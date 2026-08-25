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

const KEYS = {
  feedback: 'cue.feedback.v1', fired: 'cue.fired.v1',
  log: 'cue.log.v1', overrides: 'cue.overrides.v1', prefs: 'cue.prefs.v1',
  handled: 'cue.handled.v1', library: 'cue.library.v1',
};
const today = () => new Date().toISOString().slice(0, 10);

const read = (k, fallback) => {
  try { return JSON.parse(localStorage.getItem(k)) ?? fallback; } catch { return fallback; }
};
const write = (k, v) => { localStorage.setItem(k, JSON.stringify(v)); return v; };

export const loadFeedback = () => read(KEYS.feedback, {});
export const saveFeedback = (next) => write(KEYS.feedback, next);

/**
 * Verdicts toggle rather than latch. Tapping "I went" on a place already marked
 * went UNMARKS it — you were wrong, or you changed your mind, and a verdict you
 * cannot take back turns an honest signal into something people avoid giving.
 * Clearing hands the entity back to whatever its trigger says.
 */
export function setFeedback(entityId, verdict) {
  const next = { ...loadFeedback() };
  if (verdict == null || next[entityId] === verdict) delete next[entityId];
  else next[entityId] = verdict;
  return saveFeedback(next);
}

/**
 * Links this app has already acted on, so it acts on each of them exactly once.
 *
 * This has to survive termination, which is the whole reason it is here and not
 * a ref. The share extension leaves the link on the CLIPBOARD — iOS will not
 * let it foreground its container — and the clipboard keeps it indefinitely.
 * An in-memory guard is therefore reset by the very event it is guarding
 * against: every cold launch read the same link, decided it was new, and threw
 * the user onto the capture screen mid-ingest. Once is a share. Twice is a bug.
 */
export const handledLinks = () => read(KEYS.handled, []);

export const wasHandled = (url) => handledLinks().includes(url);

export function markHandled(url) {
  // Bounded: the clipboard only ever holds one, and this is a phone.
  return write(KEYS.handled, [url, ...handledLinks().filter((u) => u !== url)].slice(0, 30));
}

/**
 * The user's own settings — what "nearby" means, how many nudges a day, and
 * whether the hours and calendar gates apply at all.
 *
 * Only the keys the user actually changed are stored. The engine merges these
 * over `DEFAULTS`, so a setting nobody has touched keeps tracking the default
 * rather than freezing whatever it happened to be the day the app first ran.
 */
export const loadPrefs = () => read(KEYS.prefs, {});

export const savePrefs = (next) => write(KEYS.prefs, next);

export function setPref(key, value) {
  const next = { ...loadPrefs() };
  if (value === null || value === undefined) delete next[key]; else next[key] = value;
  return savePrefs(next);
}

export const resetPrefs = () => savePrefs({});

/**
 * Hand-set triggers, keyed by entity id.
 *
 * Separate from feedback on purpose: feedback is a verdict on a nudge that
 * already happened, an override is a rule about ones that have not. Blurring
 * them would mean "not now" quietly rewriting a trigger the user set by hand.
 *
 * The engine is what interprets these — see `applyOverride`. Nothing here
 * decides anything; it only remembers.
 */
export const loadOverrides = () => read(KEYS.overrides, {});

export function setOverride(entityId, override) {
  const next = { ...loadOverrides() };
  // Clearing means "use what the extractor decided again", which is a real
  // choice and not the same as switching the nudge off.
  if (!override) delete next[entityId]; else next[entityId] = override;
  return write(KEYS.overrides, next);
}

export const overrideFor = (entityId) => loadOverrides()[entityId] || null;

/** Hand every entity back to the extractor's judgement. */
export const clearOverrides = () => write(KEYS.overrides, {});

/**
 * How the library was last being looked at — grid or list, and the list's sort
 * and filters. Display state, not an engine input, but it still has to outlive
 * a tab switch: the Library unmounts when you leave it, and coming back from
 * the map to find "open now in Oslo" silently reset to the grid reads as the
 * app forgetting what you were doing.
 */
export const loadLibraryView = () => read(KEYS.library, {});
export const saveLibraryView = (next) => write(KEYS.library, next);

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
