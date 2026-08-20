import { planTrip, nextBus, explain, addMin } from "./planner.js";

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

const state = { port: "motomachi", arrival: "10:00", hasLuggage: true, day: 0, plan: null, weather: null, date: "2026-08-22", stayNights: 1 };
let tt, spots, ferry, geo;

async function loadData() {
  // スタンドアロン版（build_standalone.py）では window.__DATA__ に埋め込まれる
  if (typeof window !== "undefined" && window.__DATA__) return [window.__DATA__.timetable, window.__DATA__.spots, window.__DATA__.ferry, window.__DATA__.geo ?? null];
  return Promise.all([
    fetch("data/timetable.json").then((r) => r.json()),
    fetch("data/spots.json").then((r) => r.json()),
    fetch("data/ferry.json").then((r) => r.json()),
    fetch("data/geo.json").then((r) => r.json()).catch(() => null), // 地図は無くても旅程は成立する
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

function checkStale(tt) {
  const today = new Date().toISOString().slice(0, 10);
  if (tt.meta.validTo && today > tt.meta.validTo) {
    const el = $("#staleBanner");
    el.textContent = `⚠ この時刻表の有効期間(〜${tt.meta.validTo})を過ぎています。最新ダイヤを確認してください。`;
    el.classList.remove("hidden");
  }
}

async function load() {
  [tt, spots, ferry, geo] = await loadData();
  $("#arrival").innerHTML = arrivalOptions(ferry).map((o) => `<option value="${esc(o.value)}" ${o.value === state.arrival ? "selected" : ""}>${esc(o.label)}</option>`).join("");
  bind();
  checkStale(tt);
  render();
  loadWeather(); // awaitしない(旅程表示をブロックしない)
}

let weatherLoading = false;
async function loadWeather() {
  if (weatherLoading) return;
  weatherLoading = true;
  try {
    // ブラウザのHTTPキャッシュは使わない(エッジ側のCache APIが1hキャッシュしている)
    const w = await fetch("/api/weather", { cache: "no-store" }).then((r) => r.json());
    if (w.unavailable) throw new Error("unavailable");
    state.weather = w;
    renderWeatherChips();
  } catch {
    state.weather = null;
    $("#weatherChips").innerHTML = '<span class="text-xs opacity-60">天気情報を取得できませんでした</span>';
  } finally {
    weatherLoading = false;
  }
}

/** 選択中の旅行日程(出発日〜最終日)のYYYY-MM-DD配列 */
function tripDates() {
  if (!state.date) return null;
  const n = state.plan?.days.length ?? state.stayNights + 1;
  const d = new Date(`${state.date}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
    d.setDate(d.getDate() + 1);
  }
  return out;
}

/** 旅行日程に該当する予報だけに絞る(AI解説にも渡す)。該当なしは null */
function weatherForTrip() {
  if (!state.weather) return null;
  const dates = tripDates();
  const list = dates
    ? state.weather.forecast.filter((f) => dates.includes(f.date))
    : state.weather.forecast.slice(0, state.plan?.days.length ?? 2);
  return list.length ? { forecast: list, source: state.weather.source } : null;
}

function renderWeatherChips() {
  if (!state.weather) return; // 取得失敗時は loadWeather 側の表示のまま
  const w = weatherForTrip();
  $("#weatherChips").innerHTML = w
    ? w.forecast.map((f) =>
        `<span class="text-xs rounded-full bg-white/20 px-2 py-1">${esc(f.date.slice(5).replace("-", "/"))} ${esc(f.weather.split(/[\s　]/)[0])}${f.pop != null ? ` ☔${esc(f.pop)}%` : ""}</span>`
      ).join("")
    : '<span class="text-xs opacity-60">選択日の予報はまだありません（予報は7日先まで）</span>';
}

function bind() {
  $("#port").addEventListener("change", (e) => { state.port = e.target.value; render(); });
  $("#arrival").addEventListener("change", (e) => { state.arrival = e.target.value; render(); });
  $("#tripDate").addEventListener("change", (e) => { state.date = e.target.value || null; render(); });
  $("#stay").addEventListener("change", (e) => { state.stayNights = +e.target.value; state.day = 0; render(); });
  $("#lugOn").addEventListener("click", () => setLuggage(true));
  $("#lugOff").addEventListener("click", () => setLuggage(false));
  $("#explainBtn").addEventListener("click", () => runExplain());
  $("#speakBtn").addEventListener("click", () => toggleSpeak());
  bindShare();
  $("#modalClose").addEventListener("click", closeModal);
  $("#modal").addEventListener("click", (e) => { if (e.target.id === "modal") closeModal(); });
}

function setLuggage(v) {
  state.hasLuggage = v;
  const on = "bg-sea text-white border-sea shadow-md scale-[1.02]";
  const off = "bg-white border-neutral-200 text-neutral-500";
  $("#lugOn").className = `tbtn rounded-xl border px-3 py-2 text-sm transition-all duration-150 ${v ? on : off}`;
  $("#lugOff").className = `tbtn rounded-xl border px-3 py-2 text-sm transition-all duration-150 ${!v ? on : off}`;
  render();
}

// ---- SNS共有(𝕏 / LINE / Web Share API・リンクコピー) ----
const SHARE_TEXT = "伊豆大島の1泊2日をAIが自動設計!「大島スマートコース」";
function bindShare() {
  $("#shareX")?.addEventListener("click", () => {
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(SHARE_TEXT)}&url=${encodeURIComponent(location.href)}`, "_blank", "noopener");
  });
  $("#shareLine")?.addEventListener("click", () => {
    window.open(`https://social-plugins.line.me/lineit/share?url=${encodeURIComponent(location.href)}&text=${encodeURIComponent(SHARE_TEXT)}`, "_blank", "noopener");
  });
  $("#shareBtn")?.addEventListener("click", async () => {
    const b = $("#shareBtn");
    if (navigator.share) {
      try { await navigator.share({ title: "大島スマートコース", text: SHARE_TEXT, url: location.href }); } catch { /* キャンセルは無視 */ }
      return;
    }
    try {
      await navigator.clipboard.writeText(location.href);
      b.textContent = "✅ コピーしました";
      setTimeout(() => { b.textContent = "🔗 共有"; }, 1500);
    } catch { /* http等でclipboard不可なら何もしない */ }
  });
}

function tabBtn(label, i, active, isLast) {
  const cls = active
    ? (isLast && i > 0 ? "bg-sunset text-white" : "bg-sea text-white")
    : "bg-neutral-100 text-neutral-500";
  return `<button class="tab rounded-full px-4 py-1 text-sm shadow-sm transition-colors duration-200 ${cls}" data-i="${i}">${esc(label)}</button>`;
}
function warnBox(text, hard) {
  return `<div class="rounded-xl px-3 py-2 text-sm ${hard ? "bg-warn/10 border border-warn/40 text-warn" : "bg-neutral-50 text-neutral-500"}">${esc(text)}</div>`;
}
function unresBox(text) {
  return `<div class="rounded-xl px-3 py-2 text-sm bg-tsubaki/10 border border-tsubaki/40 text-tsubaki">⛔ ${esc(text)}</div>`;
}
function busCard(b) {
  const from = tt.stops[b.from].name, to = tt.stops[b.to].name;
  return `<div class="rounded-xl border-l-4 border-sea bg-white shadow-sm p-3 my-1 transition-all duration-200">
    <div class="flex justify-between items-start gap-2"><b class="text-sm">🚌 ${esc(from)} → ${esc(to)}</b>
      <span class="shrink-0"><span class="text-xs rounded-full bg-emerald-50 text-emerald-700 px-2 py-0.5">✅ 時刻表と一致</span>${b.estimated ? '<span class="text-xs rounded-full bg-neutral-100 text-neutral-500 px-2 py-0.5 ml-1">途中時刻は推定</span>' : ""}</span></div>
    <div class="text-xs text-neutral-500 mt-1">${esc(b.dep)}発 → ${esc(b.arr)}着 ／ ${esc(b.routeName)} ／ ${b.fareYen ? b.fareYen + "円" : "運賃未確認"}${b.fareConfirmed ? "" : "(推定)"} ／ 便ID: ${esc(b.tripId)}</div>
  </div>`;
}

function render() {
  const ret = (ferry.inbound || [])[0];
  state.plan = planTrip({ tt, spots, port: state.port, arrival: state.arrival, hasLuggage: state.hasLuggage,
    stayNights: state.stayNights, date: state.date,
    returnNote: ret ? `帰りの船: ${ret.shipType} ${ret.depOshima}発 → 竹芝${ret.arriveTakeshiba}着(${ferry.meta.validNote})` : undefined });
  const p = state.plan;
  if (state.day >= p.days.length) state.day = 0;
  $("#hotelField").value = state.stayNights === 0 ? "なし（日帰り）" : "大島温泉ホテル(三原山温泉)";
  stopSpeak();
  $("#speakBtn").classList.add("hidden");
  $("#explainLabel").classList.add("hidden");
  $("#explainText").classList.add("hidden");

  // tabs
  $("#dayTabs").innerHTML = p.days.map((d, i) => tabBtn(d.label, i, i === state.day, i === p.days.length - 1)).join("");
  $("#dayTabs").querySelectorAll(".tab").forEach((b) => b.addEventListener("click", () => { state.day = +b.dataset.i; render(); }));

  // warnings
  $("#warnings").innerHTML =
    p.unresolved.map((u) => unresBox(u)).join("") +
    p.warnings.map((w, i) => warnBox(w, i === 0 && state.hasLuggage)).join("");

  // timeline(左に旅のルート線、カードは順に浮かび上がる)
  const items = p.days[state.day].items;
  $("#timeline").innerHTML = `<ul class="space-y-2 relative pl-4 before:absolute before:left-0 before:top-2 before:bottom-2 before:w-[3px] before:rounded-full before:bg-gradient-to-b before:from-sea before:to-tsubaki">${items.map(renderItem).join("")}</ul>`;
  $("#timeline").querySelectorAll("ul > li").forEach((li, i) => {
    li.classList.add("anim-rise");
    li.style.animationDelay = `${Math.min(i * 60, 480)}ms`;
  });
  $("#timeline").querySelectorAll("[data-spot]").forEach((c) => c.addEventListener("click", () => openSpot(c.dataset.spot)));

  $("#fare").innerHTML = `<span>🎟 バス運賃合計（${p.days.length === 1 ? "日帰り" : p.days.length + "日間"}・片道換算）</span><span class="text-tsubaki text-lg font-black shrink-0">${p.fareTotal.toLocaleString()}円</span>`;
  // 初回取得に失敗していても、条件変更のタイミングで再取得を試みる
  if (!state.weather) loadWeather();
  renderWeatherChips();
  $("#dataSource").innerHTML = `<p>${esc(p.dataSource.source)}</p><p>有効期間 ${esc(p.dataSource.validFrom)}〜${esc(p.dataSource.validTo)} / ${esc(p.dataSource.serviceNote)}</p><p><a class="underline text-sea" href="${esc(p.dataSource.sourceUrl)}" target="_blank" rel="noopener">出典</a></p>`;

  renderMap();
}

// ---- 地図（Leaflet + OpenStreetMap） ----
// geo.json が無い / Leaflet未ロード(オフライン・スタンドアロン)なら地図ごと非表示にする。
let map, routeLayer;

function coordOf(stopId) {
  if (stopId === "PORT") return state.port === "okada" ? geo.ports.okada : state.port === "motomachi" ? geo.ports.motomachi : null; // 当日決定は起点なし
  return geo.stops[stopId] ?? null;
}

function numIcon(n) {
  return L.divIcon({ className: "", iconSize: [26, 26], iconAnchor: [13, 13],
    html: `<div style="background:#0e7490;color:#fff;border-radius:9999px;width:26px;height:26px;display:flex;align-items:center;justify-content:center;font-weight:bold;font-size:13px;border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.4)">${n}</div>` });
}

function renderMap() {
  const el = $("#routeMap");
  if (!geo || typeof L === "undefined") { el.classList.add("hidden"); $("#mapNote").classList.add("hidden"); return; }
  el.classList.remove("hidden");
  $("#mapNote").classList.remove("hidden");
  if (!map) {
    map = L.map("routeMap", { scrollWheelZoom: false });
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 17,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);
    routeLayer = L.layerGroup().addTo(map);
  }
  routeLayer.clearLayers();

  // その日のバス便から訪問順の停留所列を作る（第2案(alt)の中身は描かない）
  const items = state.plan.days[state.day].items;
  const seq = [];
  for (const it of items) {
    if (it.type !== "bus") continue;
    for (const id of [it.from, it.to]) if (seq[seq.length - 1] !== id) seq.push(id);
  }
  const pts = [];        // 経路線用（訪問順どおり）
  const firstVisit = []; // マーカー用（初訪問のみ番号を振る）
  for (const id of seq) {
    const c = coordOf(id);
    if (!c) continue;
    pts.push([c.lat, c.lon]);
    if (!firstVisit.some((f) => f.id === id)) firstVisit.push({ id, c, n: firstVisit.length + 1 });
  }
  for (const f of firstVisit) {
    L.marker([f.c.lat, f.c.lon], { icon: numIcon(f.n) }).addTo(routeLayer)
      .bindTooltip(`${f.n}. ${f.c.name}`, { direction: "top", offset: [0, -14] });
  }
  if (state.port === "unknown") {
    for (const p of [geo.ports.motomachi, geo.ports.okada]) {
      L.circleMarker([p.lat, p.lon], { radius: 7, color: "#737373", fillColor: "#a3a3a3", fillOpacity: 0.7 })
        .addTo(routeLayer).bindTooltip(`${p.name}（当日決定）`, { direction: "top" });
    }
  }
  if (pts.length >= 2) L.polyline(pts, { color: "#0e7490", weight: 3, dashArray: "6 6" }).addTo(routeLayer);

  const all = [...pts, ...(state.port === "unknown" ? [[geo.ports.motomachi.lat, geo.ports.motomachi.lon], [geo.ports.okada.lat, geo.ports.okada.lon]] : [])];
  if (all.length) map.fitBounds(L.latLngBounds(all), { padding: [30, 30], maxZoom: 14 });
  map.invalidateSize();
}

