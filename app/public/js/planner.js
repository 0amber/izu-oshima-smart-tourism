// planner.js — 純粋関数のみ。ブラウザ（ES module）とNode両方で動く。
// 入力: 時刻表(timetable.json) / スポット表(spots.json) / 港 / 到着時刻 / 荷物有無 / lang(ja|en)
// 出力: 旅程（バス便はすべて時刻表の trip に紐づき verified=true）。文言は MSG[lang] で日英切替。

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
const TRANSFER_BUFFER = 5; // 港での乗り継ぎ余裕（分）
const HOTEL_CHECKIN = "15:00";
// コース→1日目のメインスポット。mihara は従来ロジック（荷物で椿/山頂を出し分け）
const COURSE_SPOT = { park: "PARK", habu: "HABU" };

/** from→to の直通便。無ければ 港乗り継ぎ(from→PORT→to) を試し、便の配列を返す */
export function nextBusChain(tt, from, to, t, opts) {
  const direct = nextBus(tt, from, to, t, opts);
  let legs = direct ? [direct] : null;
  if (from !== "PORT" && to !== "PORT") {
    const l1 = nextBus(tt, from, "PORT", t, opts);
    const l2 = l1 && nextBus(tt, "PORT", to, addMin(l1.arr, TRANSFER_BUFFER), opts);
    if (l2 && (!legs || toMin(l2.arr) < toMin(legs[legs.length - 1].arr))) legs = [l1, l2];
  }
  return legs;
}

