import { test } from 'node:test';
import assert from 'node:assert/strict';
import { haversine, walkingMinutes } from './geo.js';
import { isOpenAt } from './hours.js';
import { evaluate, run, DAILY_BUDGET, MAX_WALK_MIN } from './triggers.js';
import { fmtDistance } from './geo.js';

// Real coordinates from the pipeline output.
const HAVENS = [59.9316801, 10.7250848];   // Havens Kafé, Majorstuen
const MONIKER = [59.9296, 10.7186];        // Moniker Oslo, Valkyriegata

const openAllWeek = Array.from({ length: 7 }, (_, d) => ({
  open: { day: d, hour: 8, minute: 0 }, close: { day: d, hour: 18, minute: 0 },
}));

const place = (over = {}) => ({
  id: 'e1', type: 'place', name: 'Havens Kafé', decay: 'contextual',
  nudge_eligible: true, confidence: { overall: 0.95 },
  trigger: { kind: 'spatial', scope: 'proximity', radius_m: 500 },
  place: { coords: HAVENS, periods: openAllWeek },
  ...over,
});

const at = (h, m = 0) => { const d = new Date('2026-08-24T00:00:00'); d.setHours(h, m, 0, 0); return d; };
const ctx = (over = {}) => ({ now: at(10), position: HAVENS, calendar: [], feedback: {}, firedToday: [], ...over });

test('haversine matches a known Oslo distance', () => {
  const d = haversine(HAVENS, MONIKER);
  assert.ok(d > 400 && d < 700, `expected 400-700m between Havens and Moniker, got ${Math.round(d)}m`);
  assert.equal(haversine(HAVENS, HAVENS), 0);
});

test('walking time is rounded up and never zero', () => {
  assert.equal(walkingMinutes(0), 1);
  assert.equal(walkingMinutes(500), 8);
});

test('opening hours are evaluated, not assumed', () => {
  assert.equal(isOpenAt(openAllWeek, at(10)), true);
  assert.equal(isOpenAt(openAllWeek, at(20)), false);
  assert.equal(isOpenAt(null, at(10)), null, 'unknown hours must be null, not false');
});

test('a closed venue never fires', () => {
  const r = evaluate(place(), ctx({ now: at(21) }));
  assert.equal(r.fired, false);
  assert.match(r.why, /closed/);
});

test('a venue beyond the walking threshold never fires', () => {
  const far = [59.9600, 10.8000]; // several km away
  const r = evaluate(place(), ctx({ position: far }));
  assert.equal(r.fired, false);
  assert.match(r.why, new RegExp(`beyond ${MAX_WALK_MIN}`));
});

test('a low-confidence entity never fires even when standing on top of it', () => {
  const weak = place({ nudge_eligible: false, why_not: 'confidence 0.35 below 0.7' });
  const r = evaluate(weak, ctx());
  assert.equal(r.fired, false);
  assert.match(r.why, /confidence/);
});

test('being mid-meeting blocks the nudge', () => {
  const cal = [{ title: 'Standup', start: at(9, 30).toISOString(), end: at(10, 30).toISOString() }];
  assert.equal(evaluate(place(), ctx({ calendar: cal })).fired, false);
});

test('"never" is permanent', () => {
  assert.equal(evaluate(place(), ctx({ feedback: { e1: 'never' } })).fired, false);
});

test('the daily budget suppresses the third candidate', () => {
  const many = [1, 2, 3, 4].map((n) => place({ id: `e${n}` }));
  const out = run(many, ctx());
  assert.equal(out.fired.length, DAILY_BUDGET);
  assert.ok(out.suppressed.length >= 1);
  assert.match(out.suppressed[0].why, /budget/);
});

test('a perishable entity outranks a contextual one at equal distance', () => {
  const out = run([
    place({ id: 'contextual', decay: 'contextual' }),
    place({ id: 'perishable', decay: 'perishable' }),
  ], ctx());
  assert.equal(out.fired[0].entity.id, 'perishable');
});

test('calendar triggers fire on an upcoming matching event', () => {
  const workout = {
    id: 'w1', type: 'workout', name: 'Lat pulldown', decay: 'contextual',
    nudge_eligible: true, confidence: { overall: 0.98 },
    trigger: { kind: 'calendar', match: ['gym', 'workout'] },
  };
  const cal = [{ title: 'Gym', start: at(10, 30).toISOString(), end: at(11, 30).toISOString() }];
  const r = evaluate(workout, ctx({ calendar: cal }));
  assert.equal(r.fired, true);
  assert.match(r.reason, /Gym/);
  assert.equal(evaluate(workout, ctx({ calendar: [] })).fired, false);
});

test('unwired trigger classes are recognised but never fire', () => {
  const product = {
    id: 'p1', type: 'product', name: "Arc'teryx jacket", decay: 'contextual',
    nudge_eligible: false, why_not: 'commerce triggers are modelled but not wired in this build',
    confidence: { overall: 0.94 }, trigger: { kind: 'commerce', scope: 'unwired' },
  };
  assert.equal(evaluate(product, ctx()).fired, false);
});

test('a far-away venue is rejected in kilometres, not absurd walking minutes', () => {
  const SF = [37.7749, -122.4194];
  const r = evaluate(place({ place: { coords: SF, periods: openAllWeek } }),
    { now: new Date('2026-08-24T10:00:00'), position: HAVENS });
  assert.equal(r.fired, false);
  assert.match(r.why, /km away/);
  assert.doesNotMatch(r.why, /\d{3,} min/);
});

test('distance formatting switches unit at sensible thresholds', () => {
  assert.equal(fmtDistance(240), '240m');
  assert.equal(fmtDistance(1500), '1.5 km');
  assert.match(fmtDistance(8333483), /^8,333 km$/);
});
