/**
 * The map.
 *
 * Two jobs. Close in, it shows the armed geofences around you — the radii are
 * drawn at their true size, so "these are the things that can interrupt me here"
 * is a visible fact. Zoomed out, it is the cold-start answer: the saves are
 * already scattered across the cities you will eventually be in, and the app
 * does not need to ask you anything to know that.
 *
 * Tiles are served from the local cache baked by stage 07, so this makes no
 * network calls — the map works on a plane.
 *
 * PERFORMANCE, and why the code is shaped this way. Location runs with
 * `distanceFilter: 0`, so a fix arrives roughly every second and every one of
 * them re-renders this component. Three rules keep that from turning into a
 * stutter, and all three are load-bearing:
 *
 *   1. Vectors draw on ONE canvas, not ~270 SVG nodes. Leaflet's default
 *      renderer gives every circle its own DOM element, and moving 270 of them
 *      per pan frame is what a dropped frame looks like on a phone.
 *   2. The corpus layer is built from `entities`/`armed` alone. It used to sit
 *      in the same effect as `position`, so a GPS fix destroyed and rebuilt all
 *      116 markers — once a second, for a dot that had moved two metres.
 *   3. The dot and its perimeter are MOVED (`setLatLng`), never recreated.
 *
 * Tapping a pin opens a card rather than a Leaflet popup. A popup could hold a
 * name and nothing else — it cannot hold opening hours, a walk, directions, a
 * way into the post, or the trigger. Those five are the reason anyone taps a
 * pin, so the card is React and the marker's only job is to say which one.
 */

import React, { useEffect, useLayoutEffect, useRef, useState, memo } from 'react';
import L from 'leaflet';
import {
  TYPE_COLOR, thumb, ago, nudgeState, nudgeReason,
  travelTo, hoursNow, directionsUrl,
} from '../data.js';
import * as store from '../state/store.js';
import { Glyph, StatusDot, Overlay } from '../ui/kit.jsx';
import NudgeSheet from '../ui/nudge.jsx';
import { VENUE_RADIUS_M, PERIMETER_M } from '../native/geofences.js';

/**
 * How far a tap may land from a pin and still count, in screen pixels.
 *
 * 22 gives a 44px target — the size iOS asks for — around a dot drawn at 6.
 */
const TAP_SLOP_PX = 22;

/**
 * The pin card.
 *
 * Everything on it is computed, not stored: the walk is a haversine against the
 * live fix, "open until 6" is evaluated against the Places periods this second,
 * and the status dot asks the engine. Directions are handed to the phone's own
 * Maps app — re-drawing routing inside a tile cache would be a lie about what
 * this app does.
 */
