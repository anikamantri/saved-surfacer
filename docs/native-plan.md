# Cue — native iOS handoff

*Written 2026-08-23, at the pivot from simulated demo to real app. Read `CLAUDE.md` and `docs/brief.md` first; this covers what changed and what to do next.*

---

## 1. Where things stand

The pipeline and the web prototype are **built and working**. Nothing below is planned-but-unbuilt unless it says so.

```
engine/src/             trigger engine + 24 passing tests
ingest/                 7-stage pipeline, Node 24 ESM, zero npm dependencies
data/entities.json      14 posts → 53 entities
data/hydration-report.json   which ingest door reached which post
app/                    Capacitor + React, runs fully offline on the phone
```

| Metric | Value |
|---|---|
| Posts → entities | 14 → **53** (38 places, 7 products, 6 workouts, 2 other) |
| Geocoded | 38 / 38 via Google Places |
| With real opening hours | **25** |
| Nudge-eligible | **26** — the other 27 live silently on the map |
| Clusters | Oslo 13 · San Francisco 12 · Bergen 9 · Flåm 3 · Dolomites 2 |
| Cached full re-run | **1.8 s, zero API calls** |
| Engine tests | 12 / 12 pass |
| External runtime requests | **0** — verified by Chrome net-log; runs with WiFi off |

Commands: `npm run setup` · `npm run ingest` · `npm run dev` · `npm test`

### Open items

- **Nothing is committed.** ~134 files plus 21 MB of tiles are untracked. `.env` is correctly ignored; `.env.example` holds placeholders only.
- **Both API keys were pasted into chat — rotate them before submitting.**
- Three carousel posts still need Door B screenshots (see §2).

---

## 2. Hard-won findings — do not re-derive these

Each cost real debugging time.

**oEmbed reaches only half the corpus.** Public and keyless, but **HTTP 400 on every `/photo/` carousel** — 7 of 14 saves. It also truncates `title` at ~73 chars. This is the headline evidence for the brief's claim that ingest is a hydration problem, not an intelligence one.

**`/photo/` → `/video/` is the unlock.** yt-dlp refuses `/photo/` URLs on every version tested but accepts the same id under `/video/`. One substitution recovers all seven carousels. oEmbed refuses both forms.

**`description`, not `title`, carries the full caption.** Both oEmbed's and yt-dlp's `title` truncate. The 1112-char Bergen guide that yielded 9 entities exists only in `description`.

**Carousels still lose their later slides.** yt-dlp exposes caption, audio and the *first* image only. `@planetsecretw`, `@jassetgo` and `@ebbas.diary` have their payload on later slides and under-extracted at 1 entity each. Drop screenshots into `data/manual/<post-id>/` and re-run — the pipeline picks them up as extra frames. Worth roughly 10 more entities.

**`original sound` does NOT mean narration.** Creators upload licensed music under that tag. Two posts marked `original sound` transcribed to song lyrics (one was Taylor Swift). Gating on metadata alone feeds lyrics to the extractor, which will invent places from them. The fix is to make the model read and judge the transcript — recorded as `transcript_was_useful`, true for exactly the two posts with genuine narration.

**Caption thinness should drive frame count, not model size.** Under 150 chars the pipeline samples 14 frames instead of 5. Upgrading `@elizlovesfood` to the flagship returned *fewer* entities — correctly, rejecting "Iced latte at Hardware Coffee" as not a place. Density was the lever, not model tier.

**Geocoding must score every candidate, not take `hits[0]`.** That bug resolved "Flåm Zipline" to *Flåmsbana*; the right answer was second. Fold accents on **both** sides — Google and the model disagree on NFC/NFD, which silently broke every Norwegian place name. And token overlap cannot see aliases: "Lago di Braies" and "Pragser Wildsee" are one lake in two languages and score 0.

**A silent fallback once poisoned the demo's hero venue.** A transient Places error re-cached a Nominatim result for Havens Café, losing its opening hours, and nothing in the log admitted it. Fallbacks now log loudly; Nominatim results are provisional and re-queried on later runs, Places results are final.

