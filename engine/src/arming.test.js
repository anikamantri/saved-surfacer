/**
 * Tests for the region-cap logic, run against the REAL corpus rather than
 * fixtures — the 20-region limit only bites because there are genuinely more
 * eligible venues than slots, and a fixture would hide that.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { armable, needsRearm, VENUE_SLOTS, IOS_REGION_LIMIT } from './arming.js';

const bundle = JSON.parse(readFileSync(new URL('../../data/entities.json', import.meta.url)));
const ENTITIES = bundle.posts.flatMap((p) => p.entities);

const OSLO = [59.9290, 10.7150];        // Majorstuen
const SF = [37.7749, -122.4194];
const USC = [34.0224, -118.2851];

test('the corpus genuinely exceeds what iOS can watch', () => {
  const eligible = ENTITIES.filter((e) => e.nudge_eligible && e.place?.coords);
  assert.ok(eligible.length > VENUE_SLOTS,
    `${eligible.length} eligible venues vs ${VENUE_SLOTS} slots — if this ever fails the cap is untested`);
});

test('never arms more than iOS will watch, leaving a slot for the perimeter', () => {
  const armed = armable(ENTITIES, OSLO);
  assert.ok(armed.length <= VENUE_SLOTS);
  assert.equal(VENUE_SLOTS + 1, IOS_REGION_LIMIT);
});

test('arms the nearest venues, nearest first', () => {
  const armed = armable(ENTITIES, OSLO);
  assert.ok(armed.length > 0);
  const distances = armed.map((a) => a.metres);
  assert.deepEqual(distances, [...distances].sort((a, b) => a - b));
  // Standing in Majorstuen, the nearest armed venue is a walk away, not a flight.
  assert.ok(armed[0].metres < 2000, `nearest was ${armed[0].metres}m`);
});

test('the armed set actually changes between cities', () => {
  const oslo = armable(ENTITIES, OSLO).map((a) => a.entity.id);
  const sf = armable(ENTITIES, SF).map((a) => a.entity.id);
  assert.notDeepEqual(oslo, sf);
});

test('only nudge-eligible venues ever occupy a slot', () => {
  for (const { entity } of armable(ENTITIES, OSLO)) {
    assert.equal(entity.nudge_eligible, true);
    assert.ok(entity.place.coords);
  }
});

test('"never" frees the slot it was holding', () => {
  const armed = armable(ENTITIES, OSLO);
  const banished = armed[0].entity.id;
  const after = armable(ENTITIES, OSLO, { feedback: { [banished]: 'never' } });
  assert.ok(!after.some((a) => a.entity.id === banished));
});

test('no position means nothing is armed — not everything', () => {
  assert.deepEqual(armable(ENTITIES, null), []);
});

test('re-arm is needed across cities but not for a step down the street', () => {
  const ids = armable(ENTITIES, OSLO).map((a) => a.entity.id);
  assert.equal(needsRearm(ids, ENTITIES, SF), true);
  // ~30m east: the nearest nineteen cannot have changed.
  assert.equal(needsRearm(ids, ENTITIES, [OSLO[0], OSLO[1] + 0.0005]), false);
});

test('a city with no saves arms whatever is nearest rather than nothing', () => {
  // USC has zero entities in this corpus — the cold-start case the map answers.
  const armed = armable(ENTITIES, USC);
  assert.ok(armed.length > 0, 'should still arm the globally-nearest venues');
  assert.ok(armed[0].metres > 100000, 'and they should be honestly far away');
});
