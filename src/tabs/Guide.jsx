import React, { useEffect, useMemo, useState } from "react";
import { Card, SectionLabel, Mono } from "../App.jsx";
import { parseMarkdown, parseInline, slugify } from "../lib/markdown.js";
// Bundled at build time — the guide ships inside the app, so it reads offline.
import guideMd from "../../GUIDE.md?raw";

// ---- markdown → the dashboard's own primitives ----

function Inline({ text }) {
  return parseInline(text).map((node, i) => {
    if (node.type === "strong") return <strong key={i} className="font-semibold text-body">{node.text}</strong>;
    if (node.type === "em") return <em key={i}>{node.text}</em>;
    if (node.type === "code")
      return (
        <Mono key={i} className="text-[12.5px] bg-ink border border-line rounded px-1 py-0.5">
          {node.text}
        </Mono>
      );
    if (node.type === "link")
      return (
        <a
          key={i}
          href={node.href}
          target="_blank"
          rel="noreferrer"
          className="text-amber underline underline-offset-2"
        >
          {node.text}
        </a>
      );
    return <React.Fragment key={i}>{node.text}</React.Fragment>;
  });
}

// A paragraph whose every line reads "Label: detail" becomes a definition grid.
// That is how the condensed rhythm and the troubleshooting list are written, and
// they read as lookup tables rather than prose.
function Para({ lines }) {
  const pairs = lines.map((l) => l.match(/^([^:]{2,40}):\s+(\S[\s\S]*)$/));
  if (lines.length > 1 && pairs.every(Boolean)) {
    return (
      <dl className="grid gap-2.5">
        {pairs.map(([, key, value]) => (
          <div key={key} className="sm:flex gap-3">
            <dt className="font-mono text-[11px] tracking-[0.08em] uppercase text-amber sm:w-44 shrink-0 sm:pt-1">
              {key}
            </dt>
            <dd className="text-sm leading-relaxed">
              <Inline text={value} />
            </dd>
          </div>
        ))}
      </dl>
    );
  }
  return (
    <p className="text-sm leading-relaxed">
      {lines.map((l, i) => (
        <React.Fragment key={i}>
          {i > 0 && <br />}
          <Inline text={l} />
        </React.Fragment>
      ))}
    </p>
  );
}

function Steps({ items }) {
  return (
    <ol className="grid gap-2.5">
      {items.map((item, i) => (
        <li key={i} className="flex gap-3">
          <Mono className="text-xs text-amber w-4 shrink-0 text-right pt-1">{i + 1}</Mono>
          <span className="text-sm leading-relaxed min-w-0">
            <Inline text={item} />
          </span>
        </li>
      ))}
    </ol>
  );
}

function Bullets({ items }) {
  return (
    <ul className="grid gap-2">
      {items.map((item, i) => (
        <li key={i} className="flex gap-3">
          <span className="text-line pt-1.5 shrink-0" aria-hidden="true">
            —
          </span>
          <span className="text-sm leading-relaxed min-w-0">
            <Inline text={item} />
          </span>
        </li>
      ))}
    </ul>
  );
}

// "### 1. Input session" — the step number splits off into an amber marker so the
// daily loop reads as a numbered sequence.
function SubHead({ text }) {
  const numbered = text.match(/^(\d+)\.\s+(.+)$/);
  return (
    <h3 className="flex items-baseline gap-2.5 font-head font-semibold text-[15px] text-body pt-2">
      {numbered && <Mono className="text-amber text-sm">{numbered[1]}</Mono>}
      <span>{numbered ? numbered[2] : text}</span>
    </h3>
  );
}

function Blocks({ blocks }) {
  return (
    <div className="grid gap-3">
      {blocks.map((b, i) => {
        if (b.type === "h") return <SubHead key={i} text={b.text} />;
        if (b.type === "ol") return <Steps key={i} items={b.items} />;
        if (b.type === "ul") return <Bullets key={i} items={b.items} />;
        if (b.type === "hr") return <hr key={i} className="border-line" />;
        return <Para key={i} lines={b.lines} />;
      })}
    </div>
  );
}

// ---- document shape: h1 + lead becomes the header, each h2 becomes a Card ----

function outline(blocks) {
  const intro = { title: null, blocks: [] };
  const sections = [];
  let current = null;
  for (const b of blocks) {
    if (b.type === "hr") continue; // section boundaries are the cards themselves
    if (b.type === "h" && b.level === 1) {
      intro.title = b.text;
      continue;
    }
    if (b.type === "h" && b.level === 2) {
      current = { id: slugify(b.text), title: b.text, blocks: [] };
      sections.push(current);
      continue;
    }
    (current || intro).blocks.push(b);
  }
  return { intro, sections };
}

export default function Guide() {
  const { intro, sections } = useMemo(() => outline(parseMarkdown(guideMd)), []);
  const [active, setActive] = useState(sections[0]?.id ?? null);

  // Highlight whichever section owns the top of the viewport.
  useEffect(() => {
    const targets = sections
      .map((s) => document.getElementById(s.id))
      .filter(Boolean);
    if (!targets.length) return;
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible) setActive(visible.target.id);
      },
      { rootMargin: "-72px 0px -55% 0px" }
    );
    targets.forEach((t) => io.observe(t));
    return () => io.disconnect();
  }, [sections]);

  return (
    <div className="grid lg:grid-cols-[180px_minmax(0,1fr)] gap-5 items-start">
      <nav className="hidden lg:block sticky top-5" aria-label="Guide sections">
        <SectionLabel>Contents</SectionLabel>
        <ul className="grid gap-0.5 border-l border-line">
          {sections.map((s) => (
            <li key={s.id}>
              <a
                href={`#${s.id}`}
                aria-current={active === s.id ? "true" : undefined}
                className={`block -ml-px border-l pl-3 py-1 text-[13px] leading-snug transition-colors ${
                  active === s.id
                    ? "border-amber text-body"
                    : "border-transparent text-muted hover:text-body"
                }`}
              >
                {s.title}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <div className="grid gap-5 min-w-0">
        <Card>
          <SectionLabel>Guide</SectionLabel>
          <h1 className="font-head font-bold text-xl mb-3">{intro.title}</h1>
          <div className="text-muted">
            <Blocks blocks={intro.blocks} />
          </div>
        </Card>

        {sections.map((s) => (
          <Card key={s.id}>
            <div id={s.id} className="scroll-mt-6">
              <SectionLabel>{s.title}</SectionLabel>
              <Blocks blocks={s.blocks} />
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
