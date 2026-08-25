/**
 * The graveyard, and the post page behind it.
 *
 * The grid is deliberately the dumbest screen in the app: reverse-chronological,
 * uniform, no grouping, no search. The saved folder gets shown as it actually
 * is, and establishing that in five seconds is its whole job. The header is a
 * plain iOS large title with capture in the corner — the platform's own saved
 * folder has one, and a screen with no way in but a floating button was hiding
 * the app's only input behind a guess.
 *
 * Press and hold is where the app answers back: re-run the model, re-hydrate,
 * or delete the save and everything derived from it. All three are real and all
 * three need the Mac, which the app says plainly rather than hiding.
 *
 * Tapping through shows the extraction — what the model was given and what it
 * returned. That is the anti-magic screen, so the receipts are folded to the
 * bottom rather than removed: the post comes first, the machinery is available.
 *
 * Every extracted thing carries a traffic light, and the amber one is the point:
 * most of the corpus is on the map and will never interrupt anybody. Tapping it
 * opens the trigger editor, so "this one is silent" is a state you can argue
 * with rather than a verdict you are stuck with.
 */

import React, { useState } from 'react';
import {
  thumb, frames as postFrames, ago, fmtDate,
  nudgeState, nudgeReason, NUDGE_STATES,
} from '../data.js';
import * as store from '../state/store.js';
import {
  Glyph, ContextMenu, ActionSheet, useLongPress,
  LargeTitle, StatusDot, StatusLegend,
} from '../ui/kit.jsx';
import NudgeSheet from '../ui/nudge.jsx';

/* ── The post page ──────────────────────────────────────────────────────── */

/**
 * One entity as the model returned it: name, why it matters, and — the part
 * that actually matters on this screen — whether it is allowed to interrupt you.
 *
 * The dot on the left is the whole status language in one glyph. Tapping the
 * row opens the receipts; tapping the dot opens the trigger.
 */
function Entity({ e, onEdit }) {
  const [open, setOpen] = useState(false);
  const place = e.place;
  const state = nudgeState(e, { overrides: store.loadOverrides(), feedback: store.loadFeedback() });
  const custom = !!store.overrideFor(e.id);

  return (
    <div className="entity">
      <button className="statusbtn" onClick={() => onEdit(e)}
              aria-label={`${e.name}: ${state.label}. Edit its trigger.`}>
        <StatusDot state={state} size={12} />
      </button>

      <div className="entity-main" onClick={() => setOpen(!open)}>
        <div className="top">
          <span className="name">{e.name}</span>
          {/* An override exists: the trigger below is the user's, not the
              extractor's. "yours" was tried and needed explaining, which is a
              failed label. */}
          {custom && <span className="pill tint">your trigger</span>}
        </div>
        <div className="hook">{e.hook}</div>

        {/* One quiet line rather than a stack of chips. Six entities each wrapping
            three pills turned the page into a wall of grey lozenges — the facts
            are supporting detail and should read like it. */}
        <div className="facts">
          {[e.category || e.type,
            place?.address?.split(',')[0],
            place?.hours && 'hours known',
          ].filter(Boolean).join(' · ')}
        </div>

        {/* The reason it is in that state, in the app's words. 46 of these never
            interrupt anyone and that is the design, not a fault to hide. */}
        <div className="why-line" style={{ color: state.ink }}>{
          nudgeReason(e, { overrides: store.loadOverrides(), feedback: store.loadFeedback() })
        }</div>

        {open && (
          <div className="t-foot dim" style={{ marginTop: 8, lineHeight: '19px' }}>
            <b>trigger</b> {e.trigger.kind}
            {e.trigger.scope ? ` · ${e.trigger.scope}` : ''}
            {e.trigger.radius_m ? ` · ${e.trigger.radius_m}m` : ''}
            {e.trigger.requires?.length ? ` · needs ${e.trigger.requires.join(', ')}` : ''}
            <br />
            <b>confidence</b> {e.confidence.overall} (extraction {e.confidence.extraction}
            {e.confidence.geocode != null ? `, geocode ${e.confidence.geocode}` : ''})
            <br />
            <b>found in</b> {(e.found_in || []).join(' + ') || 'caption'}
            {place?.resolved_name && <><br /><b>resolved to</b> {place.resolved_name}</>}
          </div>
        )}
      </div>

      <button className="edgebtn" onClick={() => onEdit(e)} aria-label="nudge settings">
        <Glyph name="slider" size={18} />
      </button>
    </div>
  );
}

