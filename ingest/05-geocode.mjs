/**
 * Stage 05 — geocode.
 *
 * Turns "Havens Café, Majorstuen, Oslo" into coordinates, opening hours and a
 * confidence score, via Google Places Text Search.
 *
 * Confidence is COMPUTED, not taken on faith. It gates whether an entity is ever
 * allowed to interrupt someone, so a vague name that happens to return a result
 * must score below an exact match. Two checks:
 *   1. token overlap between the name we asked for and the name we got back
 *   2. whether the result actually landed in the expected city
 *
 * Also records granularity. "Bergen" and "Jacob Aalls gate" are legitimate places
 * but they are a city and a street — you cannot be "4 minutes from Bergen", so
 * they belong on the map and must never fire a proximity nudge.
 */

import { resolve } from 'node:path';
import { statSync } from 'node:fs';
import { KEYS, PATHS, USER_AGENT } from './lib/config.mjs';
import { readUrls, rawPath, readJson, writeJson, isCached, log, banner, sleep } from './lib/util.mjs';

const FIELDS = [
  'places.id', 'places.displayName', 'places.location', 'places.formattedAddress',
  'places.regularOpeningHours.weekdayDescriptions', 'places.regularOpeningHours.periods',
  'places.types', 'places.primaryType', 'places.rating', 'places.businessStatus',
].join(',');

// Result types that describe an area or a road rather than somewhere you walk into.
const AREA_TYPES = new Set(['locality', 'sublocality', 'sublocality_level_1', 'political',
  'administrative_area_level_1', 'administrative_area_level_2', 'route', 'street_address',
  'neighborhood', 'postal_code', 'country', 'natural_feature']);

/** Fold accents and case so "Flam" and "Flåm" compare equal regardless of NFC/NFD. */
const fold = (s) => (s || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
const norm = (s) => fold(s).replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);

/** Fraction of the requested name's words that survive into the returned name. */
function nameMatch(want, got) {
  const a = norm(want), b = new Set(norm(got));
  if (!a.length) return 0;
  const generic = new Set(['cafe', 'kafe', 'the', 'restaurant', 'bar', 'shop', 'oslo', 'bergen']);
  const meaningful = a.filter((w) => !generic.has(w));
  const scored = meaningful.length ? meaningful : a;
  return scored.filter((w) => b.has(w)).length / scored.length;
}

// Query-level cache. Post-level caching was not enough: re-running the stage after
// a scoring fix re-requested every lookup and burned the daily Places quota. Keyed by
// query string, so a fix to the scoring logic costs zero API calls.
const CACHE = resolve(PATHS.raw, '_geocache.json');
const cache = readJson(CACHE, {});
const saveCache = () => writeJson(CACHE, cache);

/** Keyless backstop. Lower quality than Places and no opening hours, but it is free
 *  and it has no daily limit — so a quota wall degrades coverage instead of ending it. */
