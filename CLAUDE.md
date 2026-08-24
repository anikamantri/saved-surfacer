# saved-surfacer — working context

## ⚠️ Read this first — the project pivoted on 2026-08-23

Everything described under "Current state" below is **built and working**. But the deliverable
changed: it is no longer a demo website with simulated location. It is a **real iOS app** with
real GPS, real notifications and a real calendar.

The full handoff for that work — architecture, sequencing, permissions, risks — is
**`docs/native-plan.md`**. Read it before starting phase-2 work.

One-line summary of why the architecture is what it is: **web apps cannot do background
geolocation or geofencing on iOS**, so the phone app must be native. Capacitor was chosen
because it keeps the engine, the map, the tiles and all 53 entities unchanged.

## What this is

A personal tool that resurfaces saved social posts at the moment they become useful. Working product name: **Cue**.

**The thesis, in one line:** *my saved folder is a list of promises I made to myself — this is the thing that keeps them.*

The sharp version: **every save is a goal intention that has been stripped of its implementation intention.** Gollwitzer & Sheeran (2006, 94 tests, 8,000+ participants) found that converting "I intend to do Z" into "if X, then Y" produces a medium-to-large effect on follow-through (d = 0.65). The save button captures the goal intention perfectly and discards the if-then entirely — because asking "when will you use this?" would slow down the save the platform is optimizing for.

So the product isn't "help me find my saves." It's **manufacture the missing implementation intention automatically, from content already saved, without asking the user anything.** Not a bookmark manager, not a recommender — an *execution layer for self-directed intent.*

It generalizes because of one bet: **the trigger is inferrable from the content itself.** A café implies proximity; an internship implies a deadline; a workout implies a gym. Travel is the demo, not the product.

Full framing, the trigger taxonomy, and the domain map are in `docs/brief.md` — read it before making product decisions.

## The constraint

**Palantir Product Design Show & Tell, Lens A: "Make it work."** Take a real friction in your own life and build a working version that fixes it.

Deliverables: an unlisted YouTube video (**3 min max**) plus a link to what was built, emailed to designchallenge@palantir.com **within 7 days**. Work is capped at **3 hours** — roughly two remained as of 2026-08-23 20:00 UTC. Recording and editing sit outside that cap.

Three things the prompt rewards that are easy to miss:

- **How AI was used is explicitly scored.** *"We care about how you use AI to get there."* This project has both halves — AI as the product's mechanism, and AI as the build method. Say both.
- **Ambition beats safety.** *"If you reach and it doesn't fully land, show us how you went about it; we'd rather see that than something safe and small."* Don't over-cut.
- **It's a personal-friction brief.** The first video bullet is *"why this problem was worth solving for you."* Lead first-person, not with market framing.

See `docs/submission-notes.md` for the video structure and what to be honest about on camera.

## Decisions already made — don't relitigate

- It's a trigger engine, not a better folder. Each saved item gets a *trigger condition*, not a category.
- **Travel is the primary demo. Gym/calendar is the secondary beat.** The deadline/perishable class is *spoken*, not built — there is no deadline content in the corpus.
- **The demo is now live, on a phone, in Los Angeles (USC).** This supersedes the earlier
  Oslo-centric plan: real GPS at real venues. The corpus has **zero LA entities**, so a
  USC-area cluster must be harvested. Oslo/SF remain the world-map story.
- **Ingest still runs server-side, but now on demand.** Extraction from the real saves genuinely
  ran; what changes is that the pipeline gets an HTTP endpoint so the phone can trigger it live.
  `yt-dlp` and `ffmpeg` cannot run on iOS — that is *why* there is a server, and it is worth
  saying plainly rather than hiding.
- **Capture is answered two ways, and both are real:** the TikTok data export for the backlog,
  and an iOS Share Extension ("Share → Cue") for everything after. Neither is a workaround —
  that pairing is what the product would ship.
- **~~No live API calls during the recording.~~** Reversed deliberately. The nudge is now
  genuinely fired by real location, which is the entire point of the pivot. Risk is managed by
  sequencing (below) and a Debug surface with force-fire, not by faking it.
- The core design constraint is *surface rarely, surface right* — the failure mode is notification fatigue, not bad tech. Hard cap ~2 nudges/day; everything else goes to the map silently.

## Current state — built and working

The repo is **npm workspaces**. The engine has one home and both front-ends import it.

```
docs/brief.md          Problem / opportunity / feasibility — source of truth for product decisions
docs/native-plan.md    The iOS handoff + the build log of what is done and what blocks
docs/submission-notes.md  What the challenge asks for, video structure, what to be honest about
docs/saved-posts.md    The harvest list (14 URLs) — the pipeline's single input
engine/                @cue/engine — triggers, geo, hours, ranking, region-arming + 24 tests
ingest/                7-stage pipeline (Node 24 ESM, zero deps) + server.mjs, the on-demand HTTP door
data/raw/              Per-post artifacts: oEmbed, yt-dlp info, transcript, entities, geocode
data/entities.json     Pipeline output — 16 posts, 116 entities
data/hydration-report.json  Which door reached which post. A deliverable, not a log
app/                   Capacitor + React phone app — Library / Map / Nudges / Debug / Add
app/public/            Committed assets: corpus, thumbnails, frames, ~4k map tiles
app/ios/               Xcode project + Share Extension. SPM, not CocoaPods
```