**Places quota is per PROJECT, not per key.** A new key on an exhausted project inherits the same 429. Stage 05 caches per *query* precisely because re-running after a scoring fix once burned a whole day's quota.

**macOS Tahoe breaks the homebrew yt-dlp.** The `python@3.14` bottle ships `pyexpat` linked against too-old `libexpat`; every extraction dies with "No module named expat". Reinstalling does not help — the bottle itself carries the bad reference. `ingest/setup.sh` fetches the standalone binary, which bundles its own interpreter.

**Thumbnails expire.** `thumbnail_url` is signed with `x-expires`, ~48 h out. Everything is downloaded locally at ingest; nothing is hotlinked.

---

## 3. The pivot

### Why native

**Web apps cannot do background geolocation or geofencing on iOS.** The W3C Geofencing API was abandoned; Safari has no background location. A PWA gets foreground GPS and — only if home-screen installed — notifications. Nothing more. So *"walk past a café with the phone in my pocket and get a notification"* **requires native**.

**Chosen: Capacitor.** It wraps the existing React app in a native shell, so the engine, the map, the tiles and all 53 entities carry over unchanged, while `CLLocationManager` and `EventKit` run natively underneath. A SwiftUI rewrite would be marginally better and would cost everything already built.

### Decisions taken with Anika

- **iPhone, plugged into this Mac.** Xcode 26.2 and Swift 6.2.3 are installed. No simulator runtimes and **no signing identity yet** — a physical device needs no simulator, but does need an Apple ID signed into Xcode (free provisioning, 7-day certs).
- **Demo location: USC campus, Los Angeles.** The corpus has **zero** LA entities.
- **Calendar: real EventKit**, read-only.
- **Networking: Tailscale.** Campus WiFi very likely isolates clients, so plain LAN is unreliable.
- **Share Extension: yes.**
- **TikTok data export requested** (JSON, 1–4 days).

### The two capture answers

Anika's tension — *"ideally it should just know from my saved library"* — resolves two ways:

- **The export** is the backlog: years of saves bulk-imported, guaranteed by data-portability law.
- **The share sheet** is everything from now on: one already-habitual gesture, within ToS, carrying the caption with it.

Neither is a workaround. That pairing is what the product would actually ship.

### Video arc

| Beat | Device | What happens |
|---|---|---|
| 1. The graveyard | phone | Real imported library, dead reverse-chron grid |
| 2. Capture | phone | In TikTok: Share → Cue |
| 3. Extraction | **laptop** | The pipeline — caption + frames + transcript → typed entities |
| 4. The map | phone | New pin lands; zoom out to the world scatter |
| 5. **The nudge** | phone, walking | Phone in pocket, walk, lock-screen notification |
| 6. The card | phone | Provenance, why it fired, went / not now / never |
| 7. Gym | phone | Lyon Center with a real "Gym" calendar event |

Beat 5 is the whole pitch.

---

## 4. Target architecture

npm workspaces, so the engine has one home and both front-ends import it.

```
package.json     workspaces: ["engine", "ingest", "prototype", "app"]
engine/          @cue/engine — triggers, geo, hours, ranking + the 12 tests
                 (moved from prototype/src/engine/, logic unchanged)
ingest/          the 7-stage pipeline, unchanged + NEW server.mjs
(prototype/ deleted — the phone app does every beat for real; its committed
                 assets moved to app/public/)
app/             NEW Capacitor + React product app — the phone
```

### `ingest/server.mjs`

Imports the existing stages and runs them for a single post. No pipeline rewrite.

| Route | Purpose |
|---|---|
| `POST /ingest` | `{ url }` → resolve share link, run stages, **stream progress (SSE)**, return entities |
| `GET /entities` | full corpus, for launch sync |
| `GET /health` | so the app can show whether the Mac is reachable |

