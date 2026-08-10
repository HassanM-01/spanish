// Minimal Markdown → block list. Covers exactly what GUIDE.md uses — headings,
// paragraphs, ordered/unordered lists, thematic breaks — plus the common inline
// marks, so the guide renders through the dashboard's own primitives instead of
// pulling in a renderer dependency and a second set of typographic opinions.

function pushItem(blocks, type, text) {
  const last = blocks[blocks.length - 1];
  if (last && last.type === type) last.items.push(text);
  else blocks.push({ type, items: [text] });
}

export function parseMarkdown(src) {
  const lines = String(src).replace(/\r\n?/g, "\n").split("\n");
  const blocks = [];
  let para = null;
  let sawBlank = true;

  const flush = () => {
    if (para) blocks.push({ type: "p", lines: para });
    para = null;
  };

  for (const raw of lines) {
    const line = raw.trim();

    if (!line) {
      flush();
      sawBlank = true;
      continue;
    }

    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line)) {
      flush();
      blocks.push({ type: "hr" });
      sawBlank = false;
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      flush();
      blocks.push({ type: "h", level: heading[1].length, text: heading[2].trim() });
      sawBlank = false;
      continue;
    }

    const ordered = line.match(/^\d+[.)]\s+(.+)$/);
    if (ordered) {
      flush();
      pushItem(blocks, "ol", ordered[1]);
      sawBlank = false;
      continue;
    }

    const bulleted = line.match(/^[-*+]\s+(.+)$/);
    if (bulleted) {
      flush();
      pushItem(blocks, "ul", bulleted[1]);
      sawBlank = false;
      continue;
    }

    // Lazy continuation: an unmarked line right under a list item belongs to it.
    const last = blocks[blocks.length - 1];
    if (!para && !sawBlank && last && (last.type === "ol" || last.type === "ul")) {
      last.items[last.items.length - 1] += ` ${line}`;
      continue;
    }

    if (para) para.push(line);
    else para = [line];
    sawBlank = false;
  }

  flush();
  return blocks;
}

const INLINE =
  /(\*\*|__)([\s\S]+?)\1|(\*|_)([\s\S]+?)\3|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)/g;

// Flat list of { type: text | strong | em | code | link } spans. No nesting —
// the guide has none, and flat keeps the renderer a single switch.
export function parseInline(text) {
  const out = [];
  let cursor = 0;
  let m;
  INLINE.lastIndex = 0;
  while ((m = INLINE.exec(text))) {
    if (m.index > cursor) out.push({ type: "text", text: text.slice(cursor, m.index) });
    if (m[1]) out.push({ type: "strong", text: m[2] });
    else if (m[3]) out.push({ type: "em", text: m[4] });
    else if (m[5]) out.push({ type: "code", text: m[5] });
    else out.push({ type: "link", text: m[6], href: m[7] });
    cursor = INLINE.lastIndex;
  }
  if (cursor < text.length) out.push({ type: "text", text: text.slice(cursor) });
  return out;
}

export function slugify(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
