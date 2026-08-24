/**
 * Stage 03 — transcribe.
 *
 * Audio is the signal that rescues the caption-thin posts: "we love a drop set"
 * says nothing, but the voiceover names the exercise.
 *
 * The trap: on photo carousels the audio is usually a licensed song, so the
 * transcript is song lyrics — pure noise that extraction will happily invent
 * places out of. Stage 01 already tagged each post narration/music/silent from
 * yt-dlp's `track` metadata (a creator recording reports "original sound"),
 * which is a far more reliable signal than guessing from the text afterwards.
 *
 * Music posts are still transcribed — it's cheap, and the tag travels with the
 * text so stage 04 can discount it rather than trust it.
 */

import { readFileSync, existsSync } from 'node:fs';
import { basename } from 'node:path';
import { KEYS, MODELS } from './lib/config.mjs';
import { readUrls, rawPath, readJson, writeJson, isCached, log, banner } from './lib/util.mjs';

async function transcribe(file) {
  const form = new FormData();
  form.append('file', new Blob([readFileSync(file)], { type: 'audio/mpeg' }), basename(file));
  form.append('model', MODELS.transcribe);

  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${KEYS.openai}` },
    body: form,
  });
  if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 200)}`);
  return (await res.json()).text || '';
}

export default async function run() {
  banner(`03 · transcribe — ${MODELS.transcribe}`);

  for (const { id } of readUrls()) {
    const out = rawPath(id, 'transcript.json');
    if (isCached(out)) { log('03', `${id} cached`); continue; }

    const post = readJson(rawPath(id, 'post.json'));
    const mediaRec = readJson(rawPath(id, 'media.json'));
    if (!mediaRec?.audio || !existsSync(mediaRec.audio)) {
      writeJson(out, { id, kind: 'silent', text: '' });
      log('03', `${id} no audio`);
      continue;
    }

    try {
      const text = await transcribe(mediaRec.audio);
      writeJson(out, { id, kind: post.audio_kind, model: MODELS.transcribe, text });
      const preview = text.replace(/\s+/g, ' ').slice(0, 76);
      log('03', `${id} ${post.audio_kind.padEnd(9)} ${String(text.length).padStart(4)}ch  ${preview}`);
    } catch (err) {
      writeJson(out, { id, kind: post.audio_kind, error: String(err.message) , text: '' });
      log('03', `${id} FAILED ${err.message}`);
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) await run();
