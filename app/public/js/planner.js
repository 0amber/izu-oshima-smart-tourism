// planner.js — 純粋関数のみ。ブラウザ（ES module）とNode両方で動く。
// 入力: 時刻表(timetable.json) / スポット表(spots.json) / 港 / 到着時刻 / 荷物有無
// 出力: 1泊2日の旅程（バス便はすべて時刻表の trip に紐づき verified=true）

export const toMin = (s) => { const [h, m] = s.split(":").map(Number); return h * 60 + m; };
export const fromMin = (n) => `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
export const addMin = (s, d) => fromMin(toMin(s) + d);

/** 停留所 from→to で、時刻 t 以降に from を出る最初の便 */
export function nextBus(tt, from, to, t, { port = "motomachi" } = {}) {
  const cands = [];
  for (const trip of tt.trips) {
    if (from === "PORT" || to === "PORT") {
      if (port !== "unknown" && !trip.ports.includes(port)) continue;
      if (port === "unknown" && trip.ports.length < 2) continue; // 港未定なら両港共通便のみ
    }
    const i = trip.stops.findIndex((s) => s.stopId === from);
    const j = trip.stops.findIndex((s) => s.stopId === to);
    if (i < 0 || j <= i) continue;
    const dep = trip.stops[i].dep;
    if (!dep || toMin(dep) < toMin(t)) continue;
    cands.push({
      tripId: trip.tripId, routeName: trip.routeName, serviceId: trip.serviceId,
      from, to, dep, arr: trip.stops[j].arr,
      estimated: !!(trip.stops[i].intermediate || trip.stops[j].intermediate),
      verified: true, // 時刻表(GTFS)上に存在する便のみ返すため常に true
    });
  }
  cands.sort((a, b) => toMin(a.dep) - toMin(b.dep));
  return cands[0] ?? null;
}

export function fare(tt, a, b) {
  const f = tt.fares[`${a}-${b}`] || tt.fares[`${b}-${a}`];
  return f ? { yen: f.yen, confirmed: f.confirmed } : { yen: 0, confirmed: false };
}

const WALK_BUFFER = 10; // 下船→バス停の余裕（分）
const HOTEL_CHECKIN = "15:00";

function busItem(b, tt) {
  const f = fare(tt, b.from, b.to);
  return { type: "bus", ...b, fareYen: f.yen, fareConfirmed: f.confirmed };
}
const LUGGAGE_WORDS = ["キャリー", "手荷物", "荷物"];
function spotItem(spotId, spots, arr, dep, note, hasLuggage = true) {
  const s = spots[spotId];
  const cautions = hasLuggage ? s.cautions : s.cautions.filter((c) => !LUGGAGE_WORDS.some((w) => c.includes(w)));
  return { type: "spot", spotId, name: s.name, emoji: s.emoji, arr, dep, note, cautions, todo: s.todo };
}

/**
 * planTrip — 荷物あり/なしで分岐する 1泊2日プラン
 * 荷物あり: 港→椿・花ガーデン(2h+)→ホテル(荷物預け)。午後にホテル→山頂の便があれば「第2案」を提案（現行ダイヤでは該当便なし）
 * 荷物なし: 港→山頂口(直行)→ホテル
 * 2日目  : ホテル(荷物預け)→山頂→港
 */
const WDAYS = ["日", "月", "火", "水", "木", "金", "土"];
/** i日目のタブ名。date(YYYY-MM-DD)があれば実日付+曜日、なければ従来の固定ラベル */
function dayLabel(i, date, fallback) {
  if (!date) return fallback;
  const d = new Date(`${date}T00:00:00`);
  if (Number.isNaN(d.getTime())) return fallback;
  d.setDate(d.getDate() + i);
  return `${d.getMonth() + 1}/${d.getDate()}（${WDAYS[d.getDay()]}）`;
}

export function planTrip({ tt, spots, port = "motomachi", arrival = "10:00", hasLuggage = true, returnNote, stayNights = 1, date }) {
  const warnings = [];
  const unresolved = [];
  const day1 = [];
  const day2 = [];
  const opts = { port };
  const ready = addMin(arrival, WALK_BUFFER);
  const portName = port === "okada" ? "岡田港" : port === "motomachi" ? "元町港" : "入港地";

  if (port === "unknown") warnings.push("入港地が未定のため、元町・岡田どちらでも乗れる便だけで組んでいます（当日、港が決まったら切替）。");
  if (hasLuggage) warnings.push("大島バスの大型手荷物（3辺1m超/10kg超）は1個500円・混雑時は乗車を断られることがあります。1日目のバスは早めに並びましょう。");

  // ---- 日帰り: 港→スポット1箇所→港 ----
  if (stayNights === 0) {
    if (hasLuggage) warnings.push("日帰りで大きな荷物がある場合は、港の手荷物預かりの利用がおすすめです（有無・料金は要確認）。");
    day1.push({ type: "event", time: arrival, title: `${portName}に到着`, note: hasLuggage ? "キャリーケースあり 🧳" : "身軽 🎒" });
    const spotId = hasLuggage ? "TSUBAKI" : "SUMMIT";
    const g1 = nextBus(tt, "PORT", spotId, ready, opts);
    if (!g1) unresolved.push(`港→${spots[spotId].name}の便が見つかりません（到着時刻/港を確認）`);
    else {
      day1.push(busItem(g1, tt));
      const g2 = nextBus(tt, spotId, "PORT", addMin(g1.arr, spots[spotId].minStayMin), opts);
      day1.push(spotItem(spotId, spots, g1.arr, g2 ? g2.dep : null, hasLuggage ? "平坦な園内をゆっくり（お弁当ランチ）" : "火口一周コースなど（昼食は持参）", hasLuggage));
      if (!g2) unresolved.push(`${spots[spotId].name}→港の便が見つかりません`);
      else {
        day1.push(busItem(g2, tt));
        day1.push({ type: "event", time: g2.arr, title: "港に到着", note: returnNote || "帰りの船は東海汽船公式で要確認" });
      }
    }
    return finalize([{ label: null, items: day1 }], { port, arrival, hasLuggage, stayNights, date }, warnings, unresolved, tt);
  }

  day1.push({ type: "event", time: arrival, title: `${portName}に到着`, note: hasLuggage ? "キャリーケースあり 🧳" : "身軽 🎒" });

  if (hasLuggage) {
    // 港 → 椿・花ガーデン
    const b1 = nextBus(tt, "PORT", "TSUBAKI", ready, opts);
    if (!b1) unresolved.push("港→椿・花ガーデンの便が見つかりません（到着時刻/港を確認）");
    else {
      day1.push(busItem(b1, tt));
      const leave = addMin(b1.arr, spots.TSUBAKI.minStayMin);
      const b2 = nextBus(tt, "TSUBAKI", "ONSEN", leave, opts);
      if (!b2) unresolved.push("椿・花ガーデン→三原山温泉の便が見つかりません");
      else {
        const stayMin = toMin(b2.dep) - toMin(b1.arr);
        day1.push(spotItem("TSUBAKI", spots, b1.arr, b2.dep, `滞在 ${Math.floor(stayMin / 60)}時間${stayMin % 60}分（園内観光＋お弁当ランチ）`));
        day1.push(busItem(b2, tt));
        // ホテル
        const early = toMin(b2.arr) < toMin(HOTEL_CHECKIN);
        day1.push(spotItem("ONSEN", spots, b2.arr, null,
          early ? `チェックイン ${HOTEL_CHECKIN}。先に荷物だけ預けて、温泉・周辺散策でゆっくり` : "チェックイン"));
        // 第2案: 荷物を預けて山頂へ
        if (early) {
          const b3 = nextBus(tt, "ONSEN", "SUMMIT", addMin(b2.arr, 20), opts);
          const back = b3 && nextBus(tt, "SUMMIT", "ONSEN", addMin(b3.arr, 60), opts);
          if (b3) {
            day1.push({ type: "alt", title: "第2案（余裕があれば）", items: [
              busItem(b3, tt),
              spotItem("SUMMIT", spots, b3.arr, back ? back.dep : null, "身軽になって火口方面へ（短時間）"),
              ...(back ? [busItem(back, tt)] : []),
            ], note: "ホテルでチェックイン前に荷物を預けられることが前提（要確認）" });
          }
        }
      }
    }
  } else {
    // 身軽: 港 → 山頂口 直行
    const b1 = nextBus(tt, "PORT", "SUMMIT", ready, opts);
    if (!b1) unresolved.push("港→三原山頂口の便が見つかりません");
    else {
      day1.push(busItem(b1, tt));
      const leave = addMin(b1.arr, spots.SUMMIT.minStayMin);
      const b2 = nextBus(tt, "SUMMIT", "ONSEN", leave, opts);
      day1.push(spotItem("SUMMIT", spots, b1.arr, b2 ? b2.dep : null, "火口一周コースなど（昼食は持参）", false));
      if (b2) { day1.push(busItem(b2, tt)); day1.push(spotItem("ONSEN", spots, b2.arr, null, "チェックイン")); }
      else unresolved.push("山頂→三原山温泉の便が見つかりません");
    }
  }

  const days = [{ label: null, items: day1 }];

  // ---- 2泊3日: 中日はまる一日三原山、最終日は山に行かず港へ ----
  if (stayNights === 2) {
    const mid = [];
    mid.push({ type: "event", time: "08:20", title: "荷物はホテルに置いて、まる一日三原山へ", note: "身軽になって出発 🎒" });
    const m1 = nextBus(tt, "ONSEN", "SUMMIT", "08:20", opts);
    if (!m1) unresolved.push("中日 三原山温泉→山頂口の便が見つかりません");
    else {
      mid.push(busItem(m1, tt));
      // 中日は時間に余裕があるので、通常の滞在時間+2hの便を優先(無ければ通常)
      const m2 = nextBus(tt, "SUMMIT", "ONSEN", addMin(m1.arr, spots.SUMMIT.minStayMin + 120), opts)
        || nextBus(tt, "SUMMIT", "ONSEN", addMin(m1.arr, spots.SUMMIT.minStayMin), opts);
      mid.push(spotItem("SUMMIT", spots, m1.arr, m2 ? m2.dep : null, "たっぷり時間があるので火口一周＋裏砂漠まで", false));
      if (!m2) unresolved.push("中日 山頂→三原山温泉の便が見つかりません");
      else {
        mid.push(busItem(m2, tt));
        mid.push({ type: "event", time: m2.arr, title: "ホテルに戻って温泉", note: "連泊なので荷造り不要でゆっくり ♨️" });
      }
    }
    days.push({ label: null, items: mid });

    const fin = [];
    fin.push({ type: "event", time: "09:00", title: "チェックアウト・荷物を持って出発", note: hasLuggage ? "キャリーケースあり 🧳" : "身軽 🎒" });
    const f1 = nextBus(tt, "ONSEN", "PORT", "09:00", opts);
    if (!f1) unresolved.push("最終日 三原山温泉→港の便が見つかりません（ホテル送迎の有無を確認）");
    else {
      fin.push(busItem(f1, tt));
      if (port !== "okada") fin.push(spotItem("MOTOMACHI", spots, f1.arr, null, "出港までお土産・ランチ", hasLuggage));
      fin.push({ type: "event", time: f1.arr, title: "港に到着", note: returnNote || "帰りの船は東海汽船公式で要確認" });
    }
    days.push({ label: null, items: fin });
    return finalize(days, { port, arrival, hasLuggage, stayNights, date }, warnings, unresolved, tt);
  }

  // ---- 2日目(1泊2日の最終日): ホテル(荷物預け) → 山頂 → ホテル(荷物回収) → 港 ----
  const DAY2_READY = "08:20"; // 朝食後、ホテル前バス停に出られる時刻
  day2.push({ type: "event", time: DAY2_READY, title: "ホテルにキャリーケースを預けて出発", note: "身軽になって三原山へ 🎒" });
  const c1 = nextBus(tt, "ONSEN", "SUMMIT", DAY2_READY, opts);
  if (!c1) unresolved.push("2日目 三原山温泉→山頂口の便が見つかりません");
  else {
    day2.push(busItem(c1, tt));
    const leave = addMin(c1.arr, spots.SUMMIT.minStayMin);
    const c2 = nextBus(tt, "SUMMIT", "ONSEN", leave, opts);
    day2.push(spotItem("SUMMIT", spots, c1.arr, c2 ? c2.dep : null, "三原山を満喫（火口一周・裏砂漠など）", false));
    if (!c2) unresolved.push("2日目 山頂→三原山温泉（荷物回収）の便が見つかりません");
    else {
      day2.push(busItem(c2, tt));
      const c3 = nextBus(tt, "ONSEN", "PORT", addMin(c2.arr, 20), opts);
      const wait = c3 ? toMin(c3.dep) - toMin(c2.arr) : null;
      day2.push(spotItem("ONSEN", spots, c2.arr, c3 ? c3.dep : null,
        c3 ? `荷物を回収${wait > 40 ? `。港行きまで${Math.floor(wait / 60)}時間${wait % 60}分あるので昼食・温泉・休憩` : ""}` : "荷物を回収", false));
      if (!c3) unresolved.push("2日目 三原山温泉→港の便が見つかりません（ホテル送迎の有無を確認）");
      else {
        day2.push(busItem(c3, tt));
        day2.push({ type: "event", time: c3.arr, title: "港に到着", note: returnNote || "帰りの船は東海汽船公式で要確認" });
      }
    }
  }

  days.push({ label: null, items: day2 });
  return finalize(days, { port, arrival, hasLuggage, stayNights, date }, warnings, unresolved, tt);
}

/** ラベル付け・運賃合計・共通warningをまとめて返す */
function finalize(days, input, warnings, unresolved, tt) {
  const fallbacks = input.stayNights === 0 ? ["日帰り"]
    : input.stayNights === 1 ? ["1日目（土）", "2日目（日）"]
    : ["1日目", "2日目", "3日目"];
  days.forEach((d, i) => { d.label = dayLabel(i, input.date, fallbacks[i] ?? `${i + 1}日目`); });
  const allBuses = days.flatMap((d) => d.items).filter((i) => i.type === "bus");
  const fareTotal = allBuses.reduce((s, b) => s + (b.fareYen || 0), 0);
  if (allBuses.some((b) => !b.fareConfirmed)) warnings.push("一部区間の運賃は推定値です（公式で要確認）。");
  if (allBuses.some((b) => b.estimated)) warnings.push("下り便の途中停留所の時刻は前後の便からの推定です（要現地確認）。");
  return { input, days, warnings, unresolved, fareTotal, dataSource: tt.meta };
}

/** 説明文（PoCではテンプレ。後で /api/explain のLLM出力に差し替え可） */
export function explain(plan, spots) {
  const { hasLuggage, port } = plan.input;
  const p = port === "okada" ? "岡田港" : port === "motomachi" ? "元町港" : "港";
  if (hasLuggage) {
    return `${p}に着いたら、キャリーケースを持ったまま10分ほどでバス停へ。1本目のバスで椿・花ガーデンに向かい、平坦な園内をのんびり回ってお弁当ランチ。次のバスで大島温泉ホテルへ移動して荷物を預ければ、あとは身軽です。三原山は2日目のお楽しみ。荷物を持って山に登る必要はありません。`;
  }
  return `身軽なら1日目から三原山へ直行できます。${p}からのバスで山頂口へ上がり、火口方面を歩いたあと、バスで大島温泉ホテルへ。2日目はもう一度、朝いちばんのバスで山へ戻って裏砂漠まで足をのばすのもおすすめです。`;
}
