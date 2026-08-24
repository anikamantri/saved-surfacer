import { thumb, ago } from '../data.js';
import { fmtClock } from '../sim/world.js';

/**
 * Screen 4 — the one that has to land.
 *
 * This notification is NOT scripted. It is whatever the engine returned for the
 * current clock and position. Move the dot away in the simulator and it vanishes;
 * wind the clock past closing time and it vanishes. That is the whole claim.
 */
export default function Nudge({ result, now, setScreen }) {
  const top = result.fired[0];
  // "128727 min away" is technically true and completely useless. Anything past a
  // short walk is just "not nearby"; the interesting rejections are the near misses.
  const near = result.rejected
    .filter((r) => /closed|mid-calendar/.test(r.why || ''))
    .concat(result.rejected.filter((r) => {
      const m = (r.why || '').match(/^(\d+) min away/);
      return m && Number(m[1]) <= 25;
    }))
    .slice(0, 4);

  return (
    <div className="pad">
      <div className="eyebrow">04 · the nudge</div>
      <h1 className="h1">The moment it becomes useful.</h1>
      <p className="sub">
        Not a reminder I set. A saved post, waking itself up because the conditions it needed
        finally happened. Everything below is live output from the engine — move the dot or the
        clock in the simulator and this screen changes.
      </p>

      <div className="phone-stage" style={{ marginTop: 22 }}>
        <div className="phone">
          <div className="lock" style={{ backgroundImage: 'url(./tiles/13/4340/2382.png)' }}>
            <div className="lock-time">{fmtClock(now)}</div>
            <div className="lock-date">Monday 24 August</div>

            {top ? (
              <div className="notif">
                <div className="notif-head">
                  <div className="notif-app" />
                  <span>CUE</span>
                  <span style={{ marginLeft: 'auto' }}>now</span>
                </div>
                <div className="notif-title">
                  {top.kind === 'spatial'
                    ? `You're ${top.walk_min} minutes from ${top.entity.name}.`
                    : `${top.entity.name} — ${top.reason}`}
                </div>
                <div className="notif-body">{top.entity.hook}</div>
                <div className="notif-media">
                  {thumb(top.entity.post) && <img src={thumb(top.entity.post)} alt="" />}
                  <div className="notif-prov">
                    You saved this from @{top.entity.post.source.author}<br />
                    {ago(top.entity.post.source.saved_at)} · {top.reason}
                  </div>
                </div>
              </div>
            ) : (
              <div className="notif" style={{ textAlign: 'center' }}>
                <div className="notif-body">
                  Nothing has earned an interruption right now.<br />
                  <span style={{ color: 'var(--dim)' }}>That is the app working, not failing.</span>
                </div>
              </div>
            )}
          </div>
        </div>

        <div style={{ maxWidth: 400, minWidth: 300 }}>
          <div className="panel">
            <div className="label">why this one, and nothing else</div>
            {top ? (
              <>
                <div className="why">
                  <div className="why-l">fired because</div>
                  <div className="why-t">
                    {top.kind === 'spatial'
                      ? <>You are <b>{top.distance_m} m</b> away ({top.walk_min} min walk), it is
                         open, your calendar is clear, and extraction confidence is{' '}
                         {(top.entity.confidence.overall ?? 0).toFixed(2)}.</>
                      : top.reason}
                  </div>
                </div>
                <div className="sim-line"><span>score</span><b>{top.score}</b></div>
              </>
            ) : <div className="body-text">No candidate cleared the bar.</div>}

            <div className="label" style={{ marginTop: 14 }}>
              held back — {result.fired.length} firing, {result.suppressed.length} over budget,{' '}
              {result.rejected.length} failed the gate
            </div>
            {result.suppressed.map((s) => (
              <div className="sim-line no" key={s.entity.id}>
                <span>{s.entity.name}</span><b>{s.why}</b>
              </div>
            ))}
            {near.map((r) => (
              <div className="sim-line no" key={r.entity.id}>
                <span>{r.entity.name}</span><b>{r.why}</b>
              </div>
            ))}
            <p className="sub" style={{ fontSize: 11.5, marginTop: 10 }}>
              {result.fired.length} of a maximum {result.budget.cap} per day. Everything held back is
              still on the map — <b>the map is where the long tail lives, the notification is
              reserved for the exceptional match.</b>
            </p>
          </div>
          {top && (
            <button className="act go" style={{ marginTop: 10, width: '100%' }} onClick={() => setScreen(4)}>
              Open the card →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
