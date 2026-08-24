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

import { existsSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PATHS, TUNING, USER_AGENT } from './config.mjs';
import { ensureDir, sleep, log } from './util.mjs';

const TILE_URL = (z, x, y) => `https://basemaps.cartocdn.com/dark_all/${z}/${x}/${y}.png`;

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

export async function fetchTiles(coords) {
  const plan = planTiles(coords);
  const todo = plan.filter(([z, x, y]) => !existsSync(resolve(PATHS.tiles, String(z), String(x), `${y}.png`)));
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
  log('tiles', `${plan.length} planned · ${got} fetched · ${plan.length - todo.length - got - failed} already present · ${failed} failed`);
}