- **Share links must be resolved first.** TikTok's share sheet gives `tiktok.com/t/ZP8abc…`, not the canonical URL. Stage 01 needs a redirect-follow *before* the `/photo/` → `/video/` rewrite can apply.
- **Progress must stream.** A post takes ~20–40 s (yt-dlp download plus the vision call). Watching stages tick over is better on camera than a spinner.

### `app/` — four surfaces

The six narrative beats become a product:

| Surface | Contents |
|---|---|
| **Library** | Graveyard grid; tap a post → extraction detail (caption, frames, transcript, entities) |
| **Map** | World map, real GPS dot, geofence radii around armed venues |
| **Nudges** | Live candidates, fired history, the card with went / not now / never |
| **Debug** | Permission states, armed geofences, engine trace, force-fire, the existing simulator as fallback |

Plugins: `@capacitor/local-notifications` (official; local notifications need no paid account) · `@capgo/background-geolocation` (background location **and native geofence enter/exit**, no licence) · `@capacitor/app` (`appUrlOpen`) · EventKit via `@ebarooni/capacitor-calendar` or a ~50-line custom plugin.

### The background problem — the crux

**Capacitor suspends JavaScript when the app is backgrounded**, so the JS engine cannot evaluate with the phone in a pocket. Two layers:

1. **Native geofences (the production shape).** Register `CLCircularRegion`s for nudge-eligible venues. iOS wakes the app on entry — even after termination — and the JS engine then runs the *full* gate: opening hours, calendar, confidence, daily budget. **Native decides only proximity; every other rule stays in the tested engine.**
2. **Continuous background location (the filming guarantee).** An opt-in "demo mode" enabling the `location` background mode, keeping the app alive and JS running through a walk. Battery-hungry, deliberately opt-in, and it means the recording does not depend on geofence wake-up timing.

**iOS monitors only 20 regions at once.** `docs/brief.md` §6 already flags this as a real constraint — so implement the answer it proposed: keep the 20 nearest nudge-eligible venues armed, re-arming as the user moves, with a coarse city-level trigger above. A limitation *named in the writeup* becomes shipped behaviour.

### Share Extension

A native target alongside the Capacitor app. It receives the URL and opens the container app via `cue://share?url=<encoded>`.

**It deliberately avoids App Groups**, which are restricted under free provisioning — the URL scheme carries the payload instead. The app catches it with `App.addListener('appUrlOpen')`, POSTs to the server, and shows ingest progress. Extensions get very little runtime, so it hands off immediately and does no work itself.

*Risk:* if free provisioning fights the second target, a paid Apple Developer account ($99/yr) resolves it. Built last, so nothing else depends on it.

### Permissions — each one can derail a take

Needs a first-run flow plus a Debug readout:

- `NSLocationWhenInUseUsageDescription` + `NSLocationAlwaysAndWhenInUseUsageDescription` — iOS requires **staged** escalation: When-In-Use first, *then* Always. Asking for Always up front is silently denied.
- `NSCalendarsFullAccessUsageDescription` — iOS 17+ renamed this; the old key is ignored.
- `UIBackgroundModes: [location]`
- Notification authorisation at first launch.

---

## 5. Build log — what is now done

*Updated 2026-08-23, after the first native build session.*

**Phase 1 — complete.** npm workspaces are live: `engine/`, `ingest/`, `prototype/`, `app/`.
The engine moved out of the prototype unchanged and still passes; `prototype/` imports
`@cue/engine` and builds. `ingest/server.mjs` exists and was smoke-tested end to end —
`/health`, `/entities`, `/media/*` and an SSE `/ingest` that streams the real stage logs.

**Phase 2 — complete and RUNNING.** `app/` is a Capacitor + React app with all four
surfaces. It compiles for **real arm64 hardware** (`BUILD SUCCEEDED`, unsigned) and runs in
the iOS 26.3 simulator, where all four surfaces were verified by screenshot:

