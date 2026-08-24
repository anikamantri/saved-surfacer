import { thumb, ago, fmtDate } from '../data.js';

/**
 * Screen 5 — trust and the feedback loop.
 *
 * A nudge is an interruption asking someone to change their path. It earns that
 * by showing its work: the creator, the date saved, and the exact reason it fired.
 *
 * went / not now / never is the only correction signal, and "never" is the only
 * mechanism by which the archive ever shrinks — press it and the entity is gone
 * from the map and the graveyard too.
 */
export default function Card({ result, react, feedback, reset, living }) {
  const top = result.fired[0];
  const removed = Object.values(feedback).filter((v) => v === 'never').length;

  if (!top) {
    return (
      <div className="pad">
        <div className="eyebrow">05 · the card</div>
        <h1 className="h1">Nothing is firing right now.</h1>
        <p className="sub">Move the dot back toward Majorstuen in the simulator, or wind the clock
          into opening hours, and a card will appear here.</p>
        {removed > 0 && (
          <button className="mini" style={{ marginTop: 14 }} onClick={reset}>
            restore {removed} dismissed {removed === 1 ? 'entity' : 'entities'}
          </button>
        )}
      </div>
    );
  }

  const e = top.entity;
  const p = e.post;

  return (
    <div className="pad">
      <div className="eyebrow">05 · the card</div>
      <h1 className="h1">Show your work, then get out of the way.</h1>
      <p className="sub">
        Provenance is what makes a nudge trustworthy <i>and</i> what jogs the memory — the original
        post is the thing that reminds you why you cared.
      </p>

      <div className="phone-stage" style={{ marginTop: 22 }}>
        <div className="phone">
          <div className="lock" style={{ backgroundImage: 'url(./tiles/13/4340/2382.png)' }} />
          <div className="card-sheet">
            <div className="grab" />
            <div style={{ display: 'flex', gap: 11 }}>
              {thumb(p) && <img src={thumb(p)} alt="" style={{ width: 62, height: 84, borderRadius: 9, objectFit: 'cover' }} />}
              <div>
                <div className="ent-name" style={{ fontSize: 16 }}>{e.name}</div>
                <div className="ent-hook">{e.hook}</div>
                <div className="chips" style={{ marginTop: 7 }}>
                  <span className="chip">{e.category}</span>
                  {e.neighborhood && <span className="chip">{e.neighborhood}</span>}
                </div>
              </div>
            </div>

            <div className="why">
              <div className="why-l">why you're seeing this</div>
              <div className="why-t">{top.reason}</div>
            </div>

            <div className="label">provenance</div>
            <div className="body-text" style={{ fontSize: 12 }}>
              Saved from <b>@{p.source.author}</b> on {fmtDate(p.source.saved_at)} ({ago(p.source.saved_at)})
              {p.source.saved_at_is_estimate && ' — date estimated from the post, not a real save timestamp'}
              {'\n'}Extracted from {e.found_in.join(' + ')} by {p.extraction.model}
              {e.place?.address && `\n${e.place.address}`}
            </div>

            <div className="label" style={{ marginTop: 12 }}>confidence</div>
            <div className="sim-line"><span>extraction</span><b>{e.confidence.extraction?.toFixed(2)}</b></div>
            <div className="sim-line"><span>geocoding</span><b>{e.confidence.geocode?.toFixed(2) ?? '—'}</b></div>
            <div className="sim-line"><span>overall</span><b>{e.confidence.overall?.toFixed(2)}</b></div>

            <div className="acts">
              <button className="act go" onClick={() => react(e.id, 'went')}>Went</button>
              <button className="act" onClick={() => react(e.id, 'not_now')}>Not now</button>
              <button className="act never" onClick={() => react(e.id, 'never')}>Never</button>
            </div>
          </div>
        </div>

        <div style={{ maxWidth: 400, minWidth: 300 }}>
          <div className="panel">
            <div className="label">the only signal that shrinks the archive</div>
            <p className="sub" style={{ fontSize: 12.5 }}>
              Every other saved-content tool only ever grows. <b>Never</b> deletes the entity for
              good — from the notification queue, the map, and the graveyard. A backlog that can
              burn down is a different product from one that can't.
            </p>
            <div className="sim-out">
              <div className="sim-line"><span>living entities</span><b>{living.length}</b></div>
              <div className="sim-line no"><span>dismissed forever</span><b>{removed}</b></div>
            </div>
            {removed > 0 && <button className="mini" style={{ marginTop: 11 }} onClick={reset}>restore all</button>}
          </div>
        </div>
      </div>
    </div>
  );
}
