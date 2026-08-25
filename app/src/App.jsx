/**
 * The shell. Four surfaces, one runtime.
 *
 * Everything the user sees is derived from `cue.state` — the same object the
 * engine evaluates against. There is no screen-local notion of "what should
 * fire": if a surface needs something the engine cannot produce, the engine is
 * what changes. That rule is what keeps `npm test` meaningful.
 */

import React, { useCallback, useEffect, useState, useRef } from 'react';
import { App as CapApp } from '@capacitor/app';
import { Clipboard } from '@capacitor/clipboard';
import { RETIRING } from '@cue/engine';
import * as cue from './cue.js';
import * as store from './state/store.js';
import * as notify from './native/notify.js';
import { isNative } from './native/permissions.js';
import { loadCorpus, syncCorpus, flatten } from './data.js';
import * as server from './net/server.js';

import { Hud, Alert } from './ui/kit.jsx';
import Library from './screens/Library.jsx';
import MapView from './screens/MapView.jsx';
import Nudges from './screens/Nudges.jsx';
import Debug from './screens/Debug.jsx';
import Add from './screens/Add.jsx';
import Settings from './screens/Settings.jsx';

/**
 * Tab icons are inline SVG, not glyphs.
 *
 * The obvious characters for these (▦ ◉ ◐ ⚙) are not in the iOS system font and
 * rendered as ? boxes on device — invisible on the Mac, glaring on camera. SVG
 * has no fallback path to get wrong.
 */
const Icon = ({ d, fill }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill={fill ? 'currentColor' : 'none'}
       stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    {d}
  </svg>
);

const TABS = [
  ['library', <Icon key="l" d={<><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>} />, 'Library'],
  ['map', <Icon key="m" d={<><path d="M12 21s7-5.7 7-11a7 7 0 1 0-14 0c0 5.3 7 11 7 11Z" /><circle cx="12" cy="10" r="2.6" /></>} />, 'Map'],
  ['nudges', <Icon key="n" d={<><path d="M18 8a6 6 0 1 0-12 0c0 6-2 7-2 7h16s-2-1-2-7Z" /><path d="M10.3 20a2 2 0 0 0 3.4 0" /></>} />, 'Nudges'],
  // A ladybug, because that is what the platform's own debugger is — and a gear
  // here would collide with the Settings gear on the Nudges screen.
  ['debug', <Icon key="d" d={<><path d="M9 4.2 10.6 6.1M15 4.2 13.4 6.1" /><circle cx="12" cy="13.6" r="6.7" /><path d="M12 6.9v13.4" /><circle cx="9.3" cy="11.5" r="1.05" fill="currentColor" stroke="none" /><circle cx="14.7" cy="11.5" r="1.05" fill="currentColor" stroke="none" /><circle cx="9.3" cy="16.2" r="1.05" fill="currentColor" stroke="none" /><circle cx="14.7" cy="16.2" r="1.05" fill="currentColor" stroke="none" /></>} />, 'Debug'],
];

/**
 * Fold one SSE event from the pipeline into the capture screen's state.
 *
 * The important decision is that LOG LINES BELONG TO STAGES. The server tees
 * its console into the stream without saying which stage produced a line, but
 * it brackets every stage with running/done events — so a line is attributed
 * to whichever stage is running when it arrives. That is what lets the capture
 * screen show each step's own thinking under that step, instead of one
 * undifferentiated tail of text that scrolls the context away.
 */
function applyIngestEvent(prev, event, payload) {
  if (event === 'resolved') return { ...prev, resolved: payload };
  if (event === 'queued') return { ...prev, queued: payload };
  if (event === 'refresh') return { ...prev, cleared: payload };

  if (event === 'stage') {
    const existing = prev.stages.find((s) => s.name === payload.name);
    return {
      ...prev,
      stages: existing
        ? prev.stages.map((s) => (s.name === payload.name ? { ...s, ...payload } : s))
        : [...prev.stages, { ...payload, lines: [] }],
    };
  }

  if (event === 'log') {
    const i = prev.stages.findLastIndex((s) => s.status === 'running');
    // A line with no stage running yet is preflight chatter — kept, not lost.
    if (i < 0) return { ...prev, prelines: [...prev.prelines, payload.line].slice(-8) };
    return {
      ...prev,
      stages: prev.stages.map((s, j) =>
        j === i ? { ...s, lines: [...s.lines, payload.line].slice(-40) } : s),
    };
  }

  return prev;
}

