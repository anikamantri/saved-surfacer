/**
 * EventKit, read-only.
 *
 * The gym beat is the proof that the engine generalises: the same evaluate()
 * that fires a café on proximity fires a saved workout on a real calendar event,
 * with no branch in the product code. It reads Anika's actual calendar — a real
 * "Gym" event, not a fixture.
 *
 * Cue never writes an event, but it must still ask for FULL access: iOS 17
 * removed read-only access to events entirely. Apple offers only full access
 * (read+write) or write-only (which cannot read), so reading a calendar means
 * requesting full access. The read-only scope is enforced by this file — there
 * is no write path anywhere in the app — not by the permission prompt.
 *
 * iOS 17 also RENAMED the Info.plist key: `NSCalendarsUsageDescription` is now
 * ignored, and the app crashes on first access without
 * `NSCalendarsFullAccessUsageDescription`.
 */

import { CapacitorCalendar, CalendarPermissionScope } from '@ebarooni/capacitor-calendar';
import { isNative } from './permissions.js';

/** The simulated calendar, kept only for the browser and for filming fallback. */
const FALLBACK = [
  { title: 'Standup', start: '09:30', end: '10:15' },
  { title: 'Gym', start: '18:00', end: '19:00' },
].map((e) => {
  const day = new Date().toISOString().slice(0, 10);
  return { id: `sim-${e.title}`, title: e.title, start: `${day}T${e.start}:00`, end: `${day}T${e.end}:00`, source: 'simulated' };
});

/**
 * Today's events, in the shape the engine expects: { title, start, end }.
 * The engine has no idea whether these came from EventKit or a fixture — which
 * is exactly the property that let it be tested at all.
 */
export async function today() {
  if (!isNative()) return FALLBACK;

  const from = new Date(); from.setHours(0, 0, 0, 0);
  const to = new Date(from); to.setDate(to.getDate() + 1);

  try {
    const { result } = await CapacitorCalendar.listEventsInRange({ from: from.getTime(), to: to.getTime() });
    return (result || [])
      .filter((e) => !e.isAllDay)   // an all-day event does not make you busy
      .map((e) => ({
        id: e.id,
        title: e.title || '(untitled)',
        start: new Date(e.startDate).toISOString(),
        end: new Date(e.endDate).toISOString(),
        location: e.location || null,
        source: 'eventkit',
      }));
  } catch (err) {
    // Loudly, not silently — a fallback that pretends to be real data is how the
    // pipeline once poisoned its own hero venue.
    console.warn('[calendar] EventKit unavailable, using simulated events:', err.message);
    return FALLBACK.map((e) => ({ ...e, source: 'simulated (EventKit failed)' }));
  }
}

export async function status() {
  if (!isNative()) return 'web';
  const r = await CapacitorCalendar.checkPermission({ scope: CalendarPermissionScope.READ_CALENDAR }).catch((e) => ({ result: e.message }));
  return r.result;
}