// ---- 旅程文言の日英テーブル。関数値は補間用 ----
const MSG = {
  ja: {
    ports: { motomachi: "元町港", okada: "岡田港", unknown: "入港地" },
    wdays: ["日", "月", "火", "水", "木", "金", "土"],
    dateLabel: (m, d, w) => `${m}/${d}（${w}）`,
    fallback0: ["日帰り"], fallback1: ["1日目（土）", "2日目（日）"], fallbackN: (i) => `${i + 1}日目`,
    arriveAt: (p) => `${p}に到着`, arrivePort: "港に到着",
    withLuggage: "キャリーケースあり 🧳", light: "身軽 🎒",
    checkReturn: "帰りの船は東海汽船公式で要確認",
    warnUnknownPort: "入港地が未定のため、元町・岡田どちらでも乗れる便だけで組んでいます（当日、港が決まったら切替）。",
    warnLuggage: "大島バスの大型手荷物（3辺1m超/10kg超）は1個500円・混雑時は乗車を断られることがあります。1日目のバスは早めに並びましょう。",
    warnDayTrip: "日帰りで大きな荷物がある場合は、港の手荷物預かりの利用がおすすめです（有無・料金は要確認）。",
    warnFare: "一部区間の運賃は推定値です（公式で要確認）。",
    warnEstimated: "下り便の途中停留所の時刻は前後の便からの推定です（要現地確認）。",
    noBus: (from, to, hint) => `${from}→${to}の便が見つかりません${hint ? `（${hint}）` : ""}`,
    hintArrival: "到着時刻/港を確認", hintShuttle: "ホテル送迎の有無を確認",
    port: "港", day2: "2日目", midday: "中日", finalDay: "最終日",
    stayGarden: (h, m) => `滞在 ${h}時間${m}分（園内観光＋お弁当ランチ）`,
    gardenEasy: "平坦な園内をゆっくり（お弁当ランチ）",
    craterCourse: "火口一周コースなど（昼食は持参）",
    checkInEarly: (t) => `チェックイン ${t}。先に荷物だけ預けて、温泉・周辺散策でゆっくり`,
    checkIn: "チェックイン",
    altTitle: "第2案（余裕があれば）", altNote: "ホテルでチェックイン前に荷物を預けられることが前提（要確認）",
    altSummit: "身軽になって火口方面へ（短時間）",
    midTitle: "荷物はホテルに置いて、まる一日三原山へ", midStart: "身軽になって出発 🎒",
    midSummit: "たっぷり時間があるので火口一周＋裏砂漠まで",
    midBack: "ホテルに戻って温泉", midBackNote: "連泊なので荷造り不要でゆっくり ♨️",
    checkout: "チェックアウト・荷物を持って出発",
    motomachiStroll: "出港までお土産・ランチ",
    day2Title: "ホテルにキャリーケースを預けて出発", day2Note: "身軽になって三原山へ 🎒",
    day2Summit: "三原山を満喫（火口一周・裏砂漠など）",
    pickup: "荷物を回収", pickupWait: (h, m) => `。港行きまで${h}時間${m}分あるので昼食・温泉・休憩`,
    courseNote: { park: "入園無料の動物園と椿園をおさんぽ", habu: "レトロな港町をぶらり（名物コロッケも）" },
  },
  en: {
    ports: { motomachi: "Motomachi Port", okada: "Okada Port", unknown: "the port (decided that day)" },
    wdays: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
    dateLabel: (m, d, w) => `${w}, ${["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][m]} ${d}`,
    fallback0: ["Day trip"], fallback1: ["Day 1 (Sat)", "Day 2 (Sun)"], fallbackN: (i) => `Day ${i + 1}`,
    arriveAt: (p) => `Arrive at ${p}`, arrivePort: "Arrive at the port",
    withLuggage: "With suitcase 🧳", light: "Traveling light 🎒",
    checkReturn: "Check Tokai Kisen's official site for your return ferry",
    warnUnknownPort: "The arrival port is undecided, so only buses serving both ports are used (switch once decided on the day).",
    warnLuggage: "Oshima Bus charges ¥500 per large bag (over 1m total / 10kg) and may refuse boarding when crowded. Line up early on Day 1.",
    warnDayTrip: "For a day trip with large luggage, the baggage storage at the port is recommended (availability/fees to be confirmed).",
    warnFare: "Some fares are estimates (check official sources).",
    warnEstimated: "Times at intermediate stops on downhill buses are estimated (verify locally).",
    noBus: (from, to, hint) => `No bus found from ${from} to ${to}${hint ? ` (${hint})` : ""}`,
    hintArrival: "check arrival time/port", hintShuttle: "ask about the hotel shuttle",
    port: "the port", day2: "Day 2", midday: "middle day", finalDay: "final day",
    stayGarden: (h, m) => `Stay ${h}h ${m}m (garden stroll + bento lunch)`,
    gardenEasy: "Flat garden paths at an easy pace (bento lunch)",
    craterCourse: "Crater-rim course and more (bring lunch)",
    checkInEarly: (t) => `Check-in ${t}. Drop your bags first, then enjoy the onsen and a stroll`,
    checkIn: "Check-in",
    altTitle: "Option B (if time allows)", altNote: "Assumes the hotel stores bags before check-in (confirm)",
    altSummit: "A quick, light-footed walk toward the crater",
    midTitle: "Leave your bags at the hotel — a full day on Mt. Mihara", midStart: "Head out light 🎒",
    midSummit: "Plenty of time — crater rim plus the Ura-sabaku black desert",
    midBack: "Back to the hotel for onsen", midBackNote: "Staying another night, so no packing — relax ♨️",
    checkout: "Check out and depart with your luggage",
    motomachiStroll: "Souvenirs & lunch until departure",
    day2Title: "Drop your suitcase at the hotel and head out", day2Note: "Travel light to Mt. Mihara 🎒",
    day2Summit: "Enjoy Mt. Mihara (crater rim, black desert)",
    pickup: "Pick up your bags", pickupWait: (h, m) => ` — ${h}h ${m}m until the port bus: lunch, onsen, rest`,
    courseNote: { park: "Free-admission zoo and camellia garden stroll", habu: "Wander the retro port town (try the croquettes)" },
  },
};

