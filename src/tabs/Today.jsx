import React, { useMemo, useState } from "react";
import { Card, SectionLabel, Mono } from "../App.jsx";
import { localDateStr, sessionFor, bumpStreakForLog, reconcileStreak } from "../lib/storage.js";
import { buildTrainerBriefing } from "../lib/trainerBridge.js";
import { CHANNEL_GROUPS } from "../config/channels.js";
import { LINKS, PILLARS } from "../config/settings.js";

const PILLAR_COLOR = { input: "#4FA8A0", anki: "#8A94A3", speaking: "#E8A33D" };

export default function Today({ state, update, hours, lvl }) {
  const today = localDateStr();
  const session = sessionFor(state, today) || { input: 0, anki: 0, speaking: 0 };
  const totalToday = session.input + session.anki + session.speaking;
  const [pulse, setPulse] = useState(false);
  const [briefingCopied, setBriefingCopied] = useState(false);
  const [briefingFallback, setBriefingFallback] = useState(null);

  const log = (pillar, delta) => {
    update((s0) => {
      let s = reconcileStreak(s0, today);
      const existing = s.sessions.find((x) => x.date === today);
      const next = existing
        ? s.sessions.map((x) =>
            x.date === today ? { ...x, [pillar]: Math.max(0, (x[pillar] || 0) + delta) } : x
          )
        : [...s.sessions, { date: today, input: 0, anki: 0, speaking: 0, [pillar]: Math.max(0, delta) }];
      s = { ...s, sessions: next };
      const after = s.sessions.find((x) => x.date === today);
      const any = after.input + after.anki + after.speaking > 0;
      if (any) {
        const r = bumpStreakForLog(s, today);
        if (r.pulsed) {
          setPulse(true);
          setTimeout(() => setPulse(false), 900);
        }
        return r.state;
      }
      return s;
    });
  };

  const setExact = (pillar, value) => {
    const v = Math.max(0, Math.round(Number(value) || 0));
    update((s0) => {
      let s = reconcileStreak(s0, today);
      const existing = s.sessions.find((x) => x.date === today);
      const next = existing
        ? s.sessions.map((x) => (x.date === today ? { ...x, [pillar]: v } : x))
        : [...s.sessions, { date: today, input: 0, anki: 0, speaking: 0, [pillar]: v }];
      s = { ...s, sessions: next };
      const after = s.sessions.find((x) => x.date === today);
      if (after.input + after.anki + after.speaking > 0) {
        return bumpStreakForLog(s, today).state;
      }
      return s;
    });
  };

  const copyBriefing = async () => {
    const json = JSON.stringify(buildTrainerBriefing(state), null, 2);
    try {
      await navigator.clipboard.writeText(json);
      setBriefingCopied(true);
      setBriefingFallback(null);
      setTimeout(() => setBriefingCopied(false), 2000);
    } catch {
      setBriefingFallback(json);
    }
  };

  const goal = state.settings.dailyGoalMinutes;

  return (
    <div className="grid gap-5">
      {/* Streak + level strip */}
      <Card className={`flex flex-wrap items-center gap-x-8 gap-y-3 ${pulse ? "streak-pulse" : ""}`}>
        <div>
          <div className="font-mono text-[11px] tracking-[0.1em] uppercase text-muted">Streak</div>
          <div className="font-mono text-2xl text-amber leading-tight">
            {state.streak.current}
            <span className="text-sm text-muted"> d</span>
          </div>
        </div>
        <div>
          <div className="font-mono text-[11px] tracking-[0.1em] uppercase text-muted">Freezes</div>
          <div className="font-mono text-2xl leading-tight">{state.streak.freezesAvailable}</div>
        </div>
        <div>
          <div className="font-mono text-[11px] tracking-[0.1em] uppercase text-muted">Total hours</div>
          <div className="font-mono text-2xl leading-tight">{hours.toFixed(1)}</div>
        </div>
        <div>
          <div className="font-mono text-[11px] tracking-[0.1em] uppercase text-muted">Level</div>
          <div className="font-head font-bold text-2xl text-amber leading-tight">{lvl.level}</div>
        </div>
        {lvl.nextLevel && (
          <div className="flex-1 min-w-[180px]">
            <div className="font-mono text-[11px] tracking-[0.1em] uppercase text-muted">
              To {lvl.nextLevel}
            </div>
            <div className="font-mono text-2xl leading-tight">
              {Math.ceil(lvl.hoursRemaining)}
              <span className="text-sm text-muted"> h</span>
            </div>
          </div>
        )}
      </Card>

      {/* Split bars + logging */}
      <Card>
        <div className="flex items-baseline justify-between mb-4">
          <SectionLabel>Today's balance</SectionLabel>
          <Mono className="text-xs text-muted">
            {totalToday} / {goal} min
          </Mono>
        </div>
        <div className="grid gap-5">
          {PILLARS.map(({ id, label }) => {
            const mins = session[id] || 0;
            const actualPct = totalToday > 0 ? Math.round((mins / totalToday) * 100) : 0;
            const targetPct = state.settings.targetSplit[id];
            return (
              <div key={id}>
                <div className="flex items-baseline justify-between mb-1.5">
                  <span className="text-sm font-medium">{label}</span>
                  <Mono className="text-xs text-muted">
                    {mins} min · {actualPct}% <span className="text-line">/</span> target {targetPct}%
                  </Mono>
                </div>
                <div className="relative h-2 bg-ink rounded-full overflow-hidden border border-line">
                  <div
                    className="absolute inset-y-0 left-0 rounded-full"
                    style={{
                      width: `${Math.min(100, actualPct)}%`,
                      background: PILLAR_COLOR[id],
                      opacity: 0.9,
                    }}
                  />
                  <div
                    className="absolute inset-y-0 w-px bg-body/60"
                    style={{ left: `${targetPct}%` }}
                    title={`Target ${targetPct}%`}
                  />
                </div>
                <div className="flex items-center gap-2 mt-2">
                  {[5, 15, 30].map((d) => (
                    <button
                      key={d}
                      onClick={() => log(id, d)}
                      className="font-mono text-xs border border-line rounded-md px-2.5 py-1 text-muted hover:text-body hover:border-muted"
                    >
                      +{d}
                    </button>
                  ))}
                  <input
                    type="number"
                    min="0"
                    value={mins}
                    onChange={(e) => setExact(id, e.target.value)}
                    aria-label={`${label} minutes today`}
                    className="w-20 bg-ink border border-line rounded-md px-2 py-1 font-mono text-xs text-body ml-1"
                  />
                  <span className="text-xs text-muted">min</span>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Links + briefing */}
      <Card>
        <SectionLabel>Go practice</SectionLabel>
        <div className="flex flex-wrap gap-3">
          <a
            className="border border-line rounded-lg px-4 py-2.5 text-sm font-medium hover:border-teal"
            href={LINKS.dreamingSpanish}
            target="_blank"
            rel="noreferrer"
          >
            Dreaming Spanish ↗
          </a>
          <a
            className="border border-line rounded-lg px-4 py-2.5 text-sm font-medium hover:border-amber"
            href={state.settings.trainerUrl}
            target="_blank"
            rel="noreferrer"
          >
            Speaking Trainer ↗
          </a>
          <a
            className="border border-line rounded-lg px-4 py-2.5 text-sm font-medium hover:border-muted"
            href={LINKS.anki}
            target="_blank"
            rel="noreferrer"
            title="Fallback — desktop Anki is the real target"
          >
            Anki ↗
          </a>
          <button
            onClick={copyBriefing}
            className="bg-amber text-ink rounded-lg px-4 py-2.5 text-sm font-semibold"
          >
            {briefingCopied ? "Briefing copied ✓" : "Copy trainer briefing"}
          </button>
        </div>
        <p className="text-muted text-xs mt-3">
          The briefing carries your hours, level, top error patterns, and recent vocab into the
          trainer's setup screen — paste it there before starting a session.
        </p>
        {briefingFallback && (
          <div className="mt-3">
            <p className="text-amber text-xs mb-2">
              The clipboard said no — copy the JSON below manually.
            </p>
            <pre className="font-mono text-xs bg-ink border border-line rounded-lg p-3 overflow-x-auto">
              {briefingFallback}
            </pre>
          </div>
        )}
      </Card>

      {/* Channel list */}
      <Card>
        <SectionLabel>Channels</SectionLabel>
        <div className="grid gap-6">
          {CHANNEL_GROUPS.map((g) => (
            <div key={g.group}>
              <div className="text-sm font-head font-semibold mb-2">{g.group}</div>
              <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {g.channels.map((c) => (
                  <li key={c.name}>
                    <a
                      href={c.url}
                      target="_blank"
                      rel="noreferrer"
                      className="block border border-line rounded-lg px-3.5 py-3 hover:border-teal h-full"
                    >
                      <div className="text-sm font-medium">
                        {c.name} <span aria-hidden="true">{c.flag}</span>
                      </div>
                      <div className="text-xs text-muted mt-0.5 leading-relaxed">{c.desc}</div>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <p className="text-muted text-xs mt-4">
          Edit this list in <Mono>src/config/channels.js</Mono> — it's yours to curate.
        </p>
      </Card>
    </div>
  );
}