function Detail({ post, onBack, backLabel = 'Back', onMore, onEdit }) {
  const [expanded, setExpanded] = useState(false);
  const cover = thumb(post);
  const caption = post.source.caption || '';
  const frames = postFrames(post);

  // Counted through the engine, not off the corpus: a trigger set by hand
  // changes these numbers and the header has to agree with the dots below it.
  const ctx = { overrides: store.loadOverrides(), feedback: store.loadFeedback() };
  const counts = post.entities.reduce((acc, e) => {
    const k = nudgeState(e, ctx).key;
    return { ...acc, [k]: (acc[k] || 0) + 1 };
  }, {});
  const usage = post.extraction?.usage;

  return (
    <div>
      {/* The saved thing, at the size it was saved at. It was a video, and a
          44-pixel thumbnail beside a table of metadata had it backwards. */}
      <div className="hero">
        <div className="hero-bar">
          {/* Says where it GOES, not what screen it is on — "Library" was a lie
              whenever a map pin's Full page opened this. */}
          <button className="glass-btn" onClick={onBack}>
            <Glyph name="chevron.left" size={18} weight={2.4} />{backLabel}
          </button>
          <button className="glass-btn" onClick={onMore} aria-label="actions">
            <Glyph name="ellipsis" size={19} />
          </button>
        </div>
        {cover
          ? <img src={cover} alt="" />
          : <div style={{ height: '38vh', display: 'grid', placeItems: 'center', color: 'var(--label-3)' }}>no cover</div>}
        <div className="veil">
          <div className="handle">@{post.source.author}</div>
          <div className="when">
            saved {fmtDate(post.source.saved_at)} · {ago(post.source.saved_at)}
            {post.source.saved_at_is_estimate && ' · date estimated'}
          </div>
        </div>
      </div>

      {/* The point of a save is the thing itself. One tap back to it. */}
      <a className="watch" href={post.source.url} target="_blank" rel="noreferrer">
        <Glyph name="play" size={17} />
        Watch on TikTok
      </a>

      {caption && (
        <div className="group">
          <div className="list">
            <div className="caption">
              <div className={expanded || caption.length < 220 ? '' : 'clamped'}>{caption}</div>
            </div>
            {caption.length >= 220 && (
              <button className="more" onClick={() => setExpanded(!expanded)}>
                {expanded ? 'Less' : 'More'}
              </button>
            )}
          </div>
        </div>
      )}

      {/* The old line here read "6 things inside, 6 can nudge you", which said
          the same thing twice and left the interesting case — on the map but
          silent — with no name at all. The legend names all three states and
          the dots beside each row are the same three colours. */}
      <h4 className="group-title" style={{ margin: '0 16px 7px' }}>
        {post.entities.length} {post.entities.length === 1 ? 'thing' : 'things'} inside this post
      </h4>
      <StatusLegend counts={counts} states={NUDGE_STATES} />
      <div className="group">
        <div className="list">
          {post.entities.map((e) => <Entity key={e.id} e={e} onEdit={onEdit} />)}
          {!post.entities.length && <div className="note">nothing extracted — re-run the model from the library</div>}
        </div>
      </div>

      {/* Folded, not deleted. The receipts are what make the claim checkable;
          they are just not what the screen is about. */}
      <div className="group">
        <div className="list">
          <details className="disclose">
            <summary>
              <Glyph name="info" size={19} style={{ color: 'var(--label-2)' }} />
              How this was extracted
              <span className="chev"><Glyph name="chevron.right" size={16} weight={2.2} /></span>
            </summary>
            <div className="inner">
              <div className="kv">
                <span className="k">hydrated via</span><span className="v">{post.evidence.hydrated_via}</span>
                <span className="k">caption</span><span className="v">{caption.length} chars</span>
                <span className="k">frames sampled</span><span className="v">{post.evidence.frames_used}</span>
                <span className="k">audio</span><span className="v">{post.evidence.transcript_kind}</span>
                {/* Not red: a transcript that turned out to be song lyrics is the
                    pipeline catching itself, not a failure. Red here read as broken. */}
                <span className="k">transcript useful</span>
                <span className={`v ${post.evidence.transcript_was_useful ? 'ok' : 'dim'}`}>
                  {post.evidence.transcript_was_useful ? 'yes' : 'no — music, not narration'}
                </span>
                <span className="k">model</span><span className="v mono">{post.extraction?.model || '—'}</span>
                {usage && <>
                  <span className="k">tokens</span>
                  <span className="v mono">{usage.prompt_tokens} in · {usage.completion_tokens} out</span>
                </>}
                {post.extraction?.run_at && <>
                  <span className="k">run at</span>
                  <span className="v">{new Date(post.extraction.run_at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}</span>
                </>}
              </div>

              {/* What the vision call actually saw. A caption of "soo many new
                  cafes in sf" is not where the venues came from. */}
              {frames.length > 0 && (
                <div style={{ display: 'flex', gap: 6, overflowX: 'auto', padding: '2px 16px 14px' }}>
                  {frames.map((f) => (
                    <img key={f} src={f} alt=""
                         style={{ height: 88, borderRadius: 6, flex: 'none' }} />
                  ))}
                </div>
              )}
            </div>
          </details>
        </div>
      </div>
    </div>
  );
}

/* ── The grid ───────────────────────────────────────────────────────────── */

function Tile({ post, onOpen, onHold }) {
  const { holding, handlers } = useLongPress(() => onHold(post), { onTap: () => onOpen(post) });
  const cover = thumb(post);
  return (
    <div className={`tile${holding ? ' holding' : ''}`} {...handlers}>
      {cover ? <img src={cover} alt="" draggable="false" /> : <div className="fallback">@{post.source.author}</div>}
      <span className="count">{post.entities.length}</span>
      <span className="when">{ago(post.source.saved_at)}</span>
    </div>
  );
}

export default function Library({ posts, onRefresh, onDelete, onCapture,
                                 openId, onOpen, onBack, backLabel,
                                 onChanged, onOpenSettings }) {
  const [menuFor, setMenuFor] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [editing, setEditing] = useState(null);   // entity whose trigger is being set

  const sorted = [...posts].sort((a, b) => (b.source.saved_at || '').localeCompare(a.source.saved_at || ''));
  // Derived, not stored: a post deleted from under an open detail page should
  // close it rather than render a corpse.
  const open = posts.find((p) => p.id === openId) || null;

  const menu = menuFor && [
    {
      label: 'Watch on TikTok', icon: 'play',
      onSelect: () => window.open(menuFor.source.url, '_blank', 'noreferrer'),
    },
    {
      label: 'Copy link', icon: 'link',
      onSelect: () => navigator.clipboard?.writeText(menuFor.source.url),
    },
    {
      label: 'Re-run the model', sub: 'same frames, fresh extraction', icon: 'sparkles',
      onSelect: () => onRefresh(menuFor, 'model'),
    },
    {
      label: 'Re-hydrate', sub: 're-fetch caption, frames, audio', icon: 'arrow.clockwise',
      onSelect: () => onRefresh(menuFor, 'all'),
    },
    {
      label: 'Delete save', icon: 'trash', destructive: true,
      onSelect: () => setConfirm(menuFor),
    },
  ];

  return (
    <div style={{ position: 'relative', minHeight: '100%' }}>
      {open
        ? <Detail post={open} onBack={onBack} backLabel={backLabel}
                  onMore={() => setMenuFor(open)} onEdit={setEditing} />
        : (
          <>
            {/* The header is back, and it carries capture. The floating button
                stays too — it is the one that survives a scroll — but a save
                shared from TikTok should not depend on noticing a circle. */}
            <LargeTitle
              title="Library"
              trailing={
                <button className="addbtn" onClick={onCapture} aria-label="add a save">
                  <Glyph name="plus" size={19} weight={2.4} />
                </button>
              }
            />
            <div className="grid">
              {sorted.map((p) => (
                <Tile key={p.id} post={p} onOpen={(x) => onOpen(x.id)} onHold={setMenuFor} />
              ))}
            </div>
            <button className="fab" onClick={onCapture} aria-label="add a save">
              <Glyph name="plus" size={24} weight={2.2} />
            </button>
          </>
        )}

      {menuFor && (
        <ContextMenu
          preview={thumb(menuFor) ? <img src={thumb(menuFor)} alt="" /> : null}
          caption={`@${menuFor.source.author} · ${menuFor.entities.length} extracted`}
          items={menu}
          onClose={() => setMenuFor(null)}
        />
      )}

      {confirm && (
        <ActionSheet
          title={`Delete this save from @${confirm.source.author}?`}
          message={`Its ${confirm.entities.length} extracted ${confirm.entities.length === 1 ? 'thing' : 'things'}, its frames and its transcript go too. This cannot be undone.`}
          actions={[{
            label: 'Delete save', destructive: true,
            onSelect: () => { onBack(); onDelete(confirm); },
          }]}
          onCancel={() => setConfirm(null)}
        />
      )}

      {/* The trigger editor. Reached from the dot, so the thing you disagree
          with is the thing you tap. */}
      {editing && (
        <NudgeSheet entity={editing} onClose={() => setEditing(null)}
                    onChanged={onChanged} onOpenSettings={onOpenSettings} />
      )}
    </div>
  );
}
