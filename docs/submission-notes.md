# Submission notes — Palantir Product Design Show & Tell

Read alongside `brief.md`. This is about the *submission*, not the product.

## What the prompt actually asks for

**Lens A: Make it work.** *"Take a real friction in your own life, a task you dread, a workflow that wastes real time, a tool you wish existed, and make a working version that fixes it."*

Five things in the prompt that should change how this gets built and pitched:

**1. It's a personal-friction brief, not a startup pitch.** The first video bullet is literally *"Why this problem was worth solving for you."* Lead first-person and specific — the Oslo trip, the 247 saves, the folder never made. Market-sizing language would be answering a question they didn't ask. The competitive table in `brief.md` §2 exists to sharpen thinking, not to be presented.

**2. How you used AI is explicitly scored.** *"We're not testing whether you can do this without AI; we care about how you use AI to get there."* This project has a rare double, and both halves should be said out loud:

- **AI as the mechanism** — multimodal extraction is what makes zero-friction structuring possible. Without it this product requires manual tagging, which is the exact friction that kills it. See `brief.md`, "Why AI is load-bearing."
- **AI as the method** — how the thing got built: framing pressure-tested in conversation, the ingest pipeline written with a coding agent, the oEmbed path found and verified live.

They invite AI appendix material *in the video* rather than sent separately. Worth 15–20 seconds.

**3. Ambition beats safety.** *"Be ambitious, if you reach and it doesn't fully land, show us how you went about it; we'd rather see that than something safe and small."* So don't cut until it's trivial. A reach that visibly doesn't fully land, explained well, scores better than a small thing that works. The "what I'd do with more time" slot is explicitly offered — use it for the trigger taxonomy breadth that isn't built.

**4. The 3 hours is a work cap, not a deadline.** Submission is due within 7 days. Recording, editing and uploading sit outside the build. No need to rush the video.

**5. There's a live conversation later.** *"Make something that genuinely represents your interests."* Every claim in the video should be one that survives being asked about in detail. This is another reason to be straight about what's real (extraction from actual saves) versus assumed (ingest, simulated location).

## Suggested video structure — 3 min max, less is fine

Their bullets, in their order:

| | Beat | ~Time |
|---|---|---|
| 1 | **Why it was worth solving.** Oslo. 247 saves, 3 revisited, 0 folders. The specific moment of standing near a place you saved and not knowing. | 0:00–0:35 |
| 2 | **The reframe.** Not an organization problem — a surfacing one. Then the sharper version: every save is a goal intention with the if-then stripped out, and that's the most reliable lever in behavioral science, thrown away by design. | 0:35–1:05 |
| 3 | **How you broke it down.** Extract → assign trigger → watch → surface → learn. The trigger taxonomy in one line: spatial, calendar, deadline, activity. Travel is the demo; internships are a *different* trigger class, which is the proof it generalizes. | 1:05–1:35 |
| 4 | **Demo.** See the shot list below — it's now mostly filmed on the phone, for real. | 1:35–2:25 |
| 5 | **Where AI came in.** Both halves — mechanism and method. Name the hard part honestly: ingest and hydration, not intelligence. | 2:25–2:45 |
| 6 | **With more time.** The other trigger classes, perishable-vs-contextual handling, the notification budget. | 2:45–3:00 |

*"Think of it as a pitch for what you made, not a product demo"* — so beat 4 should be the shortest thing that lands, not a feature tour.

### Beat 4 shot list — real device, real location

The demo is now a working iOS app running on a real phone at USC, not a simulated walkthrough. Full engineering detail in [`native-plan.md`](native-plan.md).

| Shot | Device | What happens |
|---|---|---|
| a | phone | **The graveyard** — your real library, dead reverse-chron grid |
| b | phone | **Capture** — in TikTok, Share → Cue |
| c | **laptop** | **Extraction** — the pipeline: caption + frames + transcript → typed entities |
| d | phone | **The map** — the new pin lands, then zoom out to the world scatter |
| e | phone, walking | **The nudge** — phone in pocket, walk, lock-screen notification |
| f | phone | **The card** — provenance, why it fired, went / not now / never |
| g | phone | **Gym** — real calendar event, walking into Lyon Center |

