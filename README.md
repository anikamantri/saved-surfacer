# saved-surfacer

**A personal tool that resurfaces saved posts at the moment they become useful.**  
*Working product name: Cue.*

> A saved post isn't content to be organized. It's an intention with a missing trigger.

---

## The problem

Saving happens in one context — scrolling, half-distracted, no intent to act. Needing happens in a completely different one: standing in Oslo, walking into the gym, opening the fridge weeks later.

The save records *what* you found interesting and throws away *when and where it would matter.* That missing half is the whole problem.

Folders don't fix it. Folders are a **retrieval** solution, and retrieval assumes recall — which is exactly what's broken. In Oslo I didn't fail to *find* the coffee shop post. I failed to remember I had one.

So this is a **surfacing** problem, not a sorting problem.

## The approach

Extract structured context out of saved content automatically, then match it against real-world signals — location, calendar, time of day — and surface the post at the moment it's actionable.

```
CAPTURE  →  EXTRACT  →  ASSIGN TRIGGER  →  WATCH  →  SURFACE  →  LEARN
```

Instead of a folder, each saved item gets a **trigger condition** — the circumstance under which it wakes up.

| Saved thing | Trigger |
|---|---|
| Coffee shop in Oslo | Within 500 m, open now, calendar clear |
| Anything in a city | A trip to that city is detected |
| Workout | Calendar event matching *gym* |
| Recipe | Grocery store geofence |
| Gift idea | Two weeks before that person's birthday |

**The design constraint that matters most:** the failure mode isn't technical, it's notification fatigue. A muted trigger engine is worth less than the folder you never made. So — *surface rarely, surface right.* Hard cap of ~2 nudges/day; everything that doesn't clear the bar goes to the map silently.

## Ingest

The hard part isn't the AI, it's getting the saves out. Two separable problems:

- **The index** — the list of what you saved. Broadly obtainable.
- **The payload** — caption, video, on-screen text. Where it actually gets hard.

| Platform | Index | Payload |
|---|---|---|
| TikTok | Data export (JSON, 1–4 days) | `tiktok.com/oembed` — public and keyless, **but fails on photo carousels** |
| Instagram | Data export | No clean path — needs share extension or screenshots |
| X | `GET /2/users/:id/bookmarks` | Returned inline; paid API |
| Screenshots | Photos library | The whole rendered post |

Measured against 14 real saves, and the numbers are the point:

| Door | Reached |
|---|---|
| oEmbed (public, keyless) | **7 / 14** — HTTP 400 on every `/photo/` carousel |
| yt-dlp (local fetch) | **14 / 14** — and the only source of the untruncated caption |

**One save often yields several places.** A Bergen guide produced 9 entities from one caption; an SF restaurant post produced 9 more. That's also why adding these to a Google Maps list by hand is so painful, and part of why nobody does it.

**Known traps.** oEmbed `thumbnail_url` values are signed and expire in ~48 hours — download locally, never hotlink. And `original sound` does *not* mean narration: creators upload licensed music under that tag, so two posts marked that way transcribed to song lyrics. Let the model judge the transcript rather than trusting the metadata.

## The pipeline

```
docs/saved-posts.md          14 hand-harvested TikTok URLs
  01-hydrate    oEmbed + yt-dlp        -> caption, author, date, cover
  02-media      yt-dlp + ffmpeg        -> frames + audio   (fallback: data/manual/<id>/)
  03-transcribe gpt-transcribe         -> transcript
  04-extract    gpt-5.6-terra + vision -> typed entities, strict JSON schema
  05-geocode    Google Places          -> coords, opening hours, computed confidence
  06-triggers   assign a wake-up condition
  07-bundle     thumbnails, frames, map tiles -> prototype/public
```

Every stage caches and resumes independently. Output: **14 posts → 53 entities** (38 places, 7 products, 6 workouts), 38 geocoded, 25 with real opening hours, **26 nudge-eligible**.

## The prototype

A Vite + React app whose trigger engine actually evaluates: real haversine distance, real opening hours from Google Places, real calendar matching, real ranking under a hard 2-nudges-per-day cap. Feed it a simulated clock and position and it cannot tell the difference from real ones — which is the whole point.

The map is Leaflet over **locally baked tiles**, so the entire app runs with the network off.

```bash
npm run setup     # fetches yt-dlp, installs deps, checks .env
npm run ingest    # runs the pipeline (needs OPENAI_API_KEY + GOOGLE_MAPS_API_KEY)
npm run dev       # serves the prototype at localhost:5173
npm test          # 12 engine tests
```

The repo ships the pipeline's output, tiles and thumbnails, so `npm run dev` works **without any API keys** — you only need them to re-run ingest.

Six screens, steppable with ← →. `s` toggles the simulator. `?screen=4&t=10.6&p=0.82` deep-links a specific moment.

## Repo layout

```
docs/         Brief, submission notes, the harvest list
ingest/       7-stage pipeline (Node 24 ESM, no npm dependencies)
data/         Per-post artifacts, entities.json, hydration report
prototype/    Vite + React app — engine, simulator, six screens
```

## Status

Design challenge build, mid-pivot.

**Working today:** the pipeline and the web app above. Backlog capture is the assumed step — the existing links were hand-harvested because TikTok's export takes 1–4 days. Everything downstream genuinely ran against those real saves. 2 of the 8 trigger classes are wired, and the UI says so.

**In progress:** a real iOS app — genuine CoreLocation, native geofences, local notifications and EventKit — so the nudge fires while the phone is in your pocket, plus an iOS Share Extension so "Share → Cue" from inside TikTok runs the same pipeline. Web apps cannot do background geolocation on iOS, which is why this half has to be native. Architecture, sequencing and risks in [`docs/native-plan.md`](docs/native-plan.md).

See [`docs/brief.md`](docs/brief.md) for the full problem framing and feasibility analysis, and [`docs/submission-notes.md`](docs/submission-notes.md) for the video structure.