async function nominatimOnce(query) {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=3&addressdetails=1`;
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  await sleep(1100); // Nominatim asks for <=1 req/sec
  if (!res.ok) return [];
  const rows = await res.json();
  return rows.map((r) => ({
    id: `osm:${r.osm_type}/${r.osm_id}`,
    displayName: { text: (r.name || r.display_name.split(',')[0]) },
    formattedAddress: r.display_name,
    location: { latitude: Number(r.lat), longitude: Number(r.lon) },
    types: [r.type, r.class].filter(Boolean),
    primaryType: r.type || null,
    _source: 'nominatim',
  }));
}

/** Nominatim is far more literal than Places: a neighborhood in the query often
 *  returns nothing at all. Retry with progressively coarser queries. */
async function nominatim(query) {
  const parts = query.split(',').map((x) => x.trim()).filter(Boolean);
  const attempts = [query];
  if (parts.length > 2) attempts.push([parts[0], ...parts.slice(2)].join(', ')); // drop neighborhood
  if (parts.length > 1) attempts.push([parts[0], parts.at(-1)].join(', '));      // name + country
  attempts.push(parts[0]);                                                        // name alone
  for (const q of [...new Set(attempts)]) {
    const hits = await nominatimOnce(q);
    if (hits.length) return hits;
  }
  return [];
}

async function search(query) {
  const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': KEYS.google, 'X-Goog-FieldMask': FIELDS },
    body: JSON.stringify({ textQuery: query, maxResultCount: 3 }),
  });
  const body = await res.json();
  if (body.error) {
    // Quota or transient failure: fall back rather than lose the entity entirely.
    // Say so loudly — a silent downgrade once cached a worse result for the single
    // most important venue in the demo and nothing in the log admitted it.
    log('05', `  ! Places failed (${body.error.code}) for "${query}" — falling back to Nominatim (no opening hours)`);
    const alt = await nominatim(query);
    if (alt.length) { cache[query] = alt; saveCache(); return alt; }
    throw new Error(`${body.error.code} ${body.error.message}`);
  }
  const places = (body.places || []).map((p) => ({ ...p, _source: 'google-places' }));
  cache[query] = places;
  saveCache();
  return places;
}

/**
 * Nominatim results are PROVISIONAL: they carry coordinates but no opening hours,
 * which the nudge gate needs. So a cached fallback result does not block a later
 * attempt at Places — once quota is available again, re-running upgrades those
 * entries in place. Cached Places results are final and never re-requested.
 */
async function searchCached(query) {
  const hit = cache[query];
  if (hit?.length && hit[0]._source === 'google-places') return hit;
  if (hit?.length && process.argv.includes('--no-upgrade')) return hit;
  try {
    return await search(query);
  } catch (err) {
    if (hit?.length) return hit;   // quota still gone — keep what we have
    throw err;
  }
}

export default async function geocode() {
  banner('05 · geocode — Google Places (coords + real opening hours)');

  for (const { id } of readUrls()) {
    const out = rawPath(id, 'geo.json');
    const src = rawPath(id, 'entities.json');

    /**
     * The cache is keyed on the post, but the INPUT is the entity list — so a
     * re-extraction that finds new places must invalidate it. It did not, and
     * the failure was silent and expensive: recovering the carousel slides took
     * five posts from 5 entities to 66, and every one of the new ones came back
     * "not geocoded" because stage 05 saw a cached geo.json and skipped.
     *
     * Comparing mtimes keeps the per-query cache underneath doing its job, so
     * re-running still costs nothing for entities already resolved.
     */
    const stale = (() => {
      try { return statSync(src).mtimeMs > statSync(out).mtimeMs; } catch { return false; }
    })();
    if (isCached(out) && !stale) { log('05', `${id} cached`); continue; }
    if (stale) log('05', `${id} entities changed since last geocode — re-resolving`);

    const ex = readJson(src);
    if (!ex) continue;
    const results = [];

    for (const [i, e] of ex.entities.entries()) {
      if (e.type !== 'place') { results.push({ index: i, geocoded: false, reason: 'not a place' }); continue; }

      const query = [e.name, e.neighborhood, e.city, e.country].filter(Boolean).join(', ');
      try {
        const hits = await searchCached(query);
        if (!hits.length) { results.push({ index: i, geocoded: false, reason: 'no result' }); continue; }

        // Score EVERY candidate and take the best. Taking hits[0] blindly picked
        // "Flamsbana" for a query about "Flam Zipline" — the right answer was second.
        const scored = hits.map((p) => {
          const got = p.displayName?.text || '';
          const addr = fold(p.formattedAddress || '');
          const match = nameMatch(e.name, got);
          const cityOk = !e.city || addr.includes(fold(e.city.split(',')[0].trim()));
          const countryOk = !!e.country && addr.includes(fold(e.country));
          const isArea = (p.types || []).some((t) => AREA_TYPES.has(t));

          let confidence = Math.max(0, Math.min(1, match * (cityOk ? 1 : countryOk ? 0.6 : 0.35)));

          // Token overlap cannot see aliases: "Lago di Braies" and "Pragser Wildsee"
          // are one lake in two languages and score 0. A hit corroborated by locality
          // is evidence, not a miss — floor it, and flag it so the call stays visible.
          const aliasSuspected = match < 0.5 && (cityOk || countryOk);
          if (aliasSuspected) confidence = Math.max(confidence, cityOk ? 0.5 : 0.4);

          return { p, got, match, cityOk, countryOk, isArea, confidence, aliasSuspected };
        }).sort((a, b) => b.confidence - a.confidence);

        const best = scored[0];
        const { p, got, isArea, confidence, cityOk, aliasSuspected } = best;

        results.push({
          index: i, geocoded: true,
          place_id: p.id,
          resolved_name: got,
          address: p.formattedAddress || null,
          coords: [p.location.latitude, p.location.longitude],
          primary_type: p.primaryType || null,
          granularity: isArea ? 'area' : 'venue',
          hours: p.regularOpeningHours?.weekdayDescriptions || null,
          periods: p.regularOpeningHours?.periods || null,
          business_status: p.businessStatus || null,
          rating: p.rating ?? null,
          source: p._source || 'google-places',
          confidence: Number(confidence.toFixed(2)),
          city_match: cityOk,
          alias_suspected: aliasSuspected,
          candidates_considered: hits.length,
        });
        log('05', `${String(confidence.toFixed(2))} ${isArea ? 'area ' : 'venue'} ${e.name.slice(0, 28).padEnd(30)} -> ${got.slice(0, 34)}`);
      } catch (err) {
        results.push({ index: i, geocoded: false, reason: err.message });
        log('05', `FAIL ${e.name}: ${err.message}`);
      }
      await sleep(120);
    }
    writeJson(out, { id, results });
  }
}

if (import.meta.url === `file://${process.argv[1]}`) await geocode();
