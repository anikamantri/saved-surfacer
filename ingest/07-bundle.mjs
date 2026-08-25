/**
 * Stage 07 — bundle.
 *
 * Collapses every per-post artifact into the single file the prototype reads,
 * copies thumbnails, and bakes the map tiles. After this stage the prototype
 * needs no network at all.
 */

import { existsSync, copyFileSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve } from 'node:path';
import { PATHS, DEMO_ANCHORS } from './lib/config.mjs';
import { readUrls, rawPath, readJson, writeJson, ensureDir, log, banner } from './lib/util.mjs';
import { fetchTiles } from './lib/tiles.mjs';

const exec = promisify(execFile);

export default async function bundle() {
  banner('07 · bundle — thumbnails, tiles, entities.json');
  ensureDir(PATHS.thumbs);
  ensureDir(PATHS.bundled);

  const posts = [];

  for (const { id, url, kind } of readUrls()) {
    const post = readJson(rawPath(id, 'post.json'));
    const tg = readJson(rawPath(id, 'triggers.json'));
    const ex = readJson(rawPath(id, 'entities.json'));
    const mediaRec = readJson(rawPath(id, 'media.json'));
    const tr = readJson(rawPath(id, 'transcript.json'), { text: '', kind: 'silent' });
    if (!post || !tg) continue;

    // Thumbnail: downscale with sips (built into macOS) so the repo stays light.
    let thumb = null;
    if (mediaRec?.cover && existsSync(mediaRec.cover)) {
      const dest = resolve(PATHS.thumbs, `${id}.jpg`);
      copyFileSync(mediaRec.cover, dest);
      try { await exec('sips', ['-Z', '480', dest]); } catch { /* keep full size */ }
      thumb = `thumbnails/${id}.jpg`;
    }

    // Frames are copied into the app too: the Extract screen shows the model's actual
    // inputs beside its output, which is the whole point of that screen.
    const frameDir = ensureDir(resolve(PATHS.frames, id));
    const frames = [];
    for (const [n, f] of (mediaRec?.frames || []).entries()) {
      if (!existsSync(f)) continue;
      const name = `frame-${String(n + 1).padStart(2, '0')}.jpg`;
      const dest = resolve(frameDir, name);
      copyFileSync(f, dest);
      try { await exec('sips', ['-Z', '320', dest]); } catch { /* keep full size */ }
      // Listed, not inferred: frames_used is what the extractor was told to
      // sample, and a carousel slide that failed to copy would leave the post
      // page rendering broken images from a count that was never a file list.
      frames.push(`frames/${id}/${name}`);
    }

    posts.push({
      id,
      source: {
        url, kind,
        author: post.author,
        author_url: post.author_url,
        saved_at: post.saved_at,
        saved_at_is_estimate: post.saved_at_is_estimate,
        thumbnail: thumb,
        caption: post.caption,
      },
      // Kept so the Extract screen can show the real inputs beside the real output.
      evidence: {
        hydrated_via: post.hydration.oembed === 'ok' ? 'oembed + yt-dlp' : 'yt-dlp only (oEmbed 400)',
        oembed_worked: post.hydration.oembed === 'ok',
        frames_used: ex?.frames_used ?? 0,
        transcript_kind: tr.kind,
        transcript_was_useful: ex?.transcript_was_useful ?? false,
        transcript: tr.text || '',
        frames,
      },
      extraction: { model: ex?.model, signals: ex?.signals || [], run_at: ex?.run_at, usage: ex?.usage },
      entities: tg.entities.map((e, i) => ({
        id: `${id}-${i}`,
        type: e.type,
        name: e.name,
        category: e.category,
        hook: e.hook,
        neighborhood: e.neighborhood,
        city: e.city,
        country: e.country,
        found_in: e.found_in,
        trigger_class: e.trigger_class,
        decay: e.decay,
        trigger: e.trigger,
        nudge_eligible: e.nudge_eligible,
        why_not: e.why_not,
        confidence: {
          extraction: e.extraction_confidence,
          geocode: e.geo?.confidence ?? null,
          overall: e.overall,
        },
        place: e.geo ? {
          place_id: e.geo.place_id,
          resolved_name: e.geo.resolved_name,
          address: e.geo.address,
          coords: e.geo.coords,
          granularity: e.geo.granularity,
          hours: e.geo.hours,
          periods: e.geo.periods,
          rating: e.geo.rating,
          source: e.geo.source,
        } : null,
      })),
    });
  }

  const all = posts.flatMap((p) => p.entities);
  const out = {
    generated_at: new Date().toISOString(),
    totals: {
      posts: posts.length,
      entities: all.length,
      nudge_eligible: all.filter((e) => e.nudge_eligible).length,
      geocoded: all.filter((e) => e.place).length,
      with_hours: all.filter((e) => e.place?.hours).length,
    },
    hydration: readJson(PATHS.report),
    posts,
  };

  writeJson(PATHS.entities, out);
  writeJson(resolve(PATHS.bundled, 'entities.json'), out);
  log('07', `${out.totals.posts} posts · ${out.totals.entities} entities · ${out.totals.nudge_eligible} nudge-eligible · ${out.totals.with_hours} with hours`);

  // Bake tiles only around coordinates we actually trust, so one bad geocode does
  // not cost 400 tiles of the wrong continent.
  const trusted = all.filter((e) => e.place?.coords && e.confidence.overall >= 0.5).map((e) => e.place.coords);
  const anchors = DEMO_ANCHORS.map((a) => a.coords);
  log('07', `baking tiles around ${trusted.length} trusted coordinates`
    + (anchors.length ? ` + ${anchors.length} demo anchor(s): ${DEMO_ANCHORS.map((a) => a.name).join(', ')}` : ''));
  await fetchTiles([...trusted, ...anchors]);
}

if (import.meta.url === `file://${process.argv[1]}`) await bundle();
