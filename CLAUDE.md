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
- **Triggers can be set by hand, and the precedence runs strictly one way:**
  `DEFAULTS < the user's settings (ctx.prefs) < a per-entity override`. Widening "nearby" to
  twelve minutes changes what the word means for the whole corpus; setting one gym to thirty
  is a statement about that gym, and the general setting must never overwrite it. Both layers
  are engine inputs — `prefsOf()` and `applyOverride()` — so a hand-set trigger goes THROUGH
  the gate, not around it: a venue switched on by hand is still closed when it is closed,
  still inside the daily cap, and still has to win one of the nineteen geofence slots.

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
app/src/ui/kit.jsx     The Apple controls the app needs: context menu, action sheet, HUD, nav,
                       the status dot, the sheet, the segmented picker and the switch
app/src/ui/nudge.jsx   The per-entity trigger editor — one sheet, opened from three surfaces
app/src/screens/Settings.jsx  The general nudge settings, one level under Nudges
app/public/            Committed assets: corpus, thumbnails, frames, ~4k map tiles
app/ios/               Xcode project + Share Extension. SPM, not CocoaPods
```

**The web walkthrough is gone.** `prototype/` was the six-screen narrative with a
simulated location, and the pivot made it redundant: the phone app does all of it for real,
on real GPS. Its `public/` assets — the corpus, thumbnails, frames and tiles — moved to
`app/public/`, which is why the app still runs with no network and no API keys.

Run it: `npm run setup` → `npm run ingest`. Tests: `npm test` (24/24).
The phone: `npm run server` on the Mac, then `npm run app:sync` and open `app/ios` in Xcode.

**Tests: 38, in `engine/`.** The five newest are the ones that matter to the settings work —
an override goes through the gate rather than around it, a narrow override survives a wide
general setting and vice versa, proximity is refused for anything with no coordinates, and an
empty keyword list is not a rule.

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

`ingest/server.mjs` exposes that same pipeline to the phone, and the library's hold-to-act
menu is wired straight to it — there is no demo-only branch:

```
POST /ingest {url}                  a new save
POST /ingest {url, refresh:'model'} drop the extraction cache, re-run the vision call
POST /ingest {url, refresh:'all'}   drop everything, re-hydrate from TikTok
POST /delete {id}                   remove the post, its artifacts and its line, then rebundle
```

Re-running works by *deleting a prefix of the cache chain* rather than by a force flag:
every stage skips when its own output exists, so removing `<id>.entities.json` is what makes
stage 04 do real work again. Stage 05 then notices its geo.json is older than the entities
and re-geocodes underneath, hitting the per-query cache rather than the Places quota.

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

**The harvest list silently ate a shared post.** `docs/saved-posts.md` did not end in a
newline, so `addUrl` appended the new URL onto the *end of the last line* — and `readUrls`
matched only the first URL per line, so the post was written to disk and never ingested. A
save shared from the phone simply did not exist, with no error anywhere. Both halves are
fixed: the writer starts a line when the file needs one, and the reader scans every URL on
a line so a hand-edit cannot reintroduce it. That is how the corpus went from 17 to 18 posts
without harvesting anything new.

**`backdrop-filter` also wins fights it should lose.** WebKit promotes a blurred surface to
its own compositing layer, and a promoted layer paints over a z-indexed overlay that lives
inside the scrolling `main` — whatever the z-index says. The delete confirmation's Cancel
button vanished behind the floating tab capsule *on device* while looking perfect on the Mac.
Two things fix it together, and both are needed: every overlay renders through
`createPortal` into `<body>` so it is outside `.app` entirely, and `body.overlay-open` drops
the capsule's blur while one is up, so there is no promoted layer left to jump the queue.

**`backdrop-filter` is dead under an animated ancestor.** The action sheet's frosted panels
rendered as plain transparency over the photos below, while the identical treatment on the
context menu worked. The sheet animates in, and an animated ancestor isolates the backdrop
root — so the filter had nothing to sample. Anything that slides in gets an opaque fill
instead; only static overlays can rely on the blur.

**A floating bar changes the map's height, and that is what broke it.** With the tab bar in
normal flow, `.body` was `100dvh − barHeight` and the map ended above it. Making the bar
`position: absolute` gave `.body` the full viewport — which is the point, the glass has to have
something to sample — and the map now extends *underneath* the bar. Everything below follows
from that one change, and none of it was visible on the Mac.

**The map tab's layer order is a product decision: the map is the background, the navigation
and the status float over it, and the pin card floats over those.** It took five rounds to make
that stand up on device, and the surviving stack rests on two guarantees the spec does not let
an engine reinterpret — not on z-index, which the compositor weighs against its own layers, and
not on `overflow: hidden`, which a composited descendant escapes:

  1. `.map` has `contain: paint` — Leaflet cannot draw one pixel outside its box and its whole
     subtree is one stacking context. This is what actually stopped the bar being covered.
  2. The bar is `position: fixed` on the viewport with its own compositing layer
     (`translateZ(0)` on the capsule) — never again the non-composited party in a paint fight.
  3. While any overlay is up, the bar fully stands down (`body.overlay-open`): no blur, no
     transform, `z-index: 1`. A portalled sheet must beat it without a fight.

An in-flow bar (`position: static`, a flex row after `.body`) was tried between rounds and
works unconditionally — it overlaps nothing, so nothing can be painted in the wrong order. It
is the documented fallback in `styles.css` if some future WebKit still misbehaves; it costs the
full-bleed map, which is why it is not the shipping state.

**The tab bar was never being painted over by the map's z-index. It was being painted over by
pixels drawn OUTSIDE the map's box that nothing was clipping.** Four rounds of z-index and
compositing work missed this because the numbers were never the problem. Leaflet deliberately
draws past the viewport — a tile grid rounded up to 256px cells plus `keepBuffer: 3`, and a
canvas renderer `padding` — measured at **127px of overhang past the container's bottom edge**,
which is exactly the strip the tab bar occupies. `.leaflet-container` has `overflow: hidden`,
which is enough on Chromium and is not on WebKit: Leaflet positions the map pane with
`translate3d` whenever `Browser.any3d` is true — always, on a phone — and a 3d-transformed
element is composited, and **a composited descendant escapes an ancestor's overflow clip**.
Removing `will-change: transform` does not help, because the transform Leaflet sets itself is
what promotes it.

Three changes, and the first is the one that matters:

1. **`contain: paint` on `.map`.** A promise the engine must honour that no descendant paints
   outside the box, rather than an overflow rule it may optimise around. Unlike
   `transform: translateZ(0)` — tried here, made it worse — it constrains a subtree instead of
   creating a layer for one.
2. **`L.canvas({ padding: 0 })`** so the vector canvas is sized to its box. Verified: the canvas
   went from 157px of overhang to 0.

Verify it with paint, not layout — `getBoundingClientRect` still reports the un-clipped rect, so
a layout-based test reads as a failure when containment is working perfectly. `elementFromPoint`
in the bar's strip is the check that means something.

**The rule that also governs layering here: on WebKit, a promoted layer beats z-index.**
Three separate symptoms turned out to be one cause, and it is worth stating once. Anything
composited — `will-change: transform`, `backdrop-filter`, an active animation — paints over a
NON-composited sibling whatever the z-indexes say, and it also escapes an ancestor's
`overflow: hidden`. The map is full of such layers, so it produced all three: a tab bar that
was invisible and untappable, a bar that flickered back on zoom as the tree recomposited, and
finally — with the trigger editor open — the map pane painting straight *through* a portalled
sheet as an unclipped rectangle in the middle of the screen, the armed summary floating on top
of it.

The answer is NOT to keep raising numbers. It is, in order of preference:
1. **Portal it out of `.app`.** Every overlay goes to `<body>` (`Overlay` in `kit.jsx`).
2. **De-promote the competition while it is up.** `body.overlay-open` drops the capsule's
   `backdrop-filter` and the map pane's `will-change`. The promotion only buys a smooth pan,
   and nothing is panning while a sheet covers the map.
3. **Hide it rather than out-number it.** `.map-status` and `.map-card` are `display: none`
   under `overlay-open`. Not drawing something is a rule no compositor gets to reinterpret.

`overlay-open` is refcounted, because overlays stack — the pin card opens the trigger editor on
top of itself, and the editor closing must not hand the map its layers back while the card is
still up.

**`transform: translateZ(0)` on the map container is the tempting wrong answer.** It was tried,
to make the map "win properly", and it is what produced the escaped-canvas screenshot: one
composited layer for the whole Leaflet subtree, which then ignored `.leaflet-container`'s own
`overflow: hidden`. `isolation: isolate` is a paint rule the engine honours; promotion is a hint
it interprets.

**Leaflet's canvas renderer did not hit-test at all — do it yourself.** Markers painted in
exactly the right pixels (verified by projecting the entities by hand and comparing against the
canvas), and `.on('click')` on a `circleMarker` never fired: every tap produced the map's own
click and nothing else. Rather than debug a renderer chosen for its *drawing*, the map's click
handler now projects every entity to the container and takes the nearest within `TAP_SLOP_PX`.
That is a few hundred multiplications per tap, it is deterministic, and it fixes a second
problem for free: an eligible pin is drawn at radius 6, so Leaflet's own hit area would have
been a 12px target where iOS asks for 44. Decoupling the target from the dot is what lets the
dot stay small enough that a city does not become a blob.

**Informational overlays must be `pointer-events: none`.** The armed summary sits across the
bottom fifth of the map and was silently eating every tap on a pin behind it. The symptom is
"some pins don't work", which reads as a broken hit-test rather than as a transparent box.

**Three full-width blurs were competing for the same 16ms.** The status pill and the armed card
already dropped their `backdrop-filter` while the map moved. The tab capsule is not inside the
map's subtree, so it kept blurring — and being full-width and floating over live tiles, it was
the most expensive of the three. The moving flag now goes on `<html>` as well as on the wrapper.

**A `ref` is not a guard against something the clipboard remembers.** The share extension leaves
the link on the pasteboard because iOS will not let it foreground its container, and the
pasteboard holds it indefinitely. The "have I seen this link" guard was a `useRef`, which every
cold launch resets — so every launch found the same URL, decided it was new, and threw the user
out of the library into a capture screen that immediately started spending a vision call on a
post already in the corpus. Two guards now, both needed: the link is recorded in localStorage so
it survives termination, and anything whose numeric id is already in the corpus is skipped
regardless of what the clipboard says.

**Leaflet's z-indexes are in the same stacking context as yours.** The moment the tab bar
started FLOATING over the content rather than sitting beside it, the map painted straight over
it: Leaflet's panes claim 200–700 and its controls 800+, so a bar at `z-index: 60` renders
perfectly and simply stops receiving taps on one screen. Confirmed by Playwright, which
reported `<canvas class="leaflet-zoom-animated"> intercepts pointer events`. The app's own
overlays are now numbered above that range and the whole ladder is written out at the bottom
of `styles.css` — 800 map overlays, 810 pin card, 850 the capture button, 900 the tab capsule,
1000 press-and-hold, 1100 sheets, 1200 the HUD. Scoping `.body` into its own stacking context
would have fixed the bar and broken every modal inside it, which is the tempting wrong answer.
`isolation: isolate` on the inner Leaflet div is the belt to that braces: it contains Leaflet's
whole range without touching the map's own React overlays, which are siblings one level up.

**Selection must not be a dependency of the marker layer.** It goes through a ref
(`select.current`, `entitiesRef`) rather than through the effect's dependency array, and the
selection ring lives on its own layer group. Binding it directly would have made the corpus
layer depend on it — rebuilding 124 markers every time someone tapped a pin, which is exactly
the teardown the rest of that file exists to avoid.

**Five chips do not fit one row at 393pt.** The walk-radius picker wrapped to two rows with
[3, 6, 12, 20, 30] and reads as one control at [3, 6, 15, 30]. Worth checking on the device
width rather than the Mac, like everything else in this file.

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

**The tile cache is keyed by existence, so it cannot see a theme change.** 439 tiles of the
old dark basemap survived the light re-bake — "skip what exists" kept them — and showed up on
device as patches of black map at exactly the zooms and boxes an earlier corpus had covered,
indistinguishable from a rendering glitch. `ingest/lib/tiles.mjs` now writes a `.basemap`
style marker next to the tiles and ignores the whole cache when the marker does not match.
The 439 were re-fetched; a canvas scan of all 4,560 tiles now finds zero below 120/255
brightness. Missing tiles render a 1x1 paper-coloured data URI (`errorTileUrl`), never a
broken image.

**Playwright's fixed clock stalls Leaflet's tile fade.** `page.clock.setFixedTime` pins
`Date.now`, and Leaflet animates tile opacity against it — so tiles load fine and stay at
opacity 0, which looks exactly like the tile bug you are hunting. Freeze the clock for
engine-gate tests (opening hours make evening runs go quiet), but never trust a map
screenshot taken under it.

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
- **The design system is Apple's, light appearance, and it is not decoration.** System
  colours (`systemBackground`, `systemGroupedBackground`, `label`/`secondaryLabel`,
  `separator`), the HIG type scale, 44pt targets, grouped inset lists, translucent bars.
  The reason is that a nudge arrives on the *lock screen*: the card that opens from it and
  the notification that summoned it should not look like two products. The accent is the app
  icon's blue and it is **two tokens, not one** — `--tint` #3FA9F5 for fills, dots and
  selected states, `--tint-ink` #0A78CC for anything that is text, because the icon blue
  fails contrast at 13px on white. The app is pinned to Light in `Info.plist`; without that,
  a phone in Dark Mode paints white status-bar text over a white navigation bar.
- **The library has a large title and two ways to capture.** ~~No header, deliberately.~~
  Reversed: the platform's own saved folder has one, and a screen whose only way in was a
  floating circle hid the app's single input behind a guess. So it is a plain iOS large title
  with capture in the trailing corner, plus the floating button — the one that survives a
  scroll. The runtime status stays on the map, next to the dot it describes.
- **The tab bar is a floating glass capsule, not a full-width strip.** Content scrolls under
  it, which is what the blur has to sample; the selection is one pill that slides rather than
  four colours changing independently. It is a layer of the phone rather than a band of
  chrome, and on the map — where it sits over live tiles — that is the whole difference.
- **Three states, one vocabulary, everywhere: green / amber / red.** Green can interrupt you,
  amber is on the map and stays quiet, red cannot nudge at all. `nudgeState()` in `data.js`
  is the only place that decides, and it asks the ENGINE rather than reading `nudge_eligible`
  off the corpus — a hand-set trigger changes the answer, and a dot that disagrees with what
  the app will actually do is worse than no dot. The amber state is the important one: most
  of the corpus is findable and silent, and until this it had no name.
- **A nudge on this screen is drawn as a notification.** Same app icon, same small caps, same
  time on the trailing edge, same thumbnail. The card here and the banner on the lock screen
  are the same object or the app is two products. The verdict lives inside it and stays
  editable afterwards, because "went" is what stops something coming back today.
- **Navigation is a journey, not a set of hard-coded destinations.** App.jsx keeps a small
  history stack; every deliberate move goes through `navigate()` and every back button calls
  `goBack()`. The Detail page's back button used to say "Library" unconditionally, which was a
  lie whenever a map pin's "Full page" had opened it — the label now names where back actually
  goes. Re-tapping the current tab pops to its root, as iOS does. The one trap: a screen's own
  `setSettings(true)`-style shortcut bypasses the stack and silently breaks every back button
  after it — all mutations of tab/post/settings must go through navigate().
- **The pin card's drag is CONTINUOUS, and the peek is a position, not a layout.** The card
  tracks the finger 1:1 and settles to the nearest detent from wherever it was released. That
  works because the peek is the same card *translated down* until only its head shows — every
  position between detents is defined — never a variant with sections `display: none`d. Detents
  are resting offsets: 0 (card), H−P (peek, measured per entity), H (gone); a hard throw up
  grows the card into the post's full page (`height` animates from a fixed inline start —
  `auto` cannot animate). The gesture lives on the grabber strip only (`touch-action: none` or
  iOS claims it for scrolling); the card body scrolls.
- **TRAP — `animation-fill-mode: both` owns the animated property forever.** The card's
  entrance (`sheet-up … both`) kept applying `translateY(0)` after it finished, and animations
  beat inline styles in the cascade — so the drag moved the card in state only, never on
  screen, while every class and handler looked correct. `backwards` releases the property at
  the animation's end. And the fix must go in the `animation:` shorthand itself: a longhand
  `animation-fill-mode` above the shorthand is silently re-overridden by it.
- **Verdicts toggle.** Tapping "I went" or "never" on an entity that already carries that
  verdict takes it back — a verdict you cannot undo turns an honest signal into something
  people avoid giving. Entering OR leaving a retiring state re-arms (both move a geofence
  slot). Retired places stay on the map but draw GREY — a memory, not a prospect.
- **"Went" retires a save, and that is the second way the archive shrinks.** "never" is *I do
  not want this*; "went" is *I did this*. They mean opposite things about the content and the
  same thing about the future — a café you had coffee at on Tuesday must not interrupt you on
  Wednesday, or the product fails at its own premise. Both free a geofence slot; both are
  checked in the engine before the trigger is even read, so a hand-set trigger cannot resurrect
  somewhere you have been. "not now" is a deferral and is deliberately not one of them.
- **The pin card is a bottom sheet OVER the tab bar, not above it.** Two floating things stacked
  in the same corner is a pile rather than a layer, and while you are reading about one place,
  switching tabs is not the next thing you want. Closing it is what brings the bar back, which
  is why the X sits where your thumb already is.
- **Walking minutes are only information at walking range.** Past ten of them the card switches
  to driving — a car glyph, a drive time, and `dirflg=d` so Maps opens the right mode. Past 300km
  it says "too far to route" rather than inventing a 200-hour drive. Note this is NOT the nudge
  threshold, which stays at six minutes: a notification is an interruption and has to earn it
  with real proximity, whereas this is what the app tells you once *you* have asked.
- **Capture shows the pipeline as a PLAN, not a log.** All seven stages render from the first
  moment — done, running, still to come — joined by a rail; the running stage shows one line of
  what it is for plus its own live log tail, and a finished stage folds its lines into a
  disclosure with its duration. The mechanism is in `applyIngestEvent` (App.jsx): the server
  tees its console into the SSE stream without saying which stage produced a line, but it
  brackets every stage with running/done events, so each line is attributed to whichever stage
  is running when it arrives. `PLAN` in Add.jsx is the display-side stage list; its names are
  the join key to the server's stage events, and an unknown stage still renders (appended), so
  server drift degrades to ugly rather than broken. A failed run leaves the dead stage wearing
  a red cross with its last lines, and the stages after it honestly pending.
- **Destructive and expensive actions live behind press-and-hold, and all of them are real.**
  Re-run the model, re-hydrate, delete. Delete needs the Mac and says so — a phone-only
  deletion would be undone by the next sync, which is worse than refusing. "Never" on a nudge
  card silences one entity; delete removes the save. They are different promises and the UI
  must not blur them.
- **The engine must stay real, and stays in JavaScript.** It does actual haversine distance,
  actual opening-hours evaluation against Places data, actual calendar matching, actual budget
  ranking, and now the settings and the hand-set triggers too. If a screen needs something the
  engine cannot produce, fix the engine — do not special-case the screen. `npm test` guards
  this (**38 tests**, in `engine/`). The native
  layer is now live and the rule held: **native decides proximity only**. A geofence crossing
  is not a decision, it is an *invitation to decide* — the full gate (hours, calendar,
  confidence, budget) still runs in the engine and usually says no. Even *which* venues get
  watched is engine logic (`engine/src/arming.js`), because it decides what may interrupt.
- Secrets go in `.env`, which is gitignored. Never commit an API key.
- **Location is real.** The phone app uses genuine CoreLocation via Capacitor; the old
  laptop-side simulator went with the walkthrough. Debug's force-fire is the filming
  insurance instead, and it skips the walk, not the gate.
- `data/media/` is gitignored (mp4s and audio, regenerable). Tiles, frames and thumbnails
  under `app/public/` **are committed**, so the repo runs without API keys. The basemap is
  CartoDB **Positron** (`light_all`), re-baked when the app went light — a dark map under a
  light app was the one screen that still looked like a different product, and Positron has
  almost no colour of its own, so the only saturated things on it are the entity dots and the
  geofence radii.
- Unwired trigger classes stay visible rather than hidden: the schema carries all 8, the UI
  labels the 6 that aren't wired. That is what lets the video claim generality honestly.
