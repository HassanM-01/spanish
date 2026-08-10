// Bridge to the speaking trainer (different origin, so state crosses by clipboard).
// Implements the AMENDED schema from Trainer Spec §3.6 / §5.2:
//   { sessionDate, sessionNumber, level?, scenario?, durationMinutes?, turnCount?,
//     errors: [{ pattern, youSaid, correct, prompt }],
//     vocabGaps: [{ spanish, english, note }] }
// Errors need count >= 3 before carding. vocabGaps have NO threshold — a word you
// couldn't produce is by definition a word you need; they go straight to Mined.
// Version B replaces this file with a same-origin automatic bridge — keep the interface.
import { uuid, localDateStr } from "./storage.js";
import { levelFor, LEVELS } from "./levels.js";
import { totalHours } from "./storage.js";

export const CARD_THRESHOLD = 3;

export function parseTrainerSession(text) {
  let t = String(text || "").trim();
  if (!t) throw new Error("The paste box is empty.");
  t = t.replace(/```(?:json)?/gi, "").trim();
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start === -1 || end <= start) {
    throw new Error("No JSON object found — expected the trainer's session export { ... }.");
  }
  let obj;
  try {
    obj = JSON.parse(t.slice(start, end + 1).replace(/,\s*([}\]])/g, "$1"));
  } catch (e) {
    throw new Error(`JSON parse failed: ${e.message}`);
  }
  if (!Array.isArray(obj.errors) && !Array.isArray(obj.vocabGaps)) {
    throw new Error(
      'This JSON has neither an "errors" array nor a "vocabGaps" array — is it the trainer export?'
    );
  }
  return {
    sessionDate: typeof obj.sessionDate === "string" ? obj.sessionDate : localDateStr(),
    sessionNumber: typeof obj.sessionNumber === "number" ? obj.sessionNumber : null,
    level: typeof obj.level === "string" ? obj.level : null,
    scenario: typeof obj.scenario === "string" ? obj.scenario : null,
    durationMinutes: typeof obj.durationMinutes === "number" ? obj.durationMinutes : null,
    turnCount: typeof obj.turnCount === "number" ? obj.turnCount : null,
    errors: (Array.isArray(obj.errors) ? obj.errors : []).filter(
      (e) => e && typeof e.pattern === "string" && e.pattern.trim()
    ),
    vocabGaps: (Array.isArray(obj.vocabGaps) ? obj.vocabGaps : []).filter(
      (v) => v && typeof v.spanish === "string" && v.spanish.trim()
    ),
  };
}

// Pure state transition. Returns { state, summary }.
export function applyTrainerSession(state, session) {
  const errorLog = state.errorLog.map((e) => ({ ...e }));
  const captureQueue = [...state.captureQueue];
  const summary = { errorsLogged: 0, newlyCarded: [], vocabAdded: 0, approaching: [] };

  for (const err of session.errors) {
    const pattern = err.pattern.trim();
    let entry = errorLog.find((e) => e.pattern === pattern);
    if (entry) {
      entry.count += 1;
      entry.lastSeen = session.sessionDate;
    } else {
      entry = { pattern, count: 1, lastSeen: session.sessionDate, carded: false };
      errorLog.push(entry);
    }
    summary.errorsLogged += 1;
    if (!entry.carded && entry.count >= CARD_THRESHOLD) {
      entry.carded = true;
      summary.newlyCarded.push(pattern);
      captureQueue.push({
        id: uuid(),
        // errors deck mapping: english = the elicitation prompt (card front),
        // spanish = the correct form (card back), note = what you actually said.
        spanish: err.correct || "",
        english: err.prompt || `Produce: ${pattern}`,
        note: err.youSaid ? `You said "${err.youSaid}" (${pattern})` : pattern,
        pattern,
        source: "trainer",
        deck: "errors",
        capturedAt: new Date().toISOString(),
        status: "enriched",
      });
    } else if (!entry.carded) {
      summary.approaching.push({ pattern, count: entry.count });
    }
  }

  for (const gap of session.vocabGaps) {
    captureQueue.push({
      id: uuid(),
      spanish: gap.spanish.trim(),
      english: (gap.english || "").trim(),
      note: (gap.note || "").trim(),
      source: "trainer",
      deck: "mined",
      capturedAt: new Date().toISOString(),
      status: gap.english ? "enriched" : "pending",
    });
    summary.vocabAdded += 1;
  }

  const speakingSessions = [
    ...state.speakingSessions,
    {
      date: session.sessionDate,
      sessionNumber: session.sessionNumber,
      level: session.level,
      scenario: session.scenario,
      durationMinutes: session.durationMinutes,
      turnCount: session.turnCount,
    },
  ];

  return { state: { ...state, errorLog, captureQueue, speakingSessions }, summary };
}

// Trainer Spec §5.1 — "Copy trainer briefing" payload for the trainer's paste box:
// { totalHours, level, sessionNumber, topErrors[], recentVocab[] }
export function buildTrainerBriefing(state) {
  const hours = totalHours(state);
  const lvl = levelFor(hours);
  const topErrors = [...state.errorLog]
    .sort((a, b) => b.count - a.count)
    .slice(0, 3)
    .map((e) => e.pattern);
  const recentVocab = [...state.captureQueue, ...state.archive]
    .filter((it) => it.deck === "mined" && (it.status === "enriched" || it.status === "exported"))
    .sort((a, b) => (b.capturedAt || "").localeCompare(a.capturedAt || ""))
    .slice(0, 4)
    .map((it) => it.spanish);
  return {
    totalHours: Math.round(hours * 10) / 10,
    level: LEVELS[lvl.index].id,
    sessionNumber: state.speakingSessions.length,
    topErrors,
    recentVocab,
  };
}
