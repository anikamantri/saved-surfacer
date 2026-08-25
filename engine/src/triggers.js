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
export const LEAD_MIN = 45;         // how far ahead of a calendar event to nudge

/**
 * The defaults, as ONE object rather than scattered constants.
 *
 * There are three layers and the precedence runs strictly one way:
 *
 *     DEFAULTS  <  the user's own settings (ctx.prefs)  <  a per-entity override
 *
 * That order is the point. Someone who widens "nearby" to twelve minutes has
 * changed what the word means for their whole corpus; someone who then sets one
 * gym to thirty has said something about that gym specifically, and the general
 * setting must not overwrite it. So `prefs` is a floor the whole corpus stands
 * on and an override is a statement about one saved thing — never the reverse.
 */
export const DEFAULTS = {
  max_walk_min: MAX_WALK_MIN,
  daily_budget: DAILY_BUDGET,
  lead_min: LEAD_MIN,
  respect_hours: true,      // do not surface a place that is shut
  respect_calendar: true,   // do not interrupt a meeting
};

/** The settings in force, with anything unset falling back to the default. */
export const prefsOf = (ctx = {}) => ({ ...DEFAULTS, ...(ctx.prefs || {}) });

/**
 * The two verdicts that retire a save, and why they are two.
 *
 * "never" is *I do not want this* — a correction. "went" is *I did this* — the
 * promise the save represented has been kept. They mean opposite things about
 * the content and the same thing about the future: it must not come back. A
 * café you had coffee at on Tuesday interrupting you again on Wednesday is the
 * product failing at its own premise.
 *
 * This is also the second way the archive shrinks, and the kinder one. "never"
 * burns a save down; "went" retires it because it worked.
 *
 * "not_now" is deliberately NOT here. It is a deferral, not a verdict.
 */
export const RETIRING = { never: 'you said never', went: 'you went — this one is done' };

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
 * A trigger the user set by hand, folded over the one extraction inferred.
 *
 * Most of the corpus never nudges anyone, and for good reasons: a neighbourhood
 * cannot be "4 minutes away", a 0.48-confidence guess should not interrupt
 * anybody, and six of the eight trigger classes are modelled but unwired. Those
 * are the right defaults — but they are *defaults*, and the person who saved the
 * thing knows something the extractor does not.
 *
 * So an override is not a UI flag that skips the gate. It rewrites the entity's
 * trigger and then the SAME gate runs against it: a venue switched on by hand
 * still has to be open, still has to be within the walk, still has to win the
 * budget. Which is why this lives in the engine rather than in a screen.
 *
 * Shapes:
 *   { mode: 'nearby', max_walk_min }   proximity, needing coordinates
 *   { mode: 'event', match, lead_min } a calendar event whose title matches
 *   { mode: 'off' }                    never interrupt me about this one
 */
export function applyOverride(entity, override) {
  if (!override || !override.mode) return entity;

  if (override.mode === 'off') {
    return { ...entity, nudge_eligible: false, why_not: 'you turned nudges off for this one' };
  }

  if (override.mode === 'nearby') {
    // Refused rather than faked. Proximity without coordinates is not a setting
    // the app can honour, and pretending otherwise would arm a fence at nowhere.
    if (!entity.place?.coords) {
      return { ...entity, nudge_eligible: false, why_not: 'no coordinates — proximity cannot be decided' };
    }
    return {
      ...entity,
      nudge_eligible: true,
      why_not: null,
      trigger: {
        ...entity.trigger,
        kind: 'spatial',
        scope: 'proximity',
        max_walk_min: override.max_walk_min ?? MAX_WALK_MIN,
        set_by: 'user',
      },
    };
  }

  if (override.mode === 'event') {
    const match = (override.match || []).map((w) => String(w).trim().toLowerCase()).filter(Boolean);
    if (!match.length) return entity;   // an empty rule is not a rule
    return {
      ...entity,
      nudge_eligible: true,
      why_not: null,
      trigger: {
        ...entity.trigger,
        kind: 'calendar',
        match,
        lead_min: override.lead_min ?? 45,
        set_by: 'user',
      },
    };
  }

  return entity;
}