/** What the "already saved" alert needs to know about a post in the corpus. */
const summariseSave = (p) => ({
  id: p.id, url: p.source.url, author: p.source.author,
  saved_at: p.source.saved_at, entities: p.entities.length,
});

export default function App() {
  const [tab, setTab] = useState('library');
  // Which post the library has open. Lifted out of Library because the map can
  // now push you into one — "open the full page" from a pin has to land on the
  // same screen a tap in the grid does, not a second copy of it.
  const [openPostId, setOpenPostId] = useState(null);
  // Settings is a push, not a tab. It is one level under Nudges, which is where
  // "how often may this interrupt me" belongs; a fifth tab for it would put a
  // preferences screen at the same level as the product.
  const [settings, setSettings] = useState(false);

  /**
   * Where you have been, so every back button means "the last place I was at".
   *
   * A location is the whole navigable state — tab, open post, settings — and
   * every deliberate move goes through navigate(), which snapshots the current
   * location first. The Detail page's back button used to hard-code "Library",
   * which was a lie whenever a map pin's "Full page" had opened it: back
   * belongs to the journey, not to the screen.
   *
   * Reading state through a ref keeps navigate/goBack stable, so the memoised
   * map does not re-render for every keystroke of app state.
   */
  const hist = useRef([]);
  // Transient status: deleting a post and re-running a model both need the Mac,
  // and both should say so while they are happening rather than freeze a screen.
  const [hud, setHud] = useState(null);
  // A share that turned out to be a post already in the corpus. Answered with
  // an alert rather than a dim note under a pipeline that then runs anyway.
  const [duplicate, setDuplicate] = useState(null);
  const [corpus, setCorpus] = useState(() => loadCorpus());
  const [snapshot, setSnapshot] = useState({ ...cue.state });
  const [ingesting, setIngesting] = useState(null);
  const [shared, setShared] = useState(null);   // url handed over by the share sheet
  const lastClipboard = useRef(null);
  // The mount effect runs once and closes over the corpus as it was then, so
  // "is this already saved?" has to read through a ref to see later syncs.
  const postIds = useRef(new Set());
  const [clipboardBlocked, setClipboardBlocked] = useState(false);

  const posts = corpus.bundle.posts;
  postIds.current = new Set(posts.map((p) => p.id));
  // The same, for the paths that need the post and not just its id: `ingest`
  // can be reached from the mount effect's clipboard check, whose closure is
  // the first render's.
  const postsRef = useRef(posts);
  postsRef.current = posts;

  // Latched once the map has been opened, so it can stay mounted from then on.
  const visitedMap = useRef(false);
  if (tab === 'map') visitedMap.current = true;

  useEffect(() => {
    const unsub = cue.subscribe((s) => setSnapshot({ ...s }));

    // Demo mode — continuous background location — is opt-in but ON for filming:
    // it keeps JavaScript alive through a walk so the hero beat does not depend
    // on iOS's own geofence wake-up timing, which it can delay by minutes.
    cue.start({ entities: flatten(corpus.bundle), background: true });

    // Tapping the notification opens the card, even from a cold launch.
    notify.onTap((extra) => { navigate({ tab: 'nudges', settings: false }); cue.trace(`opened from notification: ${extra.entity_id}`); });

    // "Share -> Cue" from inside TikTok arrives here as cue://share?url=...
    // The extension deliberately avoids App Groups (restricted under free
    // provisioning) and carries the payload in the URL instead.
    // "Share -> Cue" from inside TikTok arrives as cue://share?url=...
    // The extension deliberately avoids App Groups (restricted under free
    // provisioning) and carries the payload in the URL instead.
    /**
     * Pull the shared link out of cue://share?url=...
     *
     * Deliberately tolerant. A Shortcut is the one mechanism iOS actually allows
     * to open this app from the share sheet, and asking someone to add a
     * URL-Encode step before it works is a good way to have it not work. So an
     * unencoded link — which still contains ? and & from TikTok's own tracking
     * params — is handled too: take everything after the first `url=` rather
     * than trusting the query parser to have split it correctly.
     */
    const handleUrl = (url) => {
      let incoming = null;
      try {
        const at = url.indexOf('url=');
        if (at >= 0) {
          const raw = url.slice(at + 4);
          incoming = /%[0-9a-f]{2}/i.test(raw) ? decodeURIComponent(raw) : raw;
        }
      } catch { /* not ours */ }
      if (!incoming || !/tiktok\.com/i.test(incoming)) return;
      // Guarded the same way the clipboard is: getLaunchUrl() hands back the
      // launching URL on a cold start, and a relaunch must not re-run a save
      // that already ran.
      if (store.wasHandled(incoming)) return cue.trace(`share link already handled: ${incoming}`);
      store.markHandled(incoming);
      setShared(incoming);
      navigate({ tab: 'add' });
      ingest(incoming);   // no second tap: sharing IS the intent
    };

    // Two paths, and BOTH are needed. `appUrlOpen` only fires when the app was
    // already running; sharing from TikTok usually cold-launches it, and that
    // URL is only retrievable via getLaunchUrl(). Handling one and not the other
    // is the difference between working on a warm app and doing nothing at all
    // in the case that actually matters.
    CapApp.addListener('appUrlOpen', ({ url }) => handleUrl(url));
    CapApp.getLaunchUrl()
      .then((res) => { if (res?.url) handleUrl(res.url); })
      .catch(() => { /* no launch url: an ordinary open */ });

    /**
     * The share extension cannot reliably foreground this app — iOS does not
     * permit it — so it leaves the link on the clipboard instead. Checking on
     * every activation means "Share to Cue, then open Cue" lands you on a
     * pre-filled capture screen rather than an empty one.
     *
     * Acting on it EXACTLY ONCE is the whole difficulty, and it was wrong twice
     * over. The guard was a ref, which a cold launch resets — and the clipboard
     * holds a link indefinitely, so every subsequent launch found the same URL,
     * decided it was new, and yanked the user out of the library into a capture
     * screen that immediately started spending a vision call on a post already
     * in the corpus. Two guards now, and both are needed: the link is recorded
     * in localStorage so it survives termination, and anything already in the
     * corpus is skipped regardless of what the clipboard says.
     */
    const checkClipboard = async () => {
      try {
        // The NATIVE pasteboard, not navigator.clipboard. WebKit rejects the web
        // Clipboard API without a user gesture, so reading it on activation threw
        // every time and the app just sat in the Library saying nothing — which
        // is exactly what a share that had worked looked like.
        const { value } = await Clipboard.read();
        const text = (value || '').trim();
        if (!text || !/tiktok\.com/i.test(text)) return;
        if (text === lastClipboard.current) return;   // same session, same link
        if (store.wasHandled(text)) return;           // an earlier session's link
        // A post's identity is its numeric id, not its URL — the same save is
        // reachable as both /photo/ and /video/. If it is already in the corpus
        // there is nothing to capture, whatever the clipboard is holding.
        const id = (text.match(/\/(?:video|photo)\/(\d+)/) || [])[1];
        if (id && postIds.current.has(id)) {
          return cue.trace(`clipboard holds ${id}, already in the corpus — ignoring`);
        }
        lastClipboard.current = text;
        store.markHandled(text);
        setShared(text);
        navigate({ tab: 'add' });
        ingest(text);          // sharing was the intent; do not ask again
      } catch (err) {
        cue.trace(`clipboard unavailable: ${err.message}`);
        setClipboardBlocked(true);
      }
    };
    checkClipboard();
    CapApp.addListener('appStateChange', ({ isActive }) => { if (isActive) checkClipboard(); });

    return () => { unsub(); cue.stop(); };
  }, []);

  async function ingest(url, opts = {}) {
    if (!url) return;
    // Known before the Mac is asked. A direct link carries the post's id and
    // the corpus is on the phone, so "already saved" needs no round trip. The
    // Mac repeats the check after resolving short links, which this cannot
    // read — this is the instant answer, that is the sure one. A re-run is a
    // known post on purpose, so it goes past both.
    if (!opts.refresh) {
      const id = (url.match(/\/(?:video|photo)\/(\d+)/) || [])[1];
      const known = id && postsRef.current.find((p) => p.id === id);
      if (known) return setDuplicate(summariseSave(known));
    }
    setIngesting({
      url, startedAt: Date.now(), refresh: opts.refresh || null,
      resolved: null, queued: null, cleared: null, stages: [], prelines: [],
    });
    navigate({ tab: 'add' });
    try {
      const done = await server.ingest(url, (event, payload) => {
        setIngesting((prev) => applyIngestEvent(prev, event, payload));
      }, opts);
      // The Mac recognised it and ran nothing. Clear the pipeline view — there
      // was no pipeline — and say so where it cannot be missed.
      if (done?.duplicate) {
        setIngesting(null);
        return setDuplicate(done.duplicate);
      }
      const bundle = await syncCorpus();
      setCorpus({ bundle, source: 'synced' });
      cue.state.entities = flatten(bundle);
      await cue.rearm({ force: true });
      setIngesting((prev) => ({ ...prev, done }));
    } catch (err) {
      setIngesting((prev) => ({ ...(prev || { url }), error: err.message }));
    }
  }

  async function sync() {
    try {
      const bundle = await syncCorpus();
      setCorpus({ bundle, source: 'synced' });
      cue.state.entities = flatten(bundle);
      await cue.rearm({ force: true });
    } catch (err) {
      cue.trace(`sync failed: ${err.message}`);
    }
  }

  /**
   * Re-run a post that is already in the corpus.
   *
   * Deliberately routed through the same screen a brand-new share goes to: the
   * stages that run are the same stages, and watching stage 04 tick over is the
   * honest version of a spinner. `model` re-extracts from frames already on
   * disk; `all` re-fetches from TikTok first.
   */
  function refresh(post, scope) {
    ingest(post.source.url, { refresh: scope });
  }

  /**
   * Delete a post, for real.
   *
   * The post's line leaves docs/saved-posts.md and its frames leave the disk, so
   * this needs the Mac. A phone-only deletion would be undone by the next sync,
   * which is worse than refusing — so when the server is unreachable it says so.
   */
  async function remove(post) {
    setHud({ text: 'Deleting on the Mac…', busy: true });
    try {
      const res = await server.removePost(post.id);
      const bundle = await syncCorpus();
      setCorpus({ bundle, source: 'synced' });
      cue.state.entities = flatten(bundle);
      await cue.rearm({ force: true });
      cue.trace(`deleted ${post.id} — ${res.removed.length} artifacts`);
      setHud({ text: `Deleted · ${res.totals.posts} posts left` });
    } catch (err) {
      setHud({ text: `Could not delete — ${err.message}`, bad: true });
    }
    setTimeout(() => setHud(null), 3200);
  }

  /**
   * Something changed what the engine is allowed to do — a hand-set trigger, or
   * a general setting. Both change WHICH venues deserve one of the nineteen
   * geofence slots, so re-arm as well as re-evaluate, or the new rule would
   * only apply while the app happens to be open.
   */
  const rulesChanged = useCallback(() => {
    // Not awaited, for the same reason `verdict` does not: evaluateNow emits
    // synchronously, so every dot repaints the moment the sheet closes, while
    // native arming — which takes a while, and can hang — catches up behind it.
    // Evaluation reads the store, not the armed set, so the order is safe.
    cue.rearm({ force: true });
    cue.evaluateNow({ deliver: false, reason: 'nudge settings changed' });
  }, []);

  const locRef = useRef(null);
  locRef.current = { tab, post: openPostId, settings };

  const apply = useCallback((loc) => {
    setTab(loc.tab);
    setOpenPostId(loc.post ?? null);
    setSettings(!!loc.settings);
  }, []);

  const navigate = useCallback((patch) => {
    const cur = locRef.current;
    const next = { ...cur, ...patch };
    if (next.tab === cur.tab && (next.post ?? null) === (cur.post ?? null)
        && !!next.settings === !!cur.settings) return;
    hist.current.push(cur);
    if (hist.current.length > 24) hist.current.shift();   // bounded; this is a phone
    apply(next);
  }, [apply]);

  const goBack = useCallback(() => {
    apply(hist.current.pop() || { tab: 'library', post: null, settings: false });
  }, [apply]);

  const openPost = useCallback((id) => navigate({ tab: 'library', post: id }), [navigate]);

  /**
   * The post page's way onto the map: go to the tab, then ask the map to
   * centre one pin and open its card. The request is a fresh object each time
   * so the memoised map sees it even when the same place is asked for twice;
   * it is not part of the location, because "which pin was focused" is not
   * somewhere back should return to.
   */
  const [mapFocus, setMapFocus] = useState(null);
  const focusSeq = useRef(0);
  const showOnMap = useCallback((entityId) => {
    setMapFocus({ id: entityId, seq: ++focusSeq.current });
    navigate({ tab: 'map' });
  }, [navigate]);

  /**
   * The same, for a whole post — what "see it on the map" means straight
   * after an ingest. The map fits everything the post put on it, opens the
   * first pin's card and pulses the new pins, so the thing just added is the
   * thing you are looking at rather than one more dot among a hundred.
   */
  const showPostOnMap = useCallback((postId) => {
    setMapFocus({ post: postId, seq: ++focusSeq.current });
    navigate({ tab: 'map', post: null });
  }, [navigate]);

  // The general settings are reachable from every trigger editor, wherever it
  // was opened from — the precedence between the two is easier to understand
  // when you can get from one to the other.
  const openSettings = useCallback(() => navigate({ tab: 'nudges', settings: true }), [navigate]);

  /** What the back button should CALL the place it returns to. */
  const prev = hist.current[hist.current.length - 1];
  const backLabel = !prev ? 'Back'
    : prev.settings ? 'Settings'
    : prev.tab === 'library' ? (prev.post ? 'Post' : 'Library')
    : { map: 'Map', nudges: 'Nudges', debug: 'Debug', add: 'Add' }[prev.tab] || 'Back';

  // Stable identity, because MapView is memoised and a fresh function every
  // render would defeat that — repainting 124 markers on every trace line.
  const verdict = useCallback((entityId, value) => {
    const before = store.loadFeedback()[entityId];
    // Tapping the verdict you already gave takes it back — the store toggles.
    store.setFeedback(entityId, value);
    // Entering OR leaving a retiring state moves a geofence slot: "went" and
    // "never" free one, and un-going hands it back. Either way the armed set
    // is now wrong.
    if (RETIRING[value] || RETIRING[before]) cue.rearm({ force: true });
    cue.evaluateNow({ deliver: false, reason: `feedback: ${value}` });
  }, []);

  const firing = snapshot.lastEval?.fired?.length || 0;

  // The ids the user has retired ("went" / "never"), as a STRING, because the
  // memoised map compares props by identity and a fresh Set every render would
  // rebuild 124 markers on every trace line. Every verdict runs evaluateNow,
  // which emits, so this recomputes exactly when it can have changed.
  const fb = store.loadFeedback();
  const retiredKey = Object.keys(fb).filter((id) => RETIRING[fb[id]]).sort().join(',');
  // The hand-set triggers, the same way and for the same reason: a trigger can
  // make a pin eligible or quiet, so the map has to repaint when one changes.
  // Every rule change runs evaluateNow, which emits, so this is fresh in time.
  const overridesKey = JSON.stringify(store.loadOverrides());

  // "starting…" was an opaque state that could last forever, so the status says
  // the last thing the runtime actually did — a stall stays legible.
  const status = (isNative()
    ? (snapshot.source || snapshot.blocked || (snapshot.trace.length ? 'waiting for GPS…' : 'starting…'))
    : 'web — no background location')
    + (snapshot.position ? ` · ±${Math.round(snapshot.accuracy || 0)}m` : '');

  return (
    <div className="app">
      {/* No app-wide header. Each surface carries its own navigation, as iOS
          does. The runtime status that used to live in one now sits on the map,
          next to the dot it describes. */}
      <main className={`body${tab === 'map' ? ' flush' : ''}`}>
        {tab === 'library' && (
          <Library posts={posts} position={snapshot.position}
                   onRefresh={refresh} onDelete={remove}
                   onCapture={() => navigate({ tab: 'add' })}
                   openId={openPostId} onOpen={(id) => navigate({ post: id })}
                   onBack={goBack} backLabel={backLabel}
                   onChanged={rulesChanged} onOpenSettings={openSettings}
                   onShowOnMap={showOnMap} />
        )}
        {/* Mounted on the first visit and kept alive thereafter, hidden rather
            than unmounted. Rebuilding Leaflet on every tab switch meant tiles
            fading up from blank and 116 markers re-created for a map that had
            not changed — the most visible stutter in the app. */}
        {(tab === 'map' || visitedMap.current) && (
          <MapView entities={snapshot.entities} position={snapshot.position} armed={snapshot.armed}
                   retiredKey={retiredKey} overridesKey={overridesKey} focus={mapFocus}
                   status={status} hidden={tab !== 'map'}
                   onOpenPost={openPost} onVerdict={verdict} onChanged={rulesChanged}
                   onOpenSettings={openSettings} />
        )}
        {tab === 'nudges' && (settings
          ? <Settings onBack={goBack} backLabel={backLabel} onChanged={rulesChanged} />
          : <Nudges evaluation={snapshot.lastEval} onVerdict={verdict}
                    onChanged={rulesChanged} onOpenSettings={openSettings} />)}
        {tab === 'add' && (
          <Add initialUrl={shared} state={ingesting} onIngest={ingest}
               backLabel={backLabel}
               onClose={(to) => {
                 const added = ingesting?.done?.post?.id;
                 setIngesting(null);
                 if (to === 'map' && added) showPostOnMap(added);
                 else if (to) navigate({ tab: to, post: null });
                 else goBack();
               }} />
        )}
        {tab === 'debug' && (
          <Debug cue={snapshot} corpusSource={corpus.source} status={status}
                 onEvaluate={(o) => cue.evaluateNow(o)} onIngest={() => navigate({ tab: 'add' })} onSync={sync} />
        )}
      </main>

      {hud && <Hud {...hud} />}

      {/* The post is already here. Offer the save itself, or the one honest
          way to run it again — the same re-run the library's menu offers. */}
      {duplicate && (
        <Alert
          title="Already saved"
          message={`${duplicate.author ? `@${duplicate.author}'s post` : 'This post'} is already in your library`
            + (duplicate.entities != null
              ? ` — ${duplicate.entities} ${duplicate.entities === 1 ? 'thing' : 'things'} extracted.`
              : '.')}
          actions={[
            { label: 'Open the save', onSelect: () => navigate({ tab: 'library', post: duplicate.id }) },
            { label: 'Re-run the model', onSelect: () => ingest(duplicate.url, { refresh: 'model' }) },
            { label: 'OK', bold: true },
          ]}
          onClose={() => setDuplicate(null)}
        />
      )}

      {/* A floating capsule rather than a full-width bar. The content runs
          under it and the glass samples what is passing beneath, which is what
          makes it read as a layer of the phone rather than a strip of chrome —
          and on the map, where the bar sits over live tiles, that is the whole
          difference. The selected pill is one element that slides, so the
          selection is a movement rather than four independent colour changes.
          Nothing above it animates: an animated ancestor isolates the backdrop
          root and the blur silently degrades to plain transparency. */}
      <nav className="tabs">
        <div className="tabs-glass" style={{ '--n': TABS.length, '--i': TABS.findIndex(([id]) => id === tab) }}>
          <span className="knob" aria-hidden="true" />
          {TABS.map(([id, glyph, label]) => (
            <button key={id} className={tab === id ? 'on' : ''}
                    onClick={() => (tab === id
                      ? navigate({ post: null, settings: false })   // re-tap: pop to the root, as iOS does
                      : navigate({ tab: id }))}
                    aria-current={tab === id ? 'page' : undefined}>
              <span className="glyph">{glyph}</span>
              {label}
              {id === 'nudges' && firing > 0 && <span className="badge">{firing}</span>}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
