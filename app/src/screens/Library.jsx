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
 *
 * The list is the second shape of the same folder, and it answers a different
 * question. The grid says "look how much you saved and forgot"; the list says
 * "what is actually near me right now". Same saves, flattened to the places
 * inside them, nearest first, with the filters a person would actually reach
 * for — open now, allowed to nudge, this city. It is not a search box: the
 * corpus is 87 places, and a sort plus three filters gets to any of them in
 * two taps, which typing a name never beats on a phone.
 */

import React, { useMemo, useState } from 'react';
import {
  thumb, frames as postFrames, ago, fmtDate, flatten,
  nudgeState, nudgeReason, NUDGE_STATES, travelTo, hoursNow,
} from '../data.js';
import * as store from '../state/store.js';
import {
  Glyph, ContextMenu, ActionSheet, useLongPress,
  LargeTitle, StatusDot, StatusLegend, Segmented, Sheet, SettingRow, Toggle,
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
function Entity({ e, position, onEdit, onMap }) {
  const [open, setOpen] = useState(false);
  const place = e.place;
  const state = nudgeState(e, { overrides: store.loadOverrides(), feedback: store.loadFeedback() });
  const custom = !!store.overrideFor(e.id);
  const trip = place?.coords ? travelTo(e, position) : null;

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

        {/* Straight to the pin, for anything that has one. The distance rides
            along when there is a fix — "8 min walk" is the reason you would
            want to see it on the map — but "too far to route" is not, so past
            routing range it is just the distance. Stops the row's own tap. */}
        {place?.coords && onMap && (
          <button className="maplink" onClick={(ev) => { ev.stopPropagation(); onMap(e.id); }}>
            <Glyph name="mappin.circle" size={15} weight={2} />
            See on map
            {trip && <span className="dim"> · {trip.mode === 'far' ? trip.distance : trip.label}</span>}
          </button>
        )}

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

function Detail({ post, position, onBack, backLabel = 'Back', onMore, onEdit, onMap }) {
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
          {post.entities.map((e) => (
            <Entity key={e.id} e={e} position={position} onEdit={onEdit} onMap={onMap} />
          ))}
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

/* ── The list ───────────────────────────────────────────────────────────── */

/**
 * The list's whole state, and its resting position. Nearest first is the
 * default because it is the only sort that changes as you move — the other two
 * are there for the moment there is no fix yet, or you know the name.
 */
const NO_FILTERS = { sort: 'distance', status: null, openNow: false, city: null };
const SORTS = [
  { value: 'distance', label: 'Nearest' },
  { value: 'saved', label: 'Newest' },
  { value: 'name', label: 'A to Z' },
];
const SORT_LABEL = { distance: 'Nearest first', saved: 'Newest first', name: 'A to Z' };

const bySaved = (a, b) => (b.post.source.saved_at || '').localeCompare(a.post.source.saved_at || '');
const byName = (a, b) => a.name.localeCompare(b.name);

/**
 * One place, as a row. The status dot on the left is the same button it is on
 * the post page; tapping the rest of the row goes to the MAP, with this pin's
 * card open — a list sorted by distance is a list of places to go, and the
 * card is where the walk, the hours and the directions are. The post it came
 * from is one more tap from there ("Full page"), and press-and-hold here still
 * opens the same menu the grid tile does.
 *
 * The distance is on the trailing edge in tabular figures because when the
 * list is sorted by it, that column is what you are reading — the names are
 * what you check second.
 */
function PlaceRow({ e, position, ctx, onShow, onHold, onEdit }) {
  const { holding, handlers } = useLongPress(() => onHold(e.post), { onTap: () => onShow(e.id) });
  const state = nudgeState(e, ctx);
  const trip = travelTo(e, position);
  const hours = hoursNow(e);
  return (
    <div className="place">
      <button className="statusbtn" onClick={() => onEdit(e)}
              aria-label={`${e.name}: ${state.label}. Edit its trigger.`}>
        <StatusDot state={state} size={12} />
      </button>
      <div className={`place-main${holding ? ' holding' : ''}`} {...handlers}>
        <div className="place-text">
          <div className="name">{e.name}</div>
          <div className="line">
            {/* The walk or the drive, but never "too far to route" — sixty
                Oslo rows each saying so from Los Angeles is noise, and the
                distance beside it already says it. */}
            {trip && trip.mode !== 'far' && <span>{trip.label}</span>}
            {hours && hours.open === false && <span style={{ color: 'var(--red-ink)' }}>Closed now</span>}
            {hours && hours.open && (
              <span style={{ color: 'var(--green-ink)' }}>Open{hours.until ? ` until ${hours.until}` : ''}</span>
            )}
            {/* Nothing to say — no fix, no hours — still needs a line, or the
                row collapses to a name and the list stops lining up. */}
            {!trip && !hours && <span className="dim3">hours unknown</span>}
            {trip?.mode === 'far' && !hours && <span className="dim3">{trip.label}</span>}
          </div>
          {/* Its own line, quiet: on the line above it was the thing that
              always got cut off, and "laptop-friendly café, Los Angeles" is
              what tells two "Happy Foods" apart. */}
          <div className="facts">{[e.category || e.type, e.city].filter(Boolean).join(', ')}</div>
        </div>
        <span className="dist">{trip ? trip.distance : ''}</span>
        <Glyph name="chevron.right" size={16} weight={2.2} style={{ color: 'var(--label-3)' }} />
      </div>
    </div>
  );
}

/**
 * The filters, as a sheet. Every control here is a real reduction of the list,
 * counted live — the footer says how many places the current choice leaves,
 * so "open now in Bergen" showing nothing is discovered before the sheet
 * closes rather than after.
 */
function FilterSheet({ filters, onChange, counts, cities, hoursKnown, shown, total, onClose }) {
  const set = (patch) => onChange({ ...filters, ...patch });
  const active = filters.status || filters.openNow || filters.city;
  return (
    <Sheet title="Sort and filter" subtitle={`${shown} of ${total} places`} onClose={onClose}
           footer={
             <div style={{ display: 'flex', gap: 8 }}>
               {active && (
                 <button className="btn" onClick={() => onChange({ ...NO_FILTERS, sort: filters.sort })}>
                   Clear
                 </button>
               )}
               <button className="btn primary wide" onClick={onClose}>
                 Show {shown} {shown === 1 ? 'place' : 'places'}
               </button>
             </div>
           }>
      <h4 className="section" style={{ marginTop: 4 }}>sort by</h4>
      <Segmented value={filters.sort} options={SORTS} onChange={(v) => set({ sort: v })} />

      <h4 className="section">show</h4>
      <div className="group">
        <div className="list">
          <div className="row stack">
            <div className="t-body">What it is allowed to do</div>
            <div className="chips tight">
              <button className={!filters.status ? 'on' : ''} onClick={() => set({ status: null })}>All</button>
              {Object.values(NUDGE_STATES).map((s) => (
                <button key={s.key} className={filters.status === s.key ? 'on' : ''}
                        onClick={() => set({ status: filters.status === s.key ? null : s.key })}>
                  <StatusDot state={s} size={9} ring={false} />
                  {s.short}
                  <span className="tag">{counts[s.key] || 0}</span>
                </button>
              ))}
            </div>
          </div>
          <SettingRow label="Open right now"
                      hint={`Real hours from Places — ${hoursKnown} of ${total} have them`}>
            <Toggle on={filters.openNow} onChange={(v) => set({ openNow: v })} />
          </SettingRow>
        </div>
      </div>

      <h4 className="section">city</h4>
      <div className="group">
        <div className="list">
          <div className="row stack">
            <div className="chips tight">
              <button className={!filters.city ? 'on' : ''} onClick={() => set({ city: null })}>Everywhere</button>
              {cities.map(([city, n]) => (
                <button key={city} className={filters.city === city ? 'on' : ''}
                        onClick={() => set({ city: filters.city === city ? null : city })}>
                  {city}<span className="tag">{n}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </Sheet>
  );
}

function PlaceList({ places, others, position, filters, onFilters, onShow, onHold, onEdit }) {
  const [sheet, setSheet] = useState(false);
  const ctx = { overrides: store.loadOverrides(), feedback: store.loadFeedback() };

  // Counted over the whole corpus, not the filtered list, so the chips in the
  // sheet say what each choice WOULD show rather than what it currently does.
  const cities = useMemo(() => {
    const n = {};
    for (const e of places) if (e.city) n[e.city] = (n[e.city] || 0) + 1;
    return Object.entries(n).sort((a, b) => b[1] - a[1]);
  }, [places]);
  const counts = {};
  for (const e of places) {
    const k = nudgeState(e, ctx).key;
    counts[k] = (counts[k] || 0) + 1;
  }
  const hoursKnown = places.filter((e) => hoursNow(e)).length;

  const shown = places.filter((e) =>
    (!filters.status || nudgeState(e, ctx).key === filters.status)
    && (!filters.openNow || hoursNow(e)?.open === true)
    && (!filters.city || e.city === filters.city));

  // Distance needs a fix. Until there is one the list still has to be in SOME
  // order, and "most recently saved" is the one that needs no explanation —
  // the note below the strip says which is in force.
  const noFix = filters.sort === 'distance' && !position;
  const metres = new Map(shown.map((e) => [e.id, travelTo(e, position)?.metres ?? Infinity]));
  const sorted = [...shown].sort(
    filters.sort === 'name' ? byName
    : noFix || filters.sort === 'saved' ? bySaved
    : (a, b) => metres.get(a.id) - metres.get(b.id));

  const active = filters.status || filters.openNow || filters.city;
  const set = (patch) => onFilters({ ...filters, ...patch });

  return (
    <>
      {/* The strip: the sort, and whatever is currently narrowing the list.
          "Open now" is always here because it is the filter reached for most;
          the other two appear when set, and tapping one takes it off. */}
      <div className="filters">
        <button className="round-btn" onClick={() => setSheet(true)} aria-label="sort and filter">
          <Glyph name="slider" size={17} />
        </button>
        <button className="fchip" onClick={() => setSheet(true)}>
          {SORT_LABEL[filters.sort]}<Glyph name="chevron.down" size={13} weight={2.4} />
        </button>
        <button className={`fchip${filters.openNow ? ' on' : ''}`} onClick={() => set({ openNow: !filters.openNow })}>
          Open now{filters.openNow && <Glyph name="xmark" size={12} weight={2.6} />}
        </button>
        {filters.status && (
          <button className="fchip on" onClick={() => set({ status: null })}>
            <StatusDot state={NUDGE_STATES[filters.status]} size={9} ring={false} />
            {NUDGE_STATES[filters.status].short}
            <Glyph name="xmark" size={12} weight={2.6} />
          </button>
        )}
        {filters.city && (
          <button className="fchip on" onClick={() => set({ city: null })}>
            {filters.city}<Glyph name="xmark" size={12} weight={2.6} />
          </button>
        )}
      </div>

      {noFix && (
        <div className="explain" style={{ marginTop: 0 }}>
          <Glyph name="mappin.circle" size={18} />
          <span><b>Waiting for a position.</b> Newest first until there is one — nearest needs a fix.</span>
        </div>
      )}

      <h4 className="group-title" style={{ margin: '0 16px 7px' }}>
        {active ? `${sorted.length} of ${places.length}` : places.length} places
        {' · '}{(noFix ? SORT_LABEL.saved : SORT_LABEL[filters.sort]).toLowerCase()}
      </h4>

      {sorted.length
        ? (
          <div className="group">
            <div className="list">
              {sorted.map((e) => (
                <PlaceRow key={e.id} e={e} position={position} ctx={ctx}
                          onShow={onShow} onHold={onHold} onEdit={onEdit} />
              ))}
            </div>
          </div>
        ) : (
          <div className="empty">
            <Glyph name="mappin.circle" size={26} />
            <div>
              <div className="t-head">Nothing matches</div>
              <div className="t-foot dim">
                {filters.openNow ? 'Nothing that fits is open right now. ' : ''}
                Loosen a filter, or{' '}
                <button className="btn plain" style={{ padding: 0, fontSize: 13 }}
                        onClick={() => onFilters({ ...NO_FILTERS, sort: filters.sort })}>
                  clear them all
                </button>.
              </div>
            </div>
          </div>
        )}

      {/* The saves that are not places — workouts, a product — are not lost,
          they are on their posts. Said once, at the bottom, so the count in
          the grid and the count here do not look like a disagreement. */}
      {others > 0 && (
        <div className="group-foot" style={{ marginTop: sorted.length ? -14 : 4 }}>
          {others} other saved {others === 1 ? 'thing is' : 'things are'} not places — workouts, products —
          and live on their posts in the grid.
        </div>
      )}

      {sheet && (
        <FilterSheet filters={filters} onChange={onFilters} counts={counts} cities={cities}
                     hoursKnown={hoursKnown} shown={sorted.length} total={places.length}
                     onClose={() => setSheet(false)} />
      )}
    </>
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

export default function Library({ posts, position, onRefresh, onDelete, onCapture,
                                 openId, onOpen, onBack, backLabel,
                                 onChanged, onOpenSettings, onShowOnMap }) {
  const [menuFor, setMenuFor] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [editing, setEditing] = useState(null);   // entity whose trigger is being set

  // Grid or list, and the list's filters — remembered across tab switches,
  // because this component unmounts when you leave it and coming back to find
  // "open now in Oslo" reset to the grid reads as the app forgetting.
  const [view, setViewState] = useState(() => (store.loadLibraryView().view === 'list' ? 'list' : 'grid'));
  const [filters, setFiltersState] = useState(() => ({ ...NO_FILTERS, ...(store.loadLibraryView().filters || {}) }));
  const setView = (v) => { setViewState(v); store.saveLibraryView({ ...store.loadLibraryView(), view: v }); };
  const setFilters = (f) => { setFiltersState(f); store.saveLibraryView({ ...store.loadLibraryView(), filters: f }); };

  // The list is the corpus flattened to what has a pin — a place with no
  // coordinates has no distance to sort by and nothing to filter on.
  const places = useMemo(() => flatten({ posts }).filter((e) => e.place?.coords), [posts]);
  const others = posts.reduce((n, p) => n + p.entities.length, 0) - places.length;

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
        ? <Detail post={open} position={position} onBack={onBack} backLabel={backLabel}
                  onMore={() => setMenuFor(open)} onEdit={setEditing} onMap={onShowOnMap} />
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
            {/* Two shapes of the same folder. The grid is the saves as they
                were saved; the list is the places inside them, nearest first. */}
            <div className="view-toggle">
              <Segmented value={view} onChange={setView}
                         options={[{ value: 'grid', label: 'Grid' }, { value: 'list', label: 'List' }]} />
            </div>
            {view === 'list'
              ? <PlaceList places={places} others={others} position={position}
                           filters={filters} onFilters={setFilters}
                           onShow={onShowOnMap} onHold={setMenuFor} onEdit={setEditing} />
              : (
                <div className="grid">
                  {sorted.map((p) => (
                    <Tile key={p.id} post={p} onOpen={(x) => onOpen(x.id)} onHold={setMenuFor} />
                  ))}
                </div>
              )}
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
