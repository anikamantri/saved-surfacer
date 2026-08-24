/**
 * Persisted state: feedback, and what has already fired today.
 *
 * went / not now / never is the only correction signal in the product and it
 * does double duty — it tunes what fires, and it is the ONLY way the archive
 * ever shrinks. "never" genuinely removes an entity, so the backlog burns down
 * instead of only ever growing.
 *
 * `firedToday` has to survive app termination, not just backgrounding: iOS can
 * kill the app between two geofence crossings, and a daily budget that resets
 * whenever the OS feels like it is not a budget.
 */

const KEYS = { feedback: 'cue.feedback.v1', fired: 'cue.fired.v1', log: 'cue.log.v1' };
const today = () => new Date().toISOString().slice(0, 10);

const read = (k, fallback) => {
  try { return JSON.parse(localStorage.getItem(k)) ?? fallback; } catch { return fallback; }
};
const write = (k, v) => { localStorage.setItem(k, JSON.stringify(v)); return v; };

export const loadFeedback = () => read(KEYS.feedback, {});
export const saveFeedback = (next) => write(KEYS.feedback, next);

export function setFeedback(entityId, verdict) {
  const next = { ...loadFeedback(), [entityId]: verdict };
  return saveFeedback(next);
}

/** Ids fired today. Anything from an earlier day is dropped on read. */
export function firedToday() {
  const rec = read(KEYS.fired, { day: today(), ids: [] });
  return rec.day === today() ? rec.ids : [];
}

export function markFired(entityId) {
  const ids = [...new Set([...firedToday(), entityId])];
  write(KEYS.fired, { day: today(), ids });
  return ids;
}

/** History of what actually fired, with the reason. The Nudges screen reads this. */
export const history = () => read(KEYS.log, []);

export function recordFire(candidate) {
  const entry = {
    entity_id: candidate.entity.id,
    name: candidate.entity.name,
    kind: candidate.kind,
    reason: candidate.reason,
    distance_m: candidate.distance_m ?? null,
    walk_min: candidate.walk_min ?? null,
    at: new Date().toISOString(),
  };
  write(KEYS.log, [entry, ...history()].slice(0, 50));
  return entry;
}

export function reset() {
  Object.values(KEYS).forEach((k) => localStorage.removeItem(k));
}