Shot **e** is the whole pitch. The laptop appears exactly once, for **c**, which is the right division of labour: the phone is the product, the laptop is the proof.

Cut ruthlessly — this is seven shots in about fifty seconds, so most are two or three seconds each.

## Lines worth keeping

- *"My saved folder is a list of promises I made to myself."*
- *"The feed is optimized to make you save. Nothing is optimized to make you act."*
- *"It isn't an algorithm recommending to you. It's you, recommending to you."*
- *"A saved folder is a portrait of who you're trying to become."*
- *"The AI isn't a feature bolted onto a bookmarks app. It's the reason the bookmarks app can finally be something else."*

## Be honest about these on camera

Naming limits is a strength in a brief that rewards showing your path, and these will come up in the live conversation anyway:

- **Backlog capture is assumed; live capture and extraction are not.** The existing 14 links were hand-harvested because TikTok's export takes 1–4 days. But Share → Cue is real, and everything downstream genuinely ran against real saves.
- **Location is real. Extraction is not on-device.** The nudge fires from genuine CoreLocation. What *is* offloaded is the pipeline: `yt-dlp` and `ffmpeg` can't run on iOS, so extraction hits a server. Say that plainly — it's the honest architecture, not a shortcut, and it's what you'd ship as a hosted function.
- **Only 2 of 8 trigger classes are wired.** Spatial and calendar run. The other six are carried in the schema and labelled in the UI as modelled-but-unwired. Say that plainly; it's what makes the generality claim credible instead of hand-wavy.
- **iOS monitors only 20 geofences at once.** A real platform ceiling, named in `brief.md` §6 before it was hit. The app keeps the 20 nearest venues armed and re-arms as you move. Worth 10 seconds — it shows the constraint was anticipated, not discovered.
- **Carousel slides past the first are unreachable.** One post's recommendations live on its last slide and no API returns it. The screenshot door is the answer, and it's wired.
- **Google Maps list export isn't possible** — no public API. Owning the map view is a deliberate response, not an oversight.

## The finding worth leading with

Half the corpus broke the "obvious" ingest path, and that is a better story than if it had worked.

`tiktok.com/oembed` is public, keyless and documented — and it returns **HTTP 400 for every photo carousel**, which was 7 of my 14 saves. The pipeline records this in `data/hydration-report.json` rather than swallowing it. It's hard evidence for the claim in `brief.md` §6 that **ingest is a permissions and hydration problem, not an intelligence problem** — a claim that would otherwise sound like an excuse.

The neighbouring finding is nearly as good: TikTok tags creator-recorded audio as `original sound`, so that looks like a clean narration-vs-music signal. It isn't — two posts tagged that way transcribed to song lyrics, one of them Taylor Swift. Trusting the metadata would have fed lyrics to the extractor and produced invented places. Letting the model read and judge the transcript is what fixed it.

Both are 15-second beats and both do the same job: they show the work was actually done, not described.

## The clearest AI-mechanism proof (beat 5)

On the Extraction screen, the **caption-only toggle** applied to `@szesze.fertitta`. That post's entire caption is `we love a drop set😊 #abs #corework #abroutine #gymgirls #gymtok`. Caption-only extraction returns **nothing**. Full multimodal returns a named exercise with weights and rep scheme, read off the video frames.

That is the argument for why AI is load-bearing rather than decorative, and it takes about eight seconds to show. Same for `@rajandroh`: caption says "Small changes for the biggest difference", and the pipeline pulls five distinct exercises with form cues out of the voiceover.

## What "working" means here, precisely

Worth being exact, because it's the difference between a prototype and a deck:

- The trigger engine genuinely evaluates — real haversine distance, real opening hours from Google Places, real calendar matching, real ranking under a 2/day cap. 12 tests cover it.
- The nudge appears **because the engine fired it.** Drag the position slider away and it disappears; wind the clock past 4pm and Havens Café drops out as closed.
- Every pin, hour, address and confidence score traces back to `data/entities.json`, which the pipeline produced.
- The simulator panel is the honesty: it exposes the two inputs and lets anyone move them. Hide it with `s` while recording.

## Logistics

Unlisted YouTube video (≤3 min) plus a link to what you built, emailed to **designchallenge@palantir.com** within 7 days of receiving the brief.
