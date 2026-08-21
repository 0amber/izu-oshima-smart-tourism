import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { toMin, addMin, nextBus, planTrip } from "../public/js/planner.js";

const tt = JSON.parse(readFileSync(new URL("../public/data/timetable.json", import.meta.url)));
const spots = JSON.parse(readFileSync(new URL("../public/data/spots.json", import.meta.url)));

test("toMin / addMin", () => {
  assert.equal(toMin("10:20"), 620);
  assert.equal(addMin("10:20", 130), "12:30");
});

test("nextBus: 港→椿・花ガーデン 10:00到着なら10:20発", () => {
  const b = nextBus(tt, "PORT", "TSUBAKI", "10:00", { port: "motomachi" });
  assert.equal(b.dep, "10:20");
  assert.equal(b.arr, "10:28");
  assert.equal(b.tripId, "MIHARA_UP_1020");
});

test("nextBus: 岡田港では12:40便は使えない", () => {
  const b = nextBus(tt, "PORT", "TSUBAKI", "10:30", { port: "okada" });
  assert.equal(b, null);
  const b2 = nextBus(tt, "PORT", "TSUBAKI", "10:30", { port: "motomachi" });
  assert.equal(b2.dep, "12:40");
});

test("nextBus: 逆方向（山頂→港）は上り便を選ばない", () => {
  const b = nextBus(tt, "SUMMIT", "PORT", "12:00", { port: "motomachi" });
  assert.equal(b.dep, "13:30");
});

test("planTrip: 荷物ありは1日目に椿・花ガーデン→ホテル、山頂には行かない", () => {
  const p = planTrip({ tt, spots, port: "motomachi", arrival: "10:00", hasLuggage: true });
  const d1 = p.days[0].items;
  const spotIds = d1.filter(i => i.type === "spot").map(i => i.spotId);
  assert.deepEqual(spotIds, ["TSUBAKI", "ONSEN"]);
  const buses = d1.filter(i => i.type === "bus");
  assert.equal(buses[0].dep, "10:20");
  assert.equal(buses[1].dep, "12:48");
  assert.equal(buses[1].arr, "12:58");
  assert.ok(buses.every(b => b.verified));
  assert.ok(p.warnings.some(w => w.includes("500円")));
});

test("planTrip: 荷物なしは1日目に山頂まで行く", () => {
  const p = planTrip({ tt, spots, port: "motomachi", arrival: "10:00", hasLuggage: false });
  const spotIds = p.days[0].items.filter(i => i.type === "spot").map(i => i.spotId);
  assert.ok(spotIds.includes("SUMMIT"));
  assert.equal(p.days[0].items.find(i => i.type === "bus").arr, "10:45");
});

test("planTrip: 2日目はホテル→山頂→ホテル(荷物回収)→港", () => {
  const p = planTrip({ tt, spots, port: "motomachi", arrival: "10:00", hasLuggage: true });
  const d2 = p.days[1].items;
  const buses = d2.filter(i => i.type === "bus");
  assert.deepEqual(buses.map(b => [b.from, b.to, b.dep]), [
    ["ONSEN", "SUMMIT", "08:38"],
    ["SUMMIT", "ONSEN", "11:20"],
    ["ONSEN", "PORT", "13:37"],
  ]);
  assert.equal(buses.at(-1).arr, "13:55");
  assert.equal(p.unresolved.length, 0);
});

test("planTrip: 岡田港入港でも1日目は成立する（12:40便は元町港始発だが椿→温泉区間は使える）", () => {
  const p = planTrip({ tt, spots, port: "okada", arrival: "10:00", hasLuggage: true });
  const buses = p.days[0].items.filter(i => i.type === "bus");
  assert.equal(buses[0].dep, "10:20");
  assert.equal(buses[1].dep, "12:48");
  assert.equal(p.unresolved.length, 0);
});

test("planTrip: 運賃合計を計算する", () => {
  const p = planTrip({ tt, spots, port: "motomachi", arrival: "10:00", hasLuggage: true });
  assert.ok(p.fareTotal > 0);
});

test("planTrip: returnNote を渡すと2日目最後のイベントに反映される", () => {
  const p = planTrip({ tt, spots, port: "motomachi", arrival: "10:00", hasLuggage: true, returnNote: "帰りの船: テスト便 15:00発" });
  const last = p.days[1].items.at(-1);
  assert.equal(last.type, "event");
  assert.ok(last.note.includes("テスト便 15:00発"));
});

test("planTrip: 日帰り(stayNights=0)は1日で港に戻る(身軽は三原山)", () => {
  const p = planTrip({ tt, spots, port: "motomachi", arrival: "10:00", hasLuggage: false, stayNights: 0 });
  assert.equal(p.days.length, 1);
  const items = p.days[0].items;
  const last = items.at(-1);
  assert.equal(last.type, "event");
  assert.ok(last.title.includes("港に到着"), last.title);
  const spotIds = items.filter((i) => i.type === "spot").map((i) => i.spotId);
  assert.deepEqual(spotIds, ["SUMMIT"]);
  for (const b of items.filter((i) => i.type === "bus")) assert.ok(b.verified);
});

