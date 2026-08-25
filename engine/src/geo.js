// Real distance maths. The nudge claims "4 minutes away" and that claim has to be true.

const R = 6371000; // earth radius, metres
const rad = (d) => (d * Math.PI) / 180;

export function haversine([lat1, lon1], [lat2, lon2]) {
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// 1.35 m/s is an ordinary walking pace; the 1.25 factor accounts for streets
// not being straight lines. Rounded up, because promising less is safer.
export const walkingMinutes = (metres) => Math.max(1, Math.ceil((metres * 1.25) / 1.35 / 60));

/**
 * Past a certain point, walking minutes stop being an offer and start being a
 * joke. Ten is where "I could just go now" turns into "I would drive".
 *
 * Note this is NOT the nudge threshold — that stays at MAX_WALK_MIN, six
 * minutes, and deliberately: a notification is an interruption and has to earn
 * it with genuine proximity. This is about what the app tells you once YOU have
 * asked about a place. Browsing and being interrupted are different promises.
 */
export const WALK_LIMIT_MIN = 10;

/**
 * Driving time, at urban speed.
 *
 * 30 km/h average is a city with lights and turns in it, not a motorway, and
 * the 1.3 factor is the same street-versus-crow-flies correction the walk uses.
 * Three minutes is the floor because the drive is never the whole cost — there
 * is a car to reach and somewhere to leave it.
 */
export const drivingMinutes = (metres) => Math.max(3, Math.ceil((metres * 1.3) / 500));

/** Beyond this, routing is meaningless and the honest answer is the distance. */
export const ROUTABLE_M = 300000;

/**
 * How you would actually get there, and how long it would take.
 *
 * One function so the pin card, the nudge card and anything else agree — and so
 * that "11 min drive" is computed from the same haversine as "6 min walk"
 * rather than being a second, quietly different estimate.
 */
export function travelBy(metres) {
  const walk = walkingMinutes(metres);
  if (walk <= WALK_LIMIT_MIN) {
    return { mode: 'walk', minutes: walk, distance: fmtDistance(metres), label: `${walk} min walk` };
  }
  if (metres <= ROUTABLE_M) {
    const drive = drivingMinutes(metres);
    return { mode: 'drive', minutes: drive, distance: fmtDistance(metres), label: `${drive} min drive` };
  }
  return { mode: 'far', minutes: null, distance: fmtDistance(metres), label: 'too far to route' };
}

/**
 * Human distance.
 *
 * Walking minutes are the right unit for the only distances that can ever fire —
 * but the corpus spans continents, and rendering a San Francisco café as
 * "8333483m" or "4672 min away" on a screen in Oslo reads as a bug even though
 * the rejection is correct. Past a walk, switch units.
 */
export function fmtDistance(metres) {
  if (metres < 1000) return `${Math.round(metres)}m`;
  if (metres < 100000) return `${(metres / 1000).toFixed(1)} km`;
  return `${Math.round(metres / 1000).toLocaleString('en-GB')} km`;
}
