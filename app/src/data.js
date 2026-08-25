/**
 * The corpus. Baked in at build time from the pipeline's output, then optionally
 * refreshed from the Mac.
 *
 * Baked-in-first is not a fallback, it is the design: the app opens and works
 * with no network, on a plane, with the Mac asleep. The server only ever ADDS —
 * a post shared from TikTok minutes ago. If it is unreachable, everything the
 * app already knows still works, and it says so plainly.
 */

import { applyOverride, haversine, travelBy, isOpenAt, closesAt, RETIRING } from '@cue/engine';
import baked from '../public/data/entities.json';
import { fetchCorpus, serverHost } from './net/server.js';

/** Which posts shipped inside this build — everything else needs the Mac for media. */
const BAKED_IDS = new Set(baked.posts.map((p) => p.id));

const KEY = 'cue.corpus.v1';

export const flatten = (bundle) =>
  bundle.posts.flatMap((p) => p.entities.map((e) => ({ ...e, post: p })));

/** Baked corpus, overlaid with anything synced since. */
export function loadCorpus() {
  try {
    const cached = JSON.parse(localStorage.getItem(KEY));
    if (cached?.posts?.length >= baked.posts.length) return { bundle: cached, source: 'synced' };
  } catch { /* fall through to baked */ }
  return { bundle: baked, source: 'baked' };
}

export async function syncCorpus() {
  const bundle = await fetchCorpus();
  localStorage.setItem(KEY, JSON.stringify(bundle));
  return bundle;
}

/**
 * Entity colours, in Apple's system palette so a dot on the map and a dot in a
 * list read as the same language as the rest of the phone. `place` is the app's
 * own blue because it is 95 of 122 entities — the corpus is mostly places, and
 * the accent should be what the app is mostly about.
 */
export const TYPE_COLOR = {
  place: '#3fa9f5', workout: '#34c759', product: '#ff9500', recipe: '#ff2d55', other: '#af52de',
};

/**
 * A post's thumbnail.
 *
 * Bundled posts are served from the app itself, so the library and every nudge
 * card work with no network at all. A post shared thirty seconds ago cannot be
 * in the bundle, and a card with a blank thumbnail loses the provenance that is
 * the whole difference between a nudge and an ad — so those, and only those,
 * come from the Mac.
 */
export const asset = (p, rel) =>
  (BAKED_IDS.has(p.id) ? `./${rel}` : `${serverHost()}/media/${rel}`);

export const thumb = (p) => (p.source.thumbnail ? asset(p, p.source.thumbnail) : null);

/** The frames the vision call actually saw, listed by the bundler, not inferred. */
export const frames = (p) => (p.evidence?.frames || []).map((f) => asset(p, f));

export const isFresh = (p) => !BAKED_IDS.has(p.id);

/* ── What a saved thing is allowed to do ─────────────────────────────────
   One vocabulary, used by the library, the map and the pin card, because a
   green dot on a list row and a green dot over a pin have to mean the same
   thing. The three states answer one question — can this interrupt me? — and
   the order is deliberate: green is the exception, not the norm. */

/**
 * `short` is the legend's wording, and it is a separate field rather than a
 * truncation of `label` on purpose. The legend has to fit three of these on one
 * line on the narrowest phone, while the map sheet and the nudge card have a
 * whole row for one of them and should read like a sentence.
 */
export const NUDGE_STATES = {
  live: {
    key: 'live', color: '#34c759', ink: '#248a3d', soft: 'rgba(52, 199, 89, 0.14)',
    label: 'Can nudge you', short: 'can nudge', blurb: 'on the map, and allowed to interrupt',
  },
  quiet: {
    key: 'quiet', color: '#ff9f0a', ink: '#a05a00', soft: 'rgba(255, 159, 10, 0.16)',
    label: 'On the map only', short: 'map only', blurb: 'findable, but it will never interrupt you',
  },
  silent: {
    key: 'silent', color: '#ff3b30', ink: '#d70015', soft: 'rgba(255, 59, 48, 0.12)',
    label: 'Cannot nudge you', short: "can't nudge", blurb: 'nothing to trigger on, or you switched it off',
  },
};

/**
 * Which of the three an entity is in, right now.
 *
 * Deliberately asks the ENGINE rather than reading `nudge_eligible` off the
 * corpus: a hand-set trigger changes the answer, and a dot that disagrees with
 * what the app will actually do is worse than no dot. `feedback: never` counts
 * as silent for the same reason — the user's decision is part of the state.
 */
