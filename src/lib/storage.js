// Versioned localStorage wrapper. All state access goes through here so schema v2
// can migrate instead of wiping a year of data.
import { DEFAULT_SETTINGS } from "../config/settings.js";

const KEY = "spanish-dashboard-v1";
const TAB_KEY = "spanish-dashboard-tab";
export const SCHEMA_VERSION = 1;

export function defaultState() {
  return {
    schemaVersion: SCHEMA_VERSION,
    onboarded: false,
    settings: { ...DEFAULT_SETTINGS, targetSplit: { ...DEFAULT_SETTINGS.targetSplit } },
    sessions: [], // { date: "YYYY-MM-DD", input, anki, speaking } minutes
    streak: {
      current: 0,
      longest: 0,
      lastLoggedDate: null,
      freezesAvailable: 1,
      lastFreezeGrantedDate: null,
    },
    captureQueue: [], // see spec §4
    archive: [],
    errorLog: [], // { pattern, count, lastSeen, carded }
    speakingSessions: [], // { date, sessionNumber, level, scenario, durationMinutes, turnCount }
  };
}

// ---- date helpers (all local time; streak rolls at local midnight) ----
export function localDateStr(d = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function daysBetween(a, b) {
  // whole local days from date-string a to date-string b
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  const da = new Date(ay, am - 1, ad);
  const db = new Date(by, bm - 1, bd);
  return Math.round((db - da) / 86400000);
}

// ---- migrations ----
function migrate(raw) {
  if (!raw || typeof raw !== "object") return defaultState();
  let s = raw;
  // Future migrations chain here:
  // if (s.schemaVersion === 1) { s = migrateV1toV2(s); }
  if (s.schemaVersion !== SCHEMA_VERSION) return defaultState();
  // Backfill fields added within v1 without a version bump.
  const d = defaultState();
  return {
    ...d,
    ...s,
    settings: { ...d.settings, ...(s.settings || {}) },
    streak: { ...d.streak, ...(s.streak || {}) },
    speakingSessions: s.speakingSessions || [],
  };
}

// ---- streak reconciliation ----
// A missed day silently consumes a freeze if one is available; a longer gap, or a
// miss with no freeze, breaks the streak. Run on load and before logging.
export function reconcileStreak(state, today = localDateStr()) {
  const st = { ...state.streak };
  if (!st.lastLoggedDate) return { ...state, streak: st };
  const gap = daysBetween(st.lastLoggedDate, today);
  if (gap <= 1) return { ...state, streak: st }; // logged today or yesterday — intact
  const missedDays = gap - 1;
  if (missedDays === 1 && st.freezesAvailable > 0) {
    st.freezesAvailable -= 1; // freeze silently covers the single missed day
  } else {
    st.current = 0;
  }
  return { ...state, streak: st };
}

// Called when minutes are logged for `date` (today only in the UI).
export function bumpStreakForLog(state, date) {
  const st = { ...state.streak };
  let pulsed = false;
  if (st.lastLoggedDate !== date) {
    const gap = st.lastLoggedDate ? daysBetween(st.lastLoggedDate, date) : null;
    if (gap === null || gap > 1) {
      // reconcileStreak already handled freeze/reset; a covered gap continues the run
      st.current = st.current > 0 ? st.current + 1 : 1;
    } else if (gap === 1) {
      st.current += 1;
    }
    st.lastLoggedDate = date;
    st.longest = Math.max(st.longest, st.current);
    pulsed = true;
    // Freeze grant: one per 7 consecutive days, max 1 held.
    if (st.current > 0 && st.current % 7 === 0 && st.freezesAvailable < 1) {
      st.freezesAvailable = 1;
      st.lastFreezeGrantedDate = date;
    }
  }
  return { state: { ...state, streak: st }, pulsed };
}

// ---- persistence ----
export function loadState() {
  let parsed = null;
  try {
    const raw = localStorage.getItem(KEY);
    parsed = raw ? JSON.parse(raw) : null;
  } catch {
    parsed = null;
  }
  return reconcileStreak(migrate(parsed));
}

export function saveState(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // storage full or blocked — nothing sane to do silently; UI stays in memory
  }
}

export function loadTab() {
  try {
    return localStorage.getItem(TAB_KEY) || "today";
  } catch {
    return "today";
  }
}

export function saveTab(tab) {
  try {
    localStorage.setItem(TAB_KEY, tab);
  } catch {
    /* noop */
  }
}

// ---- derived ----
export function totalHours(state) {
  const mins = state.sessions.reduce(
    (t, s) => t + (s.input || 0) + (s.anki || 0) + (s.speaking || 0),
    0
  );
  return (state.settings.startingHours || 0) + mins / 60;
}

export function sessionFor(state, date) {
  return state.sessions.find((s) => s.date === date) || null;
}

// ---- backup / restore ----
export function exportBackup(state) {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `spanish-dashboard-backup-${localDateStr()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function parseBackup(text) {
  const parsed = JSON.parse(text);
  if (!parsed || typeof parsed !== "object" || !("schemaVersion" in parsed)) {
    throw new Error("File is JSON but not a dashboard backup (no schemaVersion field).");
  }
  return migrate(parsed);
}

export function uuid() {
  return crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
