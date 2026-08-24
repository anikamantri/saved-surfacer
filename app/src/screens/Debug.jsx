/**
 * Debug — instrumentation, and the insurance policy.
 *
 * Every permission on this screen can silently derail a take: iOS grants
 * When-In-Use but quietly refuses Always if you ask in the wrong order, and
 * nothing surfaces that at runtime. So the app reads the states BACK from the
 * system rather than assuming the request worked.
 *
 * It also carries force-fire. The nudge in the video is fired by real GPS — that
 * is the entire point of the pivot — but a demo whose only path to the hero beat
 * depends on iOS's geofence timing is a demo that can fail on camera. Force-fire
 * runs the same engine against the same context; it skips the walk, not the gate.
 */

import React, { useEffect, useState } from 'react';
import * as perms from '../native/permissions.js';
import * as geofences from '../native/geofences.js';
import * as server from '../net/server.js';
import * as store from '../state/store.js';
import { fmtDistance } from '@cue/engine';

export default function Debug({ cue, onEvaluate, onIngest, onSync, corpusSource }) {
  const [p, setP] = useState(null);
  const [regions, setRegions] = useState([]);
  const [reach, setReach] = useState(null);
  const [host, setHost] = useState(server.serverHost());
  const [busy, setBusy] = useState('');
  const [checking, setChecking] = useState(false);
  const [checkedAt, setCheckedAt] = useState(null);

  const refresh = async () => {
    // Test what is in the field, not what was saved earlier — typing a host and
    // pressing refresh without pressing save otherwise silently tests the old one.
    if (host && host !== server.serverHost()) setHost(server.setServerHost(host));
    setChecking(true);
    try {
      setP(await perms.readPermissions());
      setRegions(await geofences.monitored());
      setReach(await server.health());
    } finally {
      // Always stamp the time, even on failure: seeing the clock move is how you
      // know the button worked at all, which "reachable: false" alone never tells you.
      setCheckedAt(new Date());
      setChecking(false);
    }
  };
  useEffect(() => { refresh(); }, []);

  const yes = (v) => ['granted', 'always', 'web'].includes(v);

  return (
    <div>
      <h4 className="section">permissions — read back from iOS, not assumed</h4>
      <div className="kv">
        <span className="k">native platform</span><span className={`v ${p?.native ? 'ok' : 'no'}`}>{String(p?.native ?? '…')}</span>
        <span className="k">location</span><span className={`v ${yes(p?.location) ? 'ok' : 'no'}`}>{p?.location ?? '…'}</span>
        <span className="k">location · always</span><span className={`v ${yes(p?.background) ? 'ok' : 'no'}`}>{p?.background ?? '…'}</span>
        <span className="k">notifications</span><span className={`v ${yes(p?.notifications) ? 'ok' : 'no'}`}>{p?.notifications ?? '…'}</span>
        <span className="k">calendar</span><span className={`v ${yes(p?.calendar) ? 'ok' : 'no'}`}>{p?.calendar ?? '…'}</span>
      </div>
      <div className="btnrow">
        <button className="btn primary" onClick={async () => { setBusy('asking'); await perms.requestAll((s) => setBusy(s)); setBusy(''); refresh(); }}>
          {busy || 'request permissions (staged)'}
        </button>
        <button className="btn" onClick={() => perms.openSettings()}>open Settings</button>
        <button className="btn" onClick={refresh}>refresh</button>
      </div>

      <h4 className="section">position</h4>
      {cue.blocked && (
        <div className="note" style={{ color: 'var(--bad)', paddingTop: 0 }}>{cue.blocked}</div>
      )}
      <div className="kv">
        <span className="k">source</span><span className="v">{cue.source || 'none'}</span>
        <span className="k">coords</span><span className="v">{cue.position ? cue.position.map((n) => n.toFixed(5)).join(', ') : '—'}</span>
        <span className="k">accuracy</span><span className="v">{cue.accuracy ? `±${Math.round(cue.accuracy)}m` : '—'}</span>
      </div>

      <h4 className="section">geofences — iOS watches 20, we have {cue.entities.filter((e) => e.nudge_eligible).length} eligible</h4>
      <div className="kv">
        <span className="k">armed by us</span><span className="v">{cue.armed.length} + perimeter</span>
        <span className="k">monitored by iOS</span><span className="v">{regions.length}</span>
      </div>
      <div className="trace">
        {cue.armed.map((a) => <div key={a.id}><b>{a.name}</b> — {fmtDistance(a.metres)}</div>)}
        {!cue.armed.length && <div>nothing armed — no position fix yet</div>}
      </div>

      <h4 className="section">calendar — {cue.calendar.length} events today</h4>
      <div className="trace">
        {cue.calendar.map((e) => (
          <div key={e.id}>
            <b>{e.title}</b> {new Date(e.start).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
            –{new Date(e.end).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })} · {e.source}
          </div>
        ))}
        {!cue.calendar.length && <div>none</div>}
      </div>

      <h4 className="section">the Mac — yt-dlp and ffmpeg cannot run on iOS</h4>
      <div style={{ padding: '0 14px' }}>
        <input className="host" value={host} onChange={(e) => setHost(e.target.value)}
               placeholder="http://100.x.y.z:4321  (Tailscale)" autoCapitalize="off" autoCorrect="off" />
      </div>
      {/* "localhost" on a phone means the phone itself, which is the single most
          likely reason this ever reads false. Say so rather than making it a puzzle. */}
      {p?.native && /localhost|127\.0\.0\.1/.test(host) && (
        <div className="note" style={{ color: 'var(--bad)' }}>
          localhost is <i>this phone</i>, not the Mac. Use the Mac's Tailscale (100.x) or
          Wi-Fi address here.
        </div>
      )}
      <div className="kv">
        <span className="k">saved host</span><span className="v" style={{ fontSize: 11 }}>{server.serverHost()}</span>
        <span className="k">last checked</span>
        <span className="v">{checking ? 'checking…' : checkedAt ? checkedAt.toLocaleTimeString('en-GB') : 'never'}</span>
        <span className="k">reachable</span><span className={`v ${reach?.reachable ? 'ok' : 'no'}`}>{reach ? String(reach.reachable) : '…'}</span>
        {reach && !reach.reachable && <>
          <span className="k">why not</span><span className="v no">{reach.error || 'unknown'}</span>
          {reach.triedFallback && <>
            <span className="k">also tried</span>
            <span className="v no" style={{ fontSize: 11 }}>{reach.triedFallback} — {reach.fallbackError}</span>
          </>}
        </>}
        {reach?.healedFrom && <>
          <span className="k">switched host</span>
          <span className="v ok" style={{ fontSize: 11 }}>{reach.healedFrom} was dead → using the tailnet address</span>
        </>}
        <span className="k">corpus on Mac</span><span className="v">{reach?.corpus ? `${reach.corpus.posts} posts · ${reach.corpus.entities} entities` : reach?.error || '—'}</span>
        <span className="k">corpus on phone</span><span className="v">{corpusSource} · {cue.entities.length} entities</span>
      </div>
      <div className="btnrow">
        <button className="btn" disabled={checking}
                onClick={() => { setHost(server.setServerHost(host)); refresh(); }}>
          {checking ? 'testing…' : 'save host + test'}
        </button>
        <button className="btn" onClick={onSync}>sync corpus</button>
        <button className="btn" onClick={() => onIngest(prompt('TikTok URL (share links work):'))}>ingest a URL</button>
      </div>

      <h4 className="section">engine</h4>
      <div className="btnrow">
        <button className="btn primary" onClick={() => onEvaluate({ deliver: true, reason: 'force' })}>force-fire (real gate)</button>
        <button className="btn" onClick={() => onEvaluate({ deliver: false, reason: 'dry run' })}>dry run</button>
        <button className="btn" onClick={() => { store.reset(); location.reload(); }}>reset feedback + budget</button>
      </div>
      <div className="note" style={{ paddingTop: 0 }}>
        Force-fire skips the walk, not the gate — closed venues, mid-meeting and a spent
        budget still refuse. It cannot make the engine say yes.
      </div>

      <h4 className="section">trace</h4>
      <div className="trace">
        {cue.trace.map((t, i) => (
          <div key={i}><b>{t.at.slice(11, 19)}</b> {t.line}</div>
        ))}
        {!cue.trace.length && <div>nothing yet</div>}
      </div>
    </div>
  );
}
