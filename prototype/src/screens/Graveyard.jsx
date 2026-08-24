import { DATA, POSTS, ENTITIES, thumb, ago } from '../data.js';

/**
 * Screen 1 — the problem, in five seconds.
 * A reverse-chronological grid with no structure and no way in. Deliberately dead:
 * greyscale, undifferentiated, exactly the thing you never open.
 */
export default function Graveyard() {
  const sorted = [...POSTS].sort((a, b) => (b.source.saved_at || '').localeCompare(a.source.saved_at || ''));

  return (
    <div className="pad">
      <div className="eyebrow">01 · the problem</div>
      <h1 className="h1">A write-only archive.</h1>
      <p className="sub">
        {POSTS.length} real saves from my TikTok favourites, in the only order the platform offers:
        reverse-chronological. No search, no filter, no notion of relevance. Every new save pushes
        the old ones further down. <b>The inbox has no outbox.</b>
      </p>

      <div className="grave-stats">
        <div className="stat"><div className="n">{POSTS.length}</div><div className="l">posts saved</div></div>
        <div className="stat"><div className="n">{ENTITIES.length}</div><div className="l">actionable things buried inside them</div></div>
        <div className="stat warn"><div className="n">0</div><div className="l">folders I have ever made</div></div>
        <div className="stat warn"><div className="n">1</div><div className="l">I went back and found</div></div>
      </div>

      <div className="grid">
        {sorted.map((p) => (
          <div className="tile" key={p.id} title={p.source.caption?.slice(0, 180)}>
            {thumb(p) && <img src={thumb(p)} alt="" loading="lazy" />}
            <div className="meta">
              <div>@{p.source.author}</div>
              <div className="when">{ago(p.source.saved_at)}</div>
            </div>
          </div>
        ))}
      </div>

      <p className="sub" style={{ marginTop: 22 }}>
        The information isn't lost — it's <b>unreachable without a memory I don't have.</b> Folders
        wouldn't fix it: folders are a retrieval solution, and retrieval assumes recall. In Oslo I
        didn't fail to <i>find</i> the coffee shop post. I failed to remember I had one.
      </p>
      <p className="sub mono" style={{ marginTop: 12, fontSize: 11.5, color: 'var(--dim)' }}>
        hydration: oEmbed reached {DATA.hydration?.totals.oembed_ok}/{DATA.hydration?.totals.posts} ·
        yt-dlp reached {DATA.hydration?.totals.ytdlp_ok}/{DATA.hydration?.totals.posts}
      </p>
    </div>
  );
}
