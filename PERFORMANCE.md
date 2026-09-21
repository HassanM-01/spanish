# Speaking trainer — turn-latency audit

**Scope.** Everything between "I finish speaking" and "the reply appears (and is heard)" in
`public/trainer/index.html`, plus the `api/tts.js` function. Report only; nothing here has been
changed in code.

**Audited revision.** `origin/main` @ `05b8c39` (2026-09-21), i.e. after both TTS merges
(PR #2 "cloud-tts", merged 2026-09-20 18:00 CDT; PR #3 "tts-streaming", merged 2026-09-21 10:57 CDT).

**Method.** Static trace of the code path, line by line; network measurements from this machine
(Dallas-area ISP) to the three endpoints; Vercel project settings via the Vercel API. Every stage
time below is an **estimate** unless it is marked **measured**. No live-session numbers exist yet —
section 6 proposes how to get them before building anything.

**Status (2026-09-21).** Implemented in the follow-up PR: §6 instrumentation (`?debug=1`), fix 3
(lazy English), fix 5 (STT stop ordering; 1200 ms fallback kept until measured), fix 6 (prompt
caching, per-block `cache_control` on the system block and on the last message), fix 10 (voice
hygiene). Not yet: fixes 1, 2, 4, 7, 8, 9, 11.

---

## 0. Headline findings

1. **The Claude call is the turn.** It is a single non-streaming POST from the browser straight to
   `api.anthropic.com` (`claude-sonnet-4-6`, `max_tokens: 1000`, no `stream`, no `cache_control`,
   no thinking). Estimated 1.9–3.4 s per turn, of which roughly 40 % is spent generating the
   English translation that the user only sees if they tap "EN". Nothing renders until the whole
   JSON has arrived. This is ~75–90 % of the machine time in a turn.
2. **Two human steps sit inside every turn.** After the mic stops, the transcript lands in a
   "Send · Enter / Redo · Space / Discard · Esc" panel and waits indefinitely; there is no
   auto-send (`pendingTimerRef` is cleared in five places and armed in none). The felt
   turn-to-turn slowness includes reading the transcript and pressing Enter.
3. **STT finalization is 0.2–1.2 s** and has a hard 1200 ms fallback on the Deepgram path. The
   final 250 ms audio chunk is also sent *after* `CloseStream`, which can clip the last word and
   trigger a "Redo" (a whole extra turn, the worst latency of all).
4. **Payload growth is not the late-session problem.** Input grows ~75 tokens per turn from a
   ~900-token base: ~1.2 k tokens at turn 5, ~1.9 k at turn 15, ~3.0 k at turn 30 (≈ 12 KB).
   That plausibly adds 0.05–0.15 s to time-to-first-token by turn 30. Under 5 % of a turn.
5. **The last two merges added nothing to the non-TTS path.** The only new network call is a
   one-time provider probe on page load. `speak()` runs after the reply is already committed to
   state and is never awaited. With "Browser (instant)" selected, the app makes **zero** network
   calls for speech (verified by code path; one caveat about Chrome's network-backed voices below).
6. **Serverless overhead touches only the Deepgram voice.** Measured from here, Vercel's edge
   answers in 140–290 ms vs 60–65 ms for Anthropic's edge; the function region is unconfigured
   (defaults to `iad1`); both Vercel projects have SSO protection on all `*.vercel.app` domains.
7. **Best fix is to hide model latency, not remove it:** stream the reply (SSE), render the
   Spanish as it arrives, start TTS the moment the `spanish` string closes. Combined with
   auto-send and a warm STT socket, "mic stops → first Spanish word heard" goes from an estimated
   4–7 s to roughly 1.5–2.5 s.

---

## 1. Stage-by-stage map of one conversation turn

Line numbers refer to `public/trainer/index.html` at `05b8c39`.

### 1a. Before the measured window (mic press → capturing) — included because it is part of the loop

| Stage | Code | Est. time | Notes |
|---|---|---|---|
| Mic press → `startListening` | 924 | <1 ms | Guards on `awaitingRef`/`pendingRef`; nothing else. |
| **Deepgram STT:** `getUserMedia` | 831 | 50–300 ms | Re-acquired on every press (tracks are stopped each turn). Windows device open can be slow. |
| **Deepgram STT:** `new WebSocket` → `onopen` | 852–864 | 200–450 ms | TCP + TLS (**measured** ~50 ms + ~50 ms to `api.deepgram.com`) + WS upgrade/auth round-trip. |
| **Deepgram STT:** `MediaRecorder.start(250)` | 886 | ~10 ms | Starts **inside `onopen`** — anything said before the socket opens is not captured. First syllable loss → "Redo" is a latency event in disguise. |
| **Web Speech STT:** `r.start()` | 705– | 100–300 ms | Chrome's recognizer spins up per press. |
| While speaking | `setInterim` per partial | n/a | Each partial re-renders the whole 1,800-line component and runs a smooth `scrollIntoView` (1208). Cosmetic, outside the window. |

### 1b. The measured window: "I finish speaking" → "the reply appears"

| # | Stage | Code | Est. time | What happens |
|---|---|---|---|---|
| 1 | Stop → final transcript, **Deepgram path** | `stopListening` 930 → `mr.stop()` 938 → `CloseStream` 942 → `ws.onclose` → `finishDeepgram` 774 → `queuePending` 980 | **200–600 ms typical; 1200 ms ceiling** | `CloseStream` asks Deepgram to flush finals and close. A `setTimeout(…, 1200)` (946) force-closes if Deepgram does not. Ordering issue: `MediaRecorder.stop()` fires its last `dataavailable` asynchronously, so the final ≤250 ms of audio is sent *after* `CloseStream` and is probably discarded. If the timer fires before the final transcript arrives, tail text is lost too. |
| 1′ | Stop → final transcript, **Web Speech path** | `r.stop()` → `r.onend` 737 → `queuePending` | 300–1000 ms | Chrome sends end-of-speech to Google's recognizer and waits for the final result. `continuous: true` tends to sit at the upper end. |
| 2 | Pending panel → user confirms | `setPending` 983 → `pendingPanel` 1388 → Enter / "Send" → `sendPending` | **0.5–2 s (human)** + 1 render | No debounce, no `setTimeout`, no auto-send anywhere in the send flow. This is a required manual step on every turn. |
| 3 | Request build | `sendUserTurn` 1031 → `setMsgs` → `fetchCharacterReply` 1009 → `toApi(messagesRef.current)` + `JSON.stringify` | <1 ms | User bubble renders immediately (2–5 ms). System prompt is memoized (1005). Request body 3–12 KB (section 2). |
| 4 | Chat API call | `callClaude` 265 | **1.9–3.4 s typical** (tail 5 s+) | See breakdown below. |
| 5 | Response parse | `res.json()` 278 → `parseReply` 1015 (strip fences, slice `{…}`, `JSON.parse`) | <2 ms | Falls back to raw text if JSON is malformed. |
| 6 | State update + re-render | `setMsgs` + `setAwaitingReply(false)` (batched, one render) → scroll effect 1208 | 2–6 ms; smooth scroll ~300 ms visual, non-blocking | Whole component re-renders; `messages.map` builds 2N bubbles; no memoization but N ≤ ~60 is trivial. |
| 7 | Time-to-first-sound, **Browser voice** | `speak` 600 → `speakBrowser` 523 → `synth.cancel()` 527 + `synth.speak()` 534 | **50–250 ms** with a local Windows voice; 300–1000 ms with Chrome's "Google …" voices | Zero app network calls. Chrome's Google voices are network-backed (`voice.localService === false`) and the browser itself fetches audio. Long-standing Chromium quirk: `cancel()` immediately followed by `speak()` occasionally drops the utterance — silent reply → user re-reads → felt slowness. |
| 7′ | Time-to-first-sound, **Deepgram voice** | `speak` 600 → `cloudTtsUrl` 569 → `<audio src>` GET `/api/tts?text=…` → Vercel edge → function → Deepgram Aura-2 → chunked MP3 → `playing` | **0.6–1.0 s warm; 1.0–1.6 s cold** | Edge RTT **measured** 140–290 ms from here; function warm 10–30 ms / cold 150–400 ms (est.); Deepgram TTFB 150–300 ms (est.); browser buffers 100–300 ms of MP3 before `playing`. Before PR #3 the full clip was downloaded first (+0.3–1.0 s). |

**Chat API call breakdown (stage 4).** Destination is `https://api.anthropic.com/v1/messages`
directly from the browser (header `anthropic-dangerous-direct-browser-access: true`), not our own
`/api`. Model `claude-sonnet-4-6`, `max_tokens: 1000`, `stream` not set, no `cache_control`, no
`thinking` (on Sonnet 4.6 omitting `thinking` means thinking is off — good for latency).

| Component | Est. | Basis |
|---|---|---|
| CORS preflight | 0 ms most turns; ~65 ms once per 10 min | **Measured:** Anthropic returns `access-control-max-age: 600`, so the browser re-preflights only after 10 idle minutes. |
| TCP/TLS | 0 ms (connection reused) or ~50 ms + ~45 ms new | **Measured** from this machine to the Anthropic edge (Cloudflare DFW): connect 20 ms, TLS 45 ms, TTFB 65 ms. |
| Upload | <20 ms | 3–12 KB body. |
| Time to first token (server) | 500–1200 ms | Queueing + prefill of ~0.9–3 k tokens. Varies with API load. |
| Generation | 1300–2100 ms | ~106 output tokens (`{"spanish":…,"english":…}` ≈ 50 Spanish + 45 English + JSON) at ~50–80 tok/s. The English half is ~40 % of this and is invisible until tapped. |
| Download + `res.json()` | <10 ms | ~600 bytes. |
| Failure mode | +5–10 s when it happens | 429/529/5xx → `replyError` state, no retry; the user must press retry. |

**Turn total, machine time only (stages 1, 3–6):** ≈ 2.1–4.6 s. **With the human confirm
(stage 2):** ≈ 2.6–6.6 s from "mic stops" to "reply visible". Add stage 7/7′ for "reply heard".
The model call is roughly three quarters or more of the machine time, and all of it is dead air
because nothing streams.

---

## 2. Payload growth

`toApi()` (283) resends the full history every turn as `{role, content}` pairs, sending only the
Spanish for assistant turns (the English never goes back — good). The system prompt for a typical
scenario (Taquería, A1, Despacio, no coaching brief) reconstructs to ~2,840 characters ≈ **790
tokens**, plus `SCENE_OPEN` ≈ 40 tokens. Estimates below use ~3.6 chars/token and a typical A1 turn
(user ~10 words, character 2–3 short sentences ≈ 30 words). Treat as ±15 %.

| Turn | Input tokens (approx.) | Request body | Cacheable prefix? (Sonnet 4.6 min = 1024 tok) |
|---:|---:|---:|---|
| 1 | ~850 | ~3.2 KB | no |
| 5 | ~1,150 | ~4.3 KB | yes |
| 15 | ~1,900 | ~7.3 KB | yes |
| 30 | ~3,000 | ~11.7 KB | yes |

Growth is ~75 input tokens per completed turn. Output stays ~100–110 tokens per turn regardless.

**How much late-session latency this explains.** Input-side processing at these sizes is fast
(tens of milliseconds for a few thousand tokens); going from ~0.9 k to ~3 k input tokens plausibly
adds **50–150 ms** to time-to-first-token, and uploading 12 KB adds under 20 ms. So payload growth
accounts for perhaps **0.1–0.15 s by turn 30 — under 5 % of a turn.** It is not what makes late
turns feel slower. Prompt caching would make even that disappear (the prefix is cache-eligible from
turn ~3 onward, and the 5-minute TTL fits the 10–30 s turn cadence), but it is a cost win far more
than a speed win.

**What plausibly does grow late in a session (unmeasured, worth instrumenting):**

- **Reply-length drift.** Characters tend to say more as the scene develops. Every extra 10 output
  tokens is ~150–200 ms of generation. The code discards `data.usage`, so we currently cannot see
  this — section 6 logs it.
- **API load variance.** TTFT and tok/s vary with time of day; a 20-minute session spans that.
- **STT reconnects.** Each mic press opens a fresh Deepgram socket (section 1a). Constant per turn,
  but it makes every turn feel like a cold start.
- Nothing on the client grows meaningfully: 60 bubbles re-render in single-digit milliseconds.

---

## 3. What the last two merges added — and the non-TTS path

Merges audited: `f6b300b` (cloud TTS proxy, PR #2) and `4888177` (GET streaming + voice toggle,
PR #3). Every addition, and where it sits relative to send and render:

| Addition | Where | On the send/render path? | Cost |
|---|---|---|---|
| Provider probe `GET /api/tts` | `useEffect` on mount, 482 | **No.** Fires once per page load, async, result stored in `ttsProviderRef`; nothing awaits it. Side benefit: it warms the Vercel function. | One request per page load. |
| `voiceMode` state + `localStorage` read | state init | No (synchronous, <1 ms at mount). | — |
| `speak()` branching (browser / cloud / legacy key) | 600–616 | **No.** `speak(rep.spanish)` (1023) is called *after* `setMsgs` and `setAwaitingReply(false)` have been queued, and it is not awaited — the render is already scheduled. In browser mode it reaches `speakBrowser` with zero fetches. | — |
| `speakCloud` via `<audio src>` GET | 569–598 | Runs after render; only in Deepgram mode. One GET per reply. | TTS path only. |
| `stopSpeaking` extended (`removeAttribute("src")`, `load()`) | 538 | Called at mic start and reply start, as before. Synchronous, trivial. | — |
| Settings "Character voice" select + copy | settings panel | Renders only while the panel is open. | — |
| `api/tts.js` | server | Never touched by the chat call. | — |

**Conclusion:** no new `await`, timer, provider check, or other work happens before the send or
before the reply renders. The STT → pending → send → fetch → parse → `setMsgs` chain is byte-for-byte
the same as before PR #2.

**Browser-voice path verification.** `speak()` → `voiceModeRef.current === "browser"` (603) →
`speakBrowser()` → `speechSynthesis` only. No `fetch`, no `Audio`, no `/api/tts`. Confirmed zero
app-initiated network calls for speech. Two caveats:

1. The mount-time probe still runs once per page load regardless of mode (not per turn).
2. If the auto-picked voice is one of Chrome's "Google español …" voices, *Chrome* fetches the
   audio from Google. The picker (`esVoices` auto-select) prefers a voice whose lang contains `mx`
   or name matches /mexic/, which on Windows is usually the local "Microsoft Sabina" — but it is
   not guaranteed. `voice.localService` tells you which.

**Two things the merges did change that are worth knowing:**

- The default voice mode is "Deepgram" whenever the probe reports a provider, and that path now
  has two hops (browser → Vercel → Deepgram) where the old client-key path had one. On a cold
  function the first reply of a session is *heard* later than before, even though it *appears* at
  the same time.
- The dashboard's default trainer link (`src/config/settings.js`) points at the **`spanish-trainer`**
  Vercel project, while `/api/tts` ships with the **`spanish`** project (this repo). Whether
  `spanish-trainer` also serves `/api/tts` could not be verified from here (both are behind Vercel
  SSO). If it returns 404 there, the probe yields `none`, "Deepgram (natural)" is disabled in
  Settings, and speech uses the legacy direct-to-Deepgram path with the key in `localStorage`.
  Worth one check: open `<trainer origin>/api/tts` in the same browser.

**If the slowdown predates the TTS merges**, the more likely culprits are the two August commits
(`6638f10` Deepgram STT, `4ba23a4` mic fix): they introduced the per-press WebSocket, the
`CloseStream` + 1200 ms fallback, and the start-recording-only-after-`onopen` ordering.

---

## 4. Serverless overhead

Only the Deepgram voice path traverses Vercel. The chat call goes browser → `api.anthropic.com`
directly, so **serverless overhead contributes nothing to "reply appears".** It does shape
time-to-first-sound.

**Deployment facts (Vercel API, 2026-09-21):**

| | `spanish` (this repo) | `spanish-trainer` |
|---|---|---|
| Framework / Node | Vite / Node 24.x | none / Node 24.x |
| Latest production deploy | 2026-09-21 15:57 UTC (PR #3) | 2026-09-20 22:34 UTC |
| Domains | `spanish-theta.vercel.app`, `spanish-hassans-projects-….vercel.app` | `spanish-trainer-rho.vercel.app`, `spanish-trainer-hassans-projects-….vercel.app` |
| SSO protection | **on**, all except custom domains | **on**, all except custom domains |
| Function region | Not set in repo (no `vercel.json`, no `regions`); Vercel default is `iad1` (Washington, D.C.) unless changed in the dashboard | n/a unless it has the API |

**Fixed per-call costs on `GET /api/tts?text=…`:**

| Component | Est. / measured | Notes |
|---|---|---|
| Browser → Vercel edge | **Measured 140–290 ms** per request from this machine; edge PoP was `cle1` (Cleveland), not Dallas | For comparison, Anthropic's edge (DFW) answered in 60–65 ms and Deepgram in ~145 ms. Anycast routing is the ISP's choice; each `/api/tts` call pays ~150–250 ms more edge latency than a direct Deepgram call would. |
| SSO/JWT check at edge | ~1–5 ms | Every request carries `_vercel_jwt`; cheap, but it means the trainer only works while signed in to Vercel in that browser, and external probes get a 302 to `vercel.com/sso-api`. |
| Edge → function region | ~20–40 ms | Cleveland/Dallas → `iad1`. |
| Cold start | 150–400 ms (est.) | Tiny ESM function, Node 24. New Vercel projects default to Fluid compute, which keeps instances warm between turns; the mount-time probe warms it at page load. A session that starts 10–15 min after loading the page may hit one cold start on the first reply. |
| Function → Deepgram | TLS ~60–100 ms on a cold instance (keep-alive reused when warm) + Aura-2 TTFB ~150–300 ms | `iad1` → Deepgram (US) is a good pairing; moving the function nearer the user would not help because it must round-trip to Deepgram anyway. |
| Buffering in the function | ~0 | `Readable.fromWeb(upstream.body).pipe(res)` (api/tts.js 140–142); nothing is accumulated. |
| Browser buffering before `playing` | 100–300 ms | Chunked response, `Accept-Ranges: none`: Chrome plays progressively, cannot seek. |

**Net:** Deepgram-voice TTFS ≈ 0.6–1.0 s warm, 1.0–1.6 s cold — of which roughly half is the
Vercel hop. Bypassing it (fix 9 below) is the only way to claw that back; a region change is not.

---

## 5. Ranked fix list

Savings are per turn and estimated; "felt" savings count the human step. Effort: XS <1 h, S ≤ half
a day, M 1–2 days. Risk is to correctness or UX, not to data.

| # | Fix | Est. saved / turn | Effort | Risk | Notes |
|---|---|---|---|---|---|
| 1 | **Stream the Claude reply (SSE)**, render Spanish as it arrives, start TTS when the `spanish` string closes | Reply *starts appearing* ~1.5–2.5 s earlier (at first token instead of last). TTS starts ~0.8–1.2 s earlier (skips generating the English + tail). | M | M-L | Assessment below. Does not shorten generation; hides it. |
| 2 | **Auto-send the transcript** after a short undo window (e.g. 1.2 s countdown; Space = redo, Esc = discard) or send-on-release in hold mode | 0.5–2 s of human time, every turn | S | L-M | Sends occasional mistranscriptions; "I didn't say that" already excludes them from the report. Keep a setting to require confirm. |
| 3 | **Lazy English translation** — drop `english` from the live reply; fetch it on "EN" tap (or in the background after the Spanish renders) | ~0.7–1.0 s (≈45 fewer output tokens) on the non-streaming path; still cuts total generation with streaming | S-M | L | Extra small call only when tapped. Simplifies the JSON contract to a single string, which also simplifies streaming. |
| 4 | **Keep the Deepgram STT socket warm** across turns: open once at session start, `KeepAlive` every 5–8 s, start/stop `MediaRecorder` per press; also keep the `getUserMedia` stream | 300–700 ms at mic press, plus no more lost first syllables → fewer Redo turns | M | M | Deepgram drops idle sockets after ~10 s without audio or KeepAlive. Fall back to per-press sockets on error. |
| 5 | **Fix STT stop ordering** — wait for the final `dataavailable` (or `mr.requestData()`) before sending `CloseStream`; measure `CloseStream → onclose`; only then keep or shorten the 1200 ms fallback | 0–1000 ms when the fallback fires; fewer clipped last words | S | L | Pure ordering change inside `stopListening` (930–950). |
| 6 | **Prompt caching** — top-level `cache_control: {type: "ephemeral"}` on the request | 50–150 ms TTFT from turn ~3; ~90 % off input cost | XS | none | Prefix is stable (system prompt memoized; changes only on speed/level change). Sonnet 4.6 minimum prefix is 1024 tokens — met from turn ~3. |
| 7 | **Retry once with jitter on 429/529/5xx**, keeping the user's line | Avoids a 5–10 s manual redo when it happens | S | L | Today `callClaude` throws and the turn is dead until the user acts. |
| 8 | **Model / effort experiment** (measure with §6 before deciding) | Unknown until measured; could be ±1 s | XS to try | quality | Candidates: `claude-sonnet-5`, `claude-haiku-4-5`, `claude-opus-5` with `output_config.effort: "low"`. **Caution:** Sonnet 5 and Opus 5 run adaptive thinking when `thinking` is omitted (Sonnet 4.6 does not), so a naive model swap would *add* latency — send `thinking: {type: "disabled"}` or low effort. Haiku 4.5's cache minimum is 4096 tokens (caching would not kick in until turn ~45). Character fidelity is the user's call, not a latency question. |
| 9 | **TTS direct to Deepgram with a short-lived token** (function mints a temporary key; browser calls Deepgram), or Deepgram's WebSocket TTS | 150–450 ms TTFS warm; up to ~1 s cold | M | M | Removes the Vercel hop measured in §4. Token endpoint still lives on Vercel but is called once per session, not per reply. |
| 10 | **Browser-TTS hygiene** — prefer `localService` voices in the auto-pick; avoid `cancel()` + `speak()` in the same tick | Reliability more than ms (no silent replies); 0.3–0.8 s when a network voice was being used | XS | L | Also expose `voice.localService` in the picker label. |
| 11 | **Render hygiene** — skip smooth scroll while streaming, `React.memo` the bubbles | negligible | XS | none | Only if jank appears once streaming lands. |

**Expected combined effect of 1 + 2 + 4 (+ 5, 6 as freebies):** "mic stops → first Spanish word
heard" from an estimated 4–7 s today to roughly **1.5–2.5 s**, with the reply text visibly typing
from ~0.7–1.0 s after send. Fix 3 alone, without streaming, is the cheapest ~1 s.

### Streaming the Claude response — assessment

**What it changes.** Today the user sees three blinking dots for the entire 1.9–3.4 s and then the
whole line at once. With `"stream": true` the API returns Server-Sent Events; the first
`content_block_delta` arrives at TTFT (~0.5–1.2 s), and text accumulates at generation speed. The
same JSON `{"spanish":…,"english":…}` is produced, but because `spanish` is emitted first, its
closing quote lands roughly 55–60 % of the way through generation. At that moment the Spanish line
is complete and TTS can start, while the English is still streaming and nobody is waiting for it.

**Why this is the right lever.** The model time is fixed by model choice and reply length; every
other stage is already small or human. Streaming converts ~2–3 s of dead air into visible progress
and pulls first-sound forward by roughly the English's generation time plus the network tail.

**Implementation shape in this codebase.** The trainer is a no-build static page with UMD React,
so the SDK is not an option; the raw `fetch` + `ReadableStream` route is appropriate here. The same
endpoint and headers stay (including `anthropic-dangerous-direct-browser-access`); add
`stream: true`. Events to handle: `message_start`, `content_block_start`, `content_block_delta`
(`delta.type === "text_delta"`), `content_block_stop`, `message_delta` (carries `stop_reason` and
`usage.output_tokens`), `message_stop`, plus `error` events. Parse `event:`/`data:` line pairs
split on blank lines; a chunk boundary can fall mid-line, so keep a text buffer.

Incremental extraction: accumulate raw text; once `"spanish":"` has been seen, scan forward for the
first unescaped `"` — everything before it is the Spanish string. Render the partial (after
unescaping `\"`, `\\`, `\n`, `\uXXXX` — note a `\uXXXX` escape can be split across two deltas, so
unescape from the accumulated buffer, not per delta). When the closing quote arrives: `JSON.parse`
that substring for correctness, commit it to the message, call `speak()`. Continue accumulating
until `message_stop`, then run the existing `parseReply()` on the full text to fill in `english`.
Fence-stripping stays as is. If the stream errors before the Spanish closes, fall back to one
non-streaming call (today's path) so behaviour never regresses.

**Sentence-level TTS (v2).** Starting TTS on the first sentence (`.`/`?`/`!` inside the Spanish
string) would pull first-sound to ~TTFT + one sentence. On the browser voice this is free —
`speechSynthesis` queues utterances natively. On the Deepgram voice it means several `<audio>`
elements played back to back, which relaxes today's "exactly one Audio" rule to "one *playing*,
others queued", and short clips pay the per-call Vercel hop each. Do v1 (start at `spanish` close)
first; measure; then decide.

**Risks and mitigations.** Partial JSON edge cases (test with replies containing quotes, `¿…?`,
accented characters, and an occasional stray fence). Mid-stream 529s (fallback above). `speak()`
sequencing: the existing `speakSeqRef` guard already prevents a late clip playing after a stop.
Optional simplification with lower risk: change the output contract to two lines (Spanish, then a
separator, then English) instead of JSON — simpler to stream, at the cost of a prompt change to
re-validate. Alternatively fix 3 (lazy English) makes the streamed payload a single string.

---

## 6. Optional instrumentation: `?debug=1`

Purpose: capture one real session's numbers per stage before building anything, so the fix order
in §5 is confirmed or corrected by data.

**Enable.** `?debug=1` in the URL or `localStorage.st_debug = "1"`. Off by default; when off the
helper is a no-op so there is no cost in normal use.

**Mechanism.** A tiny `perf` helper: `perf.turn(n)` starts a turn, `perf.mark(stage)` records
`performance.now()` (and `performance.mark(...)` so the marks also show in DevTools → Performance),
`perf.note(key, value)` attaches metadata. At `reply_rendered` it prints one `console.table` row
per stage with deltas, keeps the last 50 turns in `window.__stPerf`, and Settings gains a
"Copy perf log" button (JSON) when debug is on. Overhead is microseconds.

**Marks and where they go**

| Mark | Call site | Delta it yields |
|---|---|---|
| `mic_press` | `startListening` (924) | — |
| `stt_open` | Deepgram `ws.onopen` (864) / Web Speech `onstart` | connect latency; also `note("sttEngine")` |
| `stt_first_interim` | first `setInterim` with text | recognizer warm-up |
| `stop_pressed` | `stopListening` (930) | — |
| `stt_close_sent` | after `CloseStream` (942) | — |
| `stt_final` | `finishDeepgram` (774) / `r.onend` (737) | **finalization**; `note("fallbackTimerFired", bool)`, `note("transcriptAfterClose", bool)` |
| `pending_shown` | `queuePending` (980) | render |
| `send_pressed` | `sendPending` / auto-send | **human dwell** |
| `req_built` | after `toApi` + `JSON.stringify`; `note("reqBytes")` | build |
| `req_sent` | just before `fetch` in `callClaude` (265) | — |
| `res_headers` | when `fetch` resolves (headers in) | TTFB / TTFT-ish for non-streaming; true TTFT once streaming exists (`first_delta`) |
| `res_body` | after `res.json()` (278) | download + parse; `note("usage", data.usage)`, `note("stopReason")`, `note("requestId", res.headers.get("request-id"))` |
| `parsed` | after `parseReply` (1015) | parse |
| `reply_rendered` | `useEffect` on `messages` (or `requestAnimationFrame` after `setMsgs`) | commit + paint |
| `tts_requested` | `speak()` entry (600); `note("voiceMode")` | — |
| `tts_loadstart` / `tts_canplay` / `tts_playing` | `<audio>` events in `speakCloud`; for browser voice `utterance.onstart`; `note("voiceLocalService")` | **time-to-first-sound** |
| `tts_ended` | `onended` | clip length |

**What one row looks like**

```
turn  sttEngine  stt_final  dwell  ttfb   gen    parse  render  tts_first  in_tok  out_tok  cache_read  reqKB  fallback
12    deepgram   0.41 s     1.30 s 0.82 s 1.65 s 1 ms   4 ms    0.19 s     1740    112      0           6.8    false
```

**Decision rules once a 20–30 turn session is captured (both voice modes, both STT engines):**

- `ttfb + gen` ≥ 60 % of machine time → do fix 1 (streaming) first, then 3.
- `dwell` median > 0.8 s → fix 2 (auto-send).
- `stt_final` p50 > 0.6 s or any `fallback = true` → fix 5; if `mic_press → stt_open` > 0.4 s → fix 4.
- `ttfb` grows > 200 ms between turn 1 and turn 30 → fix 6 (caching) matters for speed, not just cost.
- `out_tok` trends upward over the session → reply-length drift is the late-session cause; tighten the length rule in `LEVEL_RULES` or cap via prompt.
- `tts_first` > 1.0 s on the Deepgram voice with `voiceMode = deepgram` → check `x-vercel-id` for a cold start pattern; consider fix 9.

**Also worth capturing in the same session (one-off checks):**

1. Which origin the trainer was opened from, and what `<origin>/api/tts` returns there (JSON or 404).
2. The `x-vercel-id` response header on `/api/tts` (`<edge>::<function-region>::…`) to confirm the region.
3. `speechSynthesis.getVoices()` → the selected voice's `localService` flag.
4. Whether any Deepgram transcript arrives after `CloseStream`, and how often the 1200 ms timer fires.

---

## Appendix — what was measured vs estimated

**Measured (this machine, 2026-09-21):** CORS preflight headers from `api.anthropic.com`
(`access-control-max-age: 600`); connect/TLS/TTFB to `api.anthropic.com` (20/45/65 ms warm),
`api.deepgram.com` (50/100/145 ms), `api.elevenlabs.io` (20/45/90 ms); Vercel edge RTT to both
project domains (140–290 ms, PoP `cle1`); Vercel project settings (Node 24.x, SSO protection,
deploy times); system-prompt size reconstructed from source (~2,840 chars).

**Estimated:** all model-side timings (TTFT, tok/s), STT finalization, cold-start duration,
Deepgram TTFB, browser buffering, human dwell. These are the numbers §6 exists to replace.

**Could not verify from here:** the function's actual region (API response omitted it; SSO blocks
an unauthenticated header check), whether the `spanish-trainer` project serves `/api/tts`, and
real per-turn latency in a live session.
