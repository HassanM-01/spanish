// Editable defaults. startingHours is asked once at onboarding — this is only the prefill.
export const DEFAULT_SETTINGS = {
  startingHours: 150,
  targetSplit: { input: 55, anki: 15, speaking: 30 }, // percentages, must sum to 100
  dailyGoalMinutes: 90,
  trainerUrl: "https://spanish-trainer-hassans-projects-f348d855.vercel.app",
};

export const LINKS = {
  dreamingSpanish: "https://www.dreamingspanish.com",
  anki: "https://ankiweb.net",
};

export const PILLARS = [
  { id: "input", label: "Input" },
  { id: "anki", label: "Anki" },
  { id: "speaking", label: "Speaking" },
];