**The web walkthrough is gone.** `prototype/` was the six-screen narrative with a
simulated location, and the pivot made it redundant: the phone app does all of it for real,
on real GPS. Its `public/` assets — the corpus, thumbnails, frames and tiles — moved to
`app/public/`, which is why the app still runs with no network and no API keys.

Run it: `npm run setup` → `npm run ingest`. Tests: `npm test` (24/24).
The phone: `npm run server` on the Mac, then `npm run app:sync` and open `app/ios` in Xcode.

**Current numbers:** 14 posts → 53 entities (38 places, 7 products, 6 workouts, 2 other) →
38 geocoded, 25 with real opening hours → **26 nudge-eligible**. Clusters: Oslo 13, San
Francisco 12, Bergen 9, Flåm 3, Dolomites 2.

## The pipeline

```
docs/saved-posts.md
  01-hydrate    oEmbed (keyless) + yt-dlp  -> caption, author, date, cover
  02-media      yt-dlp + ffmpeg            -> frames + audio  (Door B: data/manual/<id>/)
  03-transcribe gpt-transcribe             -> transcript
  04-extract    gpt-5.6-terra + vision     -> typed entities, strict JSON schema
  05-geocode    Google Places              -> coords, opening hours, computed confidence
  06-triggers   assign wake-up condition   -> spatial / calendar / 6 more modelled
  07-bundle     thumbnails, frames, tiles  -> app/public
```

Every stage caches and is independently resumable; `--force` recomputes. Stage 05 additionally
caches per *query*, because re-running it after a scoring fix once burned an entire daily
Places quota.

## Verified technical findings

**oEmbed reaches only half the corpus.** Public and keyless, but **HTTP 400 on every `/photo/`
carousel** — 7 of 14 saves. It also truncates: `title` caps at ~73 characters. This is the
headline evidence for "hydration, not intelligence, is the constraint."

**The `/photo/` → `/video/` rewrite is the unlock.** yt-dlp refuses `/photo/` URLs on every
version tested, but accepts the same id under `/video/`. One substitution recovers all seven
carousels. oEmbed refuses both.

**`description`, not `title`, carries the full caption.** Both oEmbed's `title` and yt-dlp's
`title` truncate at ~73 chars. `description` is the only untruncated source, and it is where
the 1112-character Bergen guide (9 entities) actually lives.

**Carousels still lose their later slides, and it is not a yt-dlp bug.** Verified twice:
yt-dlp models a photo post as an audio track plus a cover — a direct dump returns **1 format
(audio mp3) and 2 thumbnails, both the same first slide**. And the web page's data blob is
stripped for unauthenticated requests: `__UNIVERSAL_DATA_FOR_REHYDRATION__` is present but
carries **no `webapp.video-detail` scope at all** and zero `imageURL` occurrences. The slides
sit behind login, so reaching them means authenticating as the user.

**Door B therefore accepts a screen RECORDING, not just screenshots.** Swipe through the
carousel once with the iOS recorder, drop the `.mov` in `data/manual/<id>/`, and stage 02
pulls one frame per slide out by itself — a swipe is a scene change, which is exactly what
ffmpeg's scene detection looks for, with uniform sampling as the fallback when a slow swipe
registers no cut. The capture is manual because the pixels only exist on a screen that has
displayed them; the *extraction* stays automatic.

**`original sound` does NOT mean narration.** Creators upload licensed music under that tag.
Two posts marked `original sound` transcribed to song lyrics (one was Taylor Swift). Gating on
metadata alone feeds lyrics to the extractor, which will invent places from them. The working
fix is to make the model read and judge the transcript — recorded as `transcript_was_useful`,
which came back true for exactly the two posts with real narration.

**Caption thinness should drive frame count, not model size.** For captions under 150 chars the
pipeline samples 14 frames instead of 5. Upgrading `elizlovesfood` to the flagship model
returned *fewer* entities, correctly — it rejected "Iced latte at Hardware Coffee" as not a
place. Denser sampling was the real lever.

**Geocoding confidence must be computed, and must score every candidate.** Taking `hits[0]`
blindly resolved "Flåm Zipline" to *Flåmsbana* — the right answer was second. Also fold accents
on both sides before comparing: Google and the model disagree on NFC/NFD, which silently broke
every Norwegian place name. And token overlap cannot see aliases — "Lago di Braies" and
"Pragser Wildsee" are one lake in two languages and score 0.

**Places quota is per PROJECT, not per key.** A new key on an exhausted project inherits the
same 429. Enabling Places API (New) on a fresh project with billing is the fix.

**A post's identity is its id, not its URL.** The same post is reachable as both `/photo/`
and `/video/`, and the share sheet returns whichever form TikTok feels like. De-duping the
harvest list on the URL string let one post in twice and silently reported a 15-post,
60-entity corpus. `readUrls()` and `addUrl()` both key on the numeric id.

