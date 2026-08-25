// Small helpers shared by the pipeline stages.

import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { resolve, basename } from 'node:path';
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
    // Every URL on the line, not just the first. A file that ended without a
    // newline once let addUrl append straight onto the last entry, and the
    // second URL on that line was invisible to the whole pipeline — a post
    // shared from the phone that simply never existed. The writer is fixed
    // below; scanning the whole line means a hand-edited list cannot do it again.
    for (const m of line.matchAll(new RegExp(POST_URL_RE, 'g'))) {
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
  // The list did not always end in a newline, and appending to that concatenated
  // the new URL onto the previous entry — the post was written to disk and still
  // never ingested. Start a line if the file does not already end one.
  const lead = text.length && !text.endsWith('\n') ? '\n' : '';
  appendFileSync(PATHS.urls, `${lead}${url}\t${date}\n`);
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

/**
 * Remove a post from the harvest list.
 *
 * The mirror of addUrl, and the reason "delete" in the app is a real deletion
 * rather than a hidden flag: docs/saved-posts.md is the pipeline's only input,
 * so a post that leaves this file is gone from the next bundle by construction.
 * Keyed on the id, not the URL — the same post is reachable as /photo/ and
 * /video/ and the share sheet returns whichever form it feels like.
 */
export function removeUrl(id) {
  const text = readFileSync(PATHS.urls, 'utf8');
  const kept = text.split('\n').filter((line) => line.match(POST_URL_RE)?.[2] !== String(id));
  const removed = kept.length !== text.split('\n').length;
  if (removed) writeFileSync(PATHS.urls, kept.join('\n'));
  return removed;
}

/**
 * Every artifact a post owns, so both "re-run" and "delete" can be honest about
 * what they touch. Listed rather than globbed at each call site because a
 * near-miss here silently leaves a stale cache that makes a re-run look broken.
 */
export function postArtifacts(id) {
  return {
    // Stage caches, in pipeline order. Deleting a prefix of this list re-runs
    // exactly the stages from there on: every stage checks its own output.
    raw: ['post.json', 'media.json', 'transcript.json', 'entities.json', 'geo.json', 'triggers.json']
      .map((suffix) => rawPath(id, suffix)),
    // Bulky and regenerable.
    media: resolve(PATHS.media, id),
    // Baked into the app, which is why the app works offline.
    thumb: resolve(PATHS.thumbs, `${id}.jpg`),
    frames: resolve(PATHS.frames, id),
    manual: resolve(PATHS.manual, id),
  };
}

/**
 * Clear caches so the next run redoes real work.
 *
 * `model` keeps the expensive-to-fetch half (caption, frames, transcript) and
 * re-runs the extraction — which is what "re-run the model" should mean, and
 * costs one vision call rather than a fresh yt-dlp download. Stage 05 notices
 * that entities.json is newer than geo.json and re-geocodes underneath, hitting
 * its per-query cache rather than the Places quota.
 *
 * `all` re-hydrates from TikTok, for a post whose caption or slides came back
 * wrong the first time.
 */
export function clearCaches(id, scope = 'model') {
  const a = postArtifacts(id);
  const drop = scope === 'all'
    ? a.raw
    : a.raw.filter((p) => /entities\.json$/.test(p));
  const gone = [];
  for (const file of drop) {
    if (existsSync(file)) { rmSync(file); gone.push(basename(file)); }
  }
  if (scope === 'all' && existsSync(a.media)) { rmSync(a.media, { recursive: true }); gone.push(`media/${id}/`); }
  return gone;
}

/** Delete a post and everything derived from it. Manual Door B drops survive. */
export function deletePost(id) {
  const a = postArtifacts(id);
  const gone = [];
  for (const file of a.raw) if (existsSync(file)) { rmSync(file); gone.push(basename(file)); }
  for (const dir of [a.media, a.frames]) {
    if (existsSync(dir)) { rmSync(dir, { recursive: true }); gone.push(`${basename(dir)}/`); }
  }
  if (existsSync(a.thumb)) { rmSync(a.thumb); gone.push(`thumbnails/${id}.jpg`); }
  const delisted = removeUrl(id);
  return { delisted, removed: gone };
}
