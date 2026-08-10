// Level ladder driven by total logged hours. Thresholds are real and nonlinear —
// the Progress gauge must respect this spacing.
export const LEVELS = [
  { id: "Pre-A1", hours: 0, can: "Isolated words, memorized phrases." },
  { id: "A1", hours: 70, can: "Order food, give basic facts about yourself." },
  { id: "A2", hours: 180, can: "Transactions comfortable. Past tense exists, mangled." },
  { id: "B1", hours: 400, can: "Two hours without English. Date-viable." },
  { id: "B2", hours: 750, can: "Stop translating. Handle groups, jokes, argue a point." },
  { id: "C1", hours: 1300, can: "Register control, sarcasm, wordplay. Nothing constrains you." },
];

export const MAX_HOURS = LEVELS[LEVELS.length - 1].hours;

export function levelFor(totalHours) {
  let idx = 0;
  for (let i = 0; i < LEVELS.length; i++) {
    if (totalHours >= LEVELS[i].hours) idx = i;
  }
  const current = LEVELS[idx];
  const next = LEVELS[idx + 1] || null;
  return {
    index: idx,
    level: current.id,
    can: current.can,
    nextLevel: next ? next.id : null,
    nextCan: next ? next.can : null,
    hoursInto: totalHours - current.hours,
    hoursRemaining: next ? next.hours - totalHours : 0,
    nextThreshold: next ? next.hours : current.hours,
  };
}
