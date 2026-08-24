/**
 * The shell. Four surfaces, one runtime.
 *
 * Everything the user sees is derived from `cue.state` — the same object the
 * engine evaluates against. There is no screen-local notion of "what should
 * fire": if a surface needs something the engine cannot produce, the engine is
 * what changes. That rule is what keeps `npm test` meaningful.
 */

import React, { useEffect, useState } from 'react';
import { App as CapApp } from '@capacitor/app';
import * as cue from './cue.js';
import * as store from './state/store.js';
import * as notify from './native/notify.js';
import { isNative } from './native/permissions.js';
import { loadCorpus, syncCorpus, flatten } from './data.js';
import * as server from './net/server.js';

import Library from './screens/Library.jsx';
import MapView from './screens/MapView.jsx';
import Nudges from './screens/Nudges.jsx';
import Debug from './screens/Debug.jsx';

/**
 * Tab icons are inline SVG, not glyphs.
 *
 * The obvious characters for these (▦ ◉ ◐ ⚙) are not in the iOS system font and
 * rendered as ? boxes on device — invisible on the Mac, glaring on camera. SVG
 * has no fallback path to get wrong.
 */
const Icon = ({ d, fill }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill={fill ? 'currentColor' : 'none'}
       stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    {d}
  </svg>
);

const TABS = [
  ['library', <Icon key="l" d={<><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>} />, 'Library'],
  ['map', <Icon key="m" d={<><path d="M12 21s7-5.7 7-11a7 7 0 1 0-14 0c0 5.3 7 11 7 11Z" /><circle cx="12" cy="10" r="2.6" /></>} />, 'Map'],
  ['nudges', <Icon key="n" d={<><path d="M18 8a6 6 0 1 0-12 0c0 6-2 7-2 7h16s-2-1-2-7Z" /><path d="M10.3 20a2 2 0 0 0 3.4 0" /></>} />, 'Nudges'],
  ['debug', <Icon key="d" d={<><circle cx="12" cy="12" r="3" /><path d="M19.4 14a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1v.2a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 7 18.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 3.8 13H3.6a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 5.7 7l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H11a1.6 1.6 0 0 0 1-1.5V2.6a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1h.2a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.4 1Z" /></>} />, 'Debug'],
];

