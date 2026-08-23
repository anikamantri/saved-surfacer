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
| TikTok | Data export (JSON, 1–4 days) | `tiktok.com/oembed` — public, keyless, returns full caption |
| Instagram | Data export | No clean path — needs share extension or screenshots |
| X | `GET /2/users/:id/bookmarks` | Returned inline; paid API |
| Screenshots | Photos library | The whole rendered post |

**Current path:** TikTok URLs → oEmbed → LLM entity extraction → geocode → local JSON.

A useful finding from the first real sample: **one save often yields several places.** A "5 things to do in Oslo" post is five entities, not one — which is also why manually adding these to a Google Maps list is so painful, and part of why nobody does it.

**Known trap:** oEmbed `thumbnail_url` values are signed and expire in ~48 hours. Download thumbnails locally; never hotlink them.

## Repo layout

```
docs/        Problem, opportunity, feasibility brief
ingest/      oEmbed → extraction → geocode pipeline
data/        Extracted entities + downloaded thumbnails
prototype/   The demo
```

## Status

Design challenge build. Ingest is a stated assumption in the demo — the pipeline runs once offline and its output is baked in, so the prototype makes no live API calls.

See [`docs/brief.md`](docs/brief.md) for the full problem framing, opportunity, and feasibility analysis.
