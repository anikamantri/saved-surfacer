/**
 * The trigger editor — the one place a person can set a wake-up condition by hand.
 *
 * The product's whole claim is that the trigger is inferrable from the content,
 * and most of the time it is. But the extractor is deliberately conservative:
 * an area is not a venue, 0.48 confidence is not confidence, and six of the
 * eight trigger classes are modelled rather than wired. Those saves would
 * otherwise be permanently mute, which is the failure this screen answers.
 *
 * Two things keep it from being an escape hatch that undoes the design:
 *
 *   1. It writes a TRIGGER, not a permission. What you set here is folded into
 *      the entity and then the same gate runs — open hours, the walk, the
 *      calendar, the daily cap. `applyOverride` in the engine is the whole
 *      mechanism, and `npm test` covers it.
 *   2. It only offers what the content can support. Proximity is refused,
 *      visibly, for anything with no coordinates rather than accepted and then
 *      silently ignored.
 *
 * Precedence: your general settings are the floor, this is a statement about
 * one saved thing, and this wins.
 */

import React, { useState } from 'react';
import { DEFAULTS, RETIRING } from '@cue/engine';
import * as store from '../state/store.js';
import { nudgeState, nudgeReason, nudgeOptions, suggestedKeywords } from '../data.js';
import { Sheet, Segmented, Glyph, StatusDot } from './kit.jsx';

const WALKS = [3, 6, 15, 30];   // four fits one row at 393pt; five wraps
const LEADS = [15, 30, 45, 90];

/** A row of small choices — "how close", "how early". Cheaper than a picker. */
const Chips = ({ value, options, fmt, onChange, note }) => (
  <div className="chips">
    {options.map((o) => (
      <button key={o} className={o === value ? 'on' : ''} onClick={() => onChange(o)}>
        {fmt(o)}
        {/* Marks the value your general settings currently give this trigger —
            "default", because "yours" read as ownership and confused. */}
        {note === o && <span className="tag">default</span>}
      </button>
    ))}
  </div>
);

