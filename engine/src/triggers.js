/**
 * The trigger engine.
 *
 * This is the product. A folder assigns a category; this assigns a *condition
 * under which a saved thing wakes up* — the implementation intention the save
 * threw away.
 *
 * Nothing here is scripted. Given a context (a clock, a position, a calendar)
 * it decides what — if anything — has earned the right to interrupt. Feed it a
 * simulated position and it cannot tell the difference from a real one.
 *
 * The governing constraint is that the failure mode is notification fatigue,
 * not bad extraction. So every gate below is a reason NOT to fire.
 */

import { haversine, walkingMinutes, fmtDistance } from './geo.js';
import { isOpenAt, closesAt } from './hours.js';

export const MAX_WALK_MIN = 6;      // "nearby" means a short walk, not the same district
export const DAILY_BUDGET = 2;      // hard cap; competing candidates rank and one wins

/** Is there a calendar event happening right now? Being mid-meeting blocks a nudge. */
export function busyNow(calendar, now) {
  return calendar.some((e) => now >= new Date(e.start) && now < new Date(e.end));
}

/** A calendar-triggered entity fires when a matching event is about to start. */
function upcomingMatch(calendar, now, words, leadMin = 45) {
  for (const e of calendar) {
    const start = new Date(e.start);
    const minsAway = (start - now) / 60000;
    if (minsAway < -5 || minsAway > leadMin) continue;
    const title = e.title.toLowerCase();
    if (words.some((w) => title.includes(w))) return { event: e, minsAway: Math.round(minsAway) };
  }
  return null;
}

/**
 * Evaluate one entity against the world right now.
 * Returns a candidate, or a rejection carrying the reason — the rejections are
 * as important as the hits, because they are what keeps the app quiet.
 */
export function evaluate(entity, ctx) {
  const { now, position, calendar = [], feedback = {}, firedToday = [] } = ctx;
  const reject = (why) => ({ entity, fired: false, why });

  if (feedback[entity.id] === 'never') return reject('user said never');
  if (firedToday.includes(entity.id)) return reject('already surfaced today');
  if (!entity.nudge_eligible) return reject(entity.why_not || 'not eligible');

  const kind = entity.trigger?.kind;

  if (kind === 'spatial' && entity.trigger.scope === 'proximity') {
    if (!position || !entity.place?.coords) return reject('no position');
    const metres = haversine(position, entity.place.coords);
    const walk = walkingMinutes(metres);
    // Walking minutes are the right unit only at walking range. Past that they
    // stop being information — "4672 min away" reads as a bug, not a rejection.
    if (walk > MAX_WALK_MIN) {
      return reject(walk > 60
        ? `${fmtDistance(metres)} away — beyond ${MAX_WALK_MIN} min`
        : `${walk} min away — beyond ${MAX_WALK_MIN}`);
    }

    const open = isOpenAt(entity.place.periods, now);
    if (open === false) return reject('closed right now');
    if (busyNow(calendar, now)) return reject('mid-calendar-event');

    const until = closesAt(entity.place.periods, now);
    return {
      entity, fired: true, kind: 'spatial',
      distance_m: Math.round(metres), walk_min: walk,
      reason: `${walk} min walk${until ? ` · open until ${until}` : ''}`,
      score: score(entity, { walk }),
    };
  }

  if (kind === 'calendar') {
    const hit = upcomingMatch(calendar, now, entity.trigger.match || []);
    if (!hit) return reject('no matching calendar event nearby');
    return {
      entity, fired: true, kind: 'calendar',
      event: hit.event, mins_away: hit.minsAway,
      reason: `"${hit.event.title}" ${hit.minsAway <= 0 ? 'starting now' : `in ${hit.minsAway} min`}`,
      score: score(entity, { minsAway: hit.minsAway }),
    };
  }

  return reject(`${kind} triggers are modelled but not wired in this build`);
}

/**
 * Ranking. Decay profile matters: a perishable thing that will be worthless
 * tomorrow should beat a café that will still be there in three years.
 */
const DECAY_WEIGHT = { perishable: 1.5, contextual: 1.0, evergreen: 0.2 };

function score(entity, { walk = 0, minsAway = 0 }) {
  const proximity = walk ? Math.max(0, 1 - walk / MAX_WALK_MIN) : 0.6;
  const urgency = minsAway ? Math.max(0, 1 - minsAway / 45) : 0;
  return Number((
    (entity.confidence.overall ?? 0.5) *
    (DECAY_WEIGHT[entity.decay] ?? 1) *
    (0.6 + 0.4 * Math.max(proximity, urgency))
  ).toFixed(3));
}

/**
 * Run the whole corpus against the current context and return what should fire.
 * Only the top DAILY_BUDGET candidates survive; everything else stays silent and
 * lives on the map. That is the pressure valve the design depends on.
 */
export function run(entities, ctx) {
  const evaluated = entities.map((e) => evaluate(e, ctx));
  const candidates = evaluated.filter((r) => r.fired).sort((a, b) => b.score - a.score);
  const remaining = Math.max(0, DAILY_BUDGET - (ctx.firedToday?.length || 0));
  return {
    fired: candidates.slice(0, remaining),
    suppressed: candidates.slice(remaining).map((c) => ({ ...c, why: 'daily notification budget spent' })),
    rejected: evaluated.filter((r) => !r.fired),
    budget: { cap: DAILY_BUDGET, used: ctx.firedToday?.length || 0, remaining },
  };
}