function busItem(b, tt) {
  const f = fare(tt, b.from, b.to);
  return { type: "bus", ...b, fareYen: f.yen, fareConfirmed: f.confirmed };
}
const LUGGAGE_WORDS = ["キャリー", "手荷物", "荷物"];
/** スポット名・注意・TODOを言語に応じて返す（enはspots.jsonのenフィールド。日本語の並びと対応） */
function locSpot(s, lang) {
  const en = lang === "en" ? s.en : null;
  return {
    name: en?.name ?? s.name,
    cautions: en?.cautions ?? s.cautions,
    todo: en?.todo ?? s.todo,
    desc: en?.desc ?? s.desc,
  };
}
function spotItem(spotId, spots, arr, dep, note, hasLuggage = true, lang = "ja") {
  const s = spots[spotId];
  const loc = locSpot(s, lang);
  // 荷物なし時は「荷物系の注意」を除く（判定は日本語原文で行い、表示は選択言語で）
  const keep = s.cautions.map((c) => hasLuggage || !LUGGAGE_WORDS.some((w) => c.includes(w)));
  return { type: "spot", spotId, name: loc.name, emoji: s.emoji, arr, dep, note,
    cautions: loc.cautions.filter((_, i) => keep[i]), todo: loc.todo };
}

/** i日目のタブ名。date(YYYY-MM-DD)があれば実日付+曜日、なければ固定ラベル */
function dayLabel(i, date, fallback, L) {
  if (!date) return fallback;
  const d = new Date(`${date}T00:00:00`);
  if (Number.isNaN(d.getTime())) return fallback;
  d.setDate(d.getDate() + i);
  return L.dateLabel(d.getMonth() + 1, d.getDate(), L.wdays[d.getDay()]);
}

/**
 * planTrip — 荷物あり/なし・泊数(0〜2)・言語で分岐する旅程生成
 * 荷物あり: 港→椿・花ガーデン(2h+)→ホテル(荷物預け)。荷物なし: 港→山頂口直行→ホテル
 * 最終日: ホテル(荷物預け)→山頂→港。2泊3日は中日にまる一日三原山
 */
