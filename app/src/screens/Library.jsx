/**
 * The graveyard.
 *
 * Deliberately the dumbest screen in the app: reverse-chronological, uniform,
 * no grouping, no search. It is the saved folder as it actually is — the thing
 * the product exists to fix. Establishing that in five seconds is its whole job.
 *
 * Tapping through shows the extraction: what the model was given and what it
 * returned. That is the anti-magic screen.
 */

import React, { useState } from 'react';
import { thumb, ago, fmtDate, TYPE_COLOR } from '../data.js';

function Detail({ post, onBack }) {
  return (
    <div>
      <div className="btnrow"><button className="btn" onClick={onBack}>← library</button></div>
      <div className="card">
        <div className="prov">
          {thumb(post) && <img src={thumb(post)} alt="" />}
          <div className="meta">
            <b style={{ color: 'var(--text)' }}>@{post.source.author}</b><br />
            saved {fmtDate(post.source.saved_at)}
            {post.source.saved_at_is_estimate && ' (estimated — real dates need the export)'}
          </div>
        </div>
        <div className="pad" style={{ fontSize: 13, color: 'var(--dim)' }}>{post.source.caption}</div>
      </div>

      <h4 className="section">what the model was given</h4>
      <div className="kv">
        <span className="k">hydrated via</span><span className="v">{post.evidence.hydrated_via}</span>
        <span className="k">caption</span><span className="v">{post.source.caption.length} chars</span>
        <span className="k">frames sampled</span><span className="v">{post.evidence.frames_used}</span>
        <span className="k">audio</span><span className="v">{post.evidence.transcript_kind}</span>
        <span className="k">transcript useful</span>
        <span className={`v ${post.evidence.transcript_was_useful ? 'ok' : 'no'}`}>
          {post.evidence.transcript_was_useful ? 'yes' : 'no — music, not narration'}
        </span>
      </div>

      <h4 className="section">what it returned — {post.entities.length} entities</h4>
      {post.entities.map((e) => (
        <div className="card" key={e.id}>
          <div className="pad">
            <h3><span style={{ color: TYPE_COLOR[e.type] }}>●</span> {e.name}</h3>
            <div style={{ fontSize: 12, color: 'var(--dim)' }}>{e.hook}</div>
            <div style={{ marginTop: 8 }}>
              <span className="chip">{e.type}</span>
              <span className="chip">{e.trigger.kind}</span>
              <span className="chip">confidence {e.confidence.overall}</span>
            </div>
          </div>
          <div className="why">
            {e.nudge_eligible
              ? `armed — ${e.place?.hours ? 'real opening hours known' : 'no hours known'}`
              : `silent — ${e.why_not}`}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function Library({ posts }) {
  const [open, setOpen] = useState(null);
  if (open) return <Detail post={open} onBack={() => setOpen(null)} />;

  const sorted = [...posts].sort((a, b) => (b.source.saved_at || '').localeCompare(a.source.saved_at || ''));

  return (
    <div>
      <div className="note">
        {posts.length} saved posts · {posts.reduce((n, p) => n + p.entities.length, 0)} things inside them.
        Reverse-chronological, which is the only order the platform ever gives you.
      </div>
      <div className="grid">
        {sorted.map((p) => (
          <button className="tile" key={p.id} onClick={() => setOpen(p)}>
            {thumb(p) ? <img src={thumb(p)} alt="" /> : <div style={{ padding: 8, fontSize: 10 }}>{p.source.author}</div>}
            <span className="count">{p.entities.length}</span>
            <span className="when">{ago(p.source.saved_at)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
