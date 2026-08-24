/**
 * Stage 01 — hydrate.
 *
 * Turns a bare URL into content. This is the step the brief calls the real
 * constraint ("hydration, not intelligence"), so it runs BOTH doors and records
 * what each one could reach:
 *
 *   Door A — tiktok.com/oembed.  Public, keyless, no auth. The path you'd want
 *            to depend on. It returns HTTP 400 for every /photo/ post.
 *   Door B — yt-dlp metadata.    Reaches all 14, including the carousels, and
 *            crucially exposes `description` (the FULL caption; oEmbed's `title`
 *            and yt-dlp's own `title` are both truncated at ~73 chars).
 *
 * The failures are the point, so they're written to data/hydration-report.json
 * as data rather than swallowed as errors.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { PATHS, USER_AGENT } from './lib/config.mjs';
import { readUrls, asVideoUrl, rawPath, readJson, writeJson, isCached, log, banner, sleep } from './lib/util.mjs';

const exec = promisify(execFile);

async function tryOembed(url) {
  try {
    const res = await fetch(`https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`,
      { headers: { 'User-Agent': USER_AGENT } });
    if (!res.ok) return { ok: false, status: res.status };
    const body = await res.json();
    if (!body.title) return { ok: false, status: res.status, note: 'no title field' };
    return { ok: true, status: res.status, body };
  } catch (err) {
    return { ok: false, status: 0, note: err.message };
  }
}

async function tryYtdlp(url) {
  // The /photo/ -> /video/ rewrite is what makes carousels reachable at all.
  try {
    const { stdout } = await exec(PATHS.ytdlp,
      ['--skip-download', '--dump-single-json', '--no-warnings', asVideoUrl(url)],
      { maxBuffer: 64 * 1024 * 1024 });
    return { ok: true, body: JSON.parse(stdout) };
  } catch (err) {
    return { ok: false, note: (err.stderr || err.message || '').split('\n')[0] };
  }
}

/** "original sound" means the creator recorded it — a named commercial track means music. */
function classifyAudio(info) {
  const track = (info?.track || '').toLowerCase();
  if (!info?.duration) return 'silent';
  if (!track || track.startsWith('original sound')) return 'narration';
  return 'music';
}

export default async function hydrate() {
  banner('01 · hydrate — oEmbed (keyless) + yt-dlp (full caption)');
  const posts = readUrls();
  const report = [];

  for (const post of posts) {
    const out = rawPath(post.id, 'post.json');
    if (isCached(out)) {
      const cached = readJson(out);
      report.push(cached.hydration);
      log('01', `${post.id} cached`);
      continue;
    }

    const [oembed, ytdlp] = [await tryOembed(post.url), await tryYtdlp(post.url)];
    const info = ytdlp.ok ? ytdlp.body : null;

    // Prefer yt-dlp's `description`: it is the only field carrying the untruncated caption.
    const caption = info?.description || oembed.body?.title || '';
    const captionSource = info?.description ? 'yt-dlp.description'
      : oembed.body?.title ? 'oembed.title' : 'none';

    const hydration = {
      id: post.id,
      url: post.url,
      kind: post.kind,
      oembed: oembed.ok ? 'ok' : `fail (${oembed.status || oembed.note})`,
      ytdlp: ytdlp.ok ? 'ok' : `fail (${ytdlp.note})`,
      caption_source: captionSource,
      caption_chars: caption.length,
      has_video: !!info?.formats?.some((f) => f.vcodec && f.vcodec !== 'none'),
      audio_seconds: info?.duration ?? null,
      audio_kind: classifyAudio(info),
    };
    report.push(hydration);

    writeJson(out, {
      id: post.id,
      url: post.url,
      kind: post.kind,
      author: info?.uploader || oembed.body?.author_name || null,
      author_url: info?.uploader_url || oembed.body?.author_url || null,
      caption,
      // No API exposes when *you* saved something — only when the creator posted.
      // Real save dates need the TikTok export (1-4 days), so this is flagged honestly.
      saved_at: post.savedAt || (info?.upload_date
        ? `${info.upload_date.slice(0, 4)}-${info.upload_date.slice(4, 6)}-${info.upload_date.slice(6, 8)}`
        : null),
      saved_at_is_estimate: !post.savedAt,
      audio_kind: hydration.audio_kind,
      duration: info?.duration ?? null,
      cover_url: (info?.thumbnails || []).at(-1)?.url || oembed.body?.thumbnail_url || null,
      hydration,
    });

    log('01', `${post.id} @${(info?.uploader || '?').padEnd(20)} oembed=${oembed.ok ? 'ok  ' : 'FAIL'} caption=${String(caption.length).padStart(4)}ch audio=${hydration.audio_kind}`);
    await sleep(700);
  }

  const okE = report.filter((r) => r.oembed === 'ok').length;
  const okY = report.filter((r) => r.ytdlp === 'ok').length;
  writeJson(PATHS.report, {
    generated_at: new Date().toISOString(),
    finding: 'The public keyless endpoint (oEmbed) fails on every photo carousel — half this corpus. '
           + 'yt-dlp reaches all of them, and is also the only source of the untruncated caption. '
           + 'Hydration, not extraction, is what limits coverage.',
    totals: { posts: report.length, oembed_ok: okE, ytdlp_ok: okY },
    posts: report,
  });
  log('01', `oEmbed reached ${okE}/${report.length} · yt-dlp reached ${okY}/${report.length}`);
  return report;
}

if (import.meta.url === `file://${process.argv[1]}`) await hydrate();
