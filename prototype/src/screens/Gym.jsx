import { TYPE_COLOR, thumb, ago } from '../data.js';
import { CALENDAR } from '../sim/world.js';
import { evaluate } from '@cue/engine';

/**
 * Screen 6 — the same engine, a different trigger class.
 *
 * Travel is the demo, not the product. These workout entities came from posts
 * whose captions were "we love a drop set" and "Small changes for the biggest
 * difference" — the exercises exist only in the frames and the voiceover. And
 * they fire on a calendar match, not on proximity: nothing about the engine is
 * specific to places.
 */
export default function Gym({ ctx, living, setHours, hours }) {
  const workouts = living.filter((e) => e.type === 'workout');
  const evals = workouts.map((w) => evaluate(w, ctx));
  const firing = evals.filter((r) => r.fired);
  const gym = CALENDAR.find((e) => e.title === 'Gym');
  const gymHour = new Date(gym.start).getHours();

  return (
    <div className="pad">
      <div className="eyebrow">06 · it generalises</div>
      <h1 className="h1">Same engine. No map involved.</h1>
      <p className="sub">
        {workouts.length} workout entities, extracted from two posts whose captions say nothing at
        all. Their trigger isn't a place — it's <b>a calendar event whose title matches</b>. The
        engine code is identical; only the signal changed.
      </p>

      <div style={{ display: 'flex', gap: 8, margin: '16px 0', alignItems: 'center', flexWrap: 'wrap' }}>
        <button className="mini on" onClick={() => setHours(gymHour - 0.5)}>jump to 17:30 — before the gym</button>
        <button className="mini" onClick={() => setHours(10.6)}>back to the morning walk</button>
        <span className="chip">clock: {Math.floor(hours)}:{String(Math.round((hours % 1) * 60)).padStart(2, '0')}</span>
      </div>

      <div className="cols">
        <div className="panel">
          <div className="label">today's calendar — the signal being watched</div>
          {CALENDAR.map((e) => {
            const start = new Date(e.start);
            const isGym = e.title === 'Gym';
            return (
              <div className="ent" key={e.title} style={{ borderColor: isGym && firing.length ? 'var(--accent)' : 'var(--line)' }}>
                <div className="ent-top">
                  <span className="type-dot" style={{ background: isGym ? TYPE_COLOR.workout : 'var(--dim)' }} />
                  <span className="ent-name">{e.title}</span>
                  <span className="conf">{start.getHours()}:{String(start.getMinutes()).padStart(2, '0')}</span>
                </div>
                {isGym && (
                  <div className="ent-hook">
                    matches <span className="mono">["gym","workout","lift","training"]</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="panel">
          <div className="label">
            {firing.length
              ? `${firing.length} workouts surfacing`
              : 'nothing surfacing — no matching event within 45 minutes'}
          </div>

          {evals.map((r) => (
            <div className="ent" key={r.entity.id} style={{ opacity: r.fired ? 1 : .5 }}>
              <div className="ent-top">
                <span className="type-dot" style={{ background: TYPE_COLOR.workout }} />
                <span className="ent-name">{r.entity.name}</span>
                <span className="conf">{r.fired ? r.reason : r.why}</span>
              </div>
              <div className="ent-hook">{r.entity.hook}</div>
              <div className="ent-foot">
                {r.entity.found_in.map((s) => <span key={s} className="chip on">{s}</span>)}
                <span className="chip">@{r.entity.post.source.author}</span>
              </div>
            </div>
          ))}

          {firing.length > 0 && (
            <div className="notif" style={{ background: 'var(--surface-2)', marginTop: 14 }}>
              <div className="notif-head"><div className="notif-app" /><span>CUE</span></div>
              <div className="notif-title">Gym in 30 minutes — you saved 6 exercises.</div>
              <div className="notif-media">
                {thumb(firing[0].entity.post) && <img src={thumb(firing[0].entity.post)} alt="" />}
                <div className="notif-prov">
                  From @{firing[0].entity.post.source.author}, {ago(firing[0].entity.post.source.saved_at)}<br />
                  Pulled from the voiceover — the caption never mentioned them.
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