**iOS system fonts do not have the geometric glyphs.** ▦ ◉ ◐ ⚙ rendered as `?` boxes in the
tab bar — invisible on the Mac, glaring on the phone. Icons are inline SVG for that reason.

**`height: 100%` leaves a white band under the tab bar.** The webview's reported height
excludes the home-indicator area. Use `100dvh`, paint `html`/`body` explicitly, and set
Capacitor's `contentInset: "never"` so the app owns its own safe areas.

**Capacitor 8 uses Swift Package Manager, not CocoaPods.** `npx cap add ios` resolved all
five plugins with no Podfile. CocoaPods is not installed here and is not needed.

**The iOS platform component is a separate download from the iOS SDK.** `xcodebuild
-showsdks` lists `iphoneos26.2`, so everything *looks* ready, but the build fails with
"iOS 26.2 is not installed" — device support is a multi-GB component fetched separately via
`xcodebuild -downloadPlatform iOS`.

**TRAP — thumbnails expire.** `thumbnail_url` is signed with `x-expires`, ~48 hours out. Every
thumbnail is downloaded locally at ingest; nothing is hotlinked.

**macOS Tahoe breaks the homebrew yt-dlp.** The `python@3.14` bottle ships a `pyexpat` linked
against an older `libexpat` than it needs, so every extraction dies with "No module named
expat". Reinstalling does not help — the bottle itself carries the bad reference. Use the
standalone yt-dlp binary (`ingest/setup.sh` fetches it), which bundles its own interpreter.

**Why TikTok and not Instagram:** Instagram's export has no clean hydration path, and the Graph
API has no saved-posts endpoint. TikTok's export takes 1–4 days, which is why links are
hand-harvested. Details in `docs/brief.md` §6.

## What the demo must show

The video arc, in order. Beat 5 is the one that has to land — if the nudge works, the idea works.
Most of this now happens **on the phone**; the laptop appears only for the pipeline beat.

| Beat | Device | What happens |
|---|---|---|
| 1. The graveyard | phone | Real imported library, dead reverse-chron grid. Establishes the problem in 5 seconds |
| 2. Capture | phone | In TikTok: Share → Cue. The honest answer to "it should just know from my library" |
| 3. Extraction | **laptop** | The pipeline — caption + frames + transcript → typed entities. Proves it isn't magic |
| 4. The map | phone | New pin lands; zoom out to the world scatter. The "oh" moment and the cold-start answer |
| 5. **The nudge** | phone, walking | Phone in pocket, walk, lock-screen notification. Fired by **real GPS**, with the original thumbnail, creator handle and date saved |
| 6. The card | phone | Provenance plus the explicit reason it fired, and *went / not now / never.* "Never" is the only way the archive shrinks |
| 7. Gym | phone | Real "Gym" calendar event cross-referenced at Lyon Center. Proves the engine generalizes |

Beat 3 is the pipeline itself on the laptop — `npm run ingest`, or the live SSE stream the
phone triggers through **Add a save**. There is no longer a web app to fall back to, which is
deliberate: everything in the arc now happens on the device, for real.

## Out of scope

Auth, a hosted backend, Instagram, X, and Google Maps list export (no public API — own the map
view instead).

**No longer out of scope, as of the pivot:** real geofencing and live ingestion. Both are now
core. Note that this means the earlier "no live API calls during the recording" rule is gone —
see `docs/native-plan.md` for how that risk is managed instead.

## Conventions

- **The phone app is the only front-end.** The web walkthrough was deleted once the native
  app did every beat for real; keeping a simulated version of the thing you are demonstrating
  live is a liability, not a fallback. The app still makes **zero network calls to render** —
  tiles, thumbnails, frames and data are committed under `app/public/` and served locally.
  The only network call is ingesting a NEW post, which needs the Mac.
- **The engine must stay real, and stays in JavaScript.** It does actual haversine distance,
  actual opening-hours evaluation against Places data, actual calendar matching, actual budget
  ranking. If a screen needs something the engine cannot produce, fix the engine — do not
  special-case the screen. `npm test` guards this (**23 tests**, in `engine/`). The native
  layer is now live and the rule held: **native decides proximity only**. A geofence crossing
  is not a decision, it is an *invitation to decide* — the full gate (hours, calendar,
  confidence, budget) still runs in the engine and usually says no. Even *which* venues get
  watched is engine logic (`engine/src/arming.js`), because it decides what may interrupt.
- Secrets go in `.env`, which is gitignored. Never commit an API key.
- **Location is real.** The phone app uses genuine CoreLocation via Capacitor; the old
  laptop-side simulator went with the walkthrough. Debug's force-fire is the filming
  insurance instead, and it skips the walk, not the gate.
- `data/media/` is gitignored (mp4s and audio, regenerable). Tiles, frames and thumbnails
  under `app/public/` **are committed**, so the repo runs without API keys.
- Unwired trigger classes stay visible rather than hidden: the schema carries all 8, the UI
  labels the 6 that aren't wired. That is what lets the video claim generality honestly.
