/**
 * Feedback persistence.
 *
 * went / not now / never is the only correction signal in the product, and it
 * does double duty: it tunes what fires, and it is the ONLY way the archive ever
 * shrinks. "never" genuinely removes an entity — the backlog burns down instead
 * of only growing.
 */

const KEY = 'cue.feedback.v1';

export function loadFeedback() {
  try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; }
}

export function saveFeedback(next) {
  localStorage.setItem(KEY, JSON.stringify(next));
  return next;
}

export function resetFeedback() {
  localStorage.removeItem(KEY);
  return {};
}
