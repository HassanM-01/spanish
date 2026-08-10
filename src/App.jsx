import React, { useEffect, useMemo, useState } from "react";
import {
  loadState,
  saveState,
  loadTab,
  saveTab,
  totalHours,
} from "./lib/storage.js";
import { levelFor } from "./lib/levels.js";
import Today from "./tabs/Today.jsx";
import Capture from "./tabs/Capture.jsx";
import Progress from "./tabs/Progress.jsx";
import Guide from "./tabs/Guide.jsx";

const TABS = [
  { id: "today", label: "Today" },
  { id: "capture", label: "Capture" },
  { id: "progress", label: "Progress" },
  { id: "guide", label: "Guide" },
];

// ---- shared primitives ----
export const Card = ({ children, className = "" }) => (
  <section className={`bg-surface border border-line rounded-xl p-5 ${className}`}>
    {children}
  </section>
);

export const SectionLabel = ({ children }) => (
  <div className="font-mono text-[11px] tracking-[0.1em] uppercase text-muted mb-3">
    {children}
  </div>
);

export const Mono = ({ children, className = "" }) => (
  <span className={`font-mono ${className}`}>{children}</span>
);

function Onboarding({ onDone, defaults }) {
  const [hours, setHours] = useState(String(defaults.startingHours));
  const [trainerUrl, setTrainerUrl] = useState(defaults.trainerUrl || "");
  const parsed = Number(hours);
  const valid = Number.isFinite(parsed) && parsed >= 0;
  return (
    <div className="fixed inset-0 z-50 bg-ink/85 flex items-center justify-center p-5">
      <div className="bg-surface border border-line rounded-xl p-7 w-full max-w-md">
        <h1 className="font-head font-bold text-xl mb-1">Set your baseline</h1>
        <p className="text-muted text-sm mb-5 leading-relaxed">
          You're not starting from zero. Estimate your total Spanish hours so far —
          input, study, and speaking combined. The level gauge builds on this.
        </p>
        <label htmlFor="ob-hours" className="font-mono text-[11px] tracking-[0.1em] uppercase text-muted block mb-2">
          Starting hours
        </label>
        <input
          id="ob-hours"
          type="number"
          min="0"
          value={hours}
          onChange={(e) => setHours(e.target.value)}
          className="w-full bg-ink border border-line rounded-lg px-3 py-2.5 font-mono text-lg text-body mb-5"
          autoFocus
        />
        <label htmlFor="ob-trainer" className="font-mono text-[11px] tracking-[0.1em] uppercase text-muted block mb-2">
          Speaking trainer URL
        </label>
        <input
          id="ob-trainer"
          type="url"
          value={trainerUrl}
          onChange={(e) => setTrainerUrl(e.target.value)}
          className="w-full bg-ink border border-line rounded-lg px-3 py-2.5 font-body text-sm text-body mb-6"
          placeholder="https://..."
        />
        <button
          className="w-full bg-amber text-ink font-body font-semibold rounded-lg py-2.5 disabled:opacity-40"
          disabled={!valid}
          onClick={() => onDone(parsed, trainerUrl.trim())}
        >
          Start tracking
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const [state, setState] = useState(loadState);
  const [tab, setTab] = useState(loadTab);

  useEffect(() => saveState(state), [state]);
  useEffect(() => saveTab(tab), [tab]);

  const hours = useMemo(() => totalHours(state), [state]);
  const lvl = useMemo(() => levelFor(hours), [hours]);

  const update = (fn) => setState((s) => fn(s));

  return (
    <div className="min-h-screen bg-ink text-body font-body">
      {!state.onboarded && (
        <Onboarding
          defaults={state.settings}
          onDone={(startingHours, trainerUrl) =>
            update((s) => ({
              ...s,
              onboarded: true,
              settings: {
                ...s.settings,
                startingHours,
                trainerUrl: trainerUrl || s.settings.trainerUrl,
              },
            }))
          }
        />
      )}

      <header className="border-b border-line">
        <div className="max-w-5xl mx-auto px-5 flex items-center gap-6 h-14">
          <span className="font-head font-bold tracking-tight text-[17px]">
            Spanish<span className="text-amber">.</span>
          </span>
          <nav className="flex gap-1" aria-label="Tabs">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                aria-current={tab === t.id ? "page" : undefined}
                className={`px-3.5 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  tab === t.id ? "bg-surface text-body" : "text-muted hover:text-body"
                }`}
              >
                {t.label}
              </button>
            ))}
          </nav>
          <div className="flex-1" />
          <div className="font-mono text-xs text-muted hidden sm:block">
            {hours.toFixed(1)} h · <span className="text-amber">{lvl.level}</span>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-5 py-7">
        {tab === "today" && <Today state={state} update={update} hours={hours} lvl={lvl} />}
        {tab === "capture" && <Capture state={state} update={update} />}
        {tab === "progress" && <Progress state={state} update={update} hours={hours} lvl={lvl} />}
        {tab === "guide" && <Guide />}
      </main>
    </div>
  );
}
