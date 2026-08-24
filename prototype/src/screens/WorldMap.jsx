import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { ENTITIES, TYPE_COLOR } from '../data.js';

/**
 * Screen 3 — the pull side, and the cold-start answer.
 *
 * Every pin is a real geocode from the pipeline. Tiles are baked into the repo,
 * so this pans and zooms with the network off. Opens at world zoom because the
 * point is the scatter: you never know which of these cities you'll be standing
 * in, which is exactly why a folder was never going to work.
 */
export default function WorldMap({ living, position }) {
  const el = useRef(null);
  const map = useRef(null);
  const layer = useRef(null);
  const [onlyNudgeable, setOnlyNudgeable] = useState(false);

  const pins = living.filter((e) => e.place?.coords && e.confidence.overall >= 0.35);
  const shown = onlyNudgeable ? pins.filter((e) => e.nudge_eligible) : pins;

  useEffect(() => {
    if (map.current) return;
    map.current = L.map(el.current, { zoomControl: false, attributionControl: true, worldCopyJump: true })
      .setView([45, -40], 3);
    L.control.zoom({ position: 'bottomright' }).addTo(map.current);
    L.tileLayer('./tiles/{z}/{x}/{y}.png', {
      minZoom: 0, maxZoom: 15,
      attribution: '&copy; OpenStreetMap contributors &copy; CARTO — tiles baked locally, no network',
    }).addTo(map.current);
    layer.current = L.layerGroup().addTo(map.current);

    // Frame the actual saves rather than an arbitrary world view — at zoom 2 every
    // European pin collapses into a single dot and the scatter reads as one place.
    const pts = pins.map((e) => e.place.coords);
    if (pts.length) {
      map.current.fitBounds(L.latLngBounds(pts).pad(0.18), { maxZoom: 4, animate: false });
    }
  }, []);

  useEffect(() => {
    if (!layer.current) return;
    layer.current.clearLayers();

    for (const e of shown) {
      const venue = e.place.granularity === 'venue';
      const size = venue ? (e.nudge_eligible ? 11 : 8) : 6;
      L.marker(e.place.coords, {
        icon: L.divIcon({
          className: '',
          html: `<div class="pin" style="width:${size}px;height:${size}px;background:${TYPE_COLOR[e.type]};opacity:${e.nudge_eligible ? 1 : .55}"></div>`,
          iconSize: [size, size], iconAnchor: [size / 2, size / 2],
        }),
      }).bindPopup(
        `<b>${e.name}</b><br>${e.hook || ''}<br>
         <small>@${e.post.source.author} · ${e.city || ''}<br>
         confidence ${(e.confidence.overall ?? 0).toFixed(2)} ·
         ${e.nudge_eligible ? 'can nudge' : `map only — ${e.why_not}`}</small>`
      ).addTo(layer.current);
    }

    if (position) {
      L.marker(position, {
        icon: L.divIcon({ className: '', html: '<div class="me-dot" style="width:13px;height:13px"></div>',
          iconSize: [13, 13], iconAnchor: [6.5, 6.5] }),
      }).addTo(layer.current);
    }
  }, [shown, position]);

  const fly = (coords, zoom) => map.current?.flyTo(coords, zoom, { duration: 1.1 });

  const cities = [...new Set(pins.map((e) => e.city).filter(Boolean))];

  return (
    <div className="mapwrap">
      <div ref={el} />
      <div className="map-overlay">
        <div className="eyebrow">03 · the map</div>
        <div className="h1" style={{ fontSize: 17 }}>Everywhere I said yes.</div>
        <p className="sub" style={{ fontSize: 12.5, marginTop: 7 }}>
          <b>{shown.length} places</b> across <b>{cities.length} cities</b>, geocoded automatically
          out of {ENTITIES.length} extracted entities. Nothing here was typed in by hand.
        </p>
        <p className="sub" style={{ fontSize: 11.5, marginTop: 8, color: 'var(--dim)' }}>
          Dim pins are map-only — too vague, or an area rather than a venue. They still show up
          here; they just never earn a notification.
        </p>
      </div>

      <div className="map-actions">
        <button className="mini" onClick={() => map.current?.flyToBounds(
          L.latLngBounds(pins.map((e) => e.place.coords)).pad(0.18), { maxZoom: 4, duration: 1.1 })}>
          everything
        </button>
        <button className="mini" onClick={() => fly([59.9297, 10.7205], 15)}>Oslo</button>
        <button className="mini" onClick={() => fly([37.772, -122.43], 13)}>San Francisco</button>
        <button className="mini" onClick={() => fly([60.393, 5.321], 13)}>Bergen</button>
        <button className="mini" onClick={() => fly([46.495, 12.069], 12)}>Dolomites</button>
        <button className={`mini${onlyNudgeable ? ' on' : ''}`} onClick={() => setOnlyNudgeable((v) => !v)}>
          {onlyNudgeable ? 'showing nudge-worthy' : 'show only nudge-worthy'}
        </button>
      </div>
    </div>
  );
}
