/**
 * Capture — where a save enters Cue.
 *
 * This is the surface the share sheet hands off to, and the honest answer to
 * "why isn't it just reading my library". Two routes arrive here and both are
 * real: a link pasted in, and `cue://share?url=` from the Share Extension.
 *
 * It shows the pipeline running rather than a spinner. A post takes 20-40s —
 * the yt-dlp fetch, the carousel slides, the vision call — and watching the
 * stages tick over is both better on camera and more honest than pretending it
 * is instant. The Mac does this work because yt-dlp and ffmpeg cannot run on
 * iOS, which is worth showing rather than hiding.
 */

import React, { useState, useEffect, useRef } from 'react';
import { Clipboard } from '@capacitor/clipboard';
import { NavBar, Glyph } from '../ui/kit.jsx';

const looksLikeTikTok = (s) => /tiktok\.com/i.test(s || '');

/**
 * The seven stages, as the phone knows them.
 *
 * Rendered in full from the first moment, so the pipeline reads as a PLAN being
 * worked through rather than lines accruing — you can see what is done, what is
 * happening, and what is still to come. The names are the join key to the
 * server's stage events; a stage the server sends that is not in this list
 * still renders (appended at the end), so drift degrades to ugly, not broken.
 *
 * `think` is the one-line answer to "what is it actually doing right now" —
 * shown while the stage runs, above its own live log lines.
 */
const PLAN = [
  ['01 hydrate', 'caption, author, cover',
    'oEmbed for the caption and author; yt-dlp for the carousels oEmbed refuses.'],
  ['02 media', 'frames + audio',
    'ffmpeg pulls frames and the audio track — for a carousel, one frame per slide.'],
  ['03 transcribe', 'speech to text',
    'The audio becomes a transcript — and gets judged: narration, or just the song?'],
  ['04 extract', 'typed entities',
    'The model reads caption, frames and transcript together and returns typed entities.'],
  ['05 geocode', 'coords + opening hours',
    'Google Places pins each place and brings back real opening hours.'],
  ['06 triggers', 'wake-up conditions',
    'Every entity gets its trigger — the condition under which it may interrupt you.'],
  ['07 bundle', 'thumbnails, tiles, corpus',
    'Thumbnails, map tiles and the corpus are rebuilt so the phone owns everything.'],
];

/** pending → running → done | failed, as a 22px glyph on the rail. */
function StepDot({ status }) {
  if (status === 'running') return <span className="ind running"><span /></span>;
  if (status === 'done') return <span className="ind done"><Glyph name="checkmark" size={12} weight={3} /></span>;
  if (status === 'failed') return <span className="ind failed"><Glyph name="xmark" size={11} weight={3} /></span>;
  return <span className="ind pending" />;
}

/**
 * One stage of the pipeline.
 *
 * While it runs, its thinking is visible: the explanation of what this stage
 * is for, then its own live log lines — the real ones, teed from the Mac's
 * console, not a progress bar pretending. When it finishes, the lines fold
 * into a disclosure rather than vanishing: the receipts stay checkable without
 * burying the next step.
 */
function Step({ step, first, last }) {
  const { status = 'pending', lines = [] } = step;
  return (
    <div className={`step ${status}${first ? ' first' : ''}${last ? ' last' : ''}`}>
      <StepDot status={status} />
      <div className="step-main">
        <div className="step-title">
          <b>{step.title}</b>
          <span className="dim"> — {step.what}</span>
        </div>

        {status === 'running' && <>
          {step.think && <div className="step-why">{step.think}</div>}
          {lines.length > 0 && (
            <div className="step-think">
              {lines.slice(-5).map((l, i, arr) => (
                <div key={`${i}-${l.slice(0, 24)}`}
                     style={{ opacity: 0.45 + 0.55 * ((i + 1) / arr.length) }}>{l}</div>
              ))}
            </div>
          )}
        </>}

        {status === 'failed' && lines.length > 0 && (
          <div className="step-think bad">
            {lines.slice(-5).map((l, i) => <div key={i}>{l}</div>)}
          </div>
        )}

        {status === 'done' && lines.length > 0 && (
          <details className="step-log">
            <summary>{lines.length} {lines.length === 1 ? 'line' : 'lines'}</summary>
            <div className="step-think">
              {lines.map((l, i) => <div key={i}>{l}</div>)}
            </div>
          </details>
        )}
      </div>
      <span className="step-time">
        {status === 'done' && step.ms != null && `${(step.ms / 1000).toFixed(1)}s`}
      </span>
    </div>
  );
}