export function planTrip({ tt, spots, port = "motomachi", arrival = "10:00", hasLuggage = true, returnNote, stayNights = 1, date, lang = "ja", course = "mihara" }) {
  const L = MSG[lang] || MSG.ja;
  const warnings = [];
  const unresolved = [];
  const day1 = [];
  const day2 = [];
  const opts = { port };
  const ready = addMin(arrival, WALK_BUFFER);
  const portName = L.ports[port] ?? L.ports.unknown;
  const spotName = (id) => locSpot(spots[id], lang).name;
  const courseSpot = COURSE_SPOT[course] && spots[COURSE_SPOT[course]] ? COURSE_SPOT[course] : null;
  const input = { port, arrival, hasLuggage, stayNights, date, lang, course };
  const arriveEnd = { type: "event", title: L.arrivePort, note: returnNote || L.checkReturn };

  if (port === "unknown") warnings.push(L.warnUnknownPort);
  if (hasLuggage) warnings.push(L.warnLuggage);

  // ---- 日帰り: 港→スポット1箇所→港 ----
  if (stayNights === 0) {
    if (hasLuggage) warnings.push(L.warnDayTrip);
    day1.push({ type: "event", time: arrival, title: L.arriveAt(portName), note: hasLuggage ? L.withLuggage : L.light });
    const spotId = courseSpot ?? (hasLuggage ? "TSUBAKI" : "SUMMIT");
    const note = courseSpot ? L.courseNote[course] : hasLuggage ? L.gardenEasy : L.craterCourse;
    const g1 = nextBus(tt, "PORT", spotId, ready, opts);
    if (!g1) unresolved.push(L.noBus(L.port, spotName(spotId), L.hintArrival));
    else {
      day1.push(busItem(g1, tt));
      const g2 = nextBus(tt, spotId, "PORT", addMin(g1.arr, spots[spotId].minStayMin), opts);
      day1.push(spotItem(spotId, spots, g1.arr, g2 ? g2.dep : null, note, hasLuggage, lang));
      if (!g2) unresolved.push(L.noBus(spotName(spotId), L.port));
      else {
        day1.push(busItem(g2, tt));
        day1.push({ ...arriveEnd, time: g2.arr });
      }
    }
    return finalize([{ label: null, items: day1 }], input, warnings, unresolved, tt, L);
  }

  day1.push({ type: "event", time: arrival, title: L.arriveAt(portName), note: hasLuggage ? L.withLuggage : L.light });

  if (courseSpot) {
    // ---- 選択コース(大島公園/波浮港): 港→スポット→(港乗り継ぎ)→温泉ホテル ----
    const b1 = nextBus(tt, "PORT", courseSpot, ready, opts);
    if (!b1) unresolved.push(L.noBus(L.port, spotName(courseSpot), L.hintArrival));
    else {
      day1.push(busItem(b1, tt));
      const legs = nextBusChain(tt, courseSpot, "ONSEN", addMin(b1.arr, spots[courseSpot].minStayMin), opts);
      day1.push(spotItem(courseSpot, spots, b1.arr, legs ? legs[0].dep : null, L.courseNote[course], hasLuggage, lang));
      if (!legs) unresolved.push(L.noBus(spotName(courseSpot), spotName("ONSEN")));
      else {
        for (const leg of legs) day1.push(busItem(leg, tt));
        const arr = legs[legs.length - 1].arr;
        const early = toMin(arr) < toMin(HOTEL_CHECKIN);
        day1.push(spotItem("ONSEN", spots, arr, null, early ? L.checkInEarly(HOTEL_CHECKIN) : L.checkIn, hasLuggage, lang));
      }
    }
  } else if (hasLuggage) {
    // 港 → 椿・花ガーデン
    const b1 = nextBus(tt, "PORT", "TSUBAKI", ready, opts);
    if (!b1) unresolved.push(L.noBus(L.port, spotName("TSUBAKI"), L.hintArrival));
    else {
      day1.push(busItem(b1, tt));
      const leave = addMin(b1.arr, spots.TSUBAKI.minStayMin);
      const b2 = nextBus(tt, "TSUBAKI", "ONSEN", leave, opts);
      if (!b2) unresolved.push(L.noBus(spotName("TSUBAKI"), spotName("ONSEN")));
      else {
        const stayMin = toMin(b2.dep) - toMin(b1.arr);
        day1.push(spotItem("TSUBAKI", spots, b1.arr, b2.dep, L.stayGarden(Math.floor(stayMin / 60), stayMin % 60), true, lang));
        day1.push(busItem(b2, tt));
        // ホテル
        const early = toMin(b2.arr) < toMin(HOTEL_CHECKIN);
        day1.push(spotItem("ONSEN", spots, b2.arr, null, early ? L.checkInEarly(HOTEL_CHECKIN) : L.checkIn, true, lang));
        // 第2案: 荷物を預けて山頂へ
        if (early) {
          const b3 = nextBus(tt, "ONSEN", "SUMMIT", addMin(b2.arr, 20), opts);
          const back = b3 && nextBus(tt, "SUMMIT", "ONSEN", addMin(b3.arr, 60), opts);
          if (b3) {
            day1.push({ type: "alt", title: L.altTitle, items: [
              busItem(b3, tt),
              spotItem("SUMMIT", spots, b3.arr, back ? back.dep : null, L.altSummit, true, lang),
              ...(back ? [busItem(back, tt)] : []),
            ], note: L.altNote });
          }
        }
      }
    }
  } else {
    // 身軽: 港 → 山頂口 直行
    const b1 = nextBus(tt, "PORT", "SUMMIT", ready, opts);
    if (!b1) unresolved.push(L.noBus(L.port, spotName("SUMMIT")));
    else {
      day1.push(busItem(b1, tt));
      const leave = addMin(b1.arr, spots.SUMMIT.minStayMin);
      const b2 = nextBus(tt, "SUMMIT", "ONSEN", leave, opts);
      day1.push(spotItem("SUMMIT", spots, b1.arr, b2 ? b2.dep : null, L.craterCourse, false, lang));
      if (b2) { day1.push(busItem(b2, tt)); day1.push(spotItem("ONSEN", spots, b2.arr, null, L.checkIn, false, lang)); }
      else unresolved.push(L.noBus(spotName("SUMMIT"), spotName("ONSEN")));
    }
  }

  const days = [{ label: null, items: day1 }];

  // ---- 2泊3日: 中日はまる一日三原山、最終日は山に行かず港へ ----
  if (stayNights === 2) {
    const mid = [];
    mid.push({ type: "event", time: "08:20", title: L.midTitle, note: L.midStart });
    const m1 = nextBus(tt, "ONSEN", "SUMMIT", "08:20", opts);
    if (!m1) unresolved.push(`${L.midday}: ${L.noBus(spotName("ONSEN"), spotName("SUMMIT"))}`);
    else {
      mid.push(busItem(m1, tt));
      // 中日は時間に余裕があるので、通常の滞在時間+2hの便を優先(無ければ通常)
      const m2 = nextBus(tt, "SUMMIT", "ONSEN", addMin(m1.arr, spots.SUMMIT.minStayMin + 120), opts)
        || nextBus(tt, "SUMMIT", "ONSEN", addMin(m1.arr, spots.SUMMIT.minStayMin), opts);
      mid.push(spotItem("SUMMIT", spots, m1.arr, m2 ? m2.dep : null, L.midSummit, false, lang));
      if (!m2) unresolved.push(`${L.midday}: ${L.noBus(spotName("SUMMIT"), spotName("ONSEN"))}`);
      else {
        mid.push(busItem(m2, tt));
        mid.push({ type: "event", time: m2.arr, title: L.midBack, note: L.midBackNote });
      }
    }
    days.push({ label: null, items: mid });

    const fin = [];
    fin.push({ type: "event", time: "09:00", title: L.checkout, note: hasLuggage ? L.withLuggage : L.light });
    const f1 = nextBus(tt, "ONSEN", "PORT", "09:00", opts);
    if (!f1) unresolved.push(`${L.finalDay}: ${L.noBus(spotName("ONSEN"), L.port, L.hintShuttle)}`);
    else {
      fin.push(busItem(f1, tt));
      if (port !== "okada") fin.push(spotItem("MOTOMACHI", spots, f1.arr, null, L.motomachiStroll, hasLuggage, lang));
      fin.push({ ...arriveEnd, time: f1.arr });
    }
    days.push({ label: null, items: fin });
    return finalize(days, input, warnings, unresolved, tt, L);
  }

  // ---- 2日目(1泊2日の最終日): ホテル(荷物預け) → 山頂 → ホテル(荷物回収) → 港 ----
  const DAY2_READY = "08:20"; // 朝食後、ホテル前バス停に出られる時刻
  day2.push({ type: "event", time: DAY2_READY, title: L.day2Title, note: L.day2Note });
  const c1 = nextBus(tt, "ONSEN", "SUMMIT", DAY2_READY, opts);
  if (!c1) unresolved.push(`${L.day2}: ${L.noBus(spotName("ONSEN"), spotName("SUMMIT"))}`);
  else {
    day2.push(busItem(c1, tt));
    const leave = addMin(c1.arr, spots.SUMMIT.minStayMin);
    const c2 = nextBus(tt, "SUMMIT", "ONSEN", leave, opts);
    day2.push(spotItem("SUMMIT", spots, c1.arr, c2 ? c2.dep : null, L.day2Summit, false, lang));
    if (!c2) unresolved.push(`${L.day2}: ${L.noBus(spotName("SUMMIT"), spotName("ONSEN"))}`);
    else {
      day2.push(busItem(c2, tt));
      const c3 = nextBus(tt, "ONSEN", "PORT", addMin(c2.arr, 20), opts);
      const wait = c3 ? toMin(c3.dep) - toMin(c2.arr) : null;
      day2.push(spotItem("ONSEN", spots, c2.arr, c3 ? c3.dep : null,
        c3 ? `${L.pickup}${wait > 40 ? L.pickupWait(Math.floor(wait / 60), wait % 60) : ""}` : L.pickup, false, lang));
      if (!c3) unresolved.push(`${L.day2}: ${L.noBus(spotName("ONSEN"), L.port, L.hintShuttle)}`);
      else {
        day2.push(busItem(c3, tt));
        day2.push({ ...arriveEnd, time: c3.arr });
      }
    }
  }

  days.push({ label: null, items: day2 });
  return finalize(days, input, warnings, unresolved, tt, L);
}

