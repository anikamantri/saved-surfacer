import { test } from 'node:test';
import assert from 'node:assert/strict';
import { haversine, walkingMinutes, drivingMinutes, travelBy, WALK_LIMIT_MIN } from './geo.js';
import { isOpenAt } from './hours.js';
import { evaluate, run, applyOverride, prefsOf, RETIRING, DEFAULTS, DAILY_BUDGET, MAX_WALK_MIN } from './triggers.js';
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

/* ── Hand-set triggers ────────────────────────────────────────────────────
   The defaults are right for the corpus as a whole and wrong for individual
   saves, so the user can set a trigger by hand. The tests that matter are the
   ones proving an override goes THROUGH the gate rather than around it. */

const area = () => place({
  id: 'a1', name: 'Majorstuen', nudge_eligible: false,
  why_not: 'area, not a venue — cannot be "4 minutes away"',
  trigger: { kind: 'spatial', scope: 'city' },
});

test('an override switches on an entity the extractor ruled out', () => {
  assert.equal(evaluate(area(), ctx()).fired, false);
  const r = evaluate(area(), ctx({ overrides: { a1: { mode: 'nearby' } } }));
  assert.equal(r.fired, true, 'a hand-set proximity trigger must actually fire');
  assert.equal(r.entity.trigger.set_by, 'user');
});

test('an override still has to pass every other gate', () => {
  const over = { overrides: { a1: { mode: 'nearby' } } };
  assert.match(evaluate(area(), ctx({ ...over, now: at(21) })).why, /closed/,
    'a venue switched on by hand is still closed when it is closed');
  assert.match(evaluate(area(), ctx({ ...over, firedToday: ['a1'] })).why, /already surfaced/);
  assert.match(evaluate(area(), ctx({ ...over, feedback: { a1: 'never' } })).why, /never/);
});

test('proximity cannot be switched on for something with no coordinates', () => {
  const workout = { ...place({ id: 'w1', name: 'Pull-ups', nudge_eligible: false }), place: null };
  const r = evaluate(workout, ctx({ overrides: { w1: { mode: 'nearby' } } }));
  assert.equal(r.fired, false);
  assert.match(r.why, /no coordinates/);
});

test('a hand-set walking radius widens the gate by exactly what was asked', () => {
  const far = place({ id: 'f1', place: { coords: MONIKER, periods: openAllWeek } });
  assert.equal(evaluate(far, ctx()).fired, false, 'Moniker is beyond the default 6 min');
  assert.equal(evaluate(far, ctx({ overrides: { f1: { mode: 'nearby', max_walk_min: 12 } } })).fired, true);
  assert.equal(evaluate(far, ctx({ overrides: { f1: { mode: 'nearby', max_walk_min: 2 } } })).fired, false);
});

test('a hand-set calendar trigger matches the event the user named', () => {
  const gym = place({ id: 'g1', name: 'Lyon Center', nudge_eligible: false });
  const calendar = [{ title: 'Gym', start: new Date(at(10).getTime() + 20 * 60000), end: at(12) }];
  const r = evaluate(gym, ctx({ calendar, overrides: { g1: { mode: 'event', match: ['gym'] } } }));
  assert.equal(r.fired, true);
  assert.equal(r.kind, 'calendar');
  assert.match(r.reason, /in 20 min/);
});

test('"off" silences an entity the extractor was happy with', () => {
  const r = evaluate(place(), ctx({ overrides: { e1: { mode: 'off' } } }));
  assert.equal(r.fired, false);
  assert.match(r.why, /turned nudges off/);
});

test('an empty keyword list is not a rule', () => {
  const gym = place({ id: 'g2', nudge_eligible: false, why_not: 'confidence 0.4 below 0.7' });
  assert.equal(applyOverride(gym, { mode: 'event', match: ['  '] }).nudge_eligible, false);
});

/* ── Settings, and what beats what ───────────────────────────────────────
   Three layers: the defaults, the user's own settings, and a rule about one
   saved thing. The precedence only runs one way, and these are the tests that
   say so. */

test('a general setting widens the walk for the whole corpus', () => {
  const far = place({ id: 'f2', place: { coords: MONIKER, periods: openAllWeek } });
  assert.equal(evaluate(far, ctx()).fired, false);
  assert.equal(evaluate(far, ctx({ prefs: { max_walk_min: 12 } })).fired, true);
});