export default function Add({ initialUrl, onIngest, onClose, state, backLabel = 'Back' }) {
  const [url, setUrl] = useState(initialUrl || '');
  const input = useRef(null);

  // A link arriving from the share sheet should not need a second tap.
  useEffect(() => {
    if (initialUrl) setUrl(initialUrl);
  }, [initialUrl]);

  /**
   * The share extension copies the link to the clipboard before trying to open
   * the app, because iOS does not reliably let a share sheet launch its
   * container. So when this screen opens empty, look there first — that turns
   * the fallback from "paste it yourself" into one tap.
   *
   * iOS may show its paste permission banner; if the read is refused the field
   * is still there, so this can only ever help.
   */
  useEffect(() => {
    if (initialUrl || url) return;
    let cancelled = false;
    Clipboard.read()
      .then(({ value }) => {
        const found = (value || '').trim();
        if (!cancelled && looksLikeTikTok(found)) setUrl(found);
      })
      .catch(() => { /* refused or unavailable — the field still works */ });
    return () => { cancelled = true; };
  }, []);

  const running = state && !state.done && !state.error;

  // A ticking elapsed count while the Mac works. One honest number does more
  // against "is it stuck?" than any animation — a stall stops the clock's
  // meaning, not its movement, and the live log lines are what say why.
  const [, tick] = useState(0);
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [running]);
  const elapsed = state?.startedAt ? Math.round((Date.now() - state.startedAt) / 1000) : 0;

  /**
   * The plan, overlaid with reality. Every planned stage renders from the
   * first moment; the server's events fill in status, duration and each
   * stage's own log lines as they happen. If the whole run has failed, the
   * stage that was running wears it.
   */
  const received = state?.stages || [];
  const steps = PLAN.map(([name, what, think]) => {
    const live = received.find((r) => r.name === name);
    const status = live?.status === 'running' && state?.error ? 'failed' : live?.status || 'pending';
    return { name, what, think, title: name.replace(/^\d+ /, ''), ...live, status };
  });
  for (const r of received) {
    if (!PLAN.some(([name]) => name === r.name)) {
      steps.push({ ...r, title: r.name, status: state?.error && r.status === 'running' ? 'failed' : r.status });
    }
  }
  const runningStep = steps.find((x) => x.status === 'running');

  async function paste() {
    try {
      const { value } = await Clipboard.read();
      if (value) setUrl(value.trim());
    } catch {
      // Clipboard access needs a user gesture and can still be refused; the
      // field is always there, so this is a convenience, never the only way in.
      input.current?.focus();
    }
  }

  // A re-run from the library lands on this same screen on purpose: the stages
  // that run are the same stages, and there is no demo-only branch to drift.
  const rerun = state?.refresh;

  return (
    <div>
      <NavBar
        title={rerun === 'all' ? 'Re-hydrating' : rerun ? 'Re-running the model' : 'Add a save'}
        onBack={() => onClose()}
        backLabel={backLabel}
      />

      <div className="card" style={{ marginTop: 16 }}>
        {/* No heading here: the navigation bar already says what this screen is,
            and iOS does not repeat itself one row down. */}
        <div className="pad" style={{ paddingBottom: 4 }}>
          <div className="t-sub dim">
            {rerun === 'all'
              ? 'Caption, frames and audio are re-fetched from TikTok, then the model runs again.'
              : rerun
                ? 'The frames already on disk go back to the model. No download, one vision call.'
                : 'Share → Cue from inside TikTok, or paste a link. Short share links (tiktok.com/t/…) are resolved for you.'}
          </div>
        </div>

        <div style={{ padding: '0 16px 12px' }}>
          <input
            ref={input}
            className="host"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://www.tiktok.com/@… or tiktok.com/t/…"
            autoCapitalize="off" autoCorrect="off" spellCheck="false"
            inputMode="url"
          />
        </div>

        <div className="btnrow" style={{ paddingTop: 0 }}>
          <button className="btn primary" disabled={running || !looksLikeTikTok(url)}
                  onClick={() => onIngest(url.trim())}>
            {running ? 'Ingesting…' : 'Run the pipeline'}
          </button>
          <button className="btn" onClick={paste} disabled={running}>Paste</button>
        </div>

        {url && !looksLikeTikTok(url) && (
          <div className="why bad">that does not look like a TikTok link</div>
        )}
      </div>

      {state && (
        <>
          <h4 className="section">
            {state.done ? `done in ${state.done.seconds}s`
              : state.error ? 'failed'
              : `the Mac is working — ${runningStep ? runningStep.title : 'starting'} · ${elapsed}s`}
          </h4>

          {/* Preflight: what the link resolved to and where it was written.
              Real facts, before any stage runs — the /t/ short link carries
              neither the handle nor the photo/video distinction. */}
          {(state.resolved || state.queued || state.cleared) && (
            <div className="preflight">
              {state.resolved && <span><b>{state.resolved.kind}</b> · <span className="mono">{state.resolved.id}</span></span>}
              {state.cleared && <span>{state.cleared.scope === 'all' ? 'caches dropped — full re-hydrate' : 'extraction cache dropped'}</span>}
              {state.queued && <span className="dim">{state.queued.note}</span>}
            </div>
          )}

          {state.error && (
            <div className="card"><div className="why bad">{state.error}</div></div>
          )}

          <div className="steps">
            {(state.prelines || []).length > 0 && (
              <div className="step-think" style={{ margin: '10px 14px 0' }}>
                {state.prelines.map((l, i) => <div key={i}>{l}</div>)}
              </div>
            )}
            {steps.map((st, i) => (
              <Step key={st.name} step={st} first={i === 0} last={i === steps.length - 1} />
            ))}
          </div>

          {state.done && (
            <>
              <div className="kv" style={{ background: 'var(--bg-raised)', borderRadius: 'var(--r-group)', margin: '8px 16px' }}>
                <span className="k">things found</span><span className="v">{state.done.entities}</span>
                <span className="k">can nudge you</span><span className="v ok">{state.done.nudge_eligible}</span>
              </div>
              <div className="btnrow">
                <button className="btn primary" onClick={() => onClose('map')}>See it on the map</button>
                <button className="btn" onClick={() => onClose('library')}>Back to library</button>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
