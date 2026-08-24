/**
 * Native geofences — the crux of the whole pivot.
 *
 * Capacitor suspends JavaScript when the app is backgrounded, so the engine
 * cannot evaluate with the phone in a pocket. iOS *will* wake the app on a
 * region crossing, even after termination. So the division of labour is:
 *
 *     native decides PROXIMITY only.
 *     every other rule — opening hours, calendar, confidence, daily budget —
 *     stays in @cue/engine, where the 12 tests can see it.
 *
 * A geofence crossing is therefore not a decision. It is an *invitation to
 * decide*: iOS wakes us, and the tested engine still gets to say no. Most
 * crossings will correctly produce nothing at all.
 *
 * ## The 20-region cap
 *
 * iOS monitors at most 20 regions per app, system-wide and silently — region 21
 * does not error, it just never fires. The corpus has 26 nudge-eligible venues
 * today and would have thousands at any real scale, so this is a permanent
 * constraint, not a demo one. `docs/brief.md` §6 named it; this is the answer.
 *
 * We arm the 19 nearest venues and spend the 20th slot on a **re-arm perimeter**:
 * a large circle around the current position whose EXIT wakes the app to
 * recompute the nearest 19. Walking across a city therefore rolls the armed set
 * forward without any foreground time, and without burning battery on continuous
 * location. The perimeter is the coarse city-level trigger the plan called for.
 */

import { BackgroundGeolocation } from '@capgo/background-geolocation';
import { armable, needsRearm, IOS_REGION_LIMIT, VENUE_SLOTS } from '@cue/engine';
import { isNative } from './permissions.js';

export { IOS_REGION_LIMIT, VENUE_SLOTS };
export const PERIMETER_ID = '__rearm__';

/**
 * Perimeter radius. Big enough that ordinary movement does not thrash the armed
 * set, small enough that it is crossed long before the 19th venue stops being
 * one of the nearest 19.
 */
export const PERIMETER_M = 3000;

/**
 * Venue radius. The engine's own gate is a 6-minute walk (~500m), so the region
 * is deliberately SMALLER than the engine's threshold: iOS region entry is
 * imprecise and slow to settle, and we would rather be woken slightly late and
 * have the engine confirm than fire on a fence the engine will then reject.
 */
export const VENUE_RADIUS_M = 250;

let armed = [];  // [{ id, name, coords }]
let centre = null;

/**
 * Arm the nearest venues plus the re-arm perimeter.
 *
 * Idempotent: called on launch, on every perimeter exit, and whenever feedback
 * changes what is eligible. Clearing first is cheaper than diffing 20 regions
 * and avoids the case where a stale region survives a corpus reload.
 */
export async function arm(entities, position, log = () => {}, feedback = {}) {
  if (!isNative()) { log('web — geofences not armed (this is the part that needs native)'); return []; }
  if (!position) { log('no position yet — cannot choose which 19 to arm'); return []; }

  const picks = armable(entities, position, { feedback });
  await BackgroundGeolocation.removeAllGeofences().catch(() => {});

  for (const { entity, metres } of picks) {
    await BackgroundGeolocation.addGeofence({
      identifier: entity.id,
      latitude: entity.place.coords[0],
      longitude: entity.place.coords[1],
      radius: VENUE_RADIUS_M,
      notifyOnEntry: true,
      notifyOnExit: false,
      payload: { name: entity.name, metres: Math.round(metres) },
    }).catch((e) => log(`failed to arm ${entity.name}: ${e.message}`));
  }

  // The 20th slot. Exiting it means the "nearest 19" is probably stale.
  await BackgroundGeolocation.addGeofence({
    identifier: PERIMETER_ID,
    latitude: position[0],
    longitude: position[1],
    radius: PERIMETER_M,
    notifyOnEntry: false,
    notifyOnExit: true,
    payload: { kind: 'rearm' },
  }).catch((e) => log(`failed to arm perimeter: ${e.message}`));

  centre = position;
  armed = picks.map(({ entity, metres }) => ({ id: entity.id, name: entity.name, metres: Math.round(metres) }));
  log(`armed ${armed.length}/${VENUE_SLOTS} venues + perimeter (${PERIMETER_M}m)`);
  return armed;
}

/**
 * Wire up the native transition callback.
 *
 * `onEnter` receives the entity id and must run the FULL engine gate — this
 * function deliberately does not decide anything itself.
 */
export async function listen({ onEnter, onRearm, log = () => {} }) {
  if (!isNative()) return () => {};

  await BackgroundGeolocation.setupGeofencing({}).catch((e) => log(`setupGeofencing: ${e.message}`));

  const handle = await BackgroundGeolocation.addListener('geofenceTransition', (event) => {
    log(`geofence ${event.transition}: ${event.identifier}`);
    if (event.identifier === PERIMETER_ID) return void onRearm?.();
    if (event.enter || event.transition === 'enter') onEnter?.(event.identifier, event);
  });

  const errors = await BackgroundGeolocation.addListener('geofenceError', (e) => log(`geofence error: ${e.message || JSON.stringify(e)}`));

  return () => { handle.remove(); errors.remove(); };
}

/** What iOS says it is actually monitoring — not what we think we asked for. */
export async function monitored() {
  if (!isNative()) return [];
  const { regions } = await BackgroundGeolocation.getMonitoredGeofences().catch(() => ({ regions: [] }));
  return regions;
}

export const armedNow = () => ({ armed, centre });

/**
 * Would re-arming actually change anything? Asked on every perimeter crossing so
 * that a walk which does not change *which* venues are nearest costs nothing —
 * re-registering 20 regions on every update would thrash CoreLocation and burn
 * the battery the geofences exist to save.
 */
export const stale = (entities, position, feedback = {}) =>
  needsRearm(armed.map((a) => a.id), entities, position, { feedback });
