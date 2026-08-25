/**
 * Nudges — what fired, what it looked like, and what you did about it.
 *
 * The page is built out of the notification itself, at the size and shape iOS
 * draws one, because that is where the product actually happens: the card here
 * and the banner on the lock screen have to be the same object or the app is
 * two products. A nudge that cannot show its origin is indistinguishable from
 * an ad, so provenance — the original thumbnail, the handle, the date saved —
 * is inside the notification rather than beside it.
 *
 * The verdict is editable after the fact, and it is not a rating. "Went" is
 * what stops something coming back today; "never" is the only way the archive
 * ever shrinks. Both write straight into the feedback the engine reads, which
 * is why changing your mind about last Tuesday changes what happens tonight.
 *
 * The rejections are still here, and still on purpose — "nothing fired" and
 * "nothing was considered" look identical from outside, and only one of them is
 * design. They are folded into a disclosure now: available, not in the way.
 */

import React, { useState } from 'react';
import { thumb, fmtDate, ago } from '../data.js';
import { LargeTitle, Glyph } from '../ui/kit.jsx';
import NudgeSheet from '../ui/nudge.jsx';
import * as store from '../state/store.js';

const clock = (iso) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

/** How long ago, at notification-shelf granularity. */
function since(iso) {
  const mins = Math.round((Date.now() - new Date(iso)) / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m ago`;
  if (mins < 1440) return `${Math.round(mins / 60)}h ago`;
  return clock(iso);
}

/**
 * One notification, in the shape iOS gives one: the app's own icon and name in
 * small caps, the time on the right, a bold title, two lines of body, and the
 * thumbnail on the trailing edge.
 */
function Notification({ title, body, at, post, live, children }) {
  return (
    <div className={`notif${live ? ' live' : ''}`}>
      <div className="notif-head">
        <span className="appicon"><Glyph name="bolt" size={11} /></span>
        <span className="appname">CUE</span>
        <span className="notif-when">{at ? since(at) : 'now'}</span>
      </div>
      <div className="notif-body">
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="notif-title">{title}</div>
          <div className="notif-text">{body}</div>
          {post && (
            <div className="notif-prov">
              saved from <b>@{post.source.author}</b> · {fmtDate(post.source.saved_at)} · {ago(post.source.saved_at)}
            </div>
          )}
        </div>
        {post && thumb(post) && <img className="notif-thumb" src={thumb(post)} alt="" />}
      </div>
      {children}
    </div>
  );
}

/** went / not now / never, reflecting what is stored and able to change it. */
function Verdicts({ value, onVerdict, onEdit }) {
  const opts = [
    ['went', 'I went', 'checkmark'],
    ['not_now', 'Not now', 'clock'],
    ['never', 'Never', 'bell.slash'],
  ];
  return (
    <div className="notif-verdicts">
      {opts.map(([v, label, icon]) => (
        <button key={v} className={value === v ? `on ${v}` : ''} onClick={() => onVerdict(v)}>
          <Glyph name={icon} size={15} weight={2.1} />{label}
        </button>
      ))}
      {onEdit && (
        <button className="tune" onClick={onEdit} aria-label="nudge settings for this place">
          <Glyph name="slider" size={16} />
        </button>
      )}
    </div>
  );
}

export default function Nudges({ evaluation, onVerdict, onChanged, onOpenSettings }) {
  const [editing, setEditing] = useState(null);
  const fired = evaluation?.fired || [];
  const suppressed = evaluation?.suppressed || [];
  const rejected = evaluation?.rejected || [];
  const log = store.history();
  const feedback = store.loadFeedback();

  // History rows carry only an entity id. The evaluation covers every entity in
  // the corpus — fired, suppressed and rejected together — so it is what hands
  // back the entity itself, and with it the post a past nudge came from. A card
  // in the shelf keeps its provenance rather than degrading to a bare line.
  const byId = new Map([...fired, ...suppressed, ...rejected].map((c) => [c.entity.id, c.entity]));

  return (
    <div>
      <LargeTitle
        title="Nudges"
        subtitle={evaluation
          ? `${evaluation.budget.used} of ${evaluation.budget.cap} used today · ${rejected.length} considered and kept quiet`
          : 'The engine has not run yet — it is waiting for a position.'}
        trailing={
          <button className="round-btn big" onClick={onOpenSettings} aria-label="nudge settings">
            <Glyph name="gear" size={19} />
          </button>
        }
      />

      {!evaluation && (
        <div className="empty">
          <Glyph name="mappin.circle" size={26} />
          <div>
            <div className="t-head">Waiting for a position</div>
            <div className="t-foot dim">
              Nothing can be decided without one — the gate runs against where you actually are.
            </div>
          </div>
        </div>
      )}

      {fired.length > 0 && <h4 className="section">firing now</h4>}
      {fired.map((c) => (
        <Notification key={c.entity.id} live at={null} post={c.entity.post}
                      title={c.entity.name} body={c.reason}>
          <Verdicts value={feedback[c.entity.id]}
                    onVerdict={(v) => onVerdict(c.entity.id, v)}
                    onEdit={() => setEditing(c.entity)} />
        </Notification>
      ))}

      {!fired.length && evaluation && (
        <div className="empty">
          <Glyph name="bell.slash" size={26} />
          <div>
            <div className="t-head">Quiet right now</div>
            <div className="t-foot dim">
              Nothing has earned an interruption. That is the app working, not the app broken.
            </div>
          </div>
        </div>
      )}

      {/* Candidates that lost to the daily cap. Named, because "the budget was
          spent" is a decision the app made and should be able to show. */}
      {suppressed.length > 0 && <>
        <h4 className="section">held back — the daily cap is spent</h4>
        <div className="group">
          <div className="list">
            {suppressed.map((c) => (
              <div className="row stack" key={c.entity.id}>
                <span className="t-body">{c.entity.name}</span>
                <span className="t-foot dim">{c.reason} · would have fired</span>
              </div>
            ))}
          </div>
        </div>
      </>}

      {log.length > 0 && <>
        <h4 className="section">earlier</h4>
        {log.map((h, i) => {
          const entity = byId.get(h.entity_id);
          return (
            <Notification key={`${h.entity_id}-${h.at}-${i}`} at={h.at}
                          title={h.name} body={h.reason} post={entity?.post}>
              <Verdicts value={feedback[h.entity_id]}
                        onVerdict={(v) => onVerdict(h.entity_id, v)}
                        onEdit={entity ? () => setEditing(entity) : null} />
            </Notification>
          );
        })}
      </>}

      {/* Folded, not removed. This is the evidence that the quiet is deliberate,
          and it is also 90 lines of it — a disclosure is the honest shape. */}
      {rejected.length > 0 && (
        <div className="group" style={{ marginTop: 8 }}>
          <div className="list">
            <details className="disclose">
              <summary>
                <Glyph name="info" size={19} style={{ color: 'var(--label-2)' }} />
                Why {rejected.length} others stayed quiet
                <span className="chev"><Glyph name="chevron.right" size={16} weight={2.2} /></span>
              </summary>
              <div className="inner">
                <div className="trace">
                  {rejected.slice(0, 40).map((r, i) => (
                    <div key={i}><b>{r.entity.name}</b> — {r.why}</div>
                  ))}
                  {rejected.length > 40 && <div>…and {rejected.length - 40} more</div>}
                </div>
              </div>
            </details>
          </div>
        </div>
      )}

      {editing && (
        <NudgeSheet entity={editing} onClose={() => setEditing(null)} onChanged={onChanged}
                    onOpenSettings={() => { setEditing(null); onOpenSettings(); }} />
      )}
    </div>
  );
}