test("planTrip: 日帰り荷物ありは椿・花ガーデンへ(山頂には行かない)", () => {
  const p = planTrip({ tt, spots, port: "motomachi", arrival: "10:00", hasLuggage: true, stayNights: 0 });
  const spotIds = p.days[0].items.filter((i) => i.type === "spot").map((i) => i.spotId);
  assert.deepEqual(spotIds, ["TSUBAKI"]);
});

test("planTrip: 2泊3日(stayNights=2)は3日構成で中日は三原山、最終日は山に行かず港へ", () => {
  const p = planTrip({ tt, spots, port: "motomachi", arrival: "10:00", hasLuggage: true, stayNights: 2 });
  assert.equal(p.days.length, 3);
  const d2spots = p.days[1].items.filter((i) => i.type === "spot").map((i) => i.spotId);
  assert.ok(d2spots.includes("SUMMIT"), "中日に三原山がない");
  const d3spots = p.days[2].items.filter((i) => i.type === "spot").map((i) => i.spotId);
  assert.ok(!d3spots.includes("SUMMIT"), "最終日に三原山が入っている");
  const d3last = p.days[2].items.at(-1);
  assert.ok(d3last.title.includes("港に到着"), d3last.title);
});

test("planTrip: dateを渡すと日付+曜日ラベルになる", () => {
  const p = planTrip({ tt, spots, port: "motomachi", arrival: "10:00", hasLuggage: true, date: "2026-08-22" });
  assert.equal(p.days[0].label, "8/22（土）");
  assert.equal(p.days[1].label, "8/23（日）");
});

test("planTrip: dateなしは従来ラベルのまま(後方互換)", () => {
  const p = planTrip({ tt, spots, port: "motomachi", arrival: "10:00", hasLuggage: true });
  assert.equal(p.days[0].label, "1日目（土）");
  assert.equal(p.days[1].label, "2日目（日）");
});

test("planTrip: course=park は1日目に大島公園→乗り継ぎで温泉ホテルへ(実在便)", () => {
  const p = planTrip({ tt, spots, port: "motomachi", arrival: "10:00", hasLuggage: true, course: "park" });
  const d1 = p.days[0].items;
  const spotIds = d1.filter((i) => i.type === "spot").map((i) => i.spotId);
  assert.deepEqual(spotIds, ["PARK", "ONSEN"]);
  const buses = d1.filter((i) => i.type === "bus");
  assert.equal(buses[0].dep, "10:10"); // PORT→大島公園
  assert.ok(buses.length >= 3, `乗継便を含むはず: ${buses.length}`); // PARK→PORT→ONSEN
  assert.equal(buses.at(-1).arr, "12:58"); // 12:40港発→温泉ホテル
  for (const b of buses) assert.ok(b.verified);
});

test("planTrip: course=habu の日帰りは波浮港往復で港に戻る", () => {
  const p = planTrip({ tt, spots, port: "motomachi", arrival: "10:00", hasLuggage: false, stayNights: 0, course: "habu" });
  const items = p.days[0].items;
  const spotIds = items.filter((i) => i.type === "spot").map((i) => i.spotId);
  assert.deepEqual(spotIds, ["HABU"]);
  assert.ok(items.at(-1).title.includes("港に到着"), items.at(-1).title);
});

test("planTrip: course未指定は従来どおり三原山コース(後方互換)", () => {
  const p = planTrip({ tt, spots, port: "motomachi", arrival: "10:00", hasLuggage: true });
  const spotIds = p.days[0].items.filter((i) => i.type === "spot").map((i) => i.spotId);
  assert.deepEqual(spotIds, ["TSUBAKI", "ONSEN"]);
});

test("planTrip: lang=en で旅程の文言・スポット名が英語になる", () => {
  const p = planTrip({ tt, spots, port: "motomachi", arrival: "10:00", hasLuggage: true, lang: "en" });
  assert.equal(p.days[0].label, "Day 1 (Sat)");
  assert.equal(p.days[0].items[0].title, "Arrive at Motomachi Port");
  const spot = p.days[0].items.find((i) => i.type === "spot");
  assert.equal(spot.name, "Tsubaki Flower Garden");
  assert.ok(p.days[1].items.at(-1).title.includes("Arrive at the port"), p.days[1].items.at(-1).title);
  assert.ok(p.warnings.some((w) => w.includes("Oshima Bus")), JSON.stringify(p.warnings));
});

test("planTrip: lang=en + date で英語の日付ラベルになる", () => {
  const p = planTrip({ tt, spots, port: "motomachi", arrival: "10:00", hasLuggage: true, date: "2026-08-22", lang: "en" });
  assert.equal(p.days[0].label, "Sat, Aug 22");
  assert.equal(p.days[1].label, "Sun, Aug 23");
});
