/**
 * Tiny inline-markdown renderer for chat bubbles.
 *
 * Supports the four formats the agent actually uses:
 *   **bold**, *italic* / _italic_, `inline code`, [text](url)
 *
 * Plus paragraph + list rendering: blank lines split paragraphs, lines starting
 * with `- ` or `* ` become bullets, lines starting with `N.` become an ordered
 * list. No code blocks, no headings, no tables — those don't appear in our
 * agent's output and pulling in a full md parser is overkill.
 */
import { Fragment } from "react";

type Token =
  | { kind: "text"; text: string }
  | { kind: "bold"; text: string }
  | { kind: "italic"; text: string }
  | { kind: "code"; text: string }
  | { kind: "link"; text: string; href: string };

// Order matters: link → code → bold → italic. Bold (`**`) comes before single
// `*` italic so a `**word**` doesn't match the italic regex first.
const PATTERN =
  /\[([^\]]+)\]\(([^)\s]+)\)|`([^`]+)`|\*\*([^*]+)\*\*|__([^_]+)__|\*([^*]+)\*|_([^_]+)_/g;

function tokenize(line: string): Token[] {
  const out: Token[] = [];
  let last = 0;
  for (const m of line.matchAll(PATTERN)) {
    const start = m.index ?? 0;
    if (start > last) out.push({ kind: "text", text: line.slice(last, start) });
    if (m[1] != null && m[2] != null) {
      out.push({ kind: "link", text: m[1], href: m[2] });
    } else if (m[3] != null) {
      out.push({ kind: "code", text: m[3] });
    } else if (m[4] != null || m[5] != null) {
      out.push({ kind: "bold", text: m[4] ?? m[5]! });
    } else if (m[6] != null || m[7] != null) {
      out.push({ kind: "italic", text: m[6] ?? m[7]! });
    }
    last = start + m[0].length;
  }
  if (last < line.length) out.push({ kind: "text", text: line.slice(last) });
  return out;
}

function renderTokens(tokens: Token[]): React.ReactNode {
  return tokens.map((t, i) => {
    switch (t.kind) {
      case "bold":
        return <strong key={i} className="font-semibold">{t.text}</strong>;
      case "italic":
        return <em key={i}>{t.text}</em>;
      case "code":
        return (
          <code
            key={i}
            className="rounded bg-black/10 px-1 py-0.5 font-mono text-[0.9em]"
          >
            {t.text}
          </code>
        );
      case "link":
        return (
          <a
            key={i}
            href={t.href}
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-2 hover:opacity-80"
          >
            {t.text}
          </a>
        );
      default:
        return <Fragment key={i}>{t.text}</Fragment>;
    }
  });
}

interface Block {
  kind: "p" | "ul" | "ol";
  lines: string[];
}

function parseBlocks(source: string): Block[] {
  const lines = source.split(/\r?\n/);
  const blocks: Block[] = [];
  let current: Block | null = null;
  const flush = () => {
    if (current && current.lines.length) blocks.push(current);
    current = null;
  };
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      flush();
      continue;
    }
    const ulMatch = /^\s*[-*]\s+(.*)$/.exec(line);
    const olMatch = /^\s*\d+\.\s+(.*)$/.exec(line);
    if (ulMatch) {
      if (!current || current.kind !== "ul") {
        flush();
        current = { kind: "ul", lines: [] };
      }
      current.lines.push(ulMatch[1]!);
    } else if (olMatch) {
      if (!current || current.kind !== "ol") {
        flush();
        current = { kind: "ol", lines: [] };
      }
      current.lines.push(olMatch[1]!);
    } else {
      if (!current || current.kind !== "p") {
        flush();
        current = { kind: "p", lines: [] };
      }
      current.lines.push(line);
    }
  }
  flush();
  return blocks;
}

export default function Markdown({ text }: { text: string }) {
  const blocks = parseBlocks(text);
  return (
    <>
      {blocks.map((b, i) => {
        if (b.kind === "p") {
          return (
            <p
              key={i}
              className={i === 0 ? "whitespace-pre-wrap" : "mt-2 whitespace-pre-wrap"}
            >
              {b.lines.map((line, j) => (
                <Fragment key={j}>
                  {j > 0 && <br />}
                  {renderTokens(tokenize(line))}
                </Fragment>
              ))}
            </p>
          );
        }
        if (b.kind === "ul") {
          return (
            <ul
              key={i}
              className={`${i === 0 ? "" : "mt-2 "}list-disc space-y-0.5 pl-5`}
            >
              {b.lines.map((line, j) => (
                <li key={j}>{renderTokens(tokenize(line))}</li>
              ))}
            </ul>
          );
        }
        return (
          <ol
            key={i}
            className={`${i === 0 ? "" : "mt-2 "}list-decimal space-y-0.5 pl-5`}
          >
            {b.lines.map((line, j) => (
              <li key={j}>{renderTokens(tokenize(line))}</li>
            ))}
          </ol>
        );
      })}
    </>
  );
}
