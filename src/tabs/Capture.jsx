import React, { useMemo, useRef, useState } from "react";
import { Card, SectionLabel, Mono } from "../App.jsx";
import { uuid, localDateStr } from "../lib/storage.js";
import { buildEnrichmentPrompt, parseEnrichedResponse } from "../lib/enrich.js";
import { parseTrainerSession, applyTrainerSession, CARD_THRESHOLD } from "../lib/trainerBridge.js";
import {
  buildMinedFile,
  buildErrorsFile,
  downloadTxt,
  minedFilename,
  errorsFilename,
} from "../lib/ankiExport.js";

export default function Capture({ state, update }) {
  const inputRef = useRef(null);
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState("");
  const [promptCopied, setPromptCopied] = useState(false);
  const [promptFallback, setPromptFallback] = useState(null);
  const [enrichPaste, setEnrichPaste] = useState("");
  const [enrichResult, setEnrichResult] = useState(null);
  const [bridgePaste, setBridgePaste] = useState("");
  const [bridgeResult, setBridgeResult] = useState(null);
  const [bridgeError, setBridgeError] = useState(null);
  const [exportNote, setExportNote] = useState(null);

  const today = localDateStr();
  const pending = state.captureQueue.filter((it) => it.status === "pending");
  const enriched = state.captureQueue.filter((it) => it.status === "enriched");
  const todaysCaptures = useMemo(
    () =>
      [...state.captureQueue]
        .filter((it) => (it.capturedAt || "").slice(0, 10) === today)
        .sort((a, b) => (b.capturedAt || "").localeCompare(a.capturedAt || "")),
    [state.captureQueue, today]
  );

  // ---- fast capture: type, Enter, done ----
  const addCapture = () => {
    const text = draft.trim();
    if (!text) return;
    update((s) => ({
      ...s,
      captureQueue: [
        ...s.captureQueue,
        {
          id: uuid(),
          spanish: text,
          english: null,
          note: null,
          source: "dreaming-spanish",
          deck: "mined",
          capturedAt: new Date().toISOString(),
          status: "pending",
        },
      ],
    }));
    setDraft("");
    inputRef.current?.focus();
  };

  const saveEdit = (id) => {
    const text = editText.trim();
    update((s) => ({
      ...s,
      captureQueue: text
        ? s.captureQueue.map((it) => (it.id === id ? { ...it, spanish: text } : it))
        : s.captureQueue,
    }));
    setEditingId(null);
  };

  const remove = (id) =>
    update((s) => ({ ...s, captureQueue: s.captureQueue.filter((it) => it.id !== id) }));

  // ---- enrichment round-trip ----
  const copyPrompt = async () => {
    const prompt = buildEnrichmentPrompt(pending);
    try {
      await navigator.clipboard.writeText(prompt);
      setPromptCopied(true);
      setPromptFallback(null);
      setTimeout(() => setPromptCopied(false), 2000);
    } catch {
      setPromptFallback(prompt);
    }
  };

  const applyEnrichment = () => {
    const res = parseEnrichedResponse(enrichPaste, pending);
    setEnrichResult(res);
    if (res.matched.length) {
      const byId = new Map(res.matched.map((m) => [m.id, m]));
      update((s) => ({
        ...s,
        captureQueue: s.captureQueue.map((it) =>
          byId.has(it.id)
            ? { ...it, english: byId.get(it.id).english, note: byId.get(it.id).note, status: "enriched" }
            : it
        ),
      }));
      setEnrichPaste("");
    }
  };

  // ---- trainer bridge ----
  const applyBridge = () => {
    setBridgeError(null);
    setBridgeResult(null);
    let session;
    try {
      session = parseTrainerSession(bridgePaste);
    } catch (e) {
      setBridgeError(e.message);
      return;
    }
    update((s) => {
      const { state: next, summary } = applyTrainerSession(s, session);
      setBridgeResult({ ...summary, sessionNumber: session.sessionNumber });
      return next;
    });
    setBridgePaste("");
  };

  // ---- export ----
  const exportCards = () => {
    const mined = enriched.filter((it) => it.deck === "mined");
    const errors = enriched.filter((it) => it.deck === "errors");
    if (!mined.length && !errors.length) return;
    if (mined.length) downloadTxt(minedFilename(), buildMinedFile(mined));
    if (errors.length) setTimeout(() => downloadTxt(errorsFilename(), buildErrorsFile(errors)), 300);
    const ids = new Set([...mined, ...errors].map((it) => it.id));
    update((s) => ({
      ...s,
      captureQueue: s.captureQueue.filter((it) => !ids.has(it.id)),
      archive: [
        ...s.archive,
        ...s.captureQueue
          .filter((it) => ids.has(it.id))
          .map((it) => ({ ...it, status: "exported" })),
      ],
    }));
    setExportNote(
      `Exported ${mined.length} mined + ${errors.length} error cards. Import the .txt files into Anki — decks and fields configure themselves.`
    );
  };

  const uncardedErrors = state.errorLog.filter((e) => !e.carded).sort((a, b) => b.count - a.count);

  return (
    <div className="grid gap-5">
      {/* Fast capture */}
      <Card>
        <SectionLabel>Fast capture</SectionLabel>
        <input
          ref={inputRef}
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addCapture()}
          placeholder="Type the Spanish you didn't catch, press Enter"
          aria-label="Capture Spanish phrase"
          className="w-full bg-ink border border-line rounded-lg px-4 py-3 text-body text-[15px] focus:border-teal"
        />
        <div className="mt-4">
          {todaysCaptures.length === 0 ? (
            <p className="text-muted text-sm">
              Nothing captured yet. Start a video and type what you don't catch.
            </p>
          ) : (
            <ul className="grid gap-1.5">
              {todaysCaptures.map((it) => (
                <li
                  key={it.id}
                  className="flex items-center gap-3 border border-line rounded-lg px-3.5 py-2"
                >
                  {editingId === it.id ? (
                    <input
                      autoFocus
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") saveEdit(it.id);
                        if (e.key === "Escape") setEditingId(null);
                      }}
                      onBlur={() => saveEdit(it.id)}
                      className="flex-1 bg-ink border border-line rounded-md px-2 py-1 text-sm"
                    />
                  ) : (
                    <button
                      className="flex-1 text-left text-sm"
                      onClick={() => {
                        setEditingId(it.id);
                        setEditText(it.spanish);
                      }}
                      title="Click to edit"
                    >
                      {it.spanish}
                      {it.english && <span className="text-muted"> — {it.english}</span>}
                    </button>
                  )}
                  <Mono
                    className={`text-[10px] uppercase tracking-wider ${
                      it.deck === "errors" ? "text-red" : it.status === "pending" ? "text-muted" : "text-teal"
                    }`}
                  >
                    {it.deck === "errors" ? "errors" : it.status}
                  </Mono>
                  <button
                    onClick={() => remove(it.id)}
                    aria-label={`Delete "${it.spanish}"`}
                    className="text-muted hover:text-red text-sm px-1"
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>

      {/* Enrich queue */}
      <Card>
        <div className="flex items-baseline justify-between">
          <SectionLabel>Enrich queue</SectionLabel>
          <Mono className="text-xs text-muted">
            {pending.length} pending · {enriched.length} ready
          </Mono>
        </div>
        <div className="flex flex-wrap items-start gap-4">
          <button
            onClick={copyPrompt}
            disabled={!pending.length}
            className="border border-line rounded-lg px-4 py-2.5 text-sm font-medium hover:border-teal disabled:opacity-40"
          >
            {promptCopied ? "Prompt copied ✓" : "Copy enrichment prompt"}
          </button>
          <div className="flex-1 min-w-[260px]">
            <label htmlFor="enrich-paste" className="sr-only">
              Paste enriched JSON
            </label>
            <textarea
              id="enrich-paste"
              value={enrichPaste}
              onChange={(e) => setEnrichPaste(e.target.value)}
              placeholder="Paste enriched JSON"
              rows={3}
              className="w-full bg-ink border border-line rounded-lg px-3 py-2 font-mono text-xs"
            />
            <button
              onClick={applyEnrichment}
              disabled={!enrichPaste.trim()}
              className="mt-2 bg-teal text-ink rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-40"
            >
              Apply
            </button>
          </div>
        </div>
        {promptFallback && (
          <pre className="font-mono text-xs bg-ink border border-line rounded-lg p-3 mt-3 overflow-x-auto">
            {promptFallback}
          </pre>
        )}
        {enrichResult && (
          <div className="mt-3 text-sm grid gap-1">
            {enrichResult.matched.length > 0 && (
              <p className="text-teal">Enriched {enrichResult.matched.length} items.</p>
            )}
            {enrichResult.error && <p className="text-red">{enrichResult.error}</p>}
            {enrichResult.strayIds.length > 0 && (
              <p className="text-muted">
                Ignored {enrichResult.strayIds.length} entries with unknown ids:{" "}
                <Mono>{enrichResult.strayIds.join(", ")}</Mono>
              </p>
            )}
            {enrichResult.unmatchedIds.length > 0 && (
              <p className="text-muted">
                Still pending (no match in the paste):{" "}
                {state.captureQueue
                  .filter((it) => enrichResult.unmatchedIds.includes(it.id))
                  .map((it) => `"${it.spanish}"`)
                  .join(", ")}
              </p>
            )}
          </div>
        )}
      </Card>

      {/* Trainer bridge */}
      <Card>
        <SectionLabel>Speaking session</SectionLabel>
        <label htmlFor="bridge-paste" className="sr-only">
          Paste speaking session
        </label>
        <textarea
          id="bridge-paste"
          value={bridgePaste}
          onChange={(e) => setBridgePaste(e.target.value)}
          placeholder='Paste the trainer\u2019s "Copy session for dashboard" JSON'
          rows={4}
          className="w-full bg-ink border border-line rounded-lg px-3 py-2 font-mono text-xs"
        />
        <button
          onClick={applyBridge}
          disabled={!bridgePaste.trim()}
          className="mt-2 bg-amber text-ink rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-40"
        >
          Apply session
        </button>
        {bridgeError && <p className="text-red text-sm mt-2">{bridgeError}</p>}
        {bridgeResult && (
          <div className="mt-3 text-sm grid gap-1">
            <p className="text-teal">
              Session{bridgeResult.sessionNumber != null ? ` #${bridgeResult.sessionNumber}` : ""} logged:{" "}
              {bridgeResult.errorsLogged} error patterns, {bridgeResult.vocabAdded} vocab gaps → Mined.
            </p>
            {bridgeResult.newlyCarded.length > 0 && (
              <p className="text-amber">
                Crossed the {CARD_THRESHOLD}× threshold and became cards:{" "}
                {bridgeResult.newlyCarded.join("; ")}
              </p>
            )}
          </div>
        )}
        {uncardedErrors.length > 0 && (
          <div className="mt-4">
            <div className="text-xs text-muted mb-1.5">
              Approaching the {CARD_THRESHOLD}× card threshold:
            </div>
            <ul className="grid gap-1">
              {uncardedErrors.slice(0, 6).map((e) => (
                <li key={e.pattern} className="flex items-center gap-2 text-sm">
                  <Mono className="text-xs text-muted w-8">{e.count}×</Mono>
                  <span>{e.pattern}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>

      {/* Export */}
      <Card>
        <div className="flex items-center gap-4 flex-wrap">
          <button
            onClick={exportCards}
            disabled={!enriched.length}
            className="bg-amber text-ink rounded-lg px-5 py-2.5 text-sm font-semibold disabled:opacity-40"
          >
            Export cards
          </button>
          <span className="text-sm text-muted">
            {enriched.length
              ? `${enriched.filter((i) => i.deck === "mined").length} mined + ${
                  enriched.filter((i) => i.deck === "errors").length
                } error cards ready`
              : "Enrich items first — only enriched cards export."}
          </span>
        </div>
        {exportNote && <p className="text-teal text-sm mt-3">{exportNote}</p>}
      </Card>
    </div>
  );
}
