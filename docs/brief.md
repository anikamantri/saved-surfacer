# Cue — Design Challenge Brief

*A personal tool that resurfaces your saved posts at the moment they become useful.*

---

## 1. The problem

**Saving and needing are two different moments, and the save captures only one of them.**

I save a post while scrolling — in bed, on the bus, half-distracted, with no intent to act. The moment I'd actually use it comes weeks later, in a completely different place and headspace: standing in Oslo, walking into the gym, opening the fridge.

The save records *what* I found interesting. It throws away *when and where it would matter.* That missing half is the whole problem.

### Why this isn't an organization problem

The obvious fix is folders. Every platform ships them. They don't work, for two reasons:

1. **Filing is friction at the exact wrong moment.** Saving is a two-tenths-of-a-second reflex. Any step that turns it into a decision ("which folder?") gets skipped. I've never once made a folder.
2. **Even a perfectly organized archive still requires me to remember it exists.** Folders are a *retrieval* solution. Retrieval assumes recall. Recall is precisely what's broken — in Oslo I didn't fail to *find* the coffee shop post, I failed to *remember I had one.*

So this is a **surfacing problem**, not a sorting problem. The information isn't lost. It's unreachable without a memory I don't have.

### The shape of the failure

Saved posts are a **write-only archive**. The inbox has no outbox.

- Save rate: several a day, across four apps.
- Recall rate: near zero, and decaying — each new save pushes the old ones further down a reverse-chronological feed with no search, no filter, and no notion of relevance.
- The only successful retrievals are ones where the post hit me hard enough that I went hunting. That's maybe 1 in 50.

### The reframe

> **A saved post isn't content to be organized. It's an intention with a missing trigger.**

Every save is a latent intention — *I want to go here / try this / make that.* An intention becomes an action only when three things line up:

| | Provided by |
|---|---|
| **The content** — what to do | ✅ the platform |
| **The context** — where/when it's actionable | ❌ nobody |
| **The nudge** — a prompt at that moment | ❌ nobody |

Social platforms solve exactly one third of this and call it a feature.

---

## 2. The opportunity

**Build the layer between the save and the moment.** Not a better folder — a *trigger engine.*

Extract structured context out of saved content automatically, then match it against real-world signals — location, calendar, time of day, season, who you're with — and surface the post at the moment it's actionable.

Two things make this newly possible, and both are the "why now":

- **Multimodal models can watch a 30-second TikTok** and pull out *Fuglen · coffee · Oslo · Grünerløkka · cardamom bun* from frames, on-screen text, audio, and caption — with zero user input. Five years ago this required manual tagging, which is the exact friction that killed every previous attempt.
- **Geofencing and calendar access are commodities.** The plumbing is free. The intelligence used to be the bottleneck; it isn't anymore.

### The two-sided value

**Push — the nudge.** *"You're 4 minutes from Fuglen. You saved it 3 weeks ago."* This is the emotional hook. It's the thing you'd screenshot and text a friend about.

**Pull — the map.** All your place-saves, geocoded and dropped on a map automatically. This is the retention mechanic and it also solves cold start: the first time I open this, my three years of dead saves become a browsable map of the world. That's a genuine "oh" moment before I've done any work.

You need both. Pure push is fragile — miss the notification and it's gone. Pure pull is another archive I forget to open.

### Where it sits

| Existing thing | What it does | Why it doesn't solve this |
|---|---|---|
| Native collections / folders | Organize | Retrieval-side; still needs recall |
| Pocket, Raindrop, Notion clippers | Prettier archive | Same write-only graveyard, more setup |
| Google Maps saved lists | Right *output* format | Brutal manual input; one post at a time |
| Screenshots / camera roll | Zero-friction capture | Zero structure, zero resurfacing |
| Reminders / Apple location alerts | Right *mechanism* | You have to author every trigger by hand |

Nothing occupies the middle. The wedge is **automatic context extraction feeding automatic trigger creation.**

---

## 3. How it works — the six-step model

