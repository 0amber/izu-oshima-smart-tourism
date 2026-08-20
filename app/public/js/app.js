import { planTrip, nextBus, explain, addMin } from "./planner.js";

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

const state = { port: "motomachi", arrival: "10:00", hasLuggage: true, day: 0, plan: null, weather: null };
let tt, spots, ferry;

async function loadData() {
  // スタンドアロン版（build_standalone.py）では window.__DATA__ に埋め込まれる
  if (typeof window !== "undefined" && window.__DATA__) return [window.__DATA__.timetable, window.__DATA__.spots, window.__DATA__.ferry];
  return Promise.all([
    fetch("data/timetable.json").then((r) => r.json()),
    fetch("data/spots.json").then((r) => r.json()),
    fetch("data/ferry.json").then((r) => r.json()),
  ]);
}

function arrivalOptions(ferry) {
  const opts = (ferry.outbound || [])
    .filter((s) => s.arriveOshima)
    .map((s) => ({ value: s.arriveOshima, label: `${s.arriveOshima}(${s.shipType} 竹芝${s.depTakeshiba}発)` }));
  if (!opts.length) return [
    { value: "09:35", label: "09:35(ジェット船 竹芝7:25/7:50発)" },
    { value: "10:00", label: "10:00(ジェット船 竹芝8:15発)" },
    { value: "06:00", label: "06:00(大型客船 竹芝23:00発)" },
  ];
  return opts;
}

async function load() {
  [tt, spots, ferry] = await loadData();
  $("#arrival").innerHTML = arrivalOptions(ferry).map((o) => `<option value="${esc(o.value)}" ${o.value === state.arrival ? "selected" : ""}>${esc(o.label)}</option>`).join("");
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
    el.classList.remove("hidden");
  });
  $("#modalClose").addEventListener("click", closeModal);
  $("#modal").addEventListener("click", (e) => { if (e.target.id === "modal") closeModal(); });
}

function setLuggage(v) {
  state.hasLuggage = v;
  $("#lugOn").className = `tbtn rounded-xl border px-3 py-2 text-sm ${v ? "bg-tsubaki text-white border-tsubaki" : "bg-white border-neutral-300"}`;
  $("#lugOff").className = `tbtn rounded-xl border px-3 py-2 text-sm ${!v ? "bg-tsubaki text-white border-tsubaki" : "bg-white border-neutral-300"}`;
  render();
}

function tabBtn(label, i, active) {
  return `<button class="tab rounded-full px-3 py-1 text-sm ${active ? "bg-sea text-white" : "bg-neutral-100 text-neutral-500"}" data-i="${i}">${esc(label)}</button>`;
}
function warnBox(text, hard) {
  return `<div class="rounded-xl px-3 py-2 text-sm ${hard ? "bg-warn/10 border border-warn/40 text-warn" : "bg-neutral-50 text-neutral-500"}">${esc(text)}</div>`;
}
function unresBox(text) {
  return `<div class="rounded-xl px-3 py-2 text-sm bg-tsubaki/10 border border-tsubaki/40 text-tsubaki">⛔ ${esc(text)}</div>`;
}
function busCard(b) {
  const from = tt.stops[b.from].name, to = tt.stops[b.to].name;
  return `<div class="rounded-xl border-l-4 border-sea bg-white shadow-sm p-3 my-1">
    <div class="flex justify-between items-start gap-2"><b class="text-sm">🚌 ${esc(from)} → ${esc(to)}</b>
      <span class="shrink-0"><span class="text-xs rounded-full bg-emerald-50 text-emerald-700 px-2 py-0.5">✅ 時刻表と一致</span>${b.estimated ? '<span class="text-xs rounded-full bg-neutral-100 text-neutral-500 px-2 py-0.5 ml-1">途中時刻は推定</span>' : ""}</span></div>
    <div class="text-xs text-neutral-500 mt-1">${esc(b.dep)}発 → ${esc(b.arr)}着 ／ ${esc(b.routeName)} ／ ${b.fareYen ? b.fareYen + "円" : "運賃未確認"}${b.fareConfirmed ? "" : "(推定)"} ／ 便ID: ${esc(b.tripId)}</div>
  </div>`;
}

function render() {
  state.plan = planTrip({ tt, spots, port: state.port, arrival: state.arrival, hasLuggage: state.hasLuggage });
  const p = state.plan;
  $("#explainText").classList.add("hidden");

  // tabs
  $("#dayTabs").innerHTML = p.days.map((d, i) => tabBtn(d.label, i, i === state.day)).join("");
  $("#dayTabs").querySelectorAll(".tab").forEach((b) => b.addEventListener("click", () => { state.day = +b.dataset.i; render(); }));

  // warnings
  $("#warnings").innerHTML =
    p.unresolved.map((u) => unresBox(u)).join("") +
    p.warnings.map((w, i) => warnBox(w, i === 0 && state.hasLuggage)).join("");

  // timeline
  const items = p.days[state.day].items;
  $("#timeline").innerHTML = `<ul class="space-y-2">${items.map(renderItem).join("")}</ul>`;
  $("#timeline").querySelectorAll("[data-spot]").forEach((c) => c.addEventListener("click", () => openSpot(c.dataset.spot)));

  $("#fare").textContent = `🚌 バス運賃合計（2日間・片道換算）: ${p.fareTotal.toLocaleString()}円`;
  $("#dataSource").innerHTML = `<p>${esc(p.dataSource.source)}</p><p>有効期間 ${esc(p.dataSource.validFrom)}〜${esc(p.dataSource.validTo)} / ${esc(p.dataSource.serviceNote)}</p><p><a class="underline text-sea" href="${esc(p.dataSource.sourceUrl)}" target="_blank" rel="noopener">出典</a></p>`;
}