export function nudgeState(entity, { overrides = {}, feedback = {} } = {}) {
  const effective = applyOverride(entity, overrides[entity.id]);
  const mapped = !!entity.place?.coords;
  // A retired save — you went, or you said never — is silent whatever its
  // trigger says, and the engine agrees: the verdict is checked before the
  // trigger is even read.
  if (RETIRING[feedback[entity.id]]) return NUDGE_STATES.silent;
  if (effective.nudge_eligible) return NUDGE_STATES.live;
  return mapped ? NUDGE_STATES.quiet : NUDGE_STATES.silent;
}

/** Why it is in that state, in the app's own words rather than the pipeline's. */
export function nudgeReason(entity, { overrides = {}, feedback = {} } = {}) {
  const verdict = feedback[entity.id];
  if (verdict === 'went') return 'you went — this one is done';
  if (verdict === 'never') return 'you said never — it will not come back';
  const override = overrides[entity.id];
  const effective = applyOverride(entity, override);
  if (effective.nudge_eligible) {
    if (override?.mode === 'nearby') return `you set this: within a ${override.max_walk_min || 6} min walk`;
    if (override?.mode === 'event') return `you set this: before "${override.match.join('", "')}"`;
    return entity.trigger?.kind === 'calendar'
      ? 'fires ahead of a matching calendar event'
      : 'fires when you are a short walk away';
  }
  return effective.why_not || 'no trigger was inferred for this one';
}

/** Which hand-set triggers make sense for this content — never a fixed list. */
export const nudgeOptions = (entity) => [
  {
    mode: 'nearby', title: 'When I am nearby', icon: 'mappin.circle',
    sub: entity.place?.coords
      ? `${entity.place.resolved_name || entity.name} · ${entity.place.address?.split(',')[0] || 'geocoded'}`
      : 'needs coordinates — this one has none',
    available: !!entity.place?.coords,
  },
  {
    mode: 'event', title: 'Before a calendar event', icon: 'calendar',
    sub: 'matched on the event title, 45 minutes ahead',
    available: true,
  },
  {
    mode: 'off', title: 'Never nudge me about this', icon: 'bell.slash',
    sub: 'it stays in the library and on the map',
    available: true,
  },
];

/**
 * A sensible starting keyword for a calendar rule, from the content itself.
 * The point of the product is not asking the user things it can work out.
 */
export function suggestedKeywords(entity) {
  const words = [entity.name, entity.category, entity.type]
    .filter(Boolean).join(' ').toLowerCase()
    .split(/[^a-z0-9']+/).filter((w) => w.length > 2);
  const known = ['gym', 'workout', 'run', 'climb', 'yoga', 'pilates', 'swim', 'lift',
                 'coffee', 'lunch', 'dinner', 'brunch', 'flight', 'trip', 'travel'];
  const hit = known.filter((k) => words.includes(k));
  return (hit.length ? hit : words.slice(0, 2)).join(', ');
}

/* ── Distance and hours, for anything that has to say them out loud ──────── */

/**
 * How far, and how you would get there. Walk under ten minutes, drive over it,
 * and nothing at all across an ocean — the engine decides which, so a card and
 * a nudge can never quote two different estimates for the same place.
 */
export function travelTo(entity, position) {
  if (!position || !entity.place?.coords) return null;
  const metres = haversine(position, entity.place.coords);
  return { metres, ...travelBy(metres) };
}

/** Today's line from Places, plus whether it is actually open at this moment. */
export function hoursNow(entity, now = new Date()) {
  const place = entity.place;
  if (!place?.hours?.length && !place?.periods?.length) return null;
  // Places lists Monday first; getDay() counts from Sunday.
  const line = place.hours?.[(now.getDay() + 6) % 7] || null;
  const open = isOpenAt(place.periods, now);
  return { line, open, until: open ? closesAt(place.periods, now) : null };
}

/**
 * Directions, handed to the phone's own Maps app rather than re-drawn here.
 *
 * `dirflg` carries the mode through, so tapping Directions on somewhere twenty
 * minutes away opens driving directions rather than a twenty-minute walk the
 * app has already told you not to take.
 */
export const directionsUrl = (entity, mode = 'walk') => {
  const [lat, lon] = entity.place.coords;
  const label = encodeURIComponent(entity.place.resolved_name || entity.name);
  return `https://maps.apple.com/?daddr=${lat},${lon}&q=${label}&dirflg=${mode === 'walk' ? 'w' : 'd'}`;
};

export const fmtDate = (iso) => {
  if (!iso) return 'unknown';
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
};

export const ago = (iso) => {
  if (!iso) return '';
  const days = Math.round((Date.now() - new Date(iso)) / 86400000);
  if (days < 1) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 14) return `${days} days ago`;
  if (days < 60) return `${Math.round(days / 7)} weeks ago`;
  if (days < 365) return `${Math.round(days / 30)} months ago`;
  return `${(days / 365).toFixed(1)} years ago`;
};
