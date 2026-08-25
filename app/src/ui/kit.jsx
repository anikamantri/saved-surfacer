/**
 * The kit — the small set of Apple controls this app actually needs.
 *
 * Written out rather than pulled from a library for one reason: the pieces that
 * have to feel native are the ones no CSS framework ships — press-and-hold with
 * its blurred backdrop and floating preview, an action sheet that confirms a
 * destructive act, a HUD that admits the Mac is working. Everything else is a
 * list row.
 *
 * Glyphs are inline SVG in the shape of SF Symbols, never characters. The
 * obvious unicode for these (▦ ◉ ⚙ ↻) is missing from the iOS system font and
 * renders as ? boxes on device — invisible on the Mac, glaring on camera.
 */

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * Every overlay renders into <body>, not into the screen that opened it.
 *
 * The tab capsule is a `backdrop-filter` surface, which WebKit promotes to its
 * own compositing layer — and a promoted layer will paint over a z-indexed
 * overlay that lives inside the scrolling `main`, whatever the numbers say. The
 * confirmation sheet's Cancel button disappeared behind the tab bar on device
 * and was perfectly fine on the Mac. A portal puts the overlay outside `.app`
 * entirely; `overlay-open` then drops the capsule's blur for as long as it is
 * up, so there is no promoted layer left to jump the queue.
 */
/**
 * Refcounted, because overlays stack: the pin card opens the trigger editor on
 * top of itself, and the editor unmounting must not clear a flag the card below
 * it still needs. Without the count, closing the inner sheet handed the map its
 * promoted layers back while the outer card was still up.
 */
let openOverlays = 0;

function useOverlay() {
  useEffect(() => {
    openOverlays += 1;
    document.body.classList.add('overlay-open');
    return () => {
      openOverlays = Math.max(0, openOverlays - 1);
      if (!openOverlays) document.body.classList.remove('overlay-open');
    };
  }, []);
}

const overlay = (node) => createPortal(node, document.body);

/**
 * The same escape, for anything outside this file that needs it.
 *
 * Anything that has to sit above the app's chrome must leave `.app` — a
 * promoted layer inside it paints over a z-indexed sibling on WebKit whatever
 * the numbers say, and the map is full of promoted layers.
 */
export function Overlay({ children }) {
  useOverlay();
  return overlay(children);
}

/* ── Glyphs ─────────────────────────────────────────────────────────────── */

