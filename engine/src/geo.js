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
