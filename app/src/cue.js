/**
 * The runtime — where native signals meet the tested engine.
 *
 * This module is deliberately thin, and that is the architectural claim. It
 * receives position, calendar and geofence crossings, and hands them to
 * `@cue/engine` unchanged. It contains **no rule about when to nudge**. Every
 * such rule — the 6-minute walk, opening hours, the calendar gap, the daily cap
 * of two, the ranking — lives in the engine where `npm test` can reach it.
 *
 * The one thing native decides is proximity, and even that is only an
 * invitation: a geofence crossing runs the full gate, and is expected to be
 * rejected most of the time.
 */

import { run, evaluate } from '@cue/engine';
import * as store from './state/store.js';
import * as geofences from './native/geofences.js';
import * as notify from './native/notify.js';
import * as calendar from './native/calendar.js';
import * as location from './native/location.js';

const listeners = new Set();

export const state = {
  entities: [],
  position: null,
  accuracy: null,
  source: null,
  calendar: [],
  armed: [],
  trace: [],
  lastEval: null,
};

export const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
const emit = () => listeners.forEach((fn) => fn(state));

/**
 * No native call may wedge startup.
 *
 * A hung plugin promise never rejects — it simply never settles — so an `await`
 * on one blocks everything after it with no error and no log. That is exactly
 * how the app came to sit on "starting…" forever: the calendar and geofence
 * setup were awaited BEFORE location, so either one stalling meant the position
 * never arrived, and the only symptom was a word in the header.
 */
function withTimeout(promise, ms, label) {
  return Promise.race([
    Promise.resolve(promise),
    new Promise((resolve) => setTimeout(() => resolve({ __timedOut: label }), ms)),
  ]);
}

/** The Debug surface's engine trace. Kept short; this is a phone. */
export function trace(line) {
  state.trace = [{ at: new Date().toISOString(), line }, ...state.trace].slice(0, 60);
  emit();
}

/** The context the engine evaluates against. Assembled, never invented. */
export function context(overrides = {}) {
  return {
    now: new Date(),
    position: state.position,
    calendar: state.calendar,
    feedback: store.loadFeedback(),
    firedToday: store.firedToday(),
    ...overrides,
  };
}

/**
 * Evaluate the whole corpus and deliver whatever survives.
 *
 * `run` already enforces the daily budget and the ranking, so this only has to
 * deliver and record. Rejections are kept because they are what proves the app
 * is quiet on purpose — "nothing fired" and "nothing was considered" look
 * identical from the outside otherwise.
 */
export async function evaluateNow({ deliver = true, reason = 'manual' } = {}) {
  const ctx = context();
  const result = run(state.entities, ctx);
  state.lastEval = { at: new Date().toISOString(), reason, ...result };
  trace(`eval (${reason}): ${result.fired.length} fired · ${result.suppressed.length} suppressed · ${result.rejected.length} rejected · budget ${result.budget.used}/${result.budget.cap}`);

  if (deliver) {
    for (const candidate of result.fired) {
      await notify.fire(candidate);
      store.markFired(candidate.entity.id);
      store.recordFire(candidate);
      trace(`FIRED ${candidate.entity.name} — ${candidate.reason}`);
    }
  }
  emit();
  return result;
}

/**
 * A geofence woke us. Native said "you are near"; the engine still gets to say
 * no, and usually will — closed, mid-meeting, already surfaced, budget spent.
 */
export async function onGeofenceEnter(entityId) {
  const entity = state.entities.find((e) => e.id === entityId);
  if (!entity) return trace(`geofence ${entityId} matched no entity — corpus changed?`);

  // Refresh the calendar first: the app may have been terminated since the last
  // read, and "am I mid-meeting" is only true of the calendar as it is *now*.
  state.calendar = await calendar.today();

  const verdict = evaluate(entity, context());
  if (!verdict.fired) return trace(`near ${entity.name} but not firing — ${verdict.why}`);

  await notify.fire(verdict);
  store.markFired(entity.id);
  store.recordFire(verdict);
  trace(`FIRED ${entity.name} — ${verdict.reason}`);
  emit();
}

/** Re-arm when the perimeter is crossed, so the nearest 19 stay the nearest 19. */
export async function rearm({ force = false } = {}) {
  const feedback = store.loadFeedback();
  if (!force && state.armed.length && !geofences.stale(state.entities, state.position, feedback)) {
    return trace('perimeter crossed but the nearest venues are unchanged — not re-arming');
  }
  state.armed = await geofences.arm(state.entities, state.position, trace, feedback);
  emit();
}

/**
 * Boot. Order matters: calendar and geofences both need a position, and arming
 * before the first fix would pick 19 venues around nowhere.
 */
export async function start({ entities, background = false }) {
  state.entities = entities;
  trace(`boot: ${entities.length} entities`);

  // Location goes FIRST and is never gated behind anything else. It is the
  // feature the whole pivot exists for, and the two calls that used to precede
  // it are both optional to getting a fix.
  const locating = startLocation(background);

  // Calendar and geofence setup then run concurrently, each on a leash. A
  // failure here degrades one feature; it must never cost the position.
  withTimeout(calendar.today(), 8000, 'calendar').then((r) => {
    if (r?.__timedOut) return trace('calendar timed out after 8s — continuing without it');
    state.calendar = r || [];
    trace(`calendar: ${state.calendar.length} events (${state.calendar[0]?.source || 'none'})`);
    emit();
  }).catch((e) => trace(`calendar failed: ${e.message}`));

  withTimeout(geofences.listen({ onEnter: onGeofenceEnter, onRearm: rearm, log: trace }), 8000, 'geofences')
    .then((r) => trace(r?.__timedOut ? 'geofence setup timed out after 8s' : 'geofence listener ready'))
    .catch((e) => trace(`geofence setup failed: ${e.message}`));

  return locating;
}

function startLocation(background) {
  trace('requesting location…');
  return location.start({
    background,
    onError: (err) => trace(`location error: ${err.message}`),
    onPosition: async (position, meta) => {
      const first = !state.position;
      state.position = position;
      state.accuracy = meta.accuracy;
      state.source = meta.source;
      emit();

      if (first) {
        trace(`first fix (${meta.source}) ±${Math.round(meta.accuracy || 0)}m`);
        await rearm({ force: true });
      }

      // In demo mode JavaScript is alive through the walk, so the engine can
      // evaluate continuously instead of waiting for iOS to notice a region.
      if (meta.source === 'native/continuous' || meta.source === 'web') {
        await evaluateNow({ reason: 'position update' });
      }
    },
  }).catch((err) => trace(`location.start threw: ${err.message}`));
}

export const stop = () => location.stop();
