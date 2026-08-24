/**
 * Which venues get watched.
 *
 * iOS monitors at most **20 regions per app**, system-wide, and it fails
 * silently: region 21 does not error, it simply never fires. The corpus already
 * has 26 nudge-eligible venues and would have thousands at any real scale, so
 * this is a permanent constraint rather than a demo one.
 *
 * The selection lives here, not in the native layer, for the same reason every
 * other rule does: it decides what may interrupt someone, and `npm test` has to
 * be able to see it. The native layer only registers what this returns.
 */

import { haversine } from './geo.js';

export const IOS_REGION_LIMIT = 20;

/** One slot is spent on the re-arm perimeter, so 19 venues are watchable at once. */
export const VENUE_SLOTS = IOS_REGION_LIMIT - 1;

/**
 * The nearest armable venues, nearest first.
 *
 * Feedback is honoured here as well as at fire time: an entity marked "never"
 * should not occupy one of nineteen scarce slots. That is the difference
 * between "never" meaning "do not tell me" and meaning "forget this".
 */
export function armable(entities, position, { limit = VENUE_SLOTS, feedback = {} } = {}) {
  if (!position) return [];
  return entities
    .filter((e) => e.nudge_eligible && e.place?.coords && feedback[e.id] !== 'never')
    .map((e) => ({ entity: e, metres: Math.round(haversine(position, e.place.coords)) }))
    .sort((a, b) => a.metres - b.metres)
    .slice(0, limit);
}

/**
 * Has the armed set gone stale?
 *
 * Called when the re-arm perimeter is crossed. Comparing the ids rather than the
 * distances means an ordinary walk that does not change *which* venues are
 * nearest costs nothing — re-arming 20 regions on every position update would
 * thrash CoreLocation and drain the battery the geofences exist to save.
 */
export function needsRearm(currentIds, entities, position, opts) {
  const next = armable(entities, position, opts).map((a) => a.entity.id);
  if (next.length !== currentIds.length) return true;
  const have = new Set(currentIds);
  return next.some((id) => !have.has(id));
}