const PATHS = {
  'chevron.right': <path d="m9 5 7 7-7 7" />,
  'chevron.left': <path d="m15 5-7 7 7 7" />,
  'chevron.down': <path d="m5 9 7 7 7-7" />,
  plus: <path d="M12 5v14M5 12h14" />,
  xmark: <path d="M6 6l12 12M18 6L6 18" />,
  play: <path d="M8 5.5v13l11-6.5-11-6.5Z" fill="currentColor" stroke="none" />,
  'arrow.up.right': <><path d="M7 17 17 7" /><path d="M8 7h9v9" /></>,
  link: <><path d="M10 13a5 5 0 0 0 7.1 0l2.4-2.4a5 5 0 0 0-7.1-7.1L11 4.9" /><path d="M14 11a5 5 0 0 0-7.1 0L4.5 13.4a5 5 0 0 0 7.1 7.1l1.4-1.4" /></>,
  sparkles: <><path d="m12 3 1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3Z" /><path d="m18.5 15.5.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2Z" /></>,
  'arrow.clockwise': <><path d="M20 12a8 8 0 1 1-2.6-5.9" /><path d="M20 4v5h-5" /></>,
  trash: <><path d="M4 7h16" /><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" /><path d="M6.5 7l.8 12a1 1 0 0 0 1 1h7.4a1 1 0 0 0 1-1l.8-12" /></>,
  clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>,
  'mappin.circle': <><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="10.6" r="1.9" /><path d="M12 12.6V16" /></>,
  bolt: <path d="M13.5 3 6 13.2h5L10.5 21 18 10.8h-5L13.5 3Z" />,
  'bell.slash': <><path d="M18 8a6 6 0 0 0-9.3-5" /><path d="M6.2 6.2A6 6 0 0 0 6 8c0 6-2 7-2 7h13" /><path d="M10.3 20a2 2 0 0 0 3.4 0" /><path d="M3 3l18 18" /></>,
  info: <><circle cx="12" cy="12" r="8.5" /><path d="M12 11v5.5" /><path d="M12 7.8v.4" /></>,
  square: <rect x="4.5" y="4.5" width="15" height="15" rx="3" />,
  ellipsis: <><circle cx="5.5" cy="12" r="1.4" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" /><circle cx="18.5" cy="12" r="1.4" fill="currentColor" stroke="none" /></>,
  calendar: <><rect x="3.5" y="5" width="17" height="15" rx="3" /><path d="M3.5 9.5h17M8 3.5v3M16 3.5v3" /></>,
  // A gear built from primitives — ring, hub, eight round-capped teeth — because
  // the true SF outline pinches into a blob at the 19px this app draws it at.
  gear: <><circle cx="12" cy="12" r="6.1" /><circle cx="12" cy="12" r="2.5" /><path d="M12 3.4v2.5M12 18.1v2.5M20.6 12h-2.5M5.9 12H3.4M18.1 5.9l-1.8 1.8M7.7 16.3l-1.8 1.8M18.1 18.1l-1.8-1.8M7.7 7.7 5.9 5.9" /></>,
  bell: <><path d="M18 8a6 6 0 1 0-12 0c0 6-2 7-2 7h16s-2-1-2-7Z" /><path d="M10.3 20a2 2 0 0 0 3.4 0" /></>,
  checkmark: <path d="m5 12.5 4.5 4.5L19 7" />,
  car: <><path d="M4.5 16.5h15M6 16.5v1.8a1 1 0 0 1-1 1H4.2a1 1 0 0 1-1-1v-1.8M20.8 16.5v1.8a1 1 0 0 1-1 1H19a1 1 0 0 1-1-1v-1.8" /><path d="M3.4 16.5v-3.7l1.9-4.6a2 2 0 0 1 1.85-1.2h9.7a2 2 0 0 1 1.85 1.2l1.9 4.6v3.7Z" /><path d="M3.6 12.8h16.8M7 14.6h.01M17 14.6h.01" /></>,
  'figure.walk': <><circle cx="13" cy="4.2" r="1.8" /><path d="M11 21l1.5-5.5M12.5 15.5 10 12l1-4 3 1.6 2.5 2.2M11 8l-2.6 1.6L7 13M12.5 15.5 15.5 21" /></>,
  'arrow.turn.up.right': <><path d="M4 20v-6a4 4 0 0 1 4-4h9" /><path d="M13.5 5.5 18.5 10l-5 4.5" /></>,
  'arrow.up.forward.square': <><rect x="3.5" y="3.5" width="17" height="17" rx="4.5" /><path d="M9.5 14.5 15 9" /><path d="M10.2 9H15v4.8" /></>,
  // slider.horizontal.3, at SF Symbols' own geometry: three rows, knobs at
  // right / left / right. The two-row sketch it replaces read as an equaliser.
  slider: <><path d="M3.5 6.6h8.6M17.6 6.6h2.9M3.5 12h2.5M11.1 12h9.4M3.5 17.4h8.6M17.6 17.4h2.9" /><circle cx="14.9" cy="6.6" r="2.35" /><circle cx="8.7" cy="12" r="2.35" /><circle cx="14.9" cy="17.4" r="2.35" /></>,
};

export const Glyph = ({ name, size = 20, weight = 1.7, style }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={style}
       stroke="currentColor" strokeWidth={weight} strokeLinecap="round" strokeLinejoin="round">
    {PATHS[name] || null}
  </svg>
);

/* ── Navigation ─────────────────────────────────────────────────────────── */

/** Large title — the root of a stack. */
export const LargeTitle = ({ title, subtitle, trailing, onWhite }) => (
  <>
    <div className={`nav${onWhite ? ' on-white' : ''}`}>
      <h1>{title}</h1>
      {trailing && <div className="trailing">{trailing}</div>}
    </div>
    {subtitle && <div className="nav-sub">{subtitle}</div>}
  </>
);

