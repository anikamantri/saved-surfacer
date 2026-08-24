/**
 * Stage 06 — assign triggers.
 *
 * This is the step that makes the product what it claims to be. A folder would
 * assign a CATEGORY here. Instead each entity gets a *condition under which it
 * wakes up* — the implementation intention the save threw away.
 *
 * It also decides what may interrupt someone. The failure mode of this product
 * is notification fatigue, not bad extraction, so the bar is deliberately high:
 * only a well-identified, precisely-located venue is ever nudge-eligible.
 * Everything else still lands on the map, silently. That is the pressure valve.
 */

import { readUrls, rawPath, readJson, writeJson, log, banner } from './lib/util.mjs';

const NUDGE_MIN_CONFIDENCE = 0.7;

function assign(entity, geo) {
  const g = geo?.geocoded ? geo : null;

  // Overall confidence multiplies extraction by geocoding: being sure what the
  // place is called means nothing if you cannot say where it is.
  const overall = entity.type === 'place'
    ? Number((entity.extraction_confidence * (g?.confidence ?? 0)).toFixed(2))
    : Number(entity.extraction_confidence.toFixed(2));

  if (entity.type === 'place') {
    // "Bergen" and "Jacob Aalls gate" are real places but a city and a street.
    // You cannot be four minutes from a city, so these are map-only by construction.
    const isVenue = g?.granularity === 'venue';
    const eligible = isVenue && overall >= NUDGE_MIN_CONFIDENCE && !!g?.coords;
    return {
      trigger: eligible
        ? { kind: 'spatial', scope: 'proximity', radius_m: 500, requires: ['open_now', 'calendar_gap'] }
        : { kind: 'spatial', scope: 'city', requires: [] },
      nudge_eligible: eligible,
      why_not: eligible ? null
        : !g?.coords ? 'not geocoded'
        : !isVenue ? 'area, not a venue — cannot be "4 minutes away"'
        : `confidence ${overall} below ${NUDGE_MIN_CONFIDENCE}`,
      overall,
    };
  }

  if (entity.type === 'workout') {
    return {
      trigger: { kind: 'calendar', scope: 'event_match', match: ['gym', 'workout', 'lift', 'training'], requires: [] },
      nudge_eligible: overall >= NUDGE_MIN_CONFIDENCE,
      why_not: overall >= NUDGE_MIN_CONFIDENCE ? null : `confidence ${overall} below ${NUDGE_MIN_CONFIDENCE}`,
      overall,
    };
  }

  if (entity.type === 'recipe') {
    return {
      trigger: { kind: 'commerce', scope: 'poi_category', poi_category: 'grocery_or_supermarket', requires: [] },
      nudge_eligible: false, why_not: 'commerce triggers are modelled but not wired in this build', overall,
    };
  }

  // product / other — recognised, carried through, but not wired to a live signal.
  return {
    trigger: { kind: entity.trigger_class, scope: 'unwired', requires: [] },
    nudge_eligible: false,
    why_not: `${entity.trigger_class} triggers are modelled but not wired in this build`,
    overall,
  };
}

export default async function triggers() {
  banner('06 · triggers — assign a wake-up condition to every entity');
  let eligible = 0, total = 0;

  for (const { id } of readUrls()) {
    const ex = readJson(rawPath(id, 'entities.json'));
    const geo = readJson(rawPath(id, 'geo.json'), { results: [] });
    if (!ex) continue;

    const out = ex.entities.map((e, i) => {
      const g = geo.results.find((r) => r.index === i);
      const a = assign(e, g);
      total++; if (a.nudge_eligible) eligible++;
      return { ...e, geo: g?.geocoded ? g : null, ...a };
    });

    writeJson(rawPath(id, 'triggers.json'), { id, entities: out });
    log('06', `${id} ${String(out.filter((e) => e.nudge_eligible).length).padStart(2)}/${String(out.length).padStart(2)} nudge-eligible`);
  }
  log('06', `${eligible}/${total} entities may ever interrupt — the rest live on the map`);
}

if (import.meta.url === `file://${process.argv[1]}`) await triggers();
