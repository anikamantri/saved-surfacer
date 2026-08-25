/**
 * The on-demand ingest server.
 *
 * The phone cannot do this work. `yt-dlp` and `ffmpeg` do not run on iOS, and no
 * public API hands over a saved post's caption — that is *why* there is a
 * server, and the writeup says so plainly rather than hiding it. The phone
 * shares a URL, the Mac hydrates it, the phone gets typed entities back.
 *
 * It imports the existing stages and scopes them to one post. There is no
 * second pipeline: what runs live on camera is the same code that produced all
 * 53 entities offline.
 *
 *   POST /ingest    { url, refresh } -> SSE stream of real stage output, then the entities
 *   POST /delete    { id }   -> remove a post and everything derived from it, rebundle
 *   GET  /entities           -> the whole corpus, for launch sync
 *   GET  /media/...          -> thumbnails and frames for posts newer than the build
 *   GET  /health             -> so the app can say whether the Mac is reachable
 *
 * `refresh` is what the library's hold-to-act menu sends. "model" drops the
 * extraction cache and re-runs the vision call against the frames already on
 * disk; "all" re-hydrates from TikTok. Both go down the same code path as a
 * first ingest, so there is one pipeline and no demo-only branch.
 *
 * Stages 01-06 run scoped to the shared post. Stage 07 runs UNSCOPED on purpose:
 * the bundle has to see the entire corpus to rebuild entities.json and the tiles.
 */

import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, extname, basename } from 'node:path';
import { PATHS, SERVER } from './lib/config.mjs';
import {
  only, allPosts, resolveShareUrl, addUrl, readJson, rawPath, clearCaches, deletePost,
} from './lib/util.mjs';

import hydrate from './01-hydrate.mjs';
import media from './02-media.mjs';
import transcribe from './03-transcribe.mjs';
import extract from './04-extract.mjs';
import geocode from './05-geocode.mjs';
import triggers from './06-triggers.mjs';
import bundle from './07-bundle.mjs';

/**
 * Each stage, and the artifact it must leave behind for THIS post.
 *
 * The artifact is not decoration. Stages are written for batch runs, where one
 * bad post must not abort the other nineteen — so they catch per-post errors,
 * log them, and return normally. In a batch that is right. For a single share
 * from the phone, that one post *is* the run, and a stage that quietly produced
 * nothing was still reporting `done`: the whole seven-stage list showed ticks
 * while extraction had actually failed on an exhausted OpenAI balance.
 *
 * Checking for the artifact catches that generically, for every stage, instead
 * of teaching the server to recognise one API's error text.
 */
const STAGES = [
  ['01 hydrate',    hydrate,    'caption, author, cover',      'post.json'],
  ['02 media',      media,      'frames + audio',              'media.json'],
  ['03 transcribe', transcribe, 'speech to text',              'transcript.json'],
  ['04 extract',    extract,    'typed entities',              'entities.json'],
  ['05 geocode',    geocode,    'coords + opening hours',      'geo.json'],
  ['06 triggers',   triggers,   'wake-up conditions',          'triggers.json'],
  ['07 bundle',     bundle,     'thumbnails, tiles, corpus',   null],
];

// One post at a time. Two concurrent yt-dlp runs writing the same cache is a
// way to lose a take, and there is only ever one phone.
let busy = false;

