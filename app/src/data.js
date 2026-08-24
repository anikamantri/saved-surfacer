/**
 * The corpus. Baked in at build time from the pipeline's output, then optionally
 * refreshed from the Mac.
 *
 * Baked-in-first is not a fallback, it is the design: the app opens and works
 * with no network, on a plane, with the Mac asleep. The server only ever ADDS —
 * a post shared from TikTok minutes ago. If it is unreachable, everything the
 * app already knows still works, and it says so plainly.
 */

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

export const TYPE_COLOR = {
  place: '#ff8a3d', workout: '#4ade80', product: '#60a5fa', recipe: '#f472b6', other: '#a78bfa',
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
export const thumb = (p) => {
  if (!p.source.thumbnail) return null;
  return BAKED_IDS.has(p.id) ? `./${p.source.thumbnail}` : `${serverHost()}/media/${p.source.thumbnail}`;
};

export const isFresh = (p) => !BAKED_IDS.has(p.id);

export const fmtDate = (iso) => {
  if (!iso) return 'unknown';
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
};

export const ago = (iso) => {
  if (!iso) return '';
  const days = Math.round((Date.now() - new Date(iso)) / 86400000);
  if (days < 1) return 'today';
  if (days < 14) return `${days} days ago`;
  if (days < 60) return `${Math.round(days / 7)} weeks ago`;
  if (days < 365) return `${Math.round(days / 30)} months ago`;
  return `${(days / 365).toFixed(1)} years ago`;
};
