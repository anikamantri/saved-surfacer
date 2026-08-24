/**
 * Location. Two layers, for two different jobs.
 *
 * 1. **Geofences** (see geofences.js) are the production shape: iOS wakes the
 *    app on a region crossing, costs almost no battery, and survives the app
 *    being terminated.
 *
 * 2. **Continuous background location** — "demo mode" — is the filming
 *    guarantee. It enables the `location` background mode, which keeps the app
 *    alive and JavaScript running through a whole walk, so the recording does
 *    not depend on geofence wake-up timing (which iOS can delay by minutes on
 *    its own schedule). It is battery-hungry and therefore deliberately opt-in,
 *    with a visible toggle rather than a quiet default.
 *
 * Both feed the same `onPosition`, so the engine never learns which is running.
 */

import { BackgroundGeolocation } from '@capgo/background-geolocation';
import { isNative } from './permissions.js';

let running = false;
let last = null;

export const lastPosition = () => last;
export const isTracking = () => running;

/**
 * @param background  true = demo mode (JS stays alive with the phone locked).
 *                    Setting backgroundMessage is what actually requests it.
 */
export async function start({ onPosition, onError = () => {}, background = false }) {
  if (running) return;

  if (!isNative()) {
    // The browser gets foreground GPS and nothing else — which is the entire
    // reason this app had to become native. Kept working so the Mac can drive
    // the UI during development.
    if (!navigator.geolocation) return onError(new Error('no geolocation in this browser'));
    const id = navigator.geolocation.watchPosition(
      (p) => { last = [p.coords.latitude, p.coords.longitude]; onPosition(last, { accuracy: p.coords.accuracy, source: 'web' }); },
      (e) => onError(new Error(e.message)),
      { enableHighAccuracy: true, maximumAge: 5000 },
    );
    running = true;
    return () => { navigator.geolocation.clearWatch(id); running = false; };
  }

  await BackgroundGeolocation.start({
    ...(background ? {
      backgroundTitle: 'Cue is watching for the moment',
      backgroundMessage: 'Demo mode — continuous location. Turn this off to save battery.',
    } : {}),
    requestPermissions: true,
    stale: false,
    distanceFilter: background ? 5 : 15,
  }, (position, error) => {
    if (error) return onError(new Error(error.message || String(error)));
    if (!position) return;
    last = [position.latitude, position.longitude];
    onPosition(last, {
      accuracy: position.accuracy,
      time: position.time,
      source: background ? 'native/continuous' : 'native',
    });
  });

  running = true;
  return () => stop();
}

export async function stop() {
  if (!running) return;
  if (isNative()) await BackgroundGeolocation.stop().catch(() => {});
  running = false;
}
