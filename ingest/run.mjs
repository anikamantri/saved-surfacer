/**
 * Runs the whole pipeline. Every stage is independently resumable and caches its
 * own output, so re-running is cheap and a failure part-way through costs only
 * the stage that failed. Pass --force to recompute everything.
 */
import hydrate from './01-hydrate.mjs';
import media from './02-media.mjs';
import transcribe from './03-transcribe.mjs';
import extract from './04-extract.mjs';
import geocode from './05-geocode.mjs';
import triggers from './06-triggers.mjs';
import bundle from './07-bundle.mjs';

for (const stage of [hydrate, media, transcribe, extract, geocode, triggers, bundle]) await stage();
console.log('\n✓ pipeline complete → data/entities.json\n');