test('a per-entity override beats the general setting in both directions', () => {
  const far = place({ id: 'f3', place: { coords: MONIKER, periods: openAllWeek } });
  // The user widened everything; this one save says stay close.
  assert.equal(evaluate(far, ctx({
    prefs: { max_walk_min: 30 },
    overrides: { f3: { mode: 'nearby', max_walk_min: 2 } },
  })).fired, false, 'a narrow override must survive a wide setting');
  // And the mirror image: everything tight, this one save says go further.
  assert.equal(evaluate(far, ctx({
    prefs: { max_walk_min: 2 },
    overrides: { f3: { mode: 'nearby', max_walk_min: 30 } },
  })).fired, true, 'a wide override must survive a tight setting');
});

test('the daily budget is a setting, not a constant', () => {
  const three = [place({ id: 'x1' }), place({ id: 'x2' }), place({ id: 'x3' })];
  assert.equal(run(three, ctx()).fired.length, DAILY_BUDGET);
  assert.equal(run(three, ctx({ prefs: { daily_budget: 3 } })).fired.length, 3);
  const none = run(three, ctx({ prefs: { daily_budget: 0 } }));
  assert.equal(none.fired.length, 0);
  assert.equal(none.suppressed.length, 3, 'a zero budget suppresses rather than rejects — they were still candidates');
});

test('the hours and calendar gates can be switched off, and say so honestly', () => {
  assert.equal(evaluate(place(), ctx({ now: at(21) })).fired, false);
  assert.equal(evaluate(place(), ctx({ now: at(21), prefs: { respect_hours: false } })).fired, true);

  const meeting = [{ title: 'Standup', start: at(9), end: at(11) }];
  assert.equal(evaluate(place(), ctx({ calendar: meeting })).fired, false);
  assert.equal(evaluate(place(), ctx({ calendar: meeting, prefs: { respect_calendar: false } })).fired, true);
});

test('an unset setting falls back to the default rather than to undefined', () => {
  const p = prefsOf({ prefs: { max_walk_min: 20 } });
  assert.equal(p.max_walk_min, 20);
  assert.equal(p.daily_budget, DEFAULTS.daily_budget);
  assert.deepEqual(prefsOf({}), DEFAULTS);
});

/* ── Getting there ───────────────────────────────────────────────────────
   Walking minutes are only information at walking range. Past ten of them the
   honest answer is a drive, and past three hundred kilometres there is no
   honest answer at all. */

test('travel mode switches from walking to driving at the walk limit', () => {
  const shortWalk = travelBy(400);
  assert.equal(shortWalk.mode, 'walk');
  assert.ok(shortWalk.minutes <= WALK_LIMIT_MIN);
  assert.match(shortWalk.label, /min walk$/);

  const drive = travelBy(4200);
  assert.equal(drive.mode, 'drive');
  assert.match(drive.label, /min drive$/);
  assert.equal(drive.distance, '4.2 km');
});

test('the switch happens exactly at the limit, not near it', () => {
  // Walk from both sides of the boundary rather than trusting one sample.
  for (let m = 100; m < 20000; m += 100) {
    const t = travelBy(m);
    const expected = walkingMinutes(m) <= WALK_LIMIT_MIN ? 'walk' : 'drive';
    assert.equal(t.mode, expected, `${m}m should be a ${expected}`);
  }
});

test('driving is faster than walking, and never instant', () => {
  assert.ok(drivingMinutes(5000) < walkingMinutes(5000));
  assert.ok(drivingMinutes(10) >= 3, 'there is still a car to reach and to park');
});

test('a different continent is not a drive', () => {
  const SF = [37.7749, -122.4194];
  const t = travelBy(haversine(HAVENS, SF));
  assert.equal(t.mode, 'far');
  assert.equal(t.minutes, null, 'inventing a 200-hour drive would be worse than saying nothing');
  assert.match(t.distance, /km$/);
});

/* ── Going is the end of a save ──────────────────────────────────────────
   The save was a promise to yourself. Keeping it is the one outcome the app is
   for, and something that has been done must not come back. */

test('"went" retires an entity permanently, not just for today', () => {
  const r = evaluate(place(), ctx({ feedback: { e1: 'went' } }));
  assert.equal(r.fired, false);
  assert.match(r.why, /you went/);
  // Tomorrow, with the daily record cleared, it must STILL be quiet.
  assert.equal(evaluate(place(), ctx({ feedback: { e1: 'went' }, firedToday: [] })).fired, false);
});

test('"not now" is a deferral, not a verdict', () => {
  assert.equal(evaluate(place(), ctx({ feedback: { e1: 'not_now' } })).fired, true);
  assert.equal(RETIRING.not_now, undefined);
});

test('a hand-set trigger cannot resurrect somewhere you have been', () => {
  const r = evaluate(place(), ctx({
    feedback: { e1: 'went' },
    overrides: { e1: { mode: 'nearby', max_walk_min: 30 } },
  }));
  assert.equal(r.fired, false, 'the verdict is checked before the trigger is even read');
  assert.match(r.why, /you went/);
});
