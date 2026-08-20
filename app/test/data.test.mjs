import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const tt = JSON.parse(readFileSync(new URL("../public/data/timetable.json", import.meta.url)));
const spots = JSON.parse(readFileSync(new URL("../public/data/spots.json", import.meta.url)));
const ferry = JSON.parse(readFileSync(new URL("../public/data/ferry.json", import.meta.url)));

test("timetable: 全tripのstopIdはstops定義に存在する", () => {
  for (const trip of tt.trips) for (const s of trip.stops) assert.ok(tt.stops[s.stopId], `${trip.tripId}: ${s.stopId}`);
});
test("spots: 全スポットのstopIdはstops定義に存在する", () => {
  for (const [id, s] of Object.entries(spots)) assert.ok(tt.stops[s.stopId], `${id}`);
});
test("spots: 全スポットに出典がある", () => {
  for (const [id, s] of Object.entries(spots)) { assert.ok(s.sourceName, id); assert.ok(s.sourceUrl, id); }
});
test("ferry: 便に必須フィールドがある", () => {
  assert.ok(ferry.outbound.length >= 1, "outboundが空");
  for (const s of ferry.outbound) { assert.ok(s.shipType); assert.ok(s.depTakeshiba); assert.ok(s.arriveOshima); }
  for (const s of ferry.inbound) { assert.ok(s.shipType); assert.ok(s.depOshima); assert.ok(s.arriveTakeshiba); }
});
