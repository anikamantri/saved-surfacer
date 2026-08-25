/**
 * The Mac, over Tailscale.
 *
 * Campus WiFi almost certainly isolates clients from one another, so a plain LAN
 * address is not dependable. Tailscale gives both devices a stable 100.x address
 * that works on any network, including cellular.
 *
 * Everything here is optional by construction: the app ships with the whole
 * corpus baked in and makes zero network calls to render. The server is needed
 * for exactly one thing — ingesting a NEW post — because yt-dlp and ffmpeg
 * cannot run on iOS. When it is unreachable the app says so and carries on.
 */

const KEY = 'cue.server.host';

/**
 * The Mac's Tailscale address, baked in as the default.
 *
 * `localhost` was the old default, which on a phone means *the phone* — the
 * single most confusing way this can fail. A 100.x tailnet address is stable
 * across networks (campus Wi-Fi, home, cellular) and needs no DHCP lookup, so
 * the app can simply find the Mac on launch with nothing typed.
 *
 * Overridable in Debug, and `VITE_CUE_SERVER` overrides it at build time for
 * anyone whose tailnet differs.
 */
const DEFAULT = import.meta.env.VITE_CUE_SERVER || 'http://100.73.98.7:4321';

export const serverHost = () => localStorage.getItem(KEY) || DEFAULT;

/**
 * Normalise before storing.
 *
 * Typing "10.25.204.70:4321" without a scheme is the obvious thing to do and
 * produces a relative URL that fetch resolves against the app's own origin —
 * failing in a way indistinguishable from an unreachable server. Add the scheme
 * rather than making that a puzzle.
 */
export function setServerHost(h) {
  let host = String(h || '').trim().replace(/\/+$/, '');
  if (host && !/^https?:\/\//i.test(host)) host = `http://${host}`;
  localStorage.setItem(KEY, host);
  return host;
}

async function probe(host, timeoutMs) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${host}/health`, { signal: ctrl.signal });
    if (!res.ok) return { reachable: false, error: `HTTP ${res.status}` };
    return { reachable: true, ...(await res.json()) };
  } catch (err) {
    return { reachable: false, error: err.name === 'AbortError' ? 'timed out' : err.message };
  } finally {
    clearTimeout(t);
  }
}

/**
 * Reachability, with self-healing.
 *
 * A host saved in Debug lives in localStorage, which survives rebuilds — so a
 * LAN address typed once keeps being used long after DHCP has moved the Mac,
 * and no amount of reinstalling fixes it. That is a guaranteed way to lose a
 * morning, and worse, a take.
 *
 * So when the saved host fails, the baked-in tailnet default is tried before
 * giving up, and adopted if it answers. A stale address heals itself instead of
 * quietly reading "false" forever.
 */
export async function health(timeoutMs = 2500) {
  const saved = serverHost();
  const first = await probe(saved, timeoutMs);
  if (first.reachable || saved === DEFAULT) return { ...first, host: saved };

  const fallback = await probe(DEFAULT, timeoutMs);
  if (!fallback.reachable) {
    return { ...first, host: saved, triedFallback: DEFAULT, fallbackError: fallback.error };
  }

  localStorage.setItem(KEY, DEFAULT);
  return { ...fallback, host: DEFAULT, healedFrom: saved };
}

export async function fetchCorpus() {
  const res = await fetch(`${serverHost()}/entities`);
  if (!res.ok) throw new Error(`server said ${res.status}`);
  return res.json();
}

/**
 * Ingest one post, streaming the real stage output.
 *
 * A post takes 20-40s — the yt-dlp download plus the vision call — so a spinner
 * would be a lie about what is happening. `onEvent` receives the pipeline's
 * actual log lines as they are produced.
 *
 * Parsed by hand rather than with EventSource because EventSource cannot POST.
 */
export async function ingest(url, onEvent, opts = {}) {
  const res = await fetch(`${serverHost()}/ingest`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    // `refresh` re-runs a post already in the corpus: "model" redoes the
    // extraction against frames already on disk, "all" re-hydrates from TikTok.
    body: JSON.stringify({ url, refresh: opts.refresh || undefined }),
  });
  if (!res.ok || !res.body) throw new Error(`server said ${res.status}`);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let result = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // SSE frames are separated by a blank line; a partial frame stays buffered.
    const frames = buffer.split('\n\n');
    buffer = frames.pop();
    for (const frame of frames) {
      const event = frame.match(/^event: (.+)$/m)?.[1];
      const data = frame.match(/^data: (.+)$/m)?.[1];
      if (!event || !data) continue;
      const payload = JSON.parse(data);
      onEvent(event, payload);
      if (event === 'done') result = payload;
      if (event === 'error') throw new Error(payload.message);
    }
  }
  return result;
}

/**
 * Delete a post and everything derived from it.
 *
 * This needs the Mac, and that is not a limitation worth hiding: the post lives
 * in docs/saved-posts.md and its frames live on disk, so a phone-only deletion
 * would be a lie that the next sync quietly undoes. When the server is
 * unreachable the app says exactly that instead of pretending.
 */
export async function removePost(id) {
  const res = await fetch(`${serverHost()}/delete`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `server said ${res.status}`);
  return body;
}
