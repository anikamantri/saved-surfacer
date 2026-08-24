/**
 * Stage 02 — media.
 *
 * Produces the visual and audio signal that extraction reads. Two shapes:
 *
 *   Video posts    -> mp4, sampled into N evenly spaced frames + an audio track.
 *   Photo carousels-> audio only. yt-dlp exposes just the FIRST slide, so a
 *                     carousel yields one frame. When the payload lives on the
 *                     later slides (a licensed-music post with a thin caption),
 *                     that gap is real and Door B below is the answer.
 *
 * Door B — anything dropped in data/manual/<id>/ is picked up as extra frames.
 *          Images are used as-is; a screen RECORDING of the carousel has one
 *          frame per slide pulled out of it automatically (scene detection).
 * That's the screenshot path brief.md ranks as door #1, wired in rather than
 * described: it needs no auth, no API, and works on any platform.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readdirSync, existsSync, writeFileSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import { PATHS, TUNING, USER_AGENT } from './lib/config.mjs';
import { carouselSlides } from './lib/carousel.mjs';
import { readUrls, asVideoUrl, rawPath, readJson, writeJson, ensureDir, isCached, log, banner } from './lib/util.mjs';

const exec = promisify(execFile);
const IMG = /\.(png|jpe?g|webp)$/i;
// iOS screen recordings land as .mov; the others are here so a re-encode still works.
const VID = /\.(mov|mp4|m4v)$/i;

async function download(url, args, dest) {
  await exec(PATHS.ytdlp, ['--no-warnings', '-o', dest, ...args, asVideoUrl(url)],
    { maxBuffer: 64 * 1024 * 1024 });
}

/** Sample frames at evenly spaced midpoints. Seeking before -i keeps this fast. */
async function sampleFrames(video, dir, duration, n) {
  const made = [];
  for (let i = 0; i < n; i++) {
    const t = (duration * (i + 0.5)) / n;
    const out = resolve(dir, `frame-${String(i + 1).padStart(2, '0')}.jpg`);
    await exec('ffmpeg', ['-nostdin', '-loglevel', 'error', '-ss', t.toFixed(2), '-i', video,
      '-frames:v', '1', '-vf', `scale=${TUNING.frameWidth}:-2`, '-q:v', '3', '-y', out]);
    if (existsSync(out)) made.push(out);
  }
  return made;
}

/**
 * Frames from a screen recording — Door B without the hand-picking.
 *
 * A photo carousel's later slides are genuinely unreachable: yt-dlp models a
 * photo post as an audio track plus a cover, and the web page's data blob is
 * stripped for unauthenticated requests. Short of authenticating as the user,
 * the pixels only exist on a screen that has displayed them.
 *
 * So swipe through the carousel once with the iOS screen recorder and drop the
 * .mov in. Scene-change detection then picks out one frame per slide by itself:
 * a swipe IS a scene change, which is exactly the signal ffmpeg is looking for.
 * That turns "screenshot every slide and name them in order" into one capture
 * and no decisions — the extraction stays automatic, which is the point.
 */
async function framesFromRecording(video, dir, tag, max = 24) {
  const pattern = resolve(dir, `${tag}-%02d.jpg`);
  // 0.25 is deliberately loose: slides in one carousel share a visual style, so
  // a strict threshold misses transitions between two similar-looking photos.
  try {
    await exec('ffmpeg', ['-nostdin', '-loglevel', 'error', '-i', video,
      '-vf', `select='gt(scene,0.25)',scale=${TUNING.frameWidth}:-2`,
      '-vsync', 'vfr', '-frames:v', String(max), '-q:v', '3', '-y', pattern]);
  } catch (err) {
    log('02', `recording scene-detect failed: ${String(err.stderr || err).split('\n')[0]}`);
  }
  let out = readdirSync(dir).filter((f) => f.startsWith(`${tag}-`) && IMG.test(f)).sort()
    .map((f) => resolve(dir, f));

  // A slow, steady swipe can register as no scene change at all. Uniform
  // sampling is the honest fallback — worse frames, but never zero.
  if (out.length < 3) {
    let duration = 0;
    try {
      const { stdout } = await exec('ffprobe', ['-v', 'error', '-show_entries', 'format=duration',
        '-of', 'default=noprint_wrappers=1:nokey=1', video]);
      duration = parseFloat(stdout);
    } catch { /* fall through */ }
    if (duration > 0) {
      log('02', `recording gave ${out.length} scene cuts — falling back to uniform sampling`);
      out = await sampleFrames(video, dir, duration, Math.min(max, Math.max(6, Math.round(duration))));
    }
  }
  return out;
}

/**
 * Every slide of a photo carousel, downloaded as frames.
 *
 * When there are more slides than the vision budget allows, sample evenly but
 * ALWAYS keep the first and last. "recommendations on the last slide" is a real
 * caption in this corpus — taking the first N would drop exactly the payload.
 */