function PinCard({ entity, position, onOpenPost, onEdit, onVerdict, onClose }) {
  // Portalled out of the map for the same reason every other overlay is: the
  // Leaflet panes are composited layers, and a composited layer paints over a
  // z-indexed sibling on WebKit regardless of the numbers. Rendered inside
  // `.map-wrap`, this card was something the map could paint straight through.

  /**
   * The grabber is a control, not an ornament, and the drag is CONTINUOUS.
   *
   * The peek is not a different card with sections hidden — it is the same card
   * translated down until only its head shows above the bottom edge. That one
   * decision is what makes the gesture continuous: every position between the
   * detents is a defined state, the card tracks the finger 1:1 the whole way,
   * and a release settles to the nearest stop FROM WHEREVER THE FINGER LEFT IT
   * rather than teleporting between two layouts. Detents are resting offsets,
   * nothing more:
   *
   *   0        the card, everything on it
   *   H - P    the peek: the head and the distance line, map unobstructed
   *   H        gone
   *   above 0  rubber-banded; released hard, the card grows into the full page
   *
   * The gesture lives on the grabber/header strip only — the body of the card
   * scrolls, and a drag that both scrolled and collapsed would do neither well.
   */
  const [detent, setDetent] = useState('card');
  const [dy, setDy] = useState(0);
  const [expanding, setExpanding] = useState(false);
  const drag = useRef(null);
  const cardRef = useRef(null);
  const peekEndRef = useRef(null);   // the last element the peek keeps visible
  const dims = useRef({ H: 0, P: 0 });

  // Measured, not styled: the peek height is "up to and including the distance
  // line", wherever that lands for this entity's name length and address.
  useLayoutEffect(() => {
    if (!cardRef.current || !peekEndRef.current) return;
    dims.current = {
      H: cardRef.current.offsetHeight,
      P: peekEndRef.current.offsetTop + peekEndRef.current.offsetHeight + 12,
    };
  }, [entity.id]);

  const base = () => (detent === 'peek' ? Math.max(0, dims.current.H - dims.current.P) : 0);

  const dragStart = (e) => {
    if (expanding) return;
    drag.current = { y: e.clientY, id: e.pointerId };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const dragMove = (e) => {
    if (!drag.current) return;
    setDy(e.clientY - drag.current.y);
  };

  /** The card grows into the page it stands for, then becomes it. */
  const expand = () => {
    const el = cardRef.current;
    el.style.height = `${el.offsetHeight}px`;   // a fixed start, so height can animate
    setExpanding(true);
    requestAnimationFrame(() => { el.style.height = '100dvh'; });
    setTimeout(() => onOpenPost(post.id), 240);
  };

  const dragEnd = () => {
    if (!drag.current) return;
    drag.current = null;
    const { H, P } = dims.current;
    const raw = base() + dy;
    setDy(0);
    // A long drag is judged by where it ENDED; a flick by how far it moved.
    if (Math.abs(dy) <= 60) return;                                   // settle back
    if (dy > 0) {
      if (detent === 'card' && raw < H - P + 45) return setDetent('peek');
      return onClose();                                               // past the peek: gone
    }
    if (raw < -55 && post) return expand();                           // thrown: become the page
    return setDetent('card');
  };
  useEffect(() => { setDetent('card'); setExpanding(false); }, [entity.id]);

  const state = nudgeState(entity, { overrides: store.loadOverrides(), feedback: store.loadFeedback() });
  const trip = travelTo(entity, position);
  const hours = hoursNow(entity);
  const post = entity.post;
  const verdict = store.loadFeedback()[entity.id];

  // One function of finger position, defined everywhere between the detents.
  // Above the top there is nothing to reveal, so the overshoot rubber-bands.
  const raw = base() + dy;
  const offset = raw < 0 ? -Math.min(60, Math.abs(raw) * 0.35) : Math.min(raw, dims.current.H || 9999);
  return (
    <Overlay>
    <div ref={cardRef}
         className={`pin-card${detent === 'peek' ? ' peek' : ''}${drag.current ? ' dragging' : ''}${expanding ? ' expanding' : ''}`}
         style={{ transform: expanding ? 'translateY(0)' : `translateY(${offset}px)` }}
         onPointerDown={(e) => e.stopPropagation()}>
      <div className="pin-drag" onPointerDown={dragStart} onPointerMove={dragMove}
           onPointerUp={dragEnd} onPointerCancel={dragEnd}>
        <span className="grabber" />
      </div>
      <div className="pin-head">
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="t-title3">{entity.name}</div>
          <div className="t-foot dim">
            {[entity.place.resolved_name !== entity.name && entity.place.resolved_name,
              entity.category || entity.type].filter(Boolean).join(' · ')}
          </div>
        </div>
        <button className="round-btn" onClick={onClose} aria-label="close">
          <Glyph name="xmark" size={15} weight={2.6} />
        </button>
      </div>

      {/* The three facts a pin is tapped for. Missing hours say so rather than
          silently rendering an empty row — Places does not know every venue. */}
      <div className="pin-facts">
        {/* The glyph is the mode. Ten minutes on foot is where "I could just go"
            becomes "I would drive", and a card that keeps offering a walk past
            that is giving advice nobody would take. */}
        <div ref={peekEndRef}>
          <Glyph name={trip?.mode === 'drive' ? 'car' : 'figure.walk'} size={17} />
          {trip
            ? <><b>{trip.distance}</b>{trip.minutes ? <> · {trip.label}</> : <span className="dim"> · {trip.label}</span>}</>
            : <span className="dim">no fix yet</span>}
        </div>
        <div>
          <Glyph name="clock" size={17} />
          {hours
            ? <>
                <b style={{ color: hours.open === false ? 'var(--red-ink)' : 'var(--green-ink)' }}>
                  {hours.open === false ? 'Closed now' : hours.open ? 'Open now' : 'Hours known'}
                </b>
                {hours.until && ` · until ${hours.until}`}
                {hours.line && <span className="dim"> · {hours.line.split(': ').slice(1).join(': ')}</span>}
              </>
            : <span className="dim">no opening hours on record</span>}
        </div>
        {entity.place.address && (
          <div>
            <Glyph name="mappin.circle" size={17} />
            <span className="dim">{entity.place.address}</span>
          </div>
        )}
      </div>

      <div className="pin-actions">
        <a className="btn primary" href={directionsUrl(entity, trip?.mode)} target="_blank" rel="noreferrer">
          <Glyph name="arrow.turn.up.right" size={16} weight={2.2} />
          {trip?.mode === 'drive' ? 'Drive there' : 'Directions'}
        </a>
        {post && (
          <button className="btn" onClick={() => onOpenPost(post.id)}>
            <Glyph name="arrow.up.forward.square" size={16} />Full page
          </button>
        )}
      </div>

      {/* The trigger, editable from the pin. This is the same sheet the library
          opens — one editor, so the two surfaces cannot disagree. */}
      <button className="pin-status" onClick={() => onEdit(entity)}>
        <StatusDot state={state} size={12} />
        <span style={{ flex: 1, minWidth: 0 }}>
          <b style={{ color: state.ink }}>{state.label}</b>
          <span className="t-foot dim" style={{ display: 'block' }}>
            {nudgeReason(entity, { overrides: store.loadOverrides(), feedback: store.loadFeedback() })}
          </span>
        </span>
        <Glyph name="chevron.right" size={16} weight={2.2} style={{ color: 'var(--label-3)' }} />
      </button>

      {/* The two answers a nudge asks for, available before one has fired.
          "Went" is not a formality — it is what stops this coming back today. */}
      <div className="pin-verdicts">
        <button className={verdict === 'went' ? 'on went' : ''} onClick={() => onVerdict(entity.id, 'went')}>
          <Glyph name="checkmark" size={15} weight={2.4} />I went
        </button>
        <button className={verdict === 'never' ? 'on never' : ''} onClick={() => onVerdict(entity.id, 'never')}>
          <Glyph name="bell.slash" size={15} />Never again
        </button>
      </div>

      {post && (
        <button className="pin-prov" onClick={() => onOpenPost(post.id)}>
          {thumb(post) && <img src={thumb(post)} alt="" />}
          <span>you saved this from <b>@{post.source.author}</b> · {ago(post.source.saved_at)}</span>
        </button>
      )}
    </div>
    </Overlay>
  );
}

function MapView({ entities, position, armed, retiredKey = '', overridesKey = '', focus = null,
                   status, hidden = false, onOpenPost, onVerdict, onChanged, onOpenSettings }) {
  const [selectedId, setSelectedId] = useState(null);
  const [editing, setEditing] = useState(null);
  const el = useRef(null);
  const wrap = useRef(null);
  const map = useRef(null);
  const layer = useRef(null);      // the corpus: dots + armed radii
  const me = useRef(null);         // the you-dot and its re-arm perimeter
  const halo = useRef(null);       // the ring around the pin you tapped
  const pulses = useRef(null);     // the swelling rings over a post just added
  const renderer = useRef(null);

  /**
   * The current corpus, reachable from a listener registered once.
   *
   * The map's click handler is installed on mount and never re-registered —
   * re-binding it whenever the corpus changed would be a teardown for nothing.
   */
  const entitiesRef = useRef(entities);
  entitiesRef.current = entities;

  /**
   * Selection goes through a ref, not through the effect's dependencies.
   *
   * Putting `setSelectedId` in the closure directly would make the corpus layer
   * depend on it, and rebuilding 124 markers every time someone taps a pin is
   * exactly the teardown the rest of this file exists to avoid.
   */
  const select = useRef(null);
  select.current = (id) => {
    setSelectedId(id);
    const e = entities.find((x) => x.id === id);
    // Pan rather than zoom: the card covers the lower half, so the pin has to
    // move out from under it or you are reading about something you cannot see.
    if (e?.place?.coords && map.current) {
      const pt = map.current.latLngToContainerPoint(e.place.coords);
      map.current.panBy([0, pt.y - map.current.getSize().y * 0.3], { animate: true });
    }
  };

  useEffect(() => {
    if (map.current) return;
    // preferCanvas keeps every circle on a single <canvas>.
    //
    // padding 0 — no margin outside the viewport — and that is deliberate. The
    // margin existed so a pan would not expose an unpainted edge, but it also
    // makes the canvas BIGGER than its container, and a canvas bigger than its
    // container is only invisible for as long as something clips it. On WebKit
    // a promoted ancestor stops clipping, and 0.2 of a phone screen is ~170px
    // of canvas overhanging exactly where the tab bar lives. Sizing the canvas
    // to the box removes the question rather than answering it; the dots are
    // cheap to redraw, so the edge catches up within a frame.
    renderer.current = L.canvas({ padding: 0 });
    map.current = L.map(el.current, {
      zoomControl: false,
      attributionControl: false,
      preferCanvas: true,
      renderer: renderer.current,
      // Continuous pinch instead of a snap to the nearest whole level at the
      // end of the gesture — the snap is the single most visible judder here.
      zoomSnap: 0,
      zoomDelta: 0.5,
      wheelPxPerZoomLevel: 120,
    }).setView(position || [34.0224, -118.2851], position ? 15 : 3);

    // A 1x1 PNG of the basemap's own paper (#f6f5f2). A tile the bake never
    // covered must read as more paper, not as a broken image — during a pinch
    // the renderer shows whatever a missing tile gives it, and "parts of a
    // black map" is exactly what that looked like on device.
    const PAPER = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP49vUTAAXCAt7QofusAAAAAElFTkSuQmCC';
    L.tileLayer('./tiles/{z}/{x}/{y}.png', {
      minZoom: 0,
      maxZoom: 15,
      errorTileUrl: PAPER,
      // Tiles are on disk, so there is no reason to hold them back: paint them
      // during the gesture and keep a wider ring loaded around the viewport so
      // a fast pan runs into cached tiles rather than grey.
      updateWhenIdle: false,
      updateWhenZooming: false,
      keepBuffer: 3,
    }).addTo(map.current);

    layer.current = L.layerGroup().addTo(map.current);
    halo.current = L.layerGroup().addTo(map.current);
    pulses.current = L.layerGroup().addTo(map.current);
    me.current = L.layerGroup().addTo(map.current);

    /**
     * Hit-testing is done here rather than by binding a click to each marker,
     * for two reasons and the second is the important one.
     *
     * Leaflet's canvas renderer does its own hit-test against the drawn radius,
     * and on this map it simply did not fire: the dots painted in the right
     * place and clicking them produced nothing but the map's own click. Rather
     * than debug a renderer we have deliberately chosen for its drawing, we ask
     * the question ourselves — project every entity to the container and take
     * the nearest — which is a few hundred multiplications on a tap.
     *
     * And it lets the TARGET be bigger than the dot. An eligible pin is drawn at
     * radius 6, which is a 12px target for a finger iOS asks to be given 44.
     * Decoupling the two means the dot can stay small enough that a city does
     * not turn into a blob, while still being reliably tappable.
     */
    map.current.on('click', (ev) => {
      const p = ev.containerPoint;
      let best = null;
      let bestDistance = TAP_SLOP_PX;
      for (const entity of entitiesRef.current) {
        if (!entity.place?.coords) continue;
        const q = map.current.latLngToContainerPoint(entity.place.coords);
        const d = Math.hypot(q.x - p.x, q.y - p.y);
        // <= so that the topmost of an overlapping cluster still resolves to
        // one entity rather than to nothing.
        if (d <= bestDistance) { bestDistance = d; best = entity; }
      }
      if (best) select.current(best.id);
      else setSelectedId(null);   // tapping away dismisses, as it does anywhere
    });

    // Every frosted surface on screen is re-sampled and re-blurred on EVERY pan
    // frame, and they are competing with the pan itself for the same 16ms. While
    // the map is actually moving they all fall back to an opaque fill; the frost
    // returns the moment it settles, which is when anyone is reading them anyway.
    //
    // The class goes on <html> as well as on the wrapper because the tab capsule
    // is not a descendant of this component — it floats OVER the map now, so its
    // blur is sampling the moving tiles too, and it was the most expensive one
    // on the screen.
    const moving = (on) => {
      wrap.current?.classList.toggle('moving', on);
      document.documentElement.classList.toggle('map-moving', on);
    };
    map.current
      .on('movestart zoomstart', () => moving(true))
      .on('moveend zoomend', () => moving(false));

    return () => {
      // Leave nothing latched on <html>: a map torn down mid-gesture would
      // otherwise freeze every frosted surface in the app as opaque.
      document.documentElement.classList.remove('map-moving');
      map.current?.remove();
      map.current = null;
    };
  }, []);

  // The corpus. Rebuilt only when the saves, the armed set, or the user's own
  // rules actually change — not on every GPS fix. `retiredKey` and
  // `overridesKey` are strings for the memo's sake; what they stand for is read
  // back out of the store here.
  useEffect(() => {
    if (!layer.current) return;
    layer.current.clearLayers();
    const armedIds = new Set(armed.map((a) => a.id));
    // Asked of the engine, never read off the corpus: a trigger set by hand
    // makes a mute save eligible or an eligible one quiet, and this pin drew
    // `nudge_eligible` as the pipeline left it — so setting a trigger changed
    // the card, the library row and the geofence, and not the dot on the map.
    const ctx = { overrides: store.loadOverrides(), feedback: store.loadFeedback() };

    for (const e of entities) {
      if (!e.place?.coords) continue;
      const state = nudgeState(e, ctx);
      // Somewhere you have been — or said never to — stays on the map but goes
      // grey: it is a memory now, not a prospect, and the colour has to say so
      // before the card does.
      if (state.key === 'silent') {
        L.circleMarker(e.place.coords, {
          renderer: renderer.current,
          radius: 4.5, color: '#a9a9b0', weight: 1.4, fillColor: '#c7c7cc', fillOpacity: 0.7,
          interactive: false,
        }).addTo(layer.current);
        continue;
      }
      const eligible = state.key === 'live';
      // Drawing only. Interactivity is off because the map's own click handler
      // above does the hit-testing, and a layer that claims to be interactive
      // but is never asked is just per-marker bookkeeping on every pan.
      L.circleMarker(e.place.coords, {
        renderer: renderer.current,
        radius: eligible ? 6 : 4,
        color: TYPE_COLOR[e.type] || '#888',
        weight: eligible ? 2 : 1,
        fillOpacity: eligible ? 0.9 : 0.35,
        interactive: false,
      }).addTo(layer.current);

      // Only ARMED venues get a radius drawn. The distinction is the point: 26
      // are eligible, but iOS will only ever watch 19 of them at once.
      if (armedIds.has(e.id)) {
        L.circle(e.place.coords, {
          renderer: renderer.current,
          radius: VENUE_RADIUS_M, color: TYPE_COLOR[e.type], weight: 1, opacity: 0.6, fillOpacity: 0.08,
        }).addTo(layer.current);
      }
    }
  }, [entities, armed, retiredKey, overridesKey]);

  // The ring around the selected pin. Its own layer, so selecting something
  // costs two circles rather than a rebuild of the whole corpus.
  useEffect(() => {
    if (!halo.current) return;
    halo.current.clearLayers();
    const e = entities.find((x) => x.id === selectedId);
    if (!e?.place?.coords) return;
    L.circleMarker(e.place.coords, {
      renderer: renderer.current, radius: 13,
      color: TYPE_COLOR[e.type] || '#888', weight: 2, opacity: 0.9, fillOpacity: 0.12,
    }).addTo(halo.current);
  }, [selectedId, entities]);

  // The dot. Created once, then moved — a fix a second must cost two setLatLng
  // calls, not a teardown.
  const dot = useRef(null);
  const perimeter = useRef(null);
  useEffect(() => {
    if (!me.current || !position) return;
    if (!dot.current) {
      perimeter.current = L.circle(position, {
        renderer: renderer.current,
        radius: PERIMETER_M, color: '#3fa9f5', weight: 1, dashArray: '4 6', opacity: 0.5, fillOpacity: 0.03,
      }).addTo(me.current);
      dot.current = L.circleMarker(position, {
        renderer: renderer.current,
        radius: 7, color: '#fff', weight: 3, fillColor: '#3fa9f5', fillOpacity: 1,
      }).addTo(me.current);
      return;
    }
    dot.current.setLatLng(position);
    perimeter.current.setLatLng(position);
  }, [position]);

  // Follow the dot once, on the first fix — not continuously, or the map fights
  // the user every time they pan to look at something.
  const centred = useRef(false);
  useEffect(() => {
    if (position && map.current && !centred.current) {
      map.current.setView(position, 15);
      centred.current = true;
    }
  }, [position]);

  /**
   * The new pins, announced. Straight after an ingest, "see it on the map"
   * lands among a hundred-odd dots that all look alike; a ring that swells and
   * fades three times over the pins this post added is what makes the new
   * thing the visible one. Canvas markers cannot be CSS-animated, so the
   * radius is driven frame by frame — a handful of rings is nothing, and it
   * stops on its own.
   */
  const pulseRaf = useRef(0);
  const pulse = (list) => {
    cancelAnimationFrame(pulseRaf.current);
    pulses.current.clearLayers();
    const rings = list.map((e) => L.circleMarker(e.place.coords, {
      renderer: renderer.current, radius: 8, fill: false,
      color: TYPE_COLOR[e.type] || '#888', weight: 2, opacity: 0.9,
    }).addTo(pulses.current));
    const PERIOD_MS = 1100;
    const TIMES = 3;
    const t0 = performance.now();
    const frame = (now) => {
      const t = (now - t0) / PERIOD_MS;
      if (t >= TIMES) return pulses.current?.clearLayers();
      const k = t % 1;
      for (const r of rings) { r.setRadius(8 + 24 * k); r.setStyle({ opacity: 0.9 * (1 - k) }); }
      pulseRaf.current = requestAnimationFrame(frame);
    };
    pulseRaf.current = requestAnimationFrame(frame);
  };
  useEffect(() => () => cancelAnimationFrame(pulseRaf.current), []);

  /**
   * "See on map" — from a post page (one entity) or straight after an ingest
   * (a whole post). Street zoom, no animation — the tab has just switched, and
   * a fly-in from wherever the map last was would cross tiles that were never
   * baked. Then the same selection a tap on the pin makes, so the card opens
   * and the pin is lifted out from under it. Declared after the reveal's
   * layout effect on purpose: Leaflet has re-measured by the time this runs,
   * so the centre is the centre of the visible map.
   *
   * Keyed on the request's `seq` and re-tried as the corpus changes: a post
   * that has just been ingested can reach here a render before its entities
   * do, and a request that found nothing must wait for them rather than be
   * lost — while one that has been honoured must not fire again when a
   * verdict later changes the corpus under it.
   */
  const honoured = useRef(0);
  useEffect(() => {
    if (!focus || !map.current || honoured.current === focus.seq) return;
    const placed = entities.filter((x) => x.place?.coords
      && (focus.post ? x.post?.id === focus.post : x.id === focus.id));
    if (!placed.length) return;
    honoured.current = focus.seq;
    // A fix arriving after this must not pull the view away from the pin
    // someone deliberately asked for.
    centred.current = true;
    if (placed.length === 1) {
      map.current.setView(placed[0].place.coords, 15, { animate: false });
      select.current(placed[0].id);
    } else {
      // Everything the post put on the map, kept to the top half — the first
      // pin's card covers the bottom — rather than one pin centred and the
      // rest of the post off the edge.
      const size = map.current.getSize();
      map.current.fitBounds(placed.map((x) => x.place.coords), {
        paddingTopLeft: [40, 90], paddingBottomRight: [40, Math.round(size.y * 0.5)],
        maxZoom: 15, animate: false,
      });
      setSelectedId(placed[0].id);
    }
    if (focus.post) pulse(placed);
  }, [focus, entities]);

  /**
   * Keep Leaflet's idea of the container in sync with the real one.
   *
   * Leaflet measures once at init and then trusts itself, so anything that
   * resizes the box behind its back leaves it drawing at a stale size — the map
   * as a band across the top with grey below it. There are three such things
   * here and a ResizeObserver catches all of them at once: rotation, the
   * safe-area insets settling after launch, and this component being revealed
   * again after a spell at display: none.
   *
   * Coalesced onto a frame because invalidateSize forces a synchronous layout,
   * and a rotation fires the observer several times.
   */
  useEffect(() => {
    if (!wrap.current || typeof ResizeObserver === 'undefined') return;
    let queued = 0;
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(queued);
      queued = requestAnimationFrame(() => {
        if (map.current && wrap.current?.offsetHeight) map.current.invalidateSize({ animate: false });
      });
    });
    ro.observe(wrap.current);
    return () => { cancelAnimationFrame(queued); ro.disconnect(); };
  }, []);

  // The map stays mounted once visited, so coming back to the tab is instant
  // rather than a fresh Leaflet boot with tiles fading in from blank. Measuring
  // BEFORE the browser paints — layout effect, not effect — is what stops the
  // reveal showing one frame at the old size.
  useLayoutEffect(() => {
    if (hidden) return void document.documentElement.classList.remove('map-moving');
    if (map.current) map.current.invalidateSize({ animate: false });
  }, [hidden]);

  const selected = entities.find((e) => e.id === selectedId) || null;

  return (
    <div ref={wrap} className={`map-wrap${hidden ? ' hidden' : ''}`}>
      <div ref={el} className="map" />

      {/* Whether the runtime is actually alive, said out loud. A map with no dot
          and no explanation is the one state that looks identical whether the
          app is waiting for GPS or quietly broken. */}
      <div className="map-status">
        <span className={`live${position ? '' : ' off'}`} />
        {status}
      </div>

      {/* The armed summary steps aside for the pin card rather than stacking
          with it — two frosted panels arguing over the same corner. */}
      {!selected && (
        <div className="map-card">
          {armed.length
            ? <><b>{armed.length} armed</b> · nearest {armed[0]?.name}</>
            : 'nothing armed yet'}
          <br />
          {position
            ? <span className="mono">{position[0].toFixed(5)}, {position[1].toFixed(5)}</span>
            : 'waiting for a fix'}
        </div>
      )}

      {selected && (
        <PinCard
          entity={selected}
          position={position}
          onClose={() => setSelectedId(null)}
          onEdit={setEditing}
          onVerdict={(id, v) => { onVerdict?.(id, v); if (v === 'never') setSelectedId(null); }}
          onOpenPost={(postId) => { setSelectedId(null); onOpenPost?.(postId); }}
        />
      )}

      {editing && (
        <NudgeSheet entity={editing} onClose={() => setEditing(null)}
                    onChanged={onChanged} onOpenSettings={onOpenSettings} />
      )}
    </div>
  );
}

/**
 * Memoised, because `emit()` fires for every trace line and every fix and hands
 * App a brand-new snapshot object each time. Without this, a log message from
 * the geofence listener repaints the map.
 */
export default memo(MapView);
