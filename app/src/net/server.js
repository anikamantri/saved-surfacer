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
const DEFAULT = 'http://localhost:4321';

export const serverHost = () => localStorage.getItem(KEY) || DEFAULT;
export const setServerHost = (h) => localStorage.setItem(KEY, h.replace(/\/$/, ''));

export async function health(timeoutMs = 2500) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${serverHost()}/health`, { signal: ctrl.signal });
    return { reachable: res.ok, ...(await res.json()) };
  } catch (err) {
    return { reachable: false, error: err.name === 'AbortError' ? 'timed out' : err.message };
  } finally {
    clearTimeout(t);
  }
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
export async function ingest(url, onEvent) {
  const res = await fetch(`${serverHost()}/ingest`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ url }),
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
