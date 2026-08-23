# saved-surfacer — working context

## What this is

A personal tool that resurfaces saved social posts at the moment they become useful. Working product name: **Cue**.

**The thesis, in one line:** a saved post isn't content to be organized — it's *an intention with a missing trigger.*

Saving happens while scrolling, with no intent to act. Needing happens weeks later in a different place and headspace. The save records *what* you found interesting and discards *when and where it would matter.* Folders don't fix this: folders are a **retrieval** solution, and retrieval assumes recall, which is exactly what's broken.

So this is a **surfacing** problem, not a sorting problem. Full framing in `docs/brief.md` — read it before making product decisions.

## The constraint

Design challenge. Deliverables are a **working coded prototype** and a **3-minute walkthrough video**. Roughly two hours remained as of 2026-08-23 20:00 UTC. Scope ruthlessly and protect time for recording.

## Decisions already made — don't relitigate

- It's a trigger engine, not a better folder. Each saved item gets a *trigger condition*, not a category.
- **Travel (Oslo) is the primary demo.** Gym/calendar is the secondary beat that proves the model generalizes. Everything else is out.
- **Ingest is a stated assumption in the video's first 15 seconds.** The pipeline runs once offline; its output is baked into the prototype as static JSON.
- **No live API calls during the recording.** Network failure on camera is the main avoidable risk.
- The core design constraint is *surface rarely, surface right* — the failure mode is notification fatigue, not bad tech. Hard cap ~2 nudges/day; everything else goes to the map silently.

## Current state

```
docs/brief.md      Full problem / opportunity / feasibility writeup — the source of truth
data/samples/      One real oEmbed response, captured from Anika's actual TikTok saves
ingest/            EMPTY — this is the next task
data/              EMPTY — pipeline output lands here
prototype/         EMPTY — the demo
```

## Immediate next task: the ingest script

Build `ingest/` to run **once, offline**, and produce static JSON the prototype imports.

```
TikTok URLs (pasted by hand)
  → GET https://www.tiktok.com/oembed?url=<url>
  → LLM entity extraction from the caption
  → geocode each place name
  → download thumbnails locally
  → data/entities.json
```

Input is a hand-harvested list of ~15 TikTok URLs from Anika's Favorites — chosen to **cluster in Oslo** so the map reads densely, plus 2–3 workout saves for the gym beat.

Target output shape (one post yields *many* entities):

```json
{
  "source": {
    "url": "https://www.tiktok.com/@izia.line/video/7645972278043364630",
    "author": "izia.line",
    "saved_at": "2026-07-22",
    "thumbnail": "data/thumbnails/7645972278043364630.jpg"
  },
  "entities": [
    {
      "type": "place",
      "name": "Havens Café",
      "category": "coffee",
      "neighborhood": "Majorstuen",
      "city": "Oslo, NO",
      "coords": [59.9297, 10.7156],
      "hook": "matcha + gluten-free desserts",
      "confidence": 0.91,
      "trigger": { "kind": "proximity", "radius_m": 500 }
    }
  ]
}
```

## Verified technical findings

**TikTok oEmbed works — confirmed against real data on 2026-08-23.** `GET https://www.tiktok.com/oembed?url=<url>`, public and keyless, no auth. Returns `title` (the *full* caption), `author_name`, `author_url`, `thumbnail_url`, `embed_product_id`. A real captured response is in `data/samples/oembed-example.json`.

**TRAP — thumbnails expire.** `thumbnail_url` is signed with an `x-expires` param, roughly 48 hours out. The sample's expired 2026-08-25 19:00 UTC. **Download every thumbnail to `data/thumbnails/` and reference local paths.** Hotlinking means blank images mid-demo.

**One save yields many places.** The Oslo sample produced five entities from a single caption (Havens Café, Moniker, Valkyrien Oslo, Jacob Aals gate, Sorgenfrigata). The data model must be post → *many* entities. This is also a product argument worth keeping: manually adding one save to a Google Maps list can cost five entries, which is why nobody does it.

**oEmbed gives no coordinates.** A geocoding pass is required. Expect lower confidence on vague names ("Moniker at Valkyrien") than on named cafés — gate nudges on that confidence.

**Caption-thin posts are a dead end for oEmbed.** Saves that say "📍 in comments" or "link in bio" yield nothing. Either run vision over the thumbnail as a fallback, or just skip them during harvesting.

**Why TikTok and not Instagram:** Instagram's export has no clean hydration path, and the Graph API has no saved-posts endpoint. TikTok's data export takes 1–4 days — too slow for today, which is why links are hand-harvested instead. Details in `docs/brief.md` §6.

## What the prototype must show

The video arc, in order. Screen 4 is the one that has to land — if the nudge works, the idea works.

1. **The graveyard** — a dead reverse-chron grid of saves. Establishes the problem in 5 seconds.
2. **Extraction** — one post visibly parsed into a structured object. Proves it isn't magic.
3. **The map** — Oslo, auto-populated from saves. The "oh" moment; also the cold-start answer.
4. **The nudge** — lock screen, *"You're 4 minutes from Havens Café."* With the original post thumbnail, the creator handle, and the date saved.
5. **The card** — provenance plus the explicit reason it fired, and *went / not now / never.* "Never" is the only way the archive shrinks.
6. **Gym** — calendar event cross-referenced with a saved workout. Proves the engine generalizes.

## Out of scope

Auth, any backend, real geofencing, live ingestion, Instagram, X, and Google Maps list export (no public API — own the map view instead).

## Conventions

- Prototype is a **single self-contained HTML file**, no build step. Avoid CDN dependencies — inline everything so it can't fail offline.
- Secrets go in `.env`, which is gitignored. Never commit an API key.
- Location is simulated in the demo. Don't build real CoreLocation anything.
- Thumbnails in `data/thumbnails/` are gitignored (regenerable, and they expire).