function renderItem(it) {
  if (it.type === "event") {
    return `<li class="flex gap-2 items-baseline"><span class="font-mono text-sea font-bold text-sm">${esc(it.time)}</span> <span class="text-sm">${esc(it.title)}<div class="text-xs text-neutral-500">${esc(it.note)}</div></span></li>`;
  }
  if (it.type === "bus") return `<li>${busCard(it)}</li>`;
  if (it.type === "spot") {
    return `<li>
      <div class="flex items-baseline gap-2 mb-1"><span class="font-mono text-sea font-bold text-sm">${esc(it.arr)}${it.dep ? "〜" + esc(it.dep) : ""}</span></div>
      <div class="rounded-xl border border-neutral-200 bg-white shadow-sm p-3 cursor-pointer active:opacity-80" data-spot="${esc(it.spotId)}">
        <div class="flex justify-between items-start gap-2"><b class="text-sm">${esc(it.emoji)} ${esc(it.name)}</b><span class="text-xs text-neutral-400 shrink-0">詳細 ›</span></div>
        <div class="text-xs text-neutral-500 mt-1">${esc(it.note)}</div>
        ${it.cautions?.length ? `<div class="mt-1 flex flex-wrap gap-1">${it.cautions.map((c) => `<span class="text-xs rounded-full bg-warn/10 text-warn px-2 py-0.5">⚠ ${esc(c)}</span>`).join("")}</div>` : ""}
      </div></li>`;
  }
  if (it.type === "alt") {
    return `<li>
      <div class="rounded-xl border border-dashed border-neutral-300 bg-neutral-50 p-3">
        <b class="text-sm">💡 ${esc(it.title)}</b><div class="text-xs text-neutral-500 mt-1">${esc(it.note)}</div>
        ${it.items.map((x) => x.type === "bus" ? busCard(x) : `<div class="rounded-xl border border-neutral-200 bg-white shadow-sm p-2 mt-1"><b class="text-sm">${esc(x.emoji)} ${esc(x.name)}</b> <span class="font-mono text-sea font-bold text-xs">${esc(x.arr)}${x.dep ? "〜" + esc(x.dep) : ""}</span><div class="text-xs text-neutral-500">${esc(x.note)}</div></div>`).join("")}
      </div></li>`;
  }
  return "";
}

function openSpot(id) {
  const s = spots[id];
  const now = "09:00";
  const nexts = ["PORT", "TSUBAKI", "ONSEN", "SUMMIT"].filter((x) => x !== s.stopId).map((to) => {
    const b = nextBus(tt, s.stopId, to, now, { port: state.port });
    return b ? `${tt.stops[to].name}行き ${b.dep}` : null;
  }).filter(Boolean);
  $("#modalBody").innerHTML = `
    <h3 class="text-lg font-bold">${esc(s.emoji)} ${esc(s.name)}</h3>
    <div class="text-xs text-neutral-500 mt-2">荷物適性</div>
    <div class="flex items-center gap-1 mt-1">${[0, 1, 2].map((i) => `<span class="inline-block w-3 h-3 rounded-full ${i < s.luggageScore ? "bg-tsubaki" : "bg-neutral-200"}"></span>`).join("")} <span class="text-xs text-neutral-500 ml-1">${["× 荷物ありは不可", "△ 荷物ありはやや大変", "○ 荷物ありでもOK"][s.luggageScore]}</span></div>
    <p class="text-sm mt-3">${esc(s.desc)}</p>
    <div class="text-xs text-neutral-500 mt-2">目安の滞在時間: ${s.minStayMin ? s.minStayMin + "分〜" : "—"}${s.checkIn ? " ／ チェックイン " + esc(s.checkIn) : ""}</div>
    ${s.cautions.length ? `<b class="block text-sm mt-3">⚠ 注意</b><ul class="list-disc list-inside text-sm text-neutral-600 mt-1 space-y-0.5">${s.cautions.map((c) => `<li>${esc(c)}</li>`).join("")}</ul>` : ""}
    ${s.todo.length ? `<b class="block text-sm mt-3">❓ 現地で確認すること</b><ul class="list-disc list-inside text-sm text-neutral-600 mt-1 space-y-0.5">${s.todo.map((c) => `<li>${esc(c)}</li>`).join("")}</ul>` : ""}
    <div class="mt-3 rounded-xl bg-sand p-3 text-sm"><b>🚌 最寄バス停「${esc(tt.stops[s.stopId].name)}」 ${now}以降の次発</b><br>${nexts.length ? nexts.map(esc).join("<br>") : "該当便なし"}</div>`;
  $("#modal").hidden = false;
}
function closeModal() { $("#modal").hidden = true; }

load();
