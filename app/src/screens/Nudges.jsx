/**
 * Nudges — live candidates, what fired, and the card.
 *
 * The card is where the product either earns trust or loses it. It carries
 * provenance (the original thumbnail, the handle, the date saved) and the
 * explicit reason it fired. A nudge that cannot show its origin is
 * indistinguishable from an ad, and that is the whole difference between this
 * and a recommender.
 *
 * went / not now / never. "never" is the only way the archive ever shrinks.
 */

import React from 'react';
import { thumb, fmtDate, ago } from '../data.js';
import * as store from '../state/store.js';

function Card({ candidate, onVerdict }) {
  const e = candidate.entity;
  const post = e.post;
  return (
    <div className="card">
      <div className="pad">
        <h3>{e.name}</h3>
        <div style={{ fontSize: 13, color: 'var(--dim)' }}>{e.hook}</div>
        <div style={{ marginTop: 8 }}>
          {e.place?.address && <span className="chip">{e.place.address.split(',')[0]}</span>}
          {e.place?.hours && <span className="chip">real hours</span>}
          <span className="chip">confidence {e.confidence.overall}</span>
        </div>
      </div>

      <div className="why">↳ {candidate.reason}</div>

      {post && (
        <div className="prov">
          {thumb(post) && <img src={thumb(post)} alt="" />}
          <div className="meta">
            you saved this from <b style={{ color: 'var(--text)' }}>@{post.source.author}</b><br />
            {fmtDate(post.source.saved_at)} · {ago(post.source.saved_at)}
            {post.source.saved_at_is_estimate && <><br /><i>date estimated — the export has the real one</i></>}
          </div>
        </div>
      )}

      <div className="verdicts">
        <button className="went" onClick={() => onVerdict(e.id, 'went')}>went</button>
        <button onClick={() => onVerdict(e.id, 'not_now')}>not now</button>
        <button className="never" onClick={() => onVerdict(e.id, 'never')}>never</button>
      </div>
    </div>
  );
}

export default function Nudges({ evaluation, onVerdict }) {
  const fired = evaluation?.fired || [];
  const suppressed = evaluation?.suppressed || [];
  const rejected = evaluation?.rejected || [];
  const log = store.history();

  return (
    <div>
      {!evaluation && <div className="note">The engine has not run yet — it is waiting for a position.</div>}

      {evaluation && (
        <div className="note">
          Budget {evaluation.budget.used}/{evaluation.budget.cap} today.
          {' '}{fired.length} firing · {suppressed.length} suppressed · {rejected.length} silently rejected.
        </div>
      )}

      {fired.map((c) => <Card key={c.entity.id} candidate={c} onVerdict={onVerdict} />)}

      {!fired.length && evaluation && (
        <div className="note" style={{ color: 'var(--text)' }}>
          Nothing has earned an interruption right now. That is the app working, not the app broken.
        </div>
      )}

      {log.length > 0 && <>
        <h4 className="section">fired history</h4>
        {log.map((h, i) => (
          <div className="kv" key={i}>
            <span className="k">{h.name}</span>
            <span className="v">{new Date(h.at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span>
            <span className="k" style={{ gridColumn: '1 / -1', fontSize: 11 }}>{h.reason}</span>
          </div>
        ))}
      </>}

      {/* The rejections are shown on purpose. "Nothing fired" and "nothing was
          considered" look identical from outside, and only one of them is design. */}
      {rejected.length > 0 && <>
        <h4 className="section">considered and rejected — why it stayed quiet</h4>
        <div className="trace">
          {rejected.slice(0, 25).map((r, i) => (
            <div key={i}><b>{r.entity.name}</b> — {r.why}</div>
          ))}
          {rejected.length > 25 && <div>…and {rejected.length - 25} more</div>}
        </div>
      </>}
    </div>
  );
}
