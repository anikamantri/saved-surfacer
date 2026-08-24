import { useState } from 'react';
import { POSTS, TYPE_COLOR, thumb } from '../data.js';

/**
 * Screen 2 — proof it isn't magic.
 * The real inputs on the left, the real typed output on the right. The
 * caption-only toggle is the argument for the whole multimodal pipeline: on the
 * gym posts, hiding frames and audio empties the right-hand column.
 */
export default function Extract() {
  // Default to the Oslo post: seven entities from one save is the headline claim.
  const [id, setId] = useState('7645972278043364630');
  const [captionOnly, setCaptionOnly] = useState(false);
  const post = POSTS.find((p) => p.id === id);

  const shown = captionOnly
    ? post.entities.filter((e) => e.found_in.includes('caption'))
    : post.entities;

  const frames = Array.from({ length: post.evidence.frames_used }, (_, i) =>
    `./frames/${post.id}/frame-${String(i + 1).padStart(2, '0')}.jpg`);

  return (
    <div className="pad">
      <div className="eyebrow">02 · extraction</div>
      <h1 className="h1">One save, many intentions.</h1>
      <p className="sub">
        A multimodal pass over the caption, the sampled video frames and the audio transcript.
        Output is a typed object, not a tag — and one post routinely yields several.
      </p>

      <div style={{ display: 'flex', gap: 8, margin: '16px 0', flexWrap: 'wrap' }}>
        <select className="mini" value={id} onChange={(e) => { setId(e.target.value); setCaptionOnly(false); }}
                style={{ background: 'var(--surface-2)', padding: '7px 10px', borderRadius: 8 }}>
          {POSTS.map((p) => (
            <option key={p.id} value={p.id}>
              @{p.source.author} — {p.entities.length} {p.entities.length === 1 ? 'entity' : 'entities'} ({p.source.caption.length} char caption)
            </option>
          ))}
        </select>
        <button className={`mini${captionOnly ? ' on' : ''}`} onClick={() => setCaptionOnly((v) => !v)}>
          {captionOnly ? 'showing caption-only' : 'simulate caption-only extraction'}
        </button>
        <button className="mini" onClick={() => { setId('7654368777370373406'); setCaptionOnly(true); }}>
          ▸ show me where caption-only breaks
        </button>
      </div>

      <div className="cols">
        <div className="panel">
          <div className="label">inputs — what the model actually saw</div>

          <div className="chips" style={{ marginBottom: 12 }}>
            <span className={`chip${post.evidence.oembed_worked ? ' on' : ' off'}`}>oEmbed</span>
            <span className="chip on">yt-dlp</span>
            <span className={`chip${captionOnly ? ' off' : ' on'}`}>{post.evidence.frames_used} frames</span>
            <span className={`chip${!captionOnly && post.evidence.transcript_was_useful ? ' on' : ' off'}`}>
              audio · {post.evidence.transcript_kind}
            </span>
          </div>

          <div className="label">caption ({post.source.caption.length} chars)</div>
          <div className="body-text" style={{ marginBottom: 14 }}>{post.source.caption || '(empty)'}</div>

          {!captionOnly && frames.length > 0 && (
            <>
              <div className="label">sampled frames</div>
              <div className="framestrip" style={{ marginBottom: 14 }}>
                {frames.map((f) => <img key={f} src={f} alt="" loading="lazy"
                  onError={(e) => { e.currentTarget.style.display = 'none'; }} />)}
              </div>
            </>
          )}

          {!captionOnly && post.evidence.transcript && (
            <>
              <div className="label">
                transcript — {post.evidence.transcript_was_useful
                  ? 'judged useful' : 'judged song lyrics, discarded'}
              </div>
              <div className="body-text" style={{
                opacity: post.evidence.transcript_was_useful ? 1 : .42,
                textDecoration: post.evidence.transcript_was_useful ? 'none' : 'line-through',
              }}>{post.evidence.transcript.slice(0, 320)}</div>
            </>
          )}
        </div>

        <div className="panel">
          <div className="label">
            output — {shown.length} typed {shown.length === 1 ? 'entity' : 'entities'}
            {captionOnly && post.entities.length !== shown.length &&
              ` (${post.entities.length - shown.length} lost)`}
          </div>

          {shown.length === 0 && (
            <div className="body-text" style={{ color: 'var(--bad)', padding: '18px 0' }}>
              Nothing. The caption is "{post.source.caption.slice(0, 60)}" — it contains no
              recoverable intention at all. Everything this post is about lives in the frames
              and the voiceover.
            </div>
          )}

          {shown.map((e) => (
            <div className="ent" key={e.id}>
              <div className="ent-top">
                <span className="type-dot" style={{ background: TYPE_COLOR[e.type] }} />
                <span className="ent-name">{e.name}</span>
                <span className="conf">{(e.confidence.overall ?? 0).toFixed(2)}</span>
              </div>
              <div className="ent-hook">{e.hook}</div>
              <div className="ent-foot">
                <span className="chip">{e.type}</span>
                <span className="chip">{e.trigger_class}</span>
                <span className="chip">{e.decay}</span>
                {e.found_in.map((s) => <span key={s} className="chip on">{s}</span>)}
              </div>
            </div>
          ))}

          <div className="label" style={{ marginTop: 12 }}>
            model: {post.extraction.model} · {post.evidence.hydrated_via}
          </div>
        </div>
      </div>
    </div>
  );
}
