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
 * That's the screenshot path brief.md ranks as door #1, wired in rather than
 * described: it needs no auth, no API, and works on any platform.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readdirSync, existsSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PATHS, TUNING, USER_AGENT } from './lib/config.mjs';
import { readUrls, asVideoUrl, rawPath, readJson, writeJson, ensureDir, isCached, log, banner } from './lib/util.mjs';

const exec = promisify(execFile);
const IMG = /\.(png|jpe?g|webp)$/i;

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

    // Carousels expose only the first slide; a failed video download leaves nothing.
    // Either way the cover is better than no visual signal at all.
    if (!frames.length && existsSync(cover)) frames.push(cover);

    // --- audio, for transcription ---
    const mp3 = resolve(dir, 'audio.mp3');
    if (!existsSync(mp3) && post.duration) {
      try {
        await download(url, ['-x', '--audio-format', 'mp3'], resolve(dir, 'audio.%(ext)s'));
      } catch (err) { log('02', `${id} audio failed: ${String(err.stderr || err).split('\n')[0]}`); }
    }
    if (existsSync(mp3)) audio = mp3;

    // --- Door B: manual screenshots override/extend whatever we managed above ---
    const manual = resolve(PATHS.manual, id);
    if (existsSync(manual)) {
      const shots = readdirSync(manual).filter((f) => IMG.test(f)).sort()
        .map((f) => resolve(manual, f));
      if (shots.length) { frames.push(...shots); via = 'yt-dlp+screenshots'; }
    }

    writeJson(out, { id, via, frames, audio, cover: existsSync(cover) ? cover : null });
    log('02', `${id} ${String(frames.length).padStart(2)} frames · audio=${audio ? 'yes' : 'no '} · via=${via}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) await media();
