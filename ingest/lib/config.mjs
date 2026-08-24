// Shared configuration and paths for the ingest pipeline.
// Every stage imports from here so there is one place to change a model or a path.

import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { existsSync } from 'node:fs';

const HERE = dirname(fileURLToPath(import.meta.url));
export const ROOT = resolve(HERE, '../..');

// Node 24 loads .env natively — no dotenv dependency.
const ENV_FILE = resolve(ROOT, '.env');
if (existsSync(ENV_FILE)) process.loadEnvFile(ENV_FILE);

export const PATHS = {
  urls:      resolve(ROOT, 'docs/saved-posts.md'),
  raw:       resolve(ROOT, 'data/raw'),      // per-post JSON, committed (small, it's the evidence)
  media:     resolve(ROOT, 'data/media'),    // mp4 / audio / frames, gitignored (large, regenerable)
  manual:    resolve(ROOT, 'data/manual'),   // Door B: hand-dropped screenshots, <id>/*.png
  entities:  resolve(ROOT, 'data/entities.json'),
  report:    resolve(ROOT, 'data/hydration-report.json'),
  ytdlp:     resolve(ROOT, 'ingest/bin/yt-dlp'),
  thumbs:    resolve(ROOT, 'prototype/public/thumbnails'),
  frames:    resolve(ROOT, 'prototype/public/frames'),
  tiles:     resolve(ROOT, 'prototype/public/tiles'),
  bundled:   resolve(ROOT, 'prototype/public/data'),
};

export const KEYS = {
  openai: process.env.OPENAI_API_KEY,
  google: process.env.GOOGLE_MAPS_API_KEY,
};

export const MODELS = {
  extract:    process.env.OPENAI_EXTRACT_MODEL    || 'gpt-5.6-terra',
  transcribe: process.env.OPENAI_TRANSCRIBE_MODEL || 'gpt-transcribe',
};

// Per-post model override. A post whose extraction comes back weak can be bumped
// to the flagship and re-run alone for a fraction of a cent, rather than paying
// flagship rates across posts whose captions already do the work.
export const MODEL_OVERRIDES = {
  // @elizlovesfood — caption is "soo many new cafes in sf" and every name is on
  // screen. terra over-extracted ("Iced latte at Hardware Coffee" is not a place);
  // sol was more disciplined and returned only the real venue.
  '7662261740402494733': 'gpt-5.6-sol',
};

export const TUNING = {
  frames: 5,              // frames sampled per video — enough coverage, modest token cost
  framesThinCaption: 14,  // when the caption says nothing, the frames ARE the payload
  thinCaptionChars: 150,  // below this, treat the caption as uninformative
  frameWidth: 512,        // vision input width; larger buys little for on-screen text
  tileZoomWorld: [0, 4],  // the pannable globe
  tileZoomCity: [12, 15], // street detail around each cluster
  tileConcurrency: 6,     // parallel tile fetches — bounded, one-off bake
  tileGapMs: 120,         // politeness gap per worker
};

/**
 * The on-demand server.
 *
 * yt-dlp and ffmpeg cannot run on iOS — that is *why* there is a server, and it
 * is worth saying plainly rather than hiding. The phone posts a URL, the Mac
 * does the hydration, the phone gets typed entities back.
 *
 * Bind to 0.0.0.0 because the caller is a different device. Campus WiFi very
 * likely isolates clients from each other, so the reachable address is expected
 * to be the Tailscale one; HOST here is only what we bind, not what we advertise.
 */
export const SERVER = {
  port: Number(process.env.CUE_SERVER_PORT || 4321),
  host: process.env.CUE_SERVER_HOST || '0.0.0.0',
};

export const USER_AGENT = 'cue-prototype/0.1 (personal design-challenge tool)';