const json = (res, code, body) => {
  res.writeHead(code, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
  res.end(JSON.stringify(body));
};

/**
 * Progress must stream. A post takes 20-40s (the yt-dlp download plus the vision
 * call) and watching the real stages tick over is both better on camera and more
 * honest than a spinner. The stages already log; we tee console.log into the
 * stream rather than making every stage aware of a transport.
 */
function sse(res) {
  res.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache',
    connection: 'keep-alive',
    'access-control-allow-origin': '*',
    'x-accel-buffering': 'no',
  });
  return (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function teeConsole(onLine) {
  const real = console.log;
  console.log = (...args) => {
    real(...args);
    const line = args.join(' ').replace(/\x1b\[[0-9;]*m/g, '').trimEnd();
    if (line) onLine(line);
  };
  return () => { console.log = real; };
}

async function runIngest(req, res, body) {
  const send = sse(res);
  const fail = (message) => { send('error', { message }); res.end(); };

  if (busy) return fail('already ingesting a post — one at a time');

  let post;
  try {
    post = await resolveShareUrl(body.url);
  } catch (err) {
    return fail(err.message);
  }

  // The share sheet gives tiktok.com/t/ZP8abc..., which carries neither the
  // handle nor the /photo/ vs /video/ distinction the hydration path turns on.
  send('resolved', post);

  // A post already in the corpus is a duplicate, not a job. Say so and stop,
  // before the harvest list is touched and before any stage runs — a second
  // pass over a finished post costs a rebundle for nothing and, on a stale
  // cache, a vision call. An explicit re-run is the one way a known post is
  // meant to come back through here, so `refresh` goes past this.
  if (!body.refresh) {
    const known = (readJson(PATHS.entities, { posts: [] }).posts || []).find((p) => p.id === post.id);
    if (known) {
      send('duplicate', {
        id: post.id,
        url: known.source?.url || post.url,
        author: known.source?.author || null,
        saved_at: known.source?.saved_at || null,
        entities: (known.entities || []).length,
      });
      return res.end();
    }
  }

  // Re-runs clear caches BEFORE the stages start, which is the whole mechanism:
  // every stage skips when its own output already exists, so deleting a prefix
  // of that chain is what makes real work happen again.
  if (body.refresh) {
    const cleared = clearCaches(post.id, body.refresh === 'all' ? 'all' : 'model');
    send('refresh', { scope: body.refresh, cleared });
  }

  const added = addUrl(post.url, body.saved_at || null);
  send('queued', { url: post.url, id: post.id, added, note: added ? 'added to docs/saved-posts.md' : 'already in the harvest list' });

  busy = true;
  const restore = teeConsole((line) => send('log', { line }));
  const started = Date.now();

  try {
    for (const [name, stage, what, artifact] of STAGES) {
      send('stage', { name, what, status: 'running' });
      // 07 must see everything — it rebuilds the whole corpus and bakes tiles.
      if (name.startsWith('07')) allPosts(); else only(post.id);
      const t = Date.now();
      await stage();

      // A stage that swallowed its own error leaves no artifact. Say so, on the
      // stage that actually failed, rather than ticking all seven and finishing
      // with an empty corpus entry.
      if (artifact && !existsSync(rawPath(post.id, artifact))) {
        send('stage', { name, what, status: 'failed', ms: Date.now() - t });
        throw new Error(
          `${name} produced no ${artifact} for ${post.id} — see its log lines above for the cause.`);
      }
      send('stage', { name, what, status: 'done', ms: Date.now() - t });
    }

    const entities = readJson(rawPath(post.id, 'triggers.json'), { entities: [] }).entities;
    send('done', {
      id: post.id,
      url: post.url,
      seconds: Number(((Date.now() - started) / 1000).toFixed(1)),
      entities: entities.length,
      nudge_eligible: entities.filter((e) => e.nudge_eligible).length,
      post: (readJson(PATHS.entities, { posts: [] }).posts || []).find((p) => p.id === post.id) || null,
    });
  } catch (err) {
    send('error', { message: err.message, stack: (err.stack || '').split('\n').slice(0, 4).join('\n') });
  } finally {
    restore();
    allPosts();
    busy = false;
    res.end();
  }
}

const server = createServer(async (req, res) => {
  const { pathname } = new URL(req.url, 'http://localhost');

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET,POST,OPTIONS',
      'access-control-allow-headers': 'content-type',
    });
    return res.end();
  }

  if (pathname === '/health') {
    const corpus = readJson(PATHS.entities, null);
    return json(res, 200, {
      ok: true,
      busy,
      // The app shows this so "the Mac is reachable" is a fact on screen, not a hope.
      corpus: corpus ? { posts: corpus.totals.posts, entities: corpus.totals.entities, generated_at: corpus.generated_at } : null,
    });
  }

  /**
   * Media for posts the phone's bundle predates.
   *
   * The app ships with every thumbnail baked in, but a post shared thirty
   * seconds ago is by definition not in that bundle — and a nudge card with a
   * blank thumbnail loses exactly the provenance that separates this from an
   * ad. So freshly-ingested media is served from here until the next build.
   */
  if (pathname.startsWith('/media/') && req.method === 'GET') {
    const [, , kind, ...rest] = pathname.split('/');
    const roots = { thumbnails: PATHS.thumbs, frames: PATHS.frames };
    if (!roots[kind]) return json(res, 404, { error: 'no such media kind' });

    // Path traversal guard: the id is a number and the filename is ours.
    const safe = rest.map((seg) => basename(decodeURIComponent(seg))).filter((seg) => /^[\w.\-]+$/.test(seg));
    if (safe.length !== rest.length || !safe.length) return json(res, 400, { error: 'bad media path' });

    const file = resolve(roots[kind], ...safe);
    if (!file.startsWith(roots[kind]) || !existsSync(file)) return json(res, 404, { error: 'not found' });

    const type = extname(file) === '.png' ? 'image/png' : 'image/jpeg';
    res.writeHead(200, { 'content-type': type, 'access-control-allow-origin': '*', 'cache-control': 'no-cache' });
    return res.end(readFileSync(file));
  }

  if (pathname === '/entities' && req.method === 'GET') {
    if (!existsSync(PATHS.entities)) return json(res, 404, { error: 'no corpus yet — run the pipeline' });
    res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
    return res.end(readFileSync(PATHS.entities));
  }

  /**
   * Delete a post.
   *
   * A real deletion, not a hidden flag: the post leaves docs/saved-posts.md,
   * its stage caches and media go, and stage 07 rebuilds the corpus without it.
   * "Never" in the nudge card silences ONE entity; this removes the save. They
   * are different promises and the app should not blur them.
   */
  if (pathname === '/delete' && req.method === 'POST') {
    if (busy) return json(res, 409, { error: 'ingesting a post — try again in a moment' });
    let raw = '';
    for await (const chunk of req) raw += chunk;
    let body;
    try { body = JSON.parse(raw || '{}'); } catch { return json(res, 400, { error: 'body must be JSON' }); }
    const id = String(body.id || '').trim();
    if (!/^\d+$/.test(id)) return json(res, 400, { error: 'body must be { id }' });

    busy = true;
    try {
      const result = deletePost(id);
      // Rebundle so entities.json and the app's copy agree with the filesystem.
      allPosts();
      await bundle();
      const corpus = readJson(PATHS.entities, { totals: {} });
      return json(res, 200, { id, ...result, totals: corpus.totals });
    } catch (err) {
      return json(res, 500, { error: err.message });
    } finally {
      busy = false;
    }
  }

  if (pathname === '/ingest' && req.method === 'POST') {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    let body;
    try { body = JSON.parse(raw || '{}'); } catch { return json(res, 400, { error: 'body must be JSON' }); }
    if (!body.url) return json(res, 400, { error: 'body must be { url }' });
    return runIngest(req, res, body);
  }

  json(res, 404, { error: `no route ${req.method} ${pathname}` });
});

server.listen(SERVER.port, SERVER.host, () => {
  console.log(`\n\x1b[1mcue ingest server\x1b[0m  http://${SERVER.host}:${SERVER.port}`);
  console.log('  POST /ingest {url}   GET /entities   GET /health');
  console.log('  the phone reaches this over Tailscale — campus WiFi isolates clients\n');
});
