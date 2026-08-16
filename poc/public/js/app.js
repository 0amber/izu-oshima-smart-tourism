import { planTrip, nextBus, explain, addMin } from "./planner.js";

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

const state = { port: "motomachi", arrival: "10:00", hasLuggage: true, day: 0, plan: null };
let tt, spots;

async function load() {
  [tt, spots] = await Promise.all([
    fetch("data/timetable.json").then((r) => r.json()),
    fetch("data/spots.json").then((r) => r.json()),
  ]);
  bind();
  render();
}

function bind() {
  $("#port").addEventListener("change", (e) => { state.port = e.target.value; render(); });
  $("#arrival").addEventListener("change", (e) => { state.arrival = e.target.value; render(); });
  $("#lugOn").addEventListener("click", () => setLuggage(true));
  $("#lugOff").addEventListener("click", () => setLuggage(false));
  $("#explainBtn").addEventListener("click", () => {
    const el = $("#explainText");
    el.textContent = explain(state.plan, spots);
    el.classList.add("show");
  });
  $("#modalClose").addEventListener("click", closeModal);
  $("#modal").addEventListener("click", (e) => { if (e.target.id === "modal") closeModal(); });
}

function setLuggage(v) {
  state.hasLuggage = v;
  $("#lugOn").classList.toggle("active", v);
  $("#lugOff").classList.toggle("active", !v);
  render();
}

function render() {
  state.plan = planTrip({ tt, spots, port: state.port, arrival: state.arrival, hasLuggage: state.hasLuggage });
  const p = state.plan;
  $("#explainText").classList.remove("show");

  // tabs
  $("#dayTabs").innerHTML = p.days.map((d, i) => `<button class="tab ${i === state.day ? "active" : ""}" data-i="${i}">${esc(d.label)}</button>`).join("");
  $("#dayTabs").querySelectorAll(".tab").forEach((b) => b.addEventListener("click", () => { state.day = +b.dataset.i; render(); }));

  // warnings
  $("#warnings").innerHTML =
    p.unresolved.map((u) => `<div class="unres">⛔ ${esc(u)}</div>`).join("") +
    p.warnings.map((w, i) => `<div class="warn ${i === 0 && state.hasLuggage ? "" : "soft"}">${esc(w)}</div>`).join("");

  // timeline
  const items = p.days[state.day].items;
  $("#timeline").innerHTML = `<ul class="tl">${items.map(renderItem).join("")}</ul>`;
  $("#timeline").querySelectorAll(".card.spot").forEach((c) => c.addEventListener("click", () => openSpot(c.dataset.spot)));

  $("#fare").textContent = `🚌 バス運賃合計（2日間・片道換算）: ${p.fareTotal.toLocaleString()}円`;
  $("#dataSource").innerHTML = `<p>${esc(p.dataSource.source)}</p><p>有効期間 ${esc(p.dataSource.validFrom)}〜${esc(p.dataSource.validTo)} / ${esc(p.dataSource.serviceNote)}</p><p><a href="${esc(p.dataSource.sourceUrl)}" target="_blank" rel="noopener">出典</a></p>`;
}

function renderItem(it) {
  if (it.type === "event") {
    return `<li><span class="t">${esc(it.time)}</span> ${esc(it.title)}<div class="small">${esc(it.note)}</div></li>`;
  }
  if (it.type === "bus") return `<li class="bus">${busCard(it)}</li>`;
  if (it.type === "spot") {
    return `<li class="spot"><span class="t">${esc(it.arr)}${it.dep ? "〜" + esc(it.dep) : ""}</span>
      <div class="card spot" data-spot="${esc(it.spotId)}">
        <div class="row"><b>${esc(it.emoji)} ${esc(it.name)}</b><span class="small">詳細 ›</span></div>
        <div class="small">${esc(it.note)}</div>
        ${it.cautions?.length ? `<div class="small">${it.cautions.map((c) => `<span class="tag warn">⚠ ${esc(c)}</span>`).join(" ")}</div>` : ""}
      </div></li>`;
  }
  if (it.type === "alt") {
    return `<li class="alt"><div class="altbox"><b>💡 ${esc(it.title)}</b><div class="small">${esc(it.note)}</div>
      ${it.items.map((x) => x.type === "bus" ? busCard(x) : `<div class="card"><b>${esc(x.emoji)} ${esc(x.name)}</b> <span class="t">${esc(x.arr)}${x.dep ? "〜" + esc(x.dep) : ""}</span><div class="small">${esc(x.note)}</div></div>`).join("")}
    </div></li>`;
  }
  return "";
}

function busCard(b) {
  const from = tt.stops[b.from].name, to = tt.stops[b.to].name;
  return `<span class="t">${esc(b.dep)}</span> 🚌 発
    <div class="card bus">
      <div class="row"><b>${esc(from)} → ${esc(to)}</b>
        <span><span class="tag ok">✅ 時刻表と一致</span> ${b.estimated ? '<span class="tag est">途中時刻は推定</span>' : ""}</span></div>
      <div class="small">${esc(b.dep)} 発 → ${esc(b.arr)} 着 ／ ${esc(b.routeName)} ／ ${b.fareYen ? b.fareYen + "円" : "運賃未確認"}${b.fareConfirmed ? "" : "（推定）"} ／ 便ID: ${esc(b.tripId)}</div>
    </div>`;
}

function openSpot(id) {
  const s = spots[id];
  const now = "09:00";
  const nexts = ["PORT", "TSUBAKI", "ONSEN", "SUMMIT"].filter((x) => x !== s.stopId).map((to) => {
    const b = nextBus(tt, s.stopId, to, now, { port: state.port });
    return b ? `${tt.stops[to].name}行き ${b.dep}` : null;
  }).filter(Boolean);
  $("#modalBody").innerHTML = `
    <h3>${esc(s.emoji)} ${esc(s.name)}</h3>
    <div class="small">荷物適性</div>
    <div class="score">${[0, 1, 2].map((i) => `<span class="${i < s.luggageScore ? "on" : ""}"></span>`).join("")} <span class="small">${["× 荷物ありは不可", "△ 荷物ありはやや大変", "○ 荷物ありでもOK"][s.luggageScore]}</span></div>
    <p>${esc(s.desc)}</p>
    <div class="small">目安の滞在時間: ${s.minStayMin ? s.minStayMin + "分〜" : "—"}${s.checkIn ? " ／ チェックイン " + esc(s.checkIn) : ""}</div>
    ${s.cautions.length ? `<b>⚠ 注意</b><ul>${s.cautions.map((c) => `<li>${esc(c)}</li>`).join("")}</ul>` : ""}
    ${s.todo.length ? `<b>❓ 現地で確認すること</b><ul>${s.todo.map((c) => `<li>${esc(c)}</li>`).join("")}</ul>` : ""}
    <div class="nextb"><b>🚌 最寄バス停「${esc(tt.stops[s.stopId].name)}」 ${now}以降の次発</b><br>${nexts.length ? nexts.map(esc).join("<br>") : "該当便なし"}</div>`;
  $("#modal").hidden = false;
}
function closeModal() { $("#modal").hidden = true; }

load();
