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
  assert.equal(b.tripId, "MIHARA_DOWN_1020");
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

test("planTrip: 2日目はホテル→山頂→港", () => {
  const p = planTrip({ tt, spots, port: "motomachi", arrival: "10:00", hasLuggage: true });
  const d2 = p.days[1].items;
  const buses = d2.filter(i => i.type === "bus");
  assert.equal(buses[0].from, "ONSEN");
  assert.equal(buses[0].to, "SUMMIT");
  assert.equal(buses.at(-1).to, "PORT");
});

test("planTrip: 運賃合計を計算する", () => {
  const p = planTrip({ tt, spots, port: "motomachi", arrival: "10:00", hasLuggage: true });
  assert.ok(p.fareTotal > 0);
});
