import { fmtClock } from '../sim/world.js';
import { DAILY_BUDGET } from '@cue/engine';

/**
 * The simulator.
 *
 * This panel is the honesty of the whole prototype: it exposes the two inputs the
 * engine consumes and lets anyone move them. Nothing downstream is pre-baked —
 * drag either slider and watch candidates enter and leave the gate in real time.
 *
 * Hidden with `s` while recording.
 */
export default function SimPanel({ now, hours, setHours, routeT, setRouteT, result, onHide }) {
  const nearMisses = result.rejected.filter((r) => {
    if (/closed|mid-calendar/.test(r.why || '')) return true;
    const m = (r.why || '').match(/^(\d+) min away/);
    return m && Number(m[1]) <= 25;   // a place in another country is not a near miss
  }).slice(0, 3);

  return (
    <aside className="sim">
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <h4>simulated world</h4>
        <button className="mini" style={{ marginLeft: 'auto', padding: '2px 7px' }} onClick={onHide}>hide</button>
      </div>

      <div className="sim-row">
        <div className="lab"><span>clock</span><b>{fmtClock(now)}</b></div>
        <input type="range" min="0" max="23.9" step="0.1" value={hours}
               onChange={(e) => setHours(Number(e.target.value))} />
      </div>

      <div className="sim-row">
        <div className="lab"><span>position along the Majorstuen walk</span><b>{Math.round(routeT * 100)}%</b></div>
        <input type="range" min="0" max="1" step="0.01" value={routeT}
               onChange={(e) => setRouteT(Number(e.target.value))} />
      </div>

      <div className="sim-out">
        <div className="sim-line">
          <span>notification budget</span>
          <b className={result.fired.length ? '' : 'no'}>
            {result.fired.length}/{DAILY_BUDGET} firing
          </b>
        </div>
        {result.fired.map((f) => (
          <div className="sim-line" key={f.entity.id}>
            <span>▲ {f.entity.name}</span><b>{f.reason}</b>
          </div>
        ))}
        {!result.fired.length && <div className="sim-line no"><span>nothing firing</span><b>quiet</b></div>}
        {nearMisses.map((r) => (
          <div className="sim-line no" key={r.entity.id}><span>· {r.entity.name}</span><b>{r.why}</b></div>
        ))}
      </div>
    </aside>
  );
}