/** ラベル付け・運賃合計・共通warningをまとめて返す */
function finalize(days, input, warnings, unresolved, tt, L) {
  const fallbacks = input.stayNights === 0 ? L.fallback0
    : input.stayNights === 1 ? L.fallback1
    : [L.fallbackN(0), L.fallbackN(1), L.fallbackN(2)];
  days.forEach((d, i) => { d.label = dayLabel(i, input.date, fallbacks[i] ?? L.fallbackN(i), L); });
  const allBuses = days.flatMap((d) => d.items).filter((i) => i.type === "bus");
  const fareTotal = allBuses.reduce((s, b) => s + (b.fareYen || 0), 0);
  if (allBuses.some((b) => !b.fareConfirmed)) warnings.push(L.warnFare);
  if (allBuses.some((b) => b.estimated)) warnings.push(L.warnEstimated);
  return { input, days, warnings, unresolved, fareTotal, dataSource: tt.meta };
}

/** 説明文（AI失敗時のフォールバック。langは plan.input.lang を使う） */
export function explain(plan, spots) {
  const { hasLuggage, port, lang } = plan.input;
  if (lang === "en") {
    const p = port === "okada" ? "Okada Port" : port === "motomachi" ? "Motomachi Port" : "the port";
    if (hasLuggage) {
      return `From ${p}, it's about a 10-minute walk to the bus stop with your suitcase. Take the first bus to Tsubaki Flower Garden for an easy stroll and a bento lunch, then the next bus to Oshima Onsen Hotel. Drop your bags there and you're traveling light. Mt. Mihara is the treat for Day 2 — no need to climb with your luggage.`;
    }
    return `Traveling light, you can head straight for Mt. Mihara on Day 1. Take the bus from ${p} up to the summit trailhead, walk toward the crater, then bus down to Oshima Onsen Hotel. On Day 2, catch the first morning bus back up and push on to the Ura-sabaku black desert.`;
  }
  const p = port === "okada" ? "岡田港" : port === "motomachi" ? "元町港" : "港";
  if (hasLuggage) {
    return `${p}に着いたら、キャリーケースを持ったまま10分ほどでバス停へ。1本目のバスで椿・花ガーデンに向かい、平坦な園内をのんびり回ってお弁当ランチ。次のバスで大島温泉ホテルへ移動して荷物を預ければ、あとは身軽です。三原山は2日目のお楽しみ。荷物を持って山に登る必要はありません。`;
  }
  return `身軽なら1日目から三原山へ直行できます。${p}からのバスで山頂口へ上がり、火口方面を歩いたあと、バスで大島温泉ホテルへ。2日目はもう一度、朝いちばんのバスで山へ戻って裏砂漠まで足をのばすのもおすすめです。`;
}