/** Inline bar with a back chevron — one level down. */
export const NavBar = ({ title, onBack, backLabel = 'Back', right }) => (
  <div className="navbar">
    {onBack
      ? <button className="backbtn" onClick={onBack}><Glyph name="chevron.left" size={19} weight={2.4} />{backLabel}</button>
      : <span />}
    <span className="title">{title}</span>
    <span className="right">{right}</span>
  </div>
);

/* ── Status ─────────────────────────────────────────────────────────────── */

/**
 * The traffic light, and it is the same object everywhere.
 *
 * Green means it can interrupt you, amber means it is on the map and will stay
 * quiet, red means it cannot nudge at all. One component so a dot beside a list
 * row and a dot over a map pin can never drift apart — which they would, the
 * first time one of them was restyled.
 */
export const StatusDot = ({ state, size = 11, ring = true }) => (
  <span className={`sdot${ring ? ' ring' : ''}`}
        style={{ '--sdot': state.color, width: size, height: size }}
        role="img" aria-label={state.label} />
);

/**
 * The same three states, named. Sits above any list that uses the dots.
 *
 * One line, always — it is a key, and a key that wraps onto a second row stops
 * reading as one. That is why it takes `short` rather than lower-casing
 * `label`: the wording is chosen to fit, not clipped to fit.
 */
export const StatusLegend = ({ counts, states }) => (
  <div className="legend">
    {Object.values(states).map((s) => (
      <span key={s.key} className={counts[s.key] ? '' : 'none'}>
        <StatusDot state={s} size={9} ring={false} />
        {counts[s.key] || 0} {s.short}
      </span>
    ))}
  </div>
);

/* ── Sheet ──────────────────────────────────────────────────────────────── */

/**
 * A card that comes up from the bottom, for anything that is *about* one thing:
 * a pin you tapped, the trigger you are setting on it.
 *
 * Opaque, not frosted, and that is not a style choice — this animates in, and
 * an animated ancestor isolates the backdrop root, so `backdrop-filter` here
 * has nothing to sample and silently degrades to plain transparency over
 * whatever is behind. Only the static overlays in this app can be glass.
 */
