// Clipboard round-trip enrichment. Version B swaps this file for an in-app API call —
// keep the interface (buildEnrichmentPrompt, parseEnrichedResponse) stable.

export function buildEnrichmentPrompt(pendingItems) {
  const lines = pendingItems.map((it, i) => `${i + 1}. [id: ${it.id}] ${it.spanish}`);
  return [
    "Translate each Spanish phrase below to English. For each, give a natural English",
    "meaning (not literal) and a one-line note on register or Mexican usage where relevant.",
    "",
    "Return ONLY a JSON array, no markdown fences, no preamble:",
    '[{"id":"...","english":"...","note":"..."}]',
    "",
    "Items:",
    ...lines,
  ].join("\n");
}

// Defensive parse. Tolerates markdown fences and trailing commas; on failure reports
// exactly what broke — never a generic "invalid JSON".
export function parseEnrichedResponse(text, pendingItems) {
  const result = { matched: [], unmatchedIds: [], strayIds: [], error: null };
  let t = String(text || "").trim();
  if (!t) {
    result.error = "The paste box is empty.";
    return result;
  }
  // Strip markdown fences anywhere.
  t = t.replace(/```(?:json)?/gi, "").trim();
  // Clip to the outermost array if there's preamble/postamble text.
  const start = t.indexOf("[");
  const end = t.lastIndexOf("]");
  if (start === -1 || end === -1 || end <= start) {
    result.error = "No JSON array found — expected the response to contain [ ... ].";
    return result;
  }
  t = t.slice(start, end + 1);
  // Tolerate trailing commas before } or ].
  t = t.replace(/,\s*([}\]])/g, "$1");

  let arr;
  try {
    arr = JSON.parse(t);
  } catch (e) {
    result.error = `JSON parse failed: ${e.message}`;
    return result;
  }
  if (!Array.isArray(arr)) {
    result.error = "Parsed JSON is not an array — got " + typeof arr + ".";
    return result;
  }

  const pendingById = new Map(pendingItems.map((it) => [it.id, it]));
  const seen = new Set();
  const problems = [];
  arr.forEach((entry, i) => {
    if (!entry || typeof entry !== "object") {
      problems.push(`Entry ${i + 1} is not an object.`);
      return;
    }
    if (!entry.id) {
      problems.push(`Entry ${i + 1} has no "id" field.`);
      return;
    }
    if (!pendingById.has(entry.id)) {
      result.strayIds.push(entry.id);
      return;
    }
    if (typeof entry.english !== "string" || !entry.english.trim()) {
      problems.push(`Entry for id ${entry.id} has no "english" text.`);
      return;
    }
    seen.add(entry.id);
    result.matched.push({
      id: entry.id,
      english: entry.english.trim(),
      note: typeof entry.note === "string" ? entry.note.trim() : "",
    });
  });

  result.unmatchedIds = pendingItems.filter((it) => !seen.has(it.id)).map((it) => it.id);
  if (problems.length) result.error = problems.join(" ");
  return result;
}
