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
 */

import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import { TYPE_COLOR } from '../data.js';
import { VENUE_RADIUS_M, PERIMETER_M } from '../native/geofences.js';

export default function MapView({ entities, position, armed }) {
  const el = useRef(null);
  const map = useRef(null);
  const layer = useRef(null);

  useEffect(() => {
    if (map.current) return;
    map.current = L.map(el.current, { zoomControl: false, attributionControl: false })
      .setView(position || [34.0224, -118.2851], position ? 15 : 3);
    L.tileLayer('./tiles/{z}/{x}/{y}.png', { minZoom: 0, maxZoom: 15, errorTileUrl: '' })
      .addTo(map.current);
    layer.current = L.layerGroup().addTo(map.current);
  }, []);

  useEffect(() => {
    if (!layer.current) return;
    layer.current.clearLayers();
    const armedIds = new Set(armed.map((a) => a.id));

    for (const e of entities) {
      if (!e.place?.coords) continue;
      const eligible = e.nudge_eligible;
      L.circleMarker(e.place.coords, {
        radius: eligible ? 6 : 4,
        color: TYPE_COLOR[e.type] || '#888',
        weight: eligible ? 2 : 1,
        fillOpacity: eligible ? 0.9 : 0.35,
      }).bindPopup(`<b>${e.name}</b><br>${eligible ? 'armed' : e.why_not}`).addTo(layer.current);

      // Only ARMED venues get a radius drawn. The distinction is the point: 26
      // are eligible, but iOS will only ever watch 19 of them at once.
      if (armedIds.has(e.id)) {
        L.circle(e.place.coords, {
          radius: VENUE_RADIUS_M, color: TYPE_COLOR[e.type], weight: 1, opacity: 0.6, fillOpacity: 0.08,
        }).addTo(layer.current);
      }
    }

    if (position) {
      L.circleMarker(position, { radius: 7, color: '#fff', weight: 3, fillColor: '#4da3ff', fillOpacity: 1 })
        .bindPopup('you — real GPS').addTo(layer.current);
      // The re-arm perimeter: crossing it wakes the app to pick a new nearest 19.
      L.circle(position, {
        radius: PERIMETER_M, color: '#4da3ff', weight: 1, dashArray: '4 6', opacity: 0.5, fillOpacity: 0.03,
      }).addTo(layer.current);
    }
  }, [entities, position, armed]);

  // Follow the dot once, on the first fix — not continuously, or the map fights
  // the user every time they pan to look at something.
  const centred = useRef(false);
  useEffect(() => {
    if (position && map.current && !centred.current) {
      map.current.setView(position, 16);
      centred.current = true;
    }
  }, [position]);

  return (
    <div style={{ height: '100%', position: 'relative' }}>
      <div ref={el} className="map" />
      <div style={{
        position: 'absolute', left: 10, bottom: 10, zIndex: 500,
        background: 'rgba(11,11,13,.85)', border: '1px solid var(--line)',
        borderRadius: 10, padding: '7px 10px', fontSize: 11, color: 'var(--dim)',
      }}>
        {armed.length ? `${armed.length} armed · nearest ${armed[0]?.name}` : 'nothing armed yet'}
        <br />
        {position ? `${position[0].toFixed(5)}, ${position[1].toFixed(5)}` : 'waiting for a fix'}
      </div>
    </div>
  );
}