async function saveCarousel(id, dir, cap = TUNING.maxCarouselSlides) {
  const { ok, note, slides } = await carouselSlides(id);
  if (!ok) { log('02', `${id} carousel lookup failed: ${note}`); return []; }
  if (!slides.length) return [];

  let picked = slides;
  if (slides.length > cap) {
    const idx = new Set([0, slides.length - 1]);
    for (let i = 0; i < cap - 2; i++) idx.add(Math.round(((i + 1) * (slides.length - 1)) / (cap - 1)));
    picked = [...idx].sort((a, b) => a - b).map((i) => slides[i]);
  }

  const made = [];
  for (const [n, url] of picked.entries()) {
    const dest = resolve(dir, `slide-${String(n + 1).padStart(2, '0')}.jpg`);
    if (!existsSync(dest)) {
      // Signed with x-expires, like every other TikTok asset — fetch now or lose it.
      try { await saveCover(url, dest); } catch { continue; }
    }
    if (existsSync(dest)) made.push(dest);
  }
  log('02', `${id} carousel -> ${made.length}/${slides.length} slides`);
  return made;
}

async function saveCover(url, dest) {
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) return null;
  writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
  return dest;
}

export default async function media() {
  banner('02 · media — frames + audio (Door A: yt-dlp · Door B: manual screenshots)');

  for (const { id, url } of readUrls()) {
    const post = readJson(rawPath(id, 'post.json'));
    if (!post) { log('02', `${id} skipped (not hydrated)`); continue; }

    const dir = ensureDir(resolve(PATHS.media, id));
    const out = rawPath(id, 'media.json');
    if (isCached(out)) { log('02', `${id} cached`); continue; }

    const frames = [];
    let audio = null;
    let via = 'yt-dlp';

    // --- cover image: always useful, and it's the prototype's thumbnail ---
    const cover = resolve(dir, 'cover.jpg');
    if (post.cover_url && !existsSync(cover)) {
      try { await saveCover(post.cover_url, cover); } catch { /* signed URLs expire; not fatal */ }
    }

    // --- video frames, when there is a video at all ---
    if (post.hydration.has_video) {
      const mp4 = resolve(dir, 'video.mp4');
      // TikTok 403s some format ids; fall through a few selectors before giving up.
      const selectors = ['bv*[height<=720]+ba/b[height<=720]/b', 'b[height<=1080]/b', 'download', 'worst'];
      for (const sel of selectors) {
        if (existsSync(mp4)) break;
        try {
          await download(url, ['-f', sel, '--merge-output-format', 'mp4'], mp4);
        } catch { /* try the next selector */ }
      }
      // A post captioned "soo many new cafes in sf" hides every name on screen.
      // Denser sampling is the lever there, not a bigger model.
      const n = (post.caption || '').length < TUNING.thinCaptionChars
        ? TUNING.framesThinCaption : TUNING.frames;
      if (existsSync(mp4) && post.duration) {
        frames.push(...await sampleFrames(mp4, dir, post.duration, n));
      } else {
        log('02', `${id} video unavailable (all selectors 403) — falling back to cover`);
      }
    }

    // --- Door C: the embed endpoint carries every slide of a photo carousel ---
    // This is what makes carousels reachable without screenshots. It runs whenever
    // the video path produced nothing, which is exactly the photo-post case.
    if (!frames.length) {
      const slides = await saveCarousel(id, dir);
      if (slides.length) { frames.push(...slides); via = 'yt-dlp+embed-carousel'; }
    }

    // A failed video download leaves nothing; the cover beats no visual at all.
    if (!frames.length && existsSync(cover)) frames.push(cover);

    // --- audio, for transcription ---
    const mp3 = resolve(dir, 'audio.mp3');
    if (!existsSync(mp3) && post.duration) {
      try {
        await download(url, ['-x', '--audio-format', 'mp3'], resolve(dir, 'audio.%(ext)s'));
      } catch (err) { log('02', `${id} audio failed: ${String(err.stderr || err).split('\n')[0]}`); }
    }
    if (existsSync(mp3)) audio = mp3;

    // --- Door B: hand-captured material extends whatever we managed above ---
    const manual = resolve(PATHS.manual, id);
    if (existsSync(manual)) {
      const entries = readdirSync(manual).sort();

      const shots = entries.filter((f) => IMG.test(f)).map((f) => resolve(manual, f));
      if (shots.length) { frames.push(...shots); via = 'yt-dlp+screenshots'; }

      // A screen recording of the carousel: one capture, frames found for you.
      const clips = entries.filter((f) => VID.test(f)).map((f) => resolve(manual, f));
      for (const [n, clip] of clips.entries()) {
        const got = await framesFromRecording(clip, dir, `rec${n + 1}`);
        if (got.length) {
          frames.push(...got);
          via = shots.length ? 'yt-dlp+screenshots+recording' : 'yt-dlp+recording';
          log('02', `${id} recording ${basename(clip)} -> ${got.length} slide frames`);
        }
      }
    }

    writeJson(out, { id, via, frames, audio, cover: existsSync(cover) ? cover : null });
    log('02', `${id} ${String(frames.length).padStart(2)} frames · audio=${audio ? 'yes' : 'no '} · via=${via}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) await media();
