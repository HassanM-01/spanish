# Spanish Learning Dashboard

Daily driver for self-taught Spanish: minute logging across three pillars, streak with
freezes, near-zero-friction vocab capture, clipboard enrichment, the speaking-trainer
bridge, Anki export, and an honest hour-driven level gauge. Static, offline-capable,
all state in `localStorage`. No backend, no API key, no analytics.

## Run locally

```bash
npm install
npm run dev
```

## Deploy to GitHub Pages (hassanm-01.github.io/spanish)

One-time:

```bash
git init && git add -A && git commit -m "dashboard v1"
git remote add origin git@github.com:HassanM-01/spanish.git
git push -u origin main
```

Then every deploy is:

```bash
npm run deploy
```

This builds and pushes `dist/` to the `gh-pages` branch (the `gh-pages` package
handles it). In the repo settings, set Pages → Source → `gh-pages` branch. The build
copies `index.html` to `404.html` automatically so refreshes never 404.

`vite.config.js` already sets `base: '/spanish/'` — if you rename the repo, change it.

## Daily loop

1. **Today** — log minutes (+5/+15/+30), watch the split bars against the 55/15/30 target.
2. **Capture** — while watching: type the Spanish you miss, Enter. Later: "Copy
   enrichment prompt" → paste to Claude → paste the JSON back → Apply.
3. **Trainer** — "Copy trainer briefing" (Today tab) → paste into the trainer's setup →
   after the session, trainer's "Copy session for dashboard" → paste into Capture →
   Apply session. Errors card at 3 occurrences; vocab gaps go straight to Mined.
4. **Export cards** — downloads two self-configuring `.txt` files; import into Anki
   with zero field mapping. Exported cards move to the searchable archive.
5. **Progress** — the level gauge is hour-driven and nonlinearly spaced on purpose:
   B2→C1 is a long climb and the instrument doesn't lie about it.

## Notes

- The **Guide** tab renders `GUIDE.md` from the repo root. It's imported with Vite's
  `?raw` at build time, so the guide ships inside the bundle and reads offline — edit
  the markdown and rebuild. `src/lib/markdown.js` is a small subset parser (headings,
  paragraphs, lists, inline marks); each `##` becomes a Card.
- Channel links: three couldn't be verified at build time and use YouTube search URLs
  instead (marked in `src/config/channels.js`); the spec's "Español con Samuel" wasn't
  findable and was swapped for Easy Spanish. Curate freely.
- Backup/restore lives on the Progress tab. localStorage is per-browser — back up
  before switching machines.
- Version B seams: `src/lib/enrich.js` and `src/lib/trainerBridge.js` are the only
  files to swap for in-app enrichment / same-origin bridge.

## Cloud voice for the trainer (Vercel)

`api/tts.js` is a Vercel serverless function that proxies text-to-speech so no API key
ships to the browser. Set one of these in the Vercel project's environment variables:

- `DEEPGRAM_API_KEY` — Deepgram Aura-2 (es-MX voices, one per character).
- `ELEVENLABS_API_KEY` — ElevenLabs; optional `ELEVENLABS_VOICE_ID` and `ELEVENLABS_MODEL_ID`.
- `TTS_PROVIDER` — `deepgram` | `elevenlabs` | `none` to override auto-detection.

The trainer probes `GET /api/tts` once on load. If a provider is configured it streams
replies from `GET /api/tts?text=...&voice=...` straight into an `<audio>` element, so playback
starts before the clip has finished downloading. On any failure (or on GitHub Pages, where
there is no API) it falls back to the browser's `speechSynthesis`. Settings → "Character voice"
lets you force the browser voice ("Browser (instant)"); the choice is saved in localStorage.

## Trainer latency: debug mode and recent changes

Open the trainer with `?debug=1` (or set `localStorage.st_debug = "1"`) to print per-turn timings
to the console: one collapsed group per turn with a stage table (mic press, STT open/final, pending
dwell, request sent, response, parse, render, first sound) and a summary row that includes token
usage and cache reads. The last 50 turns are kept in `window.__stPerf`, and Settings gains a
"Copy perf log" button that copies them as JSON. Stage definitions and the decision rules are in
`PERFORMANCE.md` §6. Debug off means every instrumentation call is a no-op.

Latency changes so far (PERFORMANCE.md fixes 3, 5, 6, 10): the character now replies with the
Spanish line only and the English translation is fetched in the background (or when "English" is
tapped); the Deepgram recorder flushes its last chunk before `CloseStream`, with the 1200 ms
fallback kept until the debug log shows real close times; the chat call sets `cache_control` on the
system block and on the last message so the growing conversation is served from the prompt cache;
the browser-voice auto-pick prefers on-device voices (network voices are marked "online" in the
picker) and no longer queues an utterance in the same tick as an interrupting cancel.