export default function App() {
  const [tab, setTab] = useState('library');
  const [corpus, setCorpus] = useState(() => loadCorpus());
  const [snapshot, setSnapshot] = useState({ ...cue.state });
  const [ingesting, setIngesting] = useState(null);

  const posts = corpus.bundle.posts;

  useEffect(() => {
    const unsub = cue.subscribe((s) => setSnapshot({ ...s }));

    // Demo mode — continuous background location — is opt-in but ON for filming:
    // it keeps JavaScript alive through a walk so the hero beat does not depend
    // on iOS's own geofence wake-up timing, which it can delay by minutes.
    cue.start({ entities: flatten(corpus.bundle), background: true });

    // Tapping the notification opens the card, even from a cold launch.
    notify.onTap((extra) => { setTab('nudges'); cue.trace(`opened from notification: ${extra.entity_id}`); });

    // "Share -> Cue" from inside TikTok arrives here as cue://share?url=...
    // The extension deliberately avoids App Groups (restricted under free
    // provisioning) and carries the payload in the URL instead.
    CapApp.addListener('appUrlOpen', ({ url }) => {
      const shared = new URL(url).searchParams.get('url');
      if (shared) { setTab('debug'); ingest(shared); }
    });

    return () => { unsub(); cue.stop(); };
  }, []);

  async function ingest(url) {
    if (!url) return;
    setIngesting({ url, stages: [], lines: [] });
    try {
      const done = await server.ingest(url, (event, payload) => {
        setIngesting((prev) => ({
          ...prev,
          stages: event === 'stage' ? [...prev.stages.filter((s) => s.name !== payload.name), payload] : prev.stages,
          lines: event === 'log' ? [...prev.lines, payload.line].slice(-12) : prev.lines,
        }));
      });
      const bundle = await syncCorpus();
      setCorpus({ bundle, source: 'synced' });
      cue.state.entities = flatten(bundle);
      await cue.rearm({ force: true });
      setIngesting({ url, done });
      setTab('map');   // the new pin landing is the payoff
    } catch (err) {
      setIngesting({ url, error: err.message });
    }
  }

  async function sync() {
    try {
      const bundle = await syncCorpus();
      setCorpus({ bundle, source: 'synced' });
      cue.state.entities = flatten(bundle);
      await cue.rearm({ force: true });
    } catch (err) {
      cue.trace(`sync failed: ${err.message}`);
    }
  }

  function verdict(entityId, value) {
    store.setFeedback(entityId, value);
    // "never" changes what is eligible, so the armed set is now wrong.
    if (value === 'never') cue.rearm({ force: true });
    cue.evaluateNow({ deliver: false, reason: `feedback: ${value}` });
  }

  const firing = snapshot.lastEval?.fired?.length || 0;

  return (
    <div className="app">
      <header className="head">
        <h1>Cue</h1>
        {/* "starting…" was an opaque state that could last forever. The header now
            reports the last thing the runtime actually did, so a stall is legible. */}
        <span className="sub">
          {isNative()
            ? (snapshot.source || snapshot.trace[0]?.line?.slice(0, 34) || 'starting…')
            : 'web — no background location'}
          {snapshot.position && ` · ±${Math.round(snapshot.accuracy || 0)}m`}
        </span>
      </header>

      <main className="body">
        {tab === 'library' && <Library posts={posts} />}
        {tab === 'map' && <MapView entities={snapshot.entities} position={snapshot.position} armed={snapshot.armed} />}
        {tab === 'nudges' && <Nudges evaluation={snapshot.lastEval} onVerdict={verdict} />}
        {tab === 'debug' && (
          <>
            {ingesting && <Ingesting state={ingesting} onClose={() => setIngesting(null)} />}
            <Debug cue={snapshot} corpusSource={corpus.source}
                   onEvaluate={(o) => cue.evaluateNow(o)} onIngest={ingest} onSync={sync} />
          </>
        )}
      </main>

      <nav className="tabs">
        {TABS.map(([id, glyph, label]) => (
          <button key={id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>
            <span className="glyph">{glyph}</span>
            {label}
            {id === 'nudges' && firing > 0 && <span className="badge">{firing}</span>}
          </button>
        ))}
      </nav>
    </div>
  );
}

/** Live pipeline progress. The real stages, streamed — a spinner would be a lie. */
function Ingesting({ state, onClose }) {
  return (
    <div className="card">
      <div className="pad">
        <h3>{state.done ? 'ingested' : state.error ? 'ingest failed' : 'ingesting…'}</h3>
        <div style={{ fontSize: 11, color: 'var(--dim)', wordBreak: 'break-all' }}>{state.url}</div>
      </div>
      {state.error && <div className="why" style={{ color: 'var(--bad)' }}>{state.error}</div>}
      {state.done && (
        <div className="kv">
          <span className="k">took</span><span className="v">{state.done.seconds}s</span>
          <span className="k">entities</span><span className="v">{state.done.entities}</span>
          <span className="k">nudge-eligible</span><span className="v">{state.done.nudge_eligible}</span>
        </div>
      )}
      {!state.done && !state.error && (
        <div className="trace">
          {(state.stages || []).map((s) => (
            <div key={s.name}>{s.status === 'done' ? '✓' : '·'} <b>{s.name}</b> — {s.what}</div>
          ))}
          {(state.lines || []).map((l, i) => <div key={i} style={{ opacity: .6 }}>{l}</div>)}
        </div>
      )}
      <div className="btnrow"><button className="btn" onClick={onClose}>close</button></div>
    </div>
  );
}