export function Sheet({ title, subtitle, onClose, children, footer }) {
  useOverlay();
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return overlay(
    <div className="sheet-scrim" onPointerDown={onClose}>
      <div className="modal" onPointerDown={(e) => e.stopPropagation()}>
        <span className="grabber" />
        <div className="modal-head">
          <div>
            <div className="t-title3">{title}</div>
            {subtitle && <div className="t-foot dim" style={{ marginTop: 2 }}>{subtitle}</div>}
          </div>
          <button className="round-btn" onClick={onClose} aria-label="close">
            <Glyph name="xmark" size={15} weight={2.6} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

/* ── Segmented control ──────────────────────────────────────────────────── */

/** iOS's segmented picker: one choice of a small, fixed set. */
export const Segmented = ({ value, options, onChange }) => (
  <div className="segmented" style={{ '--n': options.length }}>
    <span className="knob" style={{ transform: `translateX(${options.findIndex((o) => o.value === value) * 100}%)` }} />
    {options.map((o) => (
      <button key={o.value} className={o.value === value ? 'on' : ''}
              disabled={o.disabled} onClick={() => onChange(o.value)}>
        {o.label}
      </button>
    ))}
  </div>
);

/** A row that reads like a setting: label, value, and the control on the right. */
export const SettingRow = ({ label, hint, children }) => (
  <div className="row setting">
    <div style={{ flex: 1, minWidth: 0 }}>
      <div className="t-body">{label}</div>
      {hint && <div className="t-foot dim" style={{ marginTop: 1 }}>{hint}</div>}
    </div>
    {children}
  </div>
);

/** A switch, the shape iOS draws one. */
export const Toggle = ({ on, onChange }) => (
  <button className={`toggle${on ? ' on' : ''}`} role="switch" aria-checked={on}
          onClick={() => onChange(!on)}>
    <span />
  </button>
);

/* ── Press and hold ─────────────────────────────────────────────────────── */

/**
 * The gesture, separated from the menu it opens.
 *
 * 450ms matches iOS's own hold. Two details make the difference between this
 * feeling native and feeling like a web page: the press has to cancel the tap
 * that would otherwise follow it, and any real finger movement has to cancel
 * the press — otherwise scrolling the grid keeps opening menus.
 */
export function useLongPress(onLongPress, { onTap, ms = 450 } = {}) {
  const timer = useRef(null);
  const start = useRef(null);
  const fired = useRef(false);
  const [holding, setHolding] = useState(false);

  const cancel = () => {
    clearTimeout(timer.current);
    timer.current = null;
    setHolding(false);
  };

  useEffect(() => () => clearTimeout(timer.current), []);

  return {
    holding,
    handlers: {
      onPointerDown: (e) => {
        fired.current = false;
        start.current = { x: e.clientX, y: e.clientY };
        setHolding(true);
        timer.current = setTimeout(() => {
          fired.current = true;
          setHolding(false);
          onLongPress(e);
        }, ms);
      },
      onPointerMove: (e) => {
        if (!start.current || !timer.current) return;
        const moved = Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y);
        if (moved > 10) cancel();
      },
      onPointerUp: () => {
        const wasHold = fired.current;
        cancel();
        if (!wasHold) onTap?.();
      },
      onPointerCancel: cancel,
      onPointerLeave: cancel,
      // Belt and braces: iOS still wants to show its own selection callout.
      onContextMenu: (e) => e.preventDefault(),
    },
  };
}

/**
 * The menu itself: the pressed thing floating over a blurred page, actions
 * beneath it. Tapping anywhere outside dismisses, as it does everywhere else on
 * the phone.
 */
export function ContextMenu({ preview, caption, items, onClose }) {
  useOverlay();
  return overlay(
    <div className="ctx-scrim" onPointerDown={onClose}>
      <div className="ctx-stage" onPointerDown={(e) => e.stopPropagation()}>
        {preview && <div className="ctx-preview">{preview}</div>}
        {caption && <div className="ctx-caption">{caption}</div>}
        <div className="ctx-menu">
          {items.map((item) => (
            <button key={item.label}
                    className={`ctx-item${item.destructive ? ' destructive' : ''}`}
                    onClick={() => { onClose(); item.onSelect(); }}>
              <span>
                {item.label}
                {item.sub && <span className="sub">{item.sub}</span>}
              </span>
              <Glyph name={item.icon} size={19} />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Action sheet ───────────────────────────────────────────────────────── */

/**
 * Confirmation for something irreversible. Deleting a post takes its frames,
 * its transcript and its line in the harvest list with it, so it gets the same
 * treatment iOS gives deleting a photo: say what will happen, in red.
 */
export function ActionSheet({ title, message, actions, onCancel, cancelLabel = 'Cancel' }) {
  useOverlay();
  return overlay(
    <div className="sheet-scrim" onPointerDown={onCancel}>
      <div className="sheet" onPointerDown={(e) => e.stopPropagation()}>
        <div className="sheet-group">
          {(title || message) && (
            <div className="sheet-head">
              {title && <b>{title}</b>}
              {message}
            </div>
          )}
          {actions.map((a) => (
            <button key={a.label}
                    className={`sheet-btn${a.destructive ? ' destructive' : ''}`}
                    onClick={() => { onCancel(); a.onSelect(); }}>
              {a.label}
            </button>
          ))}
        </div>
        <div className="sheet-group solid">
          <button className="sheet-btn cancel" onClick={onCancel}>{cancelLabel}</button>
        </div>
      </div>
    </div>
  );
}

/* ── HUD ────────────────────────────────────────────────────────────────── */

/** Transient status. Work in progress keeps its spinner until it is replaced. */
export const Hud = ({ text, busy, bad }) => overlay(
  <div className={`hud${bad ? ' bad' : ''}`}>
    {busy && <span className="spinner" />}
    {text}
  </div>,
);