/**
 * Evaluate one entity against the world right now.
 * Returns a candidate, or a rejection carrying the reason — the rejections are
 * as important as the hits, because they are what keeps the app quiet.
 */
export function evaluate(input, ctx) {
  const { now, position, calendar = [], feedback = {}, firedToday = [], overrides = {} } = ctx;
  const prefs = prefsOf(ctx);
  // The hand-set trigger, if there is one, replaces the inferred one BEFORE the
  // gate — never after it. Everything below is blind to where the trigger came from.
  const entity = applyOverride(input, overrides[input.id]);
  const reject = (why) => ({ entity, fired: false, why });

  if (RETIRING[feedback[entity.id]]) return reject(RETIRING[feedback[entity.id]]);
  if (firedToday.includes(entity.id)) return reject('already surfaced today');
  if (!entity.nudge_eligible) return reject(entity.why_not || 'not eligible');

  const kind = entity.trigger?.kind;

  if (kind === 'spatial' && entity.trigger.scope === 'proximity') {
    if (!position || !entity.place?.coords) return reject('no position');
    const metres = haversine(position, entity.place.coords);
    const walk = walkingMinutes(metres);
    // "Nearby" is whatever the user says it is: their global setting, unless
    // they said something different about THIS entity. A gym you would cross
    // town for is not the same promise as a coffee shop.
    const maxWalk = entity.trigger.max_walk_min ?? prefs.max_walk_min;
    // Walking minutes are the right unit only at walking range. Past that they
    // stop being information — "4672 min away" reads as a bug, not a rejection.
    if (walk > maxWalk) {
      return reject(walk > 60
        ? `${fmtDistance(metres)} away — beyond ${maxWalk} min`
        : `${walk} min away — beyond ${maxWalk}`);
    }

    const open = isOpenAt(entity.place.periods, now);
    if (prefs.respect_hours && open === false) return reject('closed right now');
    if (prefs.respect_calendar && busyNow(calendar, now)) return reject('mid-calendar-event');

    const until = closesAt(entity.place.periods, now);
    return {
      entity, fired: true, kind: 'spatial',
      distance_m: Math.round(metres), walk_min: walk,
      reason: `${walk} min walk${until ? ` · open until ${until}` : ''}`,
      score: score(entity, { walk, prefs }),
    };
  }

  if (kind === 'calendar') {
    const hit = upcomingMatch(calendar, now, entity.trigger.match || [],
      entity.trigger.lead_min ?? prefs.lead_min);
    if (!hit) return reject('no matching calendar event nearby');
    return {
      entity, fired: true, kind: 'calendar',
      event: hit.event, mins_away: hit.minsAway,
      reason: `"${hit.event.title}" ${hit.minsAway <= 0 ? 'starting now' : `in ${hit.minsAway} min`}`,
      score: score(entity, { minsAway: hit.minsAway, prefs }),
    };
  }

  return reject(`${kind} triggers are modelled but not wired in this build`);
}

/**
 * Ranking. Decay profile matters: a perishable thing that will be worthless
 * tomorrow should beat a café that will still be there in three years.
 */
const DECAY_WEIGHT = { perishable: 1.5, contextual: 1.0, evergreen: 0.2 };

function score(entity, { walk = 0, minsAway = 0, prefs = DEFAULTS }) {
  const proximity = walk ? Math.max(0, 1 - walk / prefs.max_walk_min) : 0.6;
  const urgency = minsAway ? Math.max(0, 1 - minsAway / prefs.lead_min) : 0;
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
  const cap = prefsOf(ctx).daily_budget;
  const evaluated = entities.map((e) => evaluate(e, ctx));
  const candidates = evaluated.filter((r) => r.fired).sort((a, b) => b.score - a.score);
  const remaining = Math.max(0, cap - (ctx.firedToday?.length || 0));
  return {
    fired: candidates.slice(0, remaining),
    suppressed: candidates.slice(remaining).map((c) => ({ ...c, why: 'daily notification budget spent' })),
    rejected: evaluated.filter((r) => !r.fired),
    budget: { cap, used: ctx.firedToday?.length || 0, remaining },
  };
}
