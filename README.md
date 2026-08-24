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
  07-bundle     thumbnails, frames, map tiles -> app/public
```

Every stage caches and resumes independently. Output: **16 posts → 116 entities**, 95 geocoded, **70 with real opening hours and 70 nudge-eligible**.

Photo carousels are reached through a third door: `tiktok.com/embed/v2/<id>` is public, keyless, and returns every slide, where yt-dlp exposes only the cover and the logged-out page has its post data stripped entirely. That one endpoint took five carousels from 5 entities to 66.

## The app

A Capacitor + React app on a real iPhone, over a trigger engine that actually evaluates:
real haversine distance, real opening hours from Google Places, real calendar matching, real
ranking under a hard 2-nudges-per-day cap.

**Native decides proximity only.** A geofence crossing is not a decision, it is an invitation
to decide — the full gate still runs in the engine and usually says no. Even *which* venues
get watched is engine logic, because iOS monitors at most 20 regions and choosing the nearest
nineteen decides what may interrupt you.

Four surfaces: **Library** (the graveyard), **Map** (real GPS over locally baked tiles),
**Nudges** (what fired, and every rejection with its reason), **Debug** (permissions read back
from iOS, armed regions, force-fire). Plus **Add a save** — paste a link, or Share → Cue from
inside TikTok.

```bash
npm run setup      # fetches yt-dlp, installs deps, checks .env
npm run ingest     # runs the pipeline (needs OPENAI_API_KEY + GOOGLE_MAPS_API_KEY)
npm run server     # the on-demand ingest server the phone calls
npm run app:sync   # build the web layer and sync it into Xcode
npm test           # 24 engine tests
```

The repo ships the pipeline's output, tiles and thumbnails, so the app runs **without any API
keys and with no network** — you only need keys to ingest something new. That is also why
there is a server at all: `yt-dlp` and `ffmpeg` cannot run on iOS.

## Repo layout

```
docs/         Brief, native handoff, submission notes, the harvest list
engine/       @cue/engine — the trigger logic, and the 24 tests that guard it
ingest/       7-stage pipeline (Node 24 ESM, no npm dependencies) + server.mjs
data/         Per-post artifacts, entities.json, hydration report
app/          Capacitor + React phone app; app/public/ holds the committed assets
app/ios/      Xcode project and the Share Extension
```

## Status

Design challenge build, mid-pivot.

**Working today:** the pipeline, and the app running on a real iPhone — genuine CoreLocation,
native geofences registered and confirmed by iOS, local notifications, and a Share Extension.
The links were hand-harvested because TikTok's export takes 1–4 days; everything downstream
genuinely ran against those real saves. 2 of the 8 trigger classes are wired, and the UI says
so.

**The web walkthrough was deleted.** It was a six-screen narrative with a simulated location,
and once the app did every beat for real there was no reason to keep a pretend version of the
thing being demonstrated. Its assets moved to `app/public/`.

**Not yet proven:** a real geofence crossing waking a terminated app with the phone in a
pocket. That needs the walk, and it is the beat the whole thing rests on. Architecture,
sequencing and risks in [`docs/native-plan.md`](docs/native-plan.md).

See [`docs/brief.md`](docs/brief.md) for the full problem framing and feasibility analysis, and [`docs/submission-notes.md`](docs/submission-notes.md) for the video structure.
