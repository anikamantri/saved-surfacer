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

const looksLikeTikTok = (s) => /tiktok\.com/i.test(s || '');

export default function Add({ initialUrl, onIngest, onClose, state }) {
  const [url, setUrl] = useState(initialUrl || '');
  const input = useRef(null);

  // A link arriving from the share sheet should not need a second tap.
  useEffect(() => {
    if (initialUrl) setUrl(initialUrl);
  }, [initialUrl]);

  const running = state && !state.done && !state.error;
  const stages = state?.stages || [];

  async function paste() {
    try {
      const text = await navigator.clipboard.readText();
      if (text) setUrl(text.trim());
    } catch {
      // Clipboard access needs a user gesture and can still be refused; the
      // field is always there, so this is a convenience, never the only way in.
      input.current?.focus();
    }
  }

  return (
    <div>
      <div className="btnrow">
        <button className="btn" onClick={onClose}>← back</button>
      </div>

      <div className="card">
        <div className="pad">
          <h3>Add a save</h3>
          <div style={{ fontSize: 12, color: 'var(--dim)' }}>
            Share → Cue from inside TikTok, or paste a link. Short share links
            (tiktok.com/t/…) are resolved for you.
          </div>
        </div>

        <div style={{ padding: '0 14px 12px' }}>
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
            {running ? 'ingesting…' : 'run the pipeline'}
          </button>
          <button className="btn" onClick={paste} disabled={running}>paste</button>
        </div>

        {url && !looksLikeTikTok(url) && (
          <div className="why" style={{ color: 'var(--bad)' }}>
            that does not look like a TikTok link
          </div>
        )}
      </div>

      {state && (
        <>
          <h4 className="section">
            {state.done ? 'done' : state.error ? 'failed' : 'the Mac is working'}
          </h4>

          {state.error && (
            <div className="card"><div className="why" style={{ color: 'var(--bad)' }}>{state.error}</div></div>
          )}

          {state.resolved && (
            <div className="kv">
              <span className="k">resolved to</span>
              <span className="v" style={{ fontSize: 11 }}>{state.resolved.kind} · {state.resolved.id}</span>
            </div>
          )}

          {!state.error && (
            <div className="trace">
              {stages.map((s) => (
                <div key={s.name}>
                  {s.status === 'done' ? '✓' : '·'} <b>{s.name}</b> — {s.what}
                  {s.ms != null && ` (${(s.ms / 1000).toFixed(1)}s)`}
                </div>
              ))}
              {(state.lines || []).map((l, i) => (
                <div key={i} style={{ opacity: 0.55 }}>{l}</div>
              ))}
            </div>
          )}

          {state.done && (
            <>
              <div className="kv">
                <span className="k">took</span><span className="v">{state.done.seconds}s</span>
                <span className="k">entities found</span><span className="v">{state.done.entities}</span>
                <span className="k">can nudge you</span><span className="v ok">{state.done.nudge_eligible}</span>
              </div>
              <div className="btnrow">
                <button className="btn primary" onClick={() => onClose('map')}>see it on the map</button>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
