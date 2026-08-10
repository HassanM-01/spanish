import React, { useMemo, useRef, useState } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { Card, SectionLabel, Mono } from "../App.jsx";
import { LEVELS, MAX_HOURS } from "../lib/levels.js";
import { exportBackup, parseBackup, localDateStr } from "../lib/storage.js";
import { PILLARS } from "../config/settings.js";

// ---- signature element: vertical calibrated level gauge ----
// Tick spacing is proportional to real hour thresholds — B2→C1 reads as the long
// climb it actually is. Everything else on this tab stays quiet.
function LevelGauge({ hours, lvl }) {
  const H = 420;
  const PAD = 16;
  const scaleMax = MAX_HOURS;
  const yFor = (h) => H - PAD - (Math.min(h, scaleMax) / scaleMax) * (H - PAD * 2);
  const yNow = yFor(hours);
  const yNext = yFor(lvl.nextThreshold);

  return (
    <div className="flex gap-5">
      <svg
        width="150"
        height={H}
        viewBox={`0 0 150 ${H}`}
        role="img"
        aria-label={`Level gauge: ${hours.toFixed(1)} hours, ${lvl.level}`}
        className="shrink-0"
      >
        <defs>
          <linearGradient id="gap-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#E8A33D" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#E8A33D" stopOpacity="0.06" />
          </linearGradient>
        </defs>
        {/* rail */}
        <line x1="44" y1={PAD} x2="44" y2={H - PAD} stroke="#2A323E" strokeWidth="2" />
        {/* amber fill between current position and next threshold */}
        {lvl.nextLevel && (
          <rect x="41" y={yNext} width="6" height={Math.max(0, yNow - yNext)} fill="url(#gap-fill)" />
        )}
        {/* progress below current position */}
        <line x1="44" y1={yNow} x2="44" y2={H - PAD} stroke="#E8A33D" strokeWidth="2" />
        {/* etched threshold ticks */}
        {LEVELS.map((l) => {
          const y = yFor(l.hours);
          const reached = hours >= l.hours;
          return (
            <g key={l.id}>
              <line x1="34" y1={y} x2="54" y2={y} stroke={reached ? "#E8A33D" : "#8A94A3"} strokeWidth="1.5" />
              <text
                x="60"
                y={y + 4}
                fontFamily="'IBM Plex Mono', monospace"
                fontSize="11"
                fill={reached ? "#E6E9EE" : "#8A94A3"}
              >
                {l.id}
              </text>
              <text
                x="30"
                y={y + 4}
                textAnchor="end"
                fontFamily="'IBM Plex Mono', monospace"
                fontSize="10"
                fill="#8A94A3"
              >
                {l.hours}
              </text>
            </g>
          );
        })}
        {/* current position indicator */}
        <g className="gauge-indicator" style={{ transform: `translateY(${yNow}px)` }}>
          <polygon points="44,0 36,-5 36,5" fill="#E8A33D" />
          <text
            x="98"
            y="4"
            fontFamily="'IBM Plex Mono', monospace"
            fontSize="12"
            fill="#E8A33D"
            textAnchor="start"
          >
            {hours.toFixed(1)} h
          </text>
        </g>
      </svg>
      <div className="grid content-center gap-4 min-w-0">
        <div>
          <div className="font-mono text-[11px] tracking-[0.1em] uppercase text-muted mb-1">
            Now — {lvl.level}
          </div>
          <p className="text-sm leading-relaxed">{lvl.can}</p>
        </div>
        {lvl.nextLevel && (
          <div>
            <div className="font-mono text-[11px] tracking-[0.1em] uppercase text-amber mb-1">
              Next — {lvl.nextLevel} in {Math.ceil(lvl.hoursRemaining)} h
            </div>
            <p className="text-sm leading-relaxed text-body">{lvl.nextCan}</p>
          </div>
        )}
        <Mono className="text-xs text-muted">
          {Math.floor(lvl.hoursInto)} h into {lvl.level}
        </Mono>
      </div>
    </div>
  );
}