export default function NudgeSheet({ entity, onClose, onChanged, onOpenSettings }) {
  const prefs = { ...DEFAULTS, ...store.loadPrefs() };
  const saved = store.overrideFor(entity.id);
  const options = nudgeOptions(entity);

  const [mode, setMode] = useState(saved?.mode || 'default');
  const [walk, setWalk] = useState(saved?.max_walk_min || prefs.max_walk_min);
  const [words, setWords] = useState((saved?.match || []).join(', ') || suggestedKeywords(entity));
  const [lead, setLead] = useState(saved?.lead_min || prefs.lead_min);

  const canBeNearby = options.find((o) => o.mode === 'nearby').available;
  const state = nudgeState(entity, { overrides: store.loadOverrides(), feedback: store.loadFeedback() });

  /**
   * A verdict outranks any trigger. The engine checks "went" and "never" before
   * the trigger is even read, so a place you have retired is silent whatever is
   * set below — and this sheet used to commit a rule on one anyway, close, and
   * change nothing, with the dot on the post page staying red. Setting a
   * trigger on a retired save is a way of taking the verdict back, so it does
   * exactly that, and the button says so rather than doing it quietly.
   */
  const verdict = store.loadFeedback()[entity.id];
  const retired = !!RETIRING[verdict];

  function commit() {
    if (retired) store.setFeedback(entity.id, null);
    if (mode === 'default') store.setOverride(entity.id, null);
    else if (mode === 'nearby') store.setOverride(entity.id, { mode: 'nearby', max_walk_min: walk });
    else if (mode === 'event') {
      store.setOverride(entity.id, {
        mode: 'event',
        match: words.split(',').map((w) => w.trim()).filter(Boolean),
        lead_min: lead,
      });
    } else store.setOverride(entity.id, { mode: 'off' });
    onChanged?.();
    onClose();
  }

  // A retired save always has something to commit: the verdict itself.
  const dirty = retired
    || mode !== (saved?.mode || 'default')
    || (mode === 'nearby' && walk !== (saved?.max_walk_min ?? prefs.max_walk_min))
    || (mode === 'event' && (words !== (saved?.match || []).join(', ') || lead !== (saved?.lead_min ?? prefs.lead_min)));

  const action = mode === 'default' ? 'use what was inferred' : 'set this trigger';

  return (
    <Sheet title={entity.name} subtitle={entity.category || entity.type} onClose={onClose}
           footer={
             <button className="btn primary wide" disabled={!dirty} onClick={commit}>
               {retired
                 ? `Take back “${verdict}” and ${action}`
                 : action[0].toUpperCase() + action.slice(1)}
             </button>
           }>
      {/* Where it stands right now, in the same three colours the library and
          the map use. Changing the picker below is what changes this. */}
      <div className="status-banner" style={{ background: state.soft }}>
        <StatusDot state={state} size={12} ring={false} />
        <div>
          <b style={{ color: state.ink }}>{state.label}</b>
          <div className="t-foot dim">{nudgeReason(entity, {
            overrides: store.loadOverrides(), feedback: store.loadFeedback(),
          })}</div>
        </div>
      </div>

      {/* Said before the picker, because until the verdict is taken back the
          picker decides nothing — and a control that looks live and is not is
          the kind of lie this sheet exists to avoid. */}
      {retired && (
        <div className="explain">
          <Glyph name={verdict === 'went' ? 'checkmark' : 'bell.slash'} size={18} />
          <div>
            {verdict === 'went'
              ? 'You went, so this one is done — nothing set below can bring it back on its own.'
              : 'You said never, so nothing set below applies on its own.'}
            {' '}Choosing a trigger here takes that back.
          </div>
        </div>
      )}

      <Segmented
        value={mode}
        onChange={setMode}
        options={[
          { value: 'default', label: 'Inferred' },
          { value: 'nearby', label: 'Nearby', disabled: !canBeNearby },
          { value: 'event', label: 'Event' },
          { value: 'off', label: 'Never' },
        ]}
      />

      {mode === 'default' && (
        <div className="explain">
          <Glyph name="sparkles" size={18} />
          <div>
            The pipeline decided this one: <b>{entity.trigger?.kind}</b>
            {entity.trigger?.scope ? ` · ${entity.trigger.scope}` : ''}.
            {' '}{entity.nudge_eligible
              ? `It uses your general settings — within a ${prefs.max_walk_min} minute walk.`
              : `It stays quiet because ${entity.why_not}.`}
            {onOpenSettings && (
              <><br /><button className="btn plain" style={{ marginLeft: -6 }} onClick={onOpenSettings}>
                Change the general settings
              </button></>
            )}
          </div>
        </div>
      )}

      {mode === 'nearby' && (canBeNearby ? (
        <>
          <div className="field-label">Nudge me within a walk of</div>
          <Chips value={walk} options={WALKS} note={prefs.max_walk_min}
                 fmt={(m) => `${m} min`} onChange={setWalk} />
          <div className="t-foot dim" style={{ padding: '0 16px' }}>
            {entity.place.resolved_name || entity.name} · {entity.place.address}
            <br />Still only when it is open, and still inside the daily cap.
          </div>
        </>
      ) : (
        <div className="explain bad">
          <Glyph name="mappin.circle" size={18} />
          <div>
            This one has no coordinates, so “nearby” is not a question the app can
            answer about it. Setting a calendar trigger is the honest option.
          </div>
        </div>
      ))}

      {mode === 'event' && (
        <>
          <div className="field-label">When an event with these words is coming up</div>
          <input className="host" value={words} onChange={(e) => setWords(e.target.value)}
                 placeholder="gym, workout" autoCapitalize="none" autoCorrect="off" />
          <div className="field-label">Tell me this far ahead</div>
          <Chips value={lead} options={LEADS} note={prefs.lead_min}
                 fmt={(m) => `${m} min`} onChange={setLead} />
          <div className="t-foot dim" style={{ padding: '0 16px' }}>
            Matched against your real calendar titles, case-insensitively.
          </div>
        </>
      )}

      {mode === 'off' && (
        <div className="explain">
          <Glyph name="bell.slash" size={18} />
          <div>
            It stays in the library and on the map — it just never interrupts you.
            This also gives up its geofence slot, so something else can have it.
          </div>
        </div>
      )}
    </Sheet>
  );
}
