// Anki .txt generation. The # header lines are Anki import directives — the file
// self-configures deck, notetype, separator, and tag column on import. Do not remove.
import { localDateStr } from "./storage.js";

const esc = (s) =>
  String(s || "")
    .replace(/\t/g, " ")
    .replace(/\n/g, "<br>");

function monthTag() {
  return localDateStr().slice(0, 7); // YYYY-MM
}

// Recognition cards: front = Spanish, back = English, third field = note.
export function buildMinedFile(items) {
  const header = [
    "#separator:tab",
    "#html:true",
    "#notetype:Basic",
    "#deck:Spanish::Mined",
    "#tags column:4",
  ];
  const rows = items.map((it) => {
    const src = it.source === "trainer" ? "trainer" : it.source === "manual" ? "manual" : "ds";
    return [esc(it.spanish), esc(it.english), esc(it.note), `mined ${src} ${monthTag()}`].join("\t");
  });
  return header.join("\n") + "\n" + rows.join("\n") + "\n";
}

// Production cards: front = English prompt, back = correct Spanish, third field = what you said.
// Queue items on the errors deck store: english = prompt, spanish = correct, note = "You said ...".
export function buildErrorsFile(items) {
  const header = [
    "#separator:tab",
    "#html:true",
    "#notetype:Basic",
    "#deck:Spanish::Errors",
    "#tags column:4",
  ];
  const rows = items.map((it) => {
    const patternTag = (it.pattern || "error").toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40);
    return [esc(it.english), esc(it.spanish), esc(it.note), `error ${patternTag} ${monthTag()}`].join(
      "\t"
    );
  });
  return header.join("\n") + "\n" + rows.join("\n") + "\n";
}

export function downloadTxt(filename, content) {
  // UTF-8 BOM so Anki reads accents correctly on every platform.
  const blob = new Blob(["\uFEFF" + content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function minedFilename() {
  return `spanish-mined-${localDateStr()}.txt`;
}

export function errorsFilename() {
  return `spanish-errors-${localDateStr()}.txt`;
}
