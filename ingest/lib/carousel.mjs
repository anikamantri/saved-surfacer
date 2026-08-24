/**
 * Door C — photo carousels, in full, automatically.
 *
 * The project long recorded carousels as unreachable past their first slide,
 * and that was true of both doors it had:
 *
 *   yt-dlp     models a photo post as an audio track plus a cover. A direct
 *              dump returns 1 format (mp3) and 2 thumbnails, both slide one.
 *   the page    `__UNIVERSAL_DATA_FOR_REHYDRATION__` is served to logged-out
 *              clients with NO `webapp.video-detail` scope at all — TikTok
 *              strips the post data entirely.
 *
 * But the **embed** endpoint is a third surface, and it is not stripped. It is
 * public, keyless, and returns `imagePostInfo.displayImages[]` — every slide,
 * at full resolution. A post whose payload is on slide 12 is reachable after
 * all, and the manual screenshot path stops being necessary.
 *
 * TRAP — these URLs are signed with `x-expires`, like thumbnails. They must be
 * downloaded now, never stored and fetched later.
 */

import { USER_AGENT } from './config.mjs';

const EMBED = (id) => `https://www.tiktok.com/embed/v2/${id}`;

/** Depth-first walk: the blob's shape is not contractual, so find the key rather than path to it. */
function findDisplayImages(node) {
  if (!node || typeof node !== 'object') return null;
  if (node.imagePostInfo?.displayImages?.length) return node.imagePostInfo.displayImages;
  for (const value of Object.values(node)) {
    const hit = findDisplayImages(value);
    if (hit) return hit;
  }
  return null;
}

/**
 * Every slide URL for a photo post, in order. Empty array for a normal video,
 * or when the embed does not carry the data — callers treat it as "no extra
 * slides", never as an error.
 */
export async function carouselSlides(id) {
  let html;
  try {
    const res = await fetch(EMBED(id), { headers: { 'User-Agent': USER_AGENT } });
    if (!res.ok) return { ok: false, note: `embed HTTP ${res.status}`, slides: [] };
    html = await res.text();
  } catch (err) {
    return { ok: false, note: err.message, slides: [] };
  }

  // The embed ships its state in a JSON <script>; the id has changed before, so
  // try the known ones and fall back to any application/json block.
  const blob = html.match(/id="__FRONTITY_CONNECT_STATE__"[^>]*>([\s\S]*?)<\/script>/)
    || html.match(/id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/)
    || html.match(/<script[^>]*type="application\/json"[^>]*>([\s\S]*?)<\/script>/);
  if (!blob) return { ok: false, note: 'no state blob in embed', slides: [] };

  let parsed;
  try { parsed = JSON.parse(blob[1]); }
  catch (err) { return { ok: false, note: `blob unparseable: ${err.message}`, slides: [] }; }

  const images = findDisplayImages(parsed);
  if (!images) return { ok: true, note: 'not a carousel', slides: [] };

  // urlList carries CDN mirrors of the same image; the first is enough.
  const slides = images.map((im) => (im.urlList || [])[0]).filter(Boolean);
  return { ok: true, note: `${slides.length} slides`, slides };
}