export default function Progress({ state, update, hours, lvl }) {
  const [query, setQuery] = useState("");
  const [restoreMsg, setRestoreMsg] = useState(null);
  const fileRef = useRef(null);

  // cumulative hours series
  const series = useMemo(() => {
    const sorted = [...state.sessions].sort((a, b) => a.date.localeCompare(b.date));
    let acc = state.settings.startingHours || 0;
    const pts = [{ date: "start", hours: Math.round(acc * 10) / 10 }];
    for (const s of sorted) {
      acc += ((s.input || 0) + (s.anki || 0) + (s.speaking || 0)) / 60;
      pts.push({ date: s.date.slice(5), hours: Math.round(acc * 10) / 10 });
    }
    return pts;
  }, [state.sessions, state.settings.startingHours]);

  // split adherence over last 30 days
  const adherence = useMemo(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    const cutoffStr = localDateStr(cutoff);
    const recent = state.sessions.filter((s) => s.date >= cutoffStr);
    const totals = { input: 0, anki: 0, speaking: 0 };
    for (const s of recent) {
      totals.input += s.input || 0;
      totals.anki += s.anki || 0;
      totals.speaking += s.speaking || 0;
    }
    const sum = totals.input + totals.anki + totals.speaking;
    return PILLARS.map(({ id, label }) => ({
      id,
      label,
      actual: sum ? Math.round((totals[id] / sum) * 100) : 0,
      target: state.settings.targetSplit[id],
    }));
  }, [state.sessions, state.settings.targetSplit]);

  const counters = {
    captured: state.captureQueue.length + state.archive.length,
    exported: state.archive.length,
    speaking: state.speakingSessions.length,
    streak: state.streak.current,
    longest: state.streak.longest,
  };

  const errors = [...state.errorLog].sort((a, b) => b.count - a.count);

  const archiveHits = useMemo(() => {
    const q = query.trim().toLowerCase();
    const items = [...state.archive].sort((a, b) =>
      (b.capturedAt || "").localeCompare(a.capturedAt || "")
    );
    if (!q) return items.slice(0, 30);
    return items.filter(
      (it) =>
        (it.spanish || "").toLowerCase().includes(q) ||
        (it.english || "").toLowerCase().includes(q) ||
        (it.note || "").toLowerCase().includes(q)
    );
  }, [state.archive, query]);

  const onRestoreFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const restored = parseBackup(String(reader.result));
        const ok = window.confirm(
          "Restore this backup? It replaces everything currently stored on this device."
        );
        if (ok) {
          update(() => restored);
          setRestoreMsg("Backup restored.");
        }
      } catch (err) {
        setRestoreMsg(`Restore failed: ${err.message}`);
      }
      e.target.value = "";
    };
    reader.readAsText(file);
  };

  return (
    <div className="grid gap-5">
      <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-5">
        <Card>
          <SectionLabel>Level</SectionLabel>
          <LevelGauge hours={hours} lvl={lvl} />
        </Card>

        <div className="grid gap-5 content-start">
          <Card>
            <SectionLabel>Hours over time</SectionLabel>
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={series} margin={{ top: 6, right: 8, bottom: 0, left: -14 }}>
                  <defs>
                    <linearGradient id="hrs" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#E8A33D" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="#E8A33D" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="date"
                    stroke="#2A323E"
                    tick={{ fill: "#8A94A3", fontSize: 10, fontFamily: "IBM Plex Mono" }}
                    tickLine={false}
                    minTickGap={30}
                  />
                  <YAxis
                    stroke="#2A323E"
                    tick={{ fill: "#8A94A3", fontSize: 10, fontFamily: "IBM Plex Mono" }}
                    tickLine={false}
                    width={54}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "#1A2029",
                      border: "1px solid #2A323E",
                      borderRadius: 8,
                      fontFamily: "IBM Plex Mono",
                      fontSize: 12,
                    }}
                    labelStyle={{ color: "#8A94A3" }}
                  />
                  {LEVELS.filter((l) => l.hours > 0).map((l) => (
                    <ReferenceLine
                      key={l.id}
                      y={l.hours}
                      stroke="#2A323E"
                      strokeDasharray="4 4"
                      label={{
                        value: l.id,
                        position: "insideTopRight",
                        fill: "#8A94A3",
                        fontSize: 10,
                        fontFamily: "IBM Plex Mono",
                      }}
                    />
                  ))}
                  <Area type="monotone" dataKey="hours" stroke="#E8A33D" strokeWidth={2} fill="url(#hrs)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card>
            <SectionLabel>Split adherence — last 30 days</SectionLabel>
            <div className="grid gap-3">
              {adherence.map((p) => (
                <div key={p.id}>
                  <div className="flex justify-between text-xs mb-1">
                    <span>{p.label}</span>
                    <Mono className="text-muted">
                      {p.actual}% <span className="text-line">/</span> target {p.target}%
                    </Mono>
                  </div>
                  <div className="relative h-2 bg-ink rounded-full overflow-hidden border border-line">
                    <div
                      className="absolute inset-y-0 left-0 rounded-full"
                      style={{
                        width: `${Math.min(100, p.actual)}%`,
                        background: p.id === "speaking" ? "#E8A33D" : p.id === "input" ? "#4FA8A0" : "#8A94A3",
                        opacity: 0.9,
                      }}
                    />
                    <div className="absolute inset-y-0 w-px bg-body/60" style={{ left: `${p.target}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>

      <Card>
        <SectionLabel>Counters</SectionLabel>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
          {[
            ["Cards captured", counters.captured],
            ["Cards exported", counters.exported],
            ["Speaking sessions", counters.speaking],
            ["Current streak", counters.streak],
            ["Longest streak", counters.longest],
          ].map(([label, value]) => (
            <div key={label}>
              <div className="font-mono text-2xl">{value}</div>
              <div className="text-xs text-muted mt-0.5">{label}</div>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <SectionLabel>Top recurring errors</SectionLabel>
        {errors.length === 0 ? (
          <p className="text-muted text-sm">
            No error patterns logged yet. Paste a speaking session on the Capture tab.
          </p>
        ) : (
          <ul className="grid gap-1.5">
            {errors.map((e) => (
              <li key={e.pattern} className="flex items-center gap-3 text-sm">
                <Mono className="text-xs text-muted w-8 shrink-0">{e.count}×</Mono>
                <span className="flex-1">{e.pattern}</span>
                {e.carded ? (
                  <Mono className="text-[10px] uppercase tracking-wider text-red">carded</Mono>
                ) : (
                  <Mono className="text-[10px] uppercase tracking-wider text-muted">
                    {3 - e.count > 0 ? `${3 - e.count} to card` : ""}
                  </Mono>
                )}
                <Mono className="text-[10px] text-muted hidden sm:block">{e.lastSeen}</Mono>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <SectionLabel>Archive</SectionLabel>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search exported cards"
          aria-label="Search archive"
          className="w-full bg-ink border border-line rounded-lg px-3.5 py-2.5 text-sm mb-3"
        />
        {archiveHits.length === 0 ? (
          <p className="text-muted text-sm">
            {state.archive.length === 0
              ? "Nothing exported yet — cards land here after export so they stay searchable."
              : "No matches for that search."}
          </p>
        ) : (
          <ul className="grid gap-1.5">
            {archiveHits.map((it) => (
              <li key={it.id} className="text-sm border border-line rounded-lg px-3.5 py-2">
                <span className="font-medium">{it.spanish}</span>
                {it.english && <span className="text-muted"> — {it.english}</span>}
                {it.note && <div className="text-xs text-muted mt-0.5">{it.note}</div>}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <SectionLabel>Backup</SectionLabel>
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => exportBackup(state)}
            className="border border-line rounded-lg px-4 py-2.5 text-sm font-medium hover:border-muted"
          >
            Download backup JSON
          </button>
          <button
            onClick={() => fileRef.current?.click()}
            className="border border-line rounded-lg px-4 py-2.5 text-sm font-medium hover:border-muted"
          >
            Restore from file
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            onChange={onRestoreFile}
            className="hidden"
            aria-label="Restore backup file"
          />
          {restoreMsg && <span className="text-sm text-teal">{restoreMsg}</span>}
        </div>
        <p className="text-muted text-xs mt-3">
          Everything lives in this browser's localStorage. One backup a month is cheap insurance.
        </p>
      </Card>
    </div>
  );
}
