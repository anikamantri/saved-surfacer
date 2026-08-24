/**
 * The simulated world.
 *
 * Location is simulated — there is no CoreLocation here and there was never
 * meant to be. What matters is that the ENGINE cannot tell: it receives a clock,
 * a position and a calendar, and evaluates them for real. Moving this dot is
 * indistinguishable, from the engine's side, from walking down the street.
 */

/** A real walk through Majorstuen, past venues the pipeline actually extracted. */
export const ROUTE = [
  [59.92899, 10.71404], // Majorstuen station
  [59.92925, 10.71548],
  [59.92871, 10.71702], // Jacob Aalls gate
  [59.92830, 10.71861], // Moniker / Valkyrien
  [59.92918, 10.71994],
  [59.93012, 10.72156],
  [59.93094, 10.72331],
  [59.93168, 10.72520], // Havens Kafé
];

/** Linear interpolation along the route. t is 0..1 across the whole walk. */
export function positionAt(t) {
  const clamped = Math.max(0, Math.min(1, t));
  const span = (ROUTE.length - 1) * clamped;
  const i = Math.min(Math.floor(span), ROUTE.length - 2);
  const f = span - i;
  const [aLat, aLon] = ROUTE[i];
  const [bLat, bLon] = ROUTE[i + 1];
  return [aLat + (bLat - aLat) * f, aLon + (bLon - aLon) * f];
}

export const DEMO_DAY = '2026-08-24'; // a Monday

/** The calendar the engine reads. Two events, each doing a job in the demo. */
export const CALENDAR = [
  { title: 'Standup', start: `${DEMO_DAY}T09:30:00`, end: `${DEMO_DAY}T10:15:00` },
  { title: 'Lunch with Mathea', start: `${DEMO_DAY}T12:30:00`, end: `${DEMO_DAY}T13:30:00` },
  { title: 'Gym', start: `${DEMO_DAY}T18:00:00`, end: `${DEMO_DAY}T19:00:00` },
];

export const timeAt = (hours) => {
  const d = new Date(`${DEMO_DAY}T00:00:00`);
  d.setMinutes(Math.round(hours * 60));
  return d;
};

export const fmtClock = (date) =>
  `${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;

/** Where the demo starts: mid-morning, mid-walk, just past the standup. */
export const DEFAULTS = { hours: 10.6, routeT: 0.82 };