- **Library** — 14 posts, real thumbnails, reverse-chron.
- **Map** — offline tiles render, the GPS dot tracks, geofence radii draw, and the overlay
  reads *"19 armed · nearest Havens Café"*.
- **Nudges** — the engine genuinely evaluates: *"Havens Café — closed right now"* was
  correct for Oslo at that hour, alongside 52 other real rejections.
- **Debug** — permissions read back from iOS (location granted, always granted), position
  `native/continuous ±5m`, and **"armed by us: 19 + perimeter / monitored by iOS: 20"** —
  iOS confirming the region cap from its own side.

**Phase 3/4 — mechanism proven, the walk still unverified.** Geofence registration works and
iOS reports 20 monitored regions. What cannot be tested without hardware is the thing §9.4
describes: a real region crossing waking a terminated app. EventKit is wired but was not
exercised — the simulator has no calendar.

**Phase 5 — not started**, deliberately: it is last so nothing depends on it.

### Bugs the simulator caught — all of which would have shown on camera

**Tab icons rendered as `?` boxes.** The obvious glyphs (▦ ◉ ◐ ⚙) are not in the iOS system
font. Invisible on the Mac, glaring on the phone. They are inline SVG now, which has no
fallback path to get wrong.

**A white band sat under the tab bar.** The webview's reported height excludes the
home-indicator area, so `height: 100%` left a gap. Fixed with `100dvh`, an explicit dark
background on `html`/`body`, and `contentInset: never` so the app owns its own safe areas.

**Distant venues were rejected in walking minutes.** "Kaigaten Deli — 4672 min away" and
"Ebiko — 8333483m" are correct and unreadable. Walking minutes are the right unit only at
walking range; past an hour the engine now says "302.7 km away". This lives in the engine
(`fmtDistance`) and is tested, because it is what the rejection log says out loud.

### What this session found

**Capacitor 8 uses Swift Package Manager, not CocoaPods.** `npx cap add ios` resolved all
five plugins with no Podfile and no `pod install`. CocoaPods is not installed on this Mac
and does not need to be — one whole class of setup risk simply is not there.

**The iOS *platform component* is a separate download from the iOS SDK.** `xcodebuild
-showsdks` lists `iphoneos26.2`, which looks like everything is ready, but building fails
with *"iOS 26.2 is not installed"* — device support is a multi-GB component fetched
separately (`xcodebuild -downloadPlatform iOS`). The handoff's claim that "a physical device
needs no simulator" is true but incomplete: it still needs this.

**The share sheet can hand back a post you already have, in the other form.** A post
harvested as `/video/` came back from `resolveShareUrl` as `/photo/`, and de-duping the
harvest list on the URL string missed it — the corpus silently reported 15 posts and 60
entities. **A post's identity is its numeric id, not its URL.** `readUrls()` and `addUrl()`
now both key on the id.

**Freshly-ingested posts have no media on the phone.** The app bakes in every thumbnail at
build time, but a post shared thirty seconds ago is by definition not in that bundle — and a
nudge card with a blank thumbnail loses exactly the provenance that separates it from an ad.
The server now serves `/media/thumbnails/...` and the app falls back to it for unbaked posts
only, so the offline guarantee is untouched.

**The 20-region cap is engine logic, not native plumbing.** Choosing *which* nineteen venues
to watch decides what may interrupt someone, so by the project's own convention it belongs
where `npm test` can see it. It lives in `engine/src/arming.js` and is tested against the
real corpus — including that the corpus genuinely exceeds the cap, which a fixture would
have hidden. Tests are now **21/21** (the original 12, unchanged, plus 9).

### Blockers — all environment, none code

| Blocker | Fix | Owner |
|---|---|---|
| ~~iOS platform component missing~~ | ✅ **done** — `xcodebuild -downloadPlatform iOS`. Note it installs the iOS 26.3 *simulator* runtime, which is also what unblocks the `Any iOS Device` destination | done |
| No signing identity (`0 valid identities`) | Xcode → Settings → Accounts → add Apple ID; free personal team | **Anika** |
| No iPhone connected | plug in, trust the Mac | **Anika** |
| Tailscale not installed on the Mac | install on Mac + iPhone, then set the host in Debug | **Anika** |
| Zero LA entities in the corpus | harvest ~6 USC-area saves into `docs/saved-posts.md` | **Anika** |

