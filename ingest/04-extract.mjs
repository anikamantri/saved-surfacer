/**
 * Stage 04 — extract.
 *
 * The core of the pipeline: caption + transcript + frames go in, typed entities
 * come out. A strict JSON schema forces the shape, so nothing needs parsing and
 * the model cannot drift into prose.
 *
 * Every entity records which signal produced it (`found_in`). That field is what
 * lets the demo prove the expensive multimodal path was necessary rather than
 * merely claim it — the gym posts have content-free captions, so anything they
 * yield must be sourced from frames or audio.
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { KEYS, MODELS, MODEL_OVERRIDES, ROOT } from './lib/config.mjs';
import { readUrls, rawPath, readJson, writeJson, isCached, log, banner } from './lib/util.mjs';

const SYSTEM = readFileSync(resolve(ROOT, 'ingest/lib/prompt.md'), 'utf8');

const ENTITY = {
  type: 'object',
  additionalProperties: false,
  required: ['type', 'name', 'category', 'neighborhood', 'city', 'country', 'hook',
             'found_in', 'extraction_confidence', 'trigger_class', 'decay'],
  properties: {
    type:        { type: 'string', enum: ['place', 'workout', 'recipe', 'product', 'other'] },
    name:        { type: 'string' },
    category:    { type: 'string' },
    neighborhood:{ type: ['string', 'null'] },
    city:        { type: ['string', 'null'] },
    country:     { type: ['string', 'null'] },
    hook:        { type: 'string' },
    found_in:    { type: 'array', items: { type: 'string', enum: ['caption', 'frames', 'audio'] } },
    extraction_confidence: { type: 'number' },
    trigger_class: { type: 'string', enum: ['spatial', 'calendar', 'deadline', 'activity',
                                            'commerce', 'social', 'temporal', 'state_change'] },
    decay:       { type: 'string', enum: ['perishable', 'contextual', 'evergreen'] },
  },
};

const SCHEMA = {
  name: 'saved_post_entities',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['transcript_was_useful', 'entities'],
    properties: {
      transcript_was_useful: { type: 'boolean' },
      entities: { type: 'array', items: ENTITY },
    },
  },
};

const dataUrl = (f) => `data:image/jpeg;base64,${readFileSync(f).toString('base64')}`;

export default async function extract() {
  banner(`04 · extract — ${MODELS.extract} (caption + transcript + frames)`);

  for (const { id, url } of readUrls()) {
    const out = rawPath(id, 'entities.json');
    if (isCached(out)) { log('04', `${id} cached`); continue; }

    const post = readJson(rawPath(id, 'post.json'));
    const mediaRec = readJson(rawPath(id, 'media.json'));
    const tr = readJson(rawPath(id, 'transcript.json'), { text: '', kind: 'silent' });
    if (!post) { log('04', `${id} skipped`); continue; }

    const frames = (mediaRec?.frames || []).filter(existsSync);
    const model = MODEL_OVERRIDES[id] || MODELS.extract;

    const parts = [{ type: 'text', text:
      `POST: ${url}\nCREATOR: @${post.author}\n\n` +
      `CAPTION:\n${post.caption || '(empty)'}\n\n` +
      `TRANSCRIPT (metadata hint: ${tr.kind} — verify by reading it):\n${tr.text || '(none)'}\n\n` +
      `FRAMES: ${frames.length} image(s) follow.` }];
    for (const f of frames) parts.push({ type: 'image_url', image_url: { url: dataUrl(f) } });

    try {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${KEYS.openai}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: parts }],
          response_format: { type: 'json_schema', json_schema: SCHEMA },
        }),
      });
      const body = await res.json();
      if (body.error) throw new Error(body.error.message);

      const parsed = JSON.parse(body.choices[0].message.content);
      writeJson(out, {
        id,
        model,
        frames_used: frames.length,
        transcript_kind: tr.kind,
        transcript_was_useful: parsed.transcript_was_useful,
        signals: [...new Set(parsed.entities.flatMap((e) => e.found_in))],
        usage: body.usage,
        run_at: new Date().toISOString(),
        entities: parsed.entities,
      });

      const fromMedia = parsed.entities.filter((e) => e.found_in.some((s) => s !== 'caption')).length;
      log('04', `${id} ${String(parsed.entities.length).padStart(2)} entities (${fromMedia} needed frames/audio) · transcript_useful=${parsed.transcript_was_useful}`);
    } catch (err) {
      log('04', `${id} FAILED ${err.message}`);
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) await extract();
