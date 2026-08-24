/**
 * Local notifications.
 *
 * Local, not push — no server, no APNs certificate, and crucially no paid Apple
 * account needed. The nudge is composed on the device from data already on the
 * device, which is also the honest privacy story: nothing about where you are
 * ever leaves the phone.
 *
 * The card the notification opens carries provenance — the original thumbnail,
 * the creator's handle, the date saved — because a nudge with no visible origin
 * is indistinguishable from an ad. That is the whole difference between this and
 * a recommender.
 */

import { LocalNotifications } from '@capacitor/local-notifications';
import { isNative } from './permissions.js';

let seq = 1000;

/**
 * @param candidate  an engine result: { entity, reason, distance_m, walk_min, kind }
 */
export async function fire(candidate) {
  const { entity, reason } = candidate;
  const title = entity.type === 'workout'
    ? `${entity.name} — you saved this`
    : `${entity.name} is ${candidate.walk_min} min away`;

  const body = [entity.hook, reason].filter(Boolean).join(' · ');
  const id = seq++;

  if (!isNative()) {
    console.log(`[notify] ${title} — ${body}`);
    return { id, delivered: 'console (web)' };
  }

  await LocalNotifications.schedule({
    notifications: [{
      id,
      title,
      body,
      // Straight through; the engine has already decided this earned an interrupt.
      schedule: { at: new Date(Date.now() + 1000) },
      // Round-trips the whole candidate so the card can be rendered from the
      // tap, even on a cold launch where no state survived.
      extra: {
        entity_id: entity.id,
        post_id: entity.id.split('-')[0],
        kind: candidate.kind,
        reason,
        fired_at: new Date().toISOString(),
      },
      threadIdentifier: 'cue',
      summaryArgument: 'Cue',
    }],
  });

  return { id, delivered: 'ios' };
}

/** The tap. Returns an unsubscribe. */
export async function onTap(handler) {
  if (!isNative()) return () => {};
  const h = await LocalNotifications.addListener('localNotificationActionPerformed',
    (action) => handler(action.notification?.extra || {}, action));
  return () => h.remove();
}

export async function pending() {
  if (!isNative()) return [];
  const { notifications } = await LocalNotifications.getPending().catch(() => ({ notifications: [] }));
  return notifications;
}