```
CAPTURE  →  EXTRACT  →  ASSIGN TRIGGER  →  WATCH  →  SURFACE  →  LEARN
```

**1. Capture.** No new habit. Either the OS share sheet ("Share → Cue") or a bulk import of the platform's data export. The save gesture stays exactly as cheap as it is today.

**2. Extract.** Multimodal pass over video frames + OCR of on-screen text + audio transcript + caption + top comments (comments are underrated — that's where the actual address usually is). Output is a typed object, not a tag:

```json
{
  "type": "place",
  "name": "Fuglen",
  "category": "coffee",
  "city": "Oslo",
  "coords": [59.9214, 10.7460],
  "hook": "cardamom bun + vintage Norwegian furniture",
  "source": "@nordicnomad · 3 weeks ago"
}
```

**3. Assign a trigger — the key design object.** Instead of a folder, each item gets a *condition under which it wakes up.* This is where the whole product lives:

| Saved thing | Trigger |
|---|---|
| Coffee shop in Oslo | Within 500m, and it's open, and you're not mid-meeting |
| Anything in a city | A trip to that city is detected (calendar, flight confirmation, or arrival) |
| Workout | Calendar event matching *gym*, or arrival at your gym's location |
| Recipe | Grocery store geofence, or your usual Sunday planning window |
| Product / gear | Near a store that stocks it, or a "you were going to buy this" resurface |
| Art / design inspiration | Time-based: when you open Figma, or during a blocked focus session |
| Restaurant for a group | You're out with 2+ people near dinner time |

**4. Watch.** A cheap background loop over location, calendar, and clock. The expensive AI work already happened at ingest.

**5. Surface.** Notification, with the original post thumbnail attached — provenance is what makes it trustworthy *and* what jogs the memory. Plus the passive map layer.

**6. Learn.** Every nudge gets *went / not now / never.* This is the only correction signal, and it does double duty: it tunes the trigger model **and** it finally lets the archive shrink. A save that gets "never" three times is dead weight; delete it. The backlog burns down instead of only growing.

---

## 4. The tension worth designing against

**The #1 failure mode is not "the tech doesn't work." It's notification fatigue.**

The moment this app becomes noisy it becomes a spam app I mute, and a muted trigger engine is worth strictly less than the folder I never made. So the core design constraint is:

> **Surface rarely. Surface right. Every nudge must clear a high bar or it doesn't fire.**

Concretely, a nudge fires only when *all* of these hold:
- **Proximity is real** — under a 6-minute walk, not "in the same neighborhood."
- **It's actionable now** — the place is open; the calendar shows a gap; you're not driving.
- **Confidence is high** — extraction was unambiguous, geocoding is a strong match.
- **Budget allows** — hard cap of ~2 nudges/day. Competing candidates rank and only the winner fires.

Everything that doesn't clear the bar goes to the map, silently. That's the pressure valve: **the map is where the long tail lives, the notification is reserved for the exceptional match.**

Three more tensions worth naming out loud in the writeup:

- **Trust.** A nudge is an interruption asking me to change my path. It earns that by showing its work: the original creator, the date I saved it, the exact reason it fired ("4 min away · open until 6").
- **Privacy.** Saved posts + continuous location + calendar is one of the most intimate datasets you could assemble about a person. Extraction runs once at ingest; matching runs on-device; raw location never leaves the phone. This is a personal tool, and the architecture should say so.
- **Serendipity vs. control.** Too smart and it's creepy; too dumb and it's noise. The escape hatch is a "what's around me" pull view, so the user can always ask instead of waiting to be told.

---

## 5. Beyond travel and gym

The travel case is the demo because it's visual and the pain is sharpest. But the model generalizes anywhere a save has an obvious trigger:

- **Cooking** — recipe saves surface at the grocery store, matched against what's actually in season.
- **Shopping** — the jacket you saved surfaces when you're near a store that carries it, or when it goes on sale.
- **Creative work** — design and art references surface during blocked "portfolio" time, not at 1am on the couch.
- **Gifts** — "this is so X" saves surface two weeks before X's birthday. This one might be the strongest non-travel case; the trigger is unambiguous and the payoff is high.
- **Home / DIY** — furniture and repair saves surface when you're at a hardware store or on a free weekend.
- **Reading & media** — long articles surface on a flight or a long transit leg, offline-cached.
- **Social** — "let's go here together" saves surface when you're actually with that person.

The unifying claim: **every save has a natural trigger, and the trigger is usually inferrable from the content itself.** That's the thesis worth defending.

---

## 6. Feasibility — what's real, what's hard

### Getting the posts in (this is the actual hard part)

**First, split the problem in two.** People conflate these and then conclude it's impossible:

- **The index** — the *list* of what you saved: permalinks and dates.
- **The payload** — the caption, video, on-screen text and comments you actually need in order to extract *Fuglen · coffee · Oslo.*

Platforms treat these completely differently. The index is broadly obtainable. **The payload is where it gets hard**, and every viable strategy below is really a different answer to "how do I hydrate a URL into content."

#### What each platform actually gives you

| Platform | Index of your saves | Payload |
|---|---|---|
| **Instagram** | ✅ Data export includes a saved-posts file — permalinks + save timestamps | ❌ URL only. No caption, no media. The Graph API has **no saved-posts endpoint** and requires a Business/Creator account; oEmbed needs an app token and app review. |
| **TikTok** | ✅ Data export has a *Favorite Videos* list with links and dates (request **JSON**, not TXT — the TXT is a fraction of the data). 1–4 days to arrive. | ⚠️ Export gives links only — **but `tiktok.com/oembed` is a public, unauthenticated endpoint** returning the full caption (`title`), `author_name`, and `thumbnail_url`. That closes the loop with no key. |
| **X** | ✅ `GET /2/users/:id/bookmarks` — the only platform with a real, documented bookmarks API | ✅ Same call returns full post text. But there's **no free tier for new developers** in 2026; it's pay-per-use at roughly $0.005/read. |
| **Pinterest** | ✅ Proper API for boards and pins | ✅ Full pin metadata |
| **Screenshots** | ✅ Photos library, Screenshots smart album | ✅ The whole rendered post — caption, handle, on-screen text |

#### Four doors, ranked

**1. Screenshots → vision model.** *Best for a 3-hour build, and underrated as a product.* Read the Screenshots album with Photos permission, run each image through a vision model. No auth, no ToS question, no waiting, no platform dependency — and it works across every app, including ones with no export at all. The screenshot *is* the payload: caption, handle, and on-screen text are all rendered right there. Plenty of people already screenshot instead of saving, which means for some users this is zero new behavior. If you want real extraction running on stage in your demo instead of seeded data, this is how you get it in under an hour.

**2. Share-sheet extension.** *Best long-term product answer.* An iOS Share Extension (or Android intent filter) that accepts URLs; the user taps Share → Cue. Costs a per-post gesture, but it's one they already make, it's fully within platform ToS, and the extension can capture the caption text alongside the link. This is what you'd ship.

**3. Data export for backfill.** *Best for cold start.* Instagram's "Download your information" and TikTok's equivalent both give you the saved index. This is what turns three years of dead saves into a populated map on first launch — the single most persuasive moment in the product. Slow, one-shot, and it needs hydration (see below), but it's legitimate and it's *your* data.

**4. Official APIs.** Only X and Pinterest actually have them. X's works and is clean; it just costs money. Fine for a personal tool at personal volume.

**Rejected: scraping and unofficial exporters.** Browser extensions that dump your Instagram saves do exist, and so do unofficial API wrappers. They're ToS-gray, they break whenever the DOM changes, and building a product on them is building on sand. Name it in your writeup as a considered-and-rejected path — judges respect that more than silence.

#### The hydration step nobody plans for

An export hands you `instagram.com/p/ABC123/` and nothing else. Between the index and the extraction sits a step that has to turn that string into content:

- **TikTok:** `https://www.tiktok.com/oembed?url=<url>` → caption, author, thumbnail. Public, keyless, works today.
- **Instagram:** no clean path. This is the real reason to lean on the share extension (which carries the caption with it) or screenshots.
- **X:** the bookmarks endpoint returns text inline — no hydration needed.

Practical consequence: **hydration quality, not extraction quality, is what limits accuracy.** Worth saying out loud, because it's the non-obvious insight.

#### Why "personal tool" isn't just a scoping excuse

Building this for *one person with their own data* puts you in a materially different position than a startup ingesting everyone's saves. You don't need a platform partnership — you need your own export and your own share sheet, and data-portability law (GDPR Art. 20, CCPA) is what guarantees the export exists at all. That's a real argument, not a dodge, and it's worth one line in the writeup: the personal-tool framing is what makes the ingest problem tractable.

Honest summary for the challenge: *ingest is a permissions and hydration problem, not an intelligence problem.* The interesting product work is downstream of it. Say that plainly rather than hand-waving.

### The rest of the pipeline

| Piece | Feasibility | Notes |
|---|---|---|
| Video → structured entity | ✅ Solved | Frames + Whisper transcript + OCR → LLM with a forced JSON schema. Cost is a few cents per post, once, at ingest. |
| Name + city → coordinates | ✅ Solved | Google Places / Mapbox text search. Confidence score gates whether it ever nudges. |
| Geofencing | ⚠️ Constrained | iOS monitors only **20 regions at once**. Real design constraint: you can't watch 400 saved places. Solution — dynamically load the ~20 nearest regions as the user moves, plus a coarse city-level trigger on top. Worth mentioning; it shows you've looked. |
| Calendar cross-reference | ✅ Solved | EventKit / Google Calendar API. Fuzzy match event titles to saved-item types. |
| Trip detection | ✅ Doable | Calendar events with a location in another city, flight confirmation emails, or simply "user is >100km from home." |
| Export to Google Maps list | ❌ Not possible | Google Maps has **no public API for saved lists.** Realistic paths: export KML/GPX into Google My Maps, deep-link each pin, or — better — own the map view yourself and offer a shareable list. Frame this as a deliberate choice, not a limitation. |
| On-device matching | ✅ | The matching loop is cheap comparisons, not inference. Nothing sensitive needs to leave the phone. |

### Cost & scale sanity check

Ingest is the only expensive operation and it happens once per post. A heavy user saving 5 posts a day is ~150 extractions a month — pennies. The watch loop is free. This is economically fine as a personal tool, which is the right framing anyway.

---

## 7. Build plan for the next 3 hours

**Scope ruthlessly. Fake the ingest, build the surfacing.** Nobody judging this expects a live TikTok integration; they want to see the idea *work.* State the assumption in the first 15 seconds of your video and move on.

**Cut:** real ingestion, auth, real geofencing, backend, the gym flow if you're running short.

**Build:**

| # | Screen | Why it's in the demo |
|---|---|---|
| 1 | **The graveyard** — 247 saved posts in a dead reverse-chron grid | Establishes the problem viscerally in 5 seconds |
| 2 | **Extraction** — one post visibly parsed into a structured card | Shows the mechanism, proves it's not magic |
| 3 | **The map** — Oslo, auto-populated with pins from saves | The "oh" moment; solves cold start on screen |
| 4 | **The nudge** — lock screen, *4 min from Fuglen*, with the original post | The emotional payoff — this is your thumbnail frame |
| 5 | **The card** — provenance, reason it fired, act / not now / never | Shows you thought about trust and the feedback loop |
| 6 | **Gym** — calendar event "Gym 6:00" cross-referenced with a saved workout | Proves the model generalizes beyond travel |

**Suggested time split:** 20 min seeding realistic fake data (use *real* Oslo places — it reads as authentic and costs nothing), 90 min building, 20 min polish, 30 min recording, 20 min buffer. Protect the buffer.

**The one thing to get right:** step 4. If the nudge lands, the idea lands. Give it the original post thumbnail, the creator handle, the date saved, the walking distance, and the reason. That single screen is the whole pitch.
