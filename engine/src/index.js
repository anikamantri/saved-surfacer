/**
 * @cue/engine — the single home for the trigger logic.
 *
 * Both front-ends import from here: the web narrative in `prototype/` and the
 * phone app in `app/`. Moving this out of the prototype was the whole point of
 * the workspace split — when the native layer lands, **native decides proximity
 * only**; every other rule (opening hours, calendar, confidence, daily budget)
 * stays here, where the tests can see it.
 */

export { haversine, walkingMinutes, fmtDistance } from './geo.js';
export { isOpenAt, closingSoon, closesAt, fmtTime } from './hours.js';
export { evaluate, run, busyNow, MAX_WALK_MIN, DAILY_BUDGET } from './triggers.js';
export { armable, needsRearm, IOS_REGION_LIMIT, VENUE_SLOTS } from './arming.js';
