/**
 * @cue/engine — the single home for the trigger logic.
 *
 * The phone app imports from here, and the tests live beside it. **Native
 * decides proximity only**; every other rule — opening hours, calendar,
 * confidence, the daily budget — stays here, where `npm test` can see it.
 */

export { haversine, walkingMinutes, fmtDistance } from './geo.js';
export { isOpenAt, closingSoon, closesAt, fmtTime } from './hours.js';
export { evaluate, run, busyNow, MAX_WALK_MIN, DAILY_BUDGET } from './triggers.js';
export { armable, needsRearm, IOS_REGION_LIMIT, VENUE_SLOTS } from './arming.js';
