/**
 * Permissions — every one of these can derail a take.
 *
 * The order matters and is not a style choice. iOS requires **staged
 * escalation**: you must hold When-In-Use before you may ask for Always. Asking
 * for Always from a cold start is silently denied — no dialog, no error, the
 * prompt simply never appears and background location never works. That failure
 * is invisible at runtime, which is exactly why the Debug surface reads these
 * states back rather than assuming them.
 */

import { Capacitor } from '@capacitor/core';
import { BackgroundGeolocation } from '@capgo/background-geolocation';
import { LocalNotifications } from '@capacitor/local-notifications';
import { CapacitorCalendar, CalendarPermissionScope } from '@ebarooni/capacitor-calendar';

export const isNative = () => Capacitor.isNativePlatform();

/** Everything the app needs, read without prompting. Drives the Debug readout. */
export async function readPermissions() {
  if (!isNative()) {
    return { native: false, location: 'web', background: 'web', notifications: 'web', calendar: 'web' };
  }
  const [loc, notif, cal] = await Promise.all([
    BackgroundGeolocation.checkPermissions().catch((e) => ({ error: e.message })),
    LocalNotifications.checkPermissions().catch((e) => ({ error: e.message })),
    CapacitorCalendar.checkPermission({ scope: CalendarPermissionScope.READ_CALENDAR }).catch((e) => ({ error: e.message })),
  ]);
  return {
    native: true,
    location: loc.location || loc.error || 'unknown',
    background: loc.backgroundLocation || loc.error || 'unknown',
    notifications: notif.display || notif.error || 'unknown',
    calendar: cal.result || cal.error || 'unknown',
  };
}

/**
 * First-run flow. Staged deliberately, with the notification prompt first
 * because it is the cheapest to grant and the one the hero beat depends on.
 */
export async function requestAll(onStep = () => {}) {
  if (!isNative()) return readPermissions();

  onStep('notifications');
  await LocalNotifications.requestPermissions().catch(() => {});

  // Stage 1 of 2. Must be granted and settled before Always is asked for.
  onStep('location (when in use)');
  await BackgroundGeolocation.requestPermissions({ permissions: ['location'] }).catch(() => {});

  // Stage 2. iOS shows this as "Change to Always Allow?" and only after the
  // app has actually used When-In-Use location at least once.
  onStep('location (always)');
  await BackgroundGeolocation.requestPermissions({ permissions: ['backgroundLocation'] }).catch(() => {});

  // Read-only: Cue never writes to the calendar, and iOS 17+ grants read-only
  // access without the full-access prompt's scarier wording.
  onStep('calendar (read only)');
  await CapacitorCalendar.requestReadOnlyCalendarAccess().catch(() => {});

  return readPermissions();
}

/** When a permission was denied, the only route left is Settings. */
export const openSettings = () => BackgroundGeolocation.openSettings().catch(() => {});
