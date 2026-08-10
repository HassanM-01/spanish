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

- Channel links: three couldn't be verified at build time and use YouTube search URLs
  instead (marked in `src/config/channels.js`); the spec's "Español con Samuel" wasn't
  findable and was swapped for Easy Spanish. Curate freely.
- Backup/restore lives on the Progress tab. localStorage is per-browser — back up
  before switching machines.
- Version B seams: `src/lib/enrich.js` and `src/lib/trainerBridge.js` are the only
  files to swap for in-app enrichment / same-origin bridge.