---

## 6. Sequencing

Ordered so something is always filmable and the riskiest work is last.

| # | Phase | Outcome |
|---|---|---|
| 1 | Workspaces + server + LA content | Pipeline reachable over Tailscale; USC cluster geocoded with real hours |
| 2 | Capacitor app on device | Library, map, real foreground GPS |
| 3 | **Notifications + background + geofences** | **The hero.** Phone in pocket, walk, notification fires |
| 4 | EventKit + gym | Real "Gym" event cross-referenced at Lyon Center |
| 5 | Share Extension | Share → Cue from inside TikTok |
| 6 | Export importer *(only if it arrives)* | Bulk backlog import |

If phase 5 fights Xcode signing, everything else is already recorded.

---

## 7. Anika's parallel tasks

1. **Request the TikTok export now** — Settings → Account → Download your data → **JSON** (not TXT). 1–4 days; it is what makes the backlog beat real.
2. **Harvest ~6 USC-area saves** into `docs/saved-posts.md`: tightly clustered and walkable from the filming spot, **naming actual venues** ("aesthetic LA day" posts geocode to nothing), open at filming time. A couple of caption-thin ones are useful — they re-prove the multimodal path on fresh data. **Hold back the post to be shared live on camera.**
3. **Sign into Apple ID in Xcode** — Settings → Accounts. A free personal team is enough.
4. **Install Tailscale** on both Mac and iPhone.
5. **Rotate both API keys** before submitting.

---

## 8. Files to touch

| Path | Change |
|---|---|
| `package.json` | npm workspaces |
| `engine/` | moved from `prototype/src/engine/`; logic unchanged, keeps its 12 tests |
| `ingest/server.mjs` | **new** — SSE progress, `/ingest`, `/entities`, `/health` |
| `ingest/01-hydrate.mjs` | resolve share short-links before the `/photo/`→`/video/` rewrite |
| `ingest/lib/config.mjs` | server port, Tailscale host |
| `app/` | **new** — Capacitor + React, four surfaces, native plugins |
| `app/ios/` | Xcode project, Info.plist keys, Share Extension target |
| ~~`prototype/`~~ | **deleted** — assets moved to `app/public/` |
| `CLAUDE.md`, `README.md`, `docs/brief.md` §6, `docs/submission-notes.md` | architecture change, the iOS background-location finding, revised video arc |

---

## 9. Verification

1. **Engine unchanged** — ✅ `npm test` passes **23/23** after the workspace move (the original 12 are untouched; 11 cover the new region-cap and distance-format logic). This is the one thing that must not regress.
2. **Server** — ✅ `/health`, `/entities` and `/media/*` verified; `POST /ingest` streams real stage progress and returns entities. A *short* share link (`tiktok.com/t/…`) still has to be tried with a genuine one from the phone — only the canonical form has been exercised.
3. **On-device GPS** — ✅ verified in the simulator with a set location: the dot tracks, the
   header reads `native/continuous ±5m`, and the armed list matches real distances (Havens
   Café 15m, Moniker 512m). Still worth repeating on hardware with a genuine fix.
4. **Geofence with the phone locked** — arm a venue, lock the phone, pocket it, walk in. The notification must arrive. *This run decides whether the demo works.*
5. **The gate is real, not scripted** — same venue after closing: nothing fires. Mid-calendar-event: nothing fires. Third candidate in a day: suppressed.
6. **Gym** — real "Gym" event, walk into Lyon Center, workout notification fires.
7. **Share Extension** — from TikTok, Share → Cue, pin lands on the map.
8. **Offline** — with the Mac unreachable, map, library and nudges still work; only new ingest is blocked, and it says so.
