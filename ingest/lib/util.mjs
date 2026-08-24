// Small helpers shared by the pipeline stages.

import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { PATHS, USER_AGENT } from './config.mjs';

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function ensureDir(d) {
  if (!existsSync(d)) mkdirSync(d, { recursive: true });
  return d;
}

/**
 * Scope the pipeline to one post.
 *
 * Every stage calls readUrls(), so setting this once narrows the whole run to a
 * single id without touching a single stage. That is what lets the server run
 * "just this post" on demand — stages 01-06 scoped, stage 07 deliberately NOT,
 * because the bundle has to see the entire corpus to rebuild entities.json.
 */
let ONLY = null;
export const only = (id) => { ONLY = id; };
export const allPosts = () => { ONLY = null; };

export const POST_URL_RE = /https:\/\/(?:www\.)?tiktok\.com\/@[\w.\-]+\/(video|photo)\/(\d+)/;

/**
 * Read the harvest list. `docs/saved-posts.md` stays the single source of truth:
 * any line containing a TikTok URL counts, so the file can carry prose and headers.
 * An optional tab-separated second column records the real save date.
 */
export function readUrls() {
  const text = readFileSync(PATHS.urls, 'utf8');
  const out = [];
  for (const line of text.split('\n')) {
    const m = line.match(POST_URL_RE);
    if (!m) continue;
    const [url, kind, id] = [m[0], m[1], m[2]];
    if (ONLY && id !== ONLY) continue;
    // A post's identity is its numeric id, not its URL: the same post is reachable
    // as both /photo/ and /video/, and the share sheet will hand back whichever
    // form TikTok feels like. De-duping on the string double-counted a post and
    // silently reported 15 posts / 60 entities for a 14-post corpus.
    if (out.some((p) => p.id === id)) continue;
    const savedAt = (line.split('\t')[1] || '').trim().match(/^\d{4}-\d{2}-\d{2}$/)?.[0] || null;
    out.push({ id, url, kind, savedAt });
  }
  return out;
}

/**
 * The share sheet does not hand over a canonical URL.
 *
 * "Share -> Cue" from inside TikTok gives `tiktok.com/t/ZP8abc...`, which carries
 * neither the author handle nor the numeric id — and crucially not the
 * /photo/ vs /video/ distinction the whole hydration path turns on. So the
 * short link must be followed to its destination BEFORE `asVideoUrl` can apply.
 *
 * TikTok answers short links with a 301 and no body, so a HEAD-style redirect
 * follow is enough; we read `res.url` rather than parsing Location by hand
 * because there can be more than one hop.
 */
export async function resolveShareUrl(input) {
  const url = String(input || '').trim();
  const direct = url.match(POST_URL_RE);
  if (direct) return { url: direct[0], id: direct[2], kind: direct[1], resolved: false };

  if (!/tiktok\.com/.test(url)) throw new Error(`not a TikTok URL: ${url}`);

  const res = await fetch(url, { redirect: 'follow', headers: { 'User-Agent': USER_AGENT } });
  const final = (res.url || '').split('?')[0];
  const m = final.match(POST_URL_RE);
  if (!m) throw new Error(`share link did not resolve to a post: ${final || url}`);
  return { url: m[0], id: m[2], kind: m[1], resolved: true, from: url };
}

/**
 * Append a newly shared post to the harvest list.
 *
 * The list stays the pipeline's single input even when the input arrives from a
 * phone — a post captured through the share sheet is indistinguishable, one run
 * later, from one harvested by hand.
 */
export function addUrl(url, savedAt = null) {
  const text = readFileSync(PATHS.urls, 'utf8');
  // Match on the id, not the URL — see readUrls above.
  const id = url.match(POST_URL_RE)?.[2];
  const known = new Set([...text.matchAll(new RegExp(POST_URL_RE, 'g'))].map((m) => m[2]));
  if (id && known.has(id)) return false;
  const date = savedAt || new Date().toISOString().slice(0, 10);
  appendFileSync(PATHS.urls, `${url}\t${date}\n`);
  return true;
}

/**
 * yt-dlp refuses /photo/ URLs on every version tested, but happily accepts the
 * same id under /video/ — which is how the photo carousels get hydrated at all.
 */
export const asVideoUrl = (url) => url.replace('/photo/', '/video/');

export const rawPath = (id, suffix) => resolve(PATHS.raw, `${id}.${suffix}`);

export function readJson(path, fallback = null) {
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return fallback; }
}

export function writeJson(path, data) {
  ensureDir(resolve(path, '..'));
  writeFileSync(path, JSON.stringify(data, null, 2) + '\n');
}

/** Stages are resumable: if the output exists and --force wasn't passed, skip the work. */
export const force = () => process.argv.includes('--force');
export const isCached = (path) => existsSync(path) && !force();

export function log(stage, msg) {
  console.log(`  [${stage}] ${msg}`);
}

export function banner(title) {
  console.log(`\n\x1b[1m${title}\x1b[0m`);
}