function renderItem(it) {
  if (it.type === "event") {
    return `<li class="flex gap-2 items-baseline"><span class="font-mono text-sea font-bold text-sm">${esc(it.time)}</span> <span class="text-sm">${esc(it.title)}<div class="text-xs text-neutral-500">${esc(it.note)}</div></span></li>`;
  }
  if (it.type === "bus") return `<li>${busCard(it)}</li>`;
  if (it.type === "spot") {
    return `<li>
      <div class="flex items-baseline gap-2 mb-1"><span class="font-mono text-sea font-bold text-sm">${esc(it.arr)}${it.dep ? "〜" + esc(it.dep) : ""}</span></div>
      <div class="rounded-xl border border-sea/15 bg-gradient-to-br from-white to-foam/60 shadow-sm p-3 cursor-pointer transition-all duration-200 active:scale-[0.99]" data-spot="${esc(it.spotId)}">
        <div class="flex gap-3">
          <div class="min-w-0 flex-1">
            <div class="flex justify-between items-start gap-2"><b class="text-sm"><span class="text-2xl align-middle mr-1">${esc(it.emoji)}</span>${esc(it.name)}</b><span class="text-xs text-neutral-400 shrink-0">詳細 ›</span></div>
            <div class="text-xs text-neutral-500 mt-1">${esc(it.note)}</div>
            ${it.cautions?.length ? `<div class="mt-1 flex flex-wrap gap-1">${it.cautions.map((c) => `<span class="text-xs rounded-full bg-warn/10 text-warn px-2 py-0.5">⚠ ${esc(c)}</span>`).join("")}</div>` : ""}
          </div>
          ${spots[it.spotId]?.photo ? `<img src="${esc(spots[it.spotId].photo)}" alt="" loading="lazy" class="w-16 h-16 shrink-0 rounded-lg object-cover self-center">` : ""}
        </div>
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

async function runExplain() {
  const el = $("#explainText");
  const btn = $("#explainBtn");
  stopSpeak();
  $("#speakBtn").classList.add("hidden");
  $("#explainLabel").classList.remove("hidden");
  el.classList.remove("hidden");
  el.textContent = "";
  btn.disabled = true;
  btn.textContent = "✨ AIガイドが考えています…";
  try {
    await streamExplain(state.plan, weatherForTrip(), (t) => { el.textContent += t; });
    btn.textContent = "✨ もう一度きく";
  } catch {
    el.textContent = explain(state.plan, spots);
    el.insertAdjacentHTML("beforeend", '<div class="mt-2 text-xs text-neutral-400">※ AI解説を取得できなかったため簡易版を表示しています</div>');
    btn.textContent = "✨ AIガイドの解説を聞く";
  } finally {
    btn.disabled = false;
    if ("speechSynthesis" in window && el.textContent.trim()) $("#speakBtn").classList.remove("hidden");
  }
}

// ---- ガイド音声（Web Speech API / ブラウザ内蔵TTS・APIキー不要） ----
function speechText() {
  // Markdown記号・矢印・注記は読み上げから除く
  return $("#explainText").textContent
    .replace(/※\s*AI解説を取得できなかったため簡易版を表示しています/g, "")
    .replace(/[#*`>]+/g, " ")
    .replace(/→/g, "、")
    .replace(/\s+/g, " ").trim();
}
function setSpeakUI(on) { $("#speakBtn").textContent = on ? "⏹ 音声を止める" : "🔊 ガイドさんの声で聞く"; }
let speakTimer = null;
function stopSpeak() {
  if (speakTimer) { clearInterval(speakTimer); speakTimer = null; }
  if (typeof window !== "undefined" && window.speechSynthesis?.speaking) window.speechSynthesis.cancel();
  const b = typeof document !== "undefined" && document.querySelector("#speakBtn");
  if (b) setSpeakUI(false);
}
function toggleSpeak() {
  const synth = window.speechSynthesis;
  if (!synth) return;
  if (synth.speaking) { stopSpeak(); return; }
  // 長文を1つのutteranceで渡すとChrome系は途中で無音停止する既知バグがあるため、
  // 文の区切り(。！？)で最大120字ずつに分割してキューに積む
  const parts = [];
  let buf = "";
  for (const s of speechText().split(/(?<=[。！？])/)) {
    if (buf && (buf + s).length > 120) { parts.push(buf); buf = s; } else buf += s;
  }
  if (buf.trim()) parts.push(buf);
  if (!parts.length) return;
  const ja = synth.getVoices().find((v) => v.lang?.startsWith("ja"));
  parts.forEach((text, i) => {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "ja-JP";
    if (ja) u.voice = ja;
    u.rate = 1.05;  // 少しテンポよく
    u.pitch = 1.15; // 明るいバスガイドさん風に少し高め
    if (i === parts.length - 1) u.onend = () => stopSpeak();
    synth.speak(u);
  });
  // 保険: 一時停止状態で固まったら resume。読み上げが終わっていたらUIを戻す
  speakTimer = setInterval(() => {
    if (!synth.speaking) stopSpeak();
    else synth.resume();
  }, 5000);
  setSpeakUI(true);
}

