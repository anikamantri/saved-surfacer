/**
 * Tile prefetch.
 *
 * The prototype must run with WiFi off — a blank grey map during the recording is
 * the one avoidable failure. So the map's tiles are baked into the repo at ingest
 * time rather than fetched live.
 *
 * Two bands:
 *   z0-z4  the whole globe, so the world view pans and zooms offline
 *   z12-15 street detail, but only in a small box around each actual cluster
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PATHS, TUNING, USER_AGENT } from './config.mjs';
import { ensureDir, sleep, log } from './util.mjs';

/**
 * Positron, not dark_all.
 *
 * The app is a light-appearance app now, and a dark basemap under it was the
 * one screen that still looked like a different product. Positron is also the
 * right *kind* of light: almost no colour of its own, so the only saturated
 * things on the map are the entity dots and the geofence radii — which is
 * exactly what the map is for.
 */
const TILE_URL = (z, x, y) => `https://basemaps.cartocdn.com/light_all/${z}/${x}/${y}.png`;

export const lon2x = (lon, z) => Math.floor(((lon + 180) / 360) * 2 ** z);
export const lat2y = (lat, z) => Math.floor(
  ((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) * 2 ** z);

/** Group coordinates into clusters so we only fetch street tiles where saves exist. */
export function clusterCoords(coords, degrees = 0.5) {
  const clusters = [];
  for (const [lat, lon] of coords) {
    const near = clusters.find((c) => Math.abs(c.lat - lat) < degrees && Math.abs(c.lon - lon) < degrees);
    if (near) { near.points.push([lat, lon]); near.lat = avg(near.points, 0); near.lon = avg(near.points, 1); }
    else clusters.push({ lat, lon, points: [[lat, lon]] });
  }
  return clusters;
}
const avg = (pts, i) => pts.reduce((s, p) => s + p[i], 0) / pts.length;

function tilesForBox(minLat, maxLat, minLon, maxLon, z) {
  const out = [];
  for (let x = lon2x(minLon, z); x <= lon2x(maxLon, z); x++)
    for (let y = lat2y(maxLat, z); y <= lat2y(minLat, z); y++) out.push([z, x, y]);
  return out;
}

export function planTiles(coords) {
  const wanted = [];
  const [wz0, wz1] = TUNING.tileZoomWorld;
  for (let z = wz0; z <= wz1; z++)
    for (let x = 0; x < 2 ** z; x++) for (let y = 0; y < 2 ** z; y++) wanted.push([z, x, y]);

  const [cz0, cz1] = TUNING.tileZoomCity;

  /**
   * The padding box widens as you zoom OUT, which is the opposite of the obvious
   * thing and the reason the map stops going black when you pan.
   *
   * A fixed ~4km box is right at street level: detail is expensive and you only
   * need to walk around a neighbourhood. But that same box at z6 is a fraction
   * of one tile, so zooming out left a column of coverage one tile wide with
   * black either side. Low-zoom tiles are cheap — one z6 tile spans hundreds of
   * kilometres — so the box grows to a regional span there for almost nothing.
   */
  const padFor = (z) => (z >= 12 ? 0.035 : Math.min(12, 0.035 * 2 ** ((12 - z) * 0.78)));

  for (const c of clusterCoords(coords)) {
    const lats = c.points.map((p) => p[0]), lons = c.points.map((p) => p[1]);
    for (let z = cz0; z <= cz1; z++) {
      const pad = padFor(z);
      wanted.push(...tilesForBox(Math.min(...lats) - pad, Math.max(...lats) + pad,
                                 Math.min(...lons) - pad, Math.max(...lons) + pad, z));
    }
  }
  return [...new Map(wanted.map((t) => [t.join('/'), t])).values()];
}

/**
 * The style marker, or how 439 dark tiles survived the light redesign.
 *
 * "Skip what exists" is the right cache for a corpus that only grows — but the
 * file's existence says nothing about which BASEMAP it came from. When the app
 * went light, every tile a previous bake had already fetched was silently kept
 * as dark_all, and the map showed patches of the old black basemap only at the
 * zooms and boxes an earlier corpus had covered — a bug indistinguishable from
 * a rendering glitch. The marker names the style the cache belongs to; a bake
 * against a different style ignores the cache wholesale.
 */
const STYLE = 'light_all';
const styleMarker = () => resolve(PATHS.tiles, '.basemap');
const cacheIsCurrentStyle = () => {
  try { return readFileSync(styleMarker(), 'utf8').trim() === STYLE; } catch { return false; }
};

export async function fetchTiles(coords) {
  const plan = planTiles(coords);
  const reusable = cacheIsCurrentStyle();
  if (!reusable) log('tiles', `cache is not ${STYLE} — refetching everything`);
  const todo = plan.filter(([z, x, y]) =>
    !reusable || !existsSync(resolve(PATHS.tiles, String(z), String(x), `${y}.png`)));
  let got = 0, failed = 0;

  // Modest concurrency against a CDN. Still bounded and still identifies itself —
  // this is a one-off bake of ~3k tiles, not a crawler.
  const workers = Array.from({ length: TUNING.tileConcurrency }, async () => {
    while (todo.length) {
      const [z, x, y] = todo.pop();
      const dest = resolve(PATHS.tiles, String(z), String(x), `${y}.png`);
      ensureDir(resolve(dest, '..'));
      try {
        const res = await fetch(TILE_URL(z, x, y), { headers: { 'User-Agent': USER_AGENT } });
        if (!res.ok) { failed++; continue; }
        writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
        if (++got % 400 === 0) log('tiles', `${got} fetched`);
      } catch { failed++; }
      await sleep(TUNING.tileGapMs);
    }
  });
  await Promise.all(workers);
  ensureDir(PATHS.tiles);
  writeFileSync(styleMarker(), STYLE + '\n');
  log('tiles', `${plan.length} planned · ${got} fetched · ${plan.length - todo.length - got - failed} already present · ${failed} failed`);
}
