/**
 * The general settings — what "nearby" means, and how often the app is allowed
 * to speak at all.
 *
 * These are the floor the whole corpus stands on. A per-pin trigger is a
 * statement about one saved thing and always wins; this screen deliberately
 * says so at the bottom rather than leaving the precedence to be discovered.
 *
 * Everything here is a real engine input — `prefsOf()` merges it over
 * `DEFAULTS` and the gate reads it. There is no setting on this screen that
 * only changes a label.
 */

import React from 'react';
import { DEFAULTS } from '@cue/engine';
import * as store from '../state/store.js';
import { NavBar, SettingRow, Toggle, Glyph } from '../ui/kit.jsx';

const Choice = ({ value, options, fmt, onChange }) => (
  <div className="chips tight">
    {options.map((o) => (
      <button key={o} className={o === value ? 'on' : ''} onClick={() => onChange(o)}>{fmt(o)}</button>
    ))}
  </div>
);

export default function Settings({ onBack, backLabel = 'Back', onChanged }) {
  const prefs = { ...DEFAULTS, ...store.loadPrefs() };
  const overrides = store.loadOverrides();
  const set = (k, v) => { store.setPref(k, v); onChanged?.(); };

  const custom = Object.keys(overrides).length;

  return (
    <div>
      <NavBar title="Nudge settings" onBack={onBack} backLabel={backLabel} />

      <h4 className="section">how close is “nearby”</h4>
      <div className="group">
        <div className="list">
          <div className="row stack">
            <div className="t-body">Within a walk of</div>
            <Choice value={prefs.max_walk_min} options={[3, 6, 15, 30]}
                    fmt={(m) => `${m} min`} onChange={(v) => set('max_walk_min', v)} />
            <span className="t-foot dim">
              Measured as a real walk, not a straight line — {prefs.max_walk_min} minutes is
              about {Math.round(prefs.max_walk_min * 1.35 * 60 / 1.25)} metres of street.
            </span>
          </div>
        </div>
      </div>

      <h4 className="section">how often it may interrupt you</h4>
      <div className="group">
        <div className="list">
          <div className="row stack">
            <div className="t-body">Nudges a day, at most</div>
            <Choice value={prefs.daily_budget} options={[1, 2, 3, 5]}
                    fmt={(n) => `${n}`} onChange={(v) => set('daily_budget', v)} />
            <span className="t-foot dim">
              Everything beyond the cap stays on the map instead. The failure mode
              this product has to avoid is notification fatigue, not a missed café.
            </span>
          </div>
          <div className="row stack">
            <div className="t-body">Calendar nudges arrive this early</div>
            <Choice value={prefs.lead_min} options={[15, 30, 45, 90]}
                    fmt={(m) => `${m} min`} onChange={(v) => set('lead_min', v)} />
          </div>
        </div>
      </div>

      <h4 className="section">when it should stay quiet</h4>
      <div className="group">
        <div className="list">
          <SettingRow label="Only when it is open"
                      hint="Real opening hours from Places, not a guess">
            <Toggle on={prefs.respect_hours} onChange={(v) => set('respect_hours', v)} />
          </SettingRow>
          <SettingRow label="Never mid-meeting"
                      hint="Nothing fires while a calendar event is running">
            <Toggle on={prefs.respect_calendar} onChange={(v) => set('respect_calendar', v)} />
          </SettingRow>
        </div>
      </div>

      {/* The precedence, said out loud. Someone who widens "nearby" here and
          then finds one pin behaving differently should not have to guess why. */}
      <h4 className="section">per-place triggers</h4>
      <div className="group">
        <div className="list">
          <div className="row stack">
            <div className="t-body">{custom
              ? `${custom} ${custom === 1 ? 'place has' : 'places have'} their own trigger`
              : 'No place has its own trigger yet'}</div>
            <span className="t-foot dim">
              Anything you set on a single pin overrides everything on this screen —
              hold a place in the library, or tap its pin on the map.
            </span>
          </div>
          {custom > 0 && (
            <button className="row" style={{ color: 'var(--red-ink)' }}
                    onClick={() => { store.clearOverrides(); onChanged?.(); }}>
              <Glyph name="arrow.clockwise" size={19} />
              Clear all per-place triggers
            </button>
          )}
        </div>
      </div>

      <div className="group-foot">
        These are engine inputs, not display options — the same values `npm test`
        runs against.
      </div>
    </div>
  );
}