// exported for tests
export async function streamExplain(plan, weather, onText) {
  const res = await fetch("/api/explain", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ itinerary: plan, conditions: plan.input, weather }),
  });
  if (!res.ok || !res.body) throw new Error(`explain http ${res.status}`);
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "", ev = "message", got = false;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let nl;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trimEnd();
      buf = buf.slice(nl + 1);
      if (line.startsWith("event: ")) ev = line.slice(7);
      else if (line.startsWith("data: ")) {
        if (ev === "fallback") throw new Error("server fallback");
        if (ev === "message") { onText(JSON.parse(line.slice(6))); got = true; }
        ev = "message";
      }
    }
  }
  if (!got) throw new Error("empty stream");
}

function openSpot(id) {
  const s = spots[id];
  const now = "09:00";
  const nexts = ["PORT", "TSUBAKI", "ONSEN", "SUMMIT"].filter((x) => x !== s.stopId).map((to) => {
    const b = nextBus(tt, s.stopId, to, now, { port: state.port });
    return b ? `${tt.stops[to].name}行き ${b.dep}` : null;
  }).filter(Boolean);
  $("#modalBody").innerHTML = `
    ${s.photo ? `<img src="${esc(s.photo)}" alt="${esc(s.name)}" loading="lazy" class="w-full h-36 object-cover rounded-xl mb-3">` : ""}
    <h3 class="text-lg font-bold">${esc(s.emoji)} ${esc(s.name)}</h3>
    <div class="text-xs text-neutral-500 mt-2">荷物適性</div>
    <div class="flex items-center gap-1 mt-1">${[0, 1, 2].map((i) => `<span class="inline-block w-3 h-3 rounded-full ${i < s.luggageScore ? "bg-tsubaki" : "bg-neutral-200"}"></span>`).join("")} <span class="text-xs text-neutral-500 ml-1">${["× 荷物ありは不可", "△ 荷物ありはやや大変", "○ 荷物ありでもOK"][s.luggageScore]}</span></div>
    <p class="text-sm mt-3">${esc(s.desc)}</p>
    <div class="text-xs text-neutral-500 mt-2">目安の滞在時間: ${s.minStayMin ? s.minStayMin + "分〜" : "—"}${s.checkIn ? " ／ チェックイン " + esc(s.checkIn) : ""}</div>
    ${s.cautions.length ? `<b class="block text-sm mt-3">⚠ 注意</b><ul class="list-disc list-inside text-sm text-neutral-600 mt-1 space-y-0.5">${s.cautions.map((c) => `<li>${esc(c)}</li>`).join("")}</ul>` : ""}
    ${s.todo.length ? `<b class="block text-sm mt-3">❓ 現地で確認すること</b><ul class="list-disc list-inside text-sm text-neutral-600 mt-1 space-y-0.5">${s.todo.map((c) => `<li>${esc(c)}</li>`).join("")}</ul>` : ""}
    <div class="mt-3 rounded-xl bg-sand p-3 text-sm"><b>🚌 最寄バス停「${esc(tt.stops[s.stopId].name)}」 ${now}以降の次発</b><br>${nexts.length ? nexts.map(esc).join("<br>") : "該当便なし"}</div>
    ${s.officialUrl ? `<a class="mt-3 block w-full text-center rounded-xl bg-sea text-white text-sm font-bold py-2.5 transition-transform active:scale-[0.98]" href="${esc(s.officialUrl)}" target="_blank" rel="noopener">🔗 公式サイトを見る</a>` : ""}
    <div class="mt-3 text-xs text-neutral-400">出典: <a class="underline" href="${esc(s.sourceUrl)}" target="_blank" rel="noopener">${esc(s.sourceName)}</a></div>`;
  $("#modal").hidden = false;
}
function closeModal() { $("#modal").hidden = true; }

// guarded so this module can be imported under Node (e.g. for testing streamExplain)
// without a DOM/document — browsers always have `document`, so behavior is unchanged.
if (typeof document !== "undefined") load();
