# Trainer patch — already applied

The Dashboard spec asked for this file to describe an "Export session" button to be
added to the speaking trainer. **That button already exists** in the deployed trainer
(`Copy session for dashboard`, on the report screen) and it emits the *amended*
schema from Trainer Spec §3.6, which this dashboard's bridge parses:

```json
{
  "sessionDate": "2026-08-26",
  "sessionNumber": 42,
  "level": "A2",
  "scenario": "taqueria",
  "durationMinutes": 14,
  "turnCount": 18,
  "errors": [
    { "pattern": "...", "youSaid": "...", "correct": "...", "prompt": "..." }
  ],
  "vocabGaps": [
    { "spanish": "...", "english": "...", "note": "..." }
  ]
}
```

Notes:
- `sessionCount` from Dashboard Spec §5.2 was renamed to `sessionNumber`.
- `errors` still require 3 occurrences before carding.
- `vocabGaps` have **no threshold** — they go straight to the Mined queue.
- `level` / `scenario` / `durationMinutes` / `turnCount` are stored per session
  for the Progress tab counters.
