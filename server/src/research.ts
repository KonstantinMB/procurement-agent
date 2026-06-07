// ─────────────────────────────────────────────────────────────────────────
// RESEARCH — live supplier discovery via a STREAMING headless `claude -p` call.
//
// Spawns the Claude Code CLI in print mode with --output-format stream-json so
// we can watch the research agent work in real time: its WebSearch/WebFetch
// tool-calls are surfaced to the UI activity feed, and each supplier it verifies
// is streamed into the table the instant it emits a `SUPPLIER: {…}` line — no
// waiting for the final answer. stdin is IGNORED (else `claude -p` hangs); the
// full parent env is passed through (needed for auth). Never throws.
// ─────────────────────────────────────────────────────────────────────────

import { spawn, type ChildProcess } from "node:child_process";
import { appendFileSync } from "node:fs";

const DEBUG_LOG = "/tmp/procura_research_debug.log";

/** Per-run handles so a run (or reset) cancels only ITS own web search. */
export interface ResearchControl {
  /** The owning run's child set — the spawned process registers/deregisters here. */
  childSet?: Set<ChildProcess>;
  /** The owning run's abort signal — fires SIGTERM when the run is cancelled. */
  signal?: AbortSignal;
}

export interface ResearchArgs {
  item: string;
  quantity?: number;
  region?: string;
  targetPrice?: number;
  currency?: string;
  count?: number;
}

export interface ResearchedSupplier {
  name: string;
  location?: string;
  phone?: string;
  email?: string;
  url?: string;
  moq?: number;
  unitPrice?: number;
  rating?: number;
}

export interface ResearchHandlers {
  /** Called the instant a supplier is verified (live table population). */
  onSupplier?: (s: ResearchedSupplier) => void;
  /** Called when the research agent starts/finishes an internal tool-call. */
  onActivity?: (a: { id: string; label?: string; kind?: string; done?: boolean }) => void;
}

function buildPrompt(a: ResearchArgs): string {
  const count = a.count ?? 4;
  const region = a.region ? ` based in or shipping to ${a.region}` : "";
  const qty = a.quantity ? ` The buyer needs about ${a.quantity} units.` : "";
  const cur = a.currency ? ` Prefer prices in ${a.currency}.` : "";
  return [
    `You are a FAST procurement research assistant for a LIVE demo. Find ${count} REAL, currently-operating suppliers/distributors of "${a.item}"${region}.${qty}`,
    `SPEED IS CRITICAL. Run ONE or two web searches, then emit suppliers straight from the search results — do NOT open each company's website to verify.${cur} Use only real companies that actually appear in the results — never invent names. For EVERY supplier always provide: a contact \`email\` (the published sales/procurement address, else the standard one for their domain like sales@theirdomain.com), an \`moq\` (estimate if unstated), and a \`unitPrice\` number — the public/list price if shown, otherwise your best market estimate.`,
    ``,
    `Stream as you go: the INSTANT you have a real name + location from the results, output it on its own line, before looking at the next, in EXACTLY this form:`,
    `SUPPLIER: {"name":"…","location":"…","email":"…","moq":0,"unitPrice":0}`,
    `(one compact JSON object per line; email and unitPrice are required — unitPrice must be a number, estimate it if needed). Emit all ${count} within about 20 seconds.`,
  ].join("\n");
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url.slice(0, 40);
  }
}

function coerce(s: any): ResearchedSupplier | null {
  if (!s || typeof s.name !== "string" || !s.name.trim()) return null;
  const num = (v: any) => (typeof v === "number" ? v : typeof v === "string" && /^\d/.test(v) ? Number(v.replace(/[^\d.]/g, "")) || undefined : undefined);
  return {
    name: s.name.trim(),
    location: typeof s.location === "string" ? s.location : undefined,
    phone: typeof s.phone === "string" ? s.phone : undefined,
    email: typeof s.email === "string" ? s.email : undefined,
    url: typeof s.url === "string" ? s.url : undefined,
    moq: num(s.moq),
    unitPrice: num(s.unitPrice),
    rating: num(s.rating),
  };
}

export function runClaudeResearch(
  a: ResearchArgs,
  handlers: ResearchHandlers = {},
  control: ResearchControl = {},
): Promise<ResearchedSupplier[]> {
  const prompt = buildPrompt(a);
  const model = process.env.RESEARCH_MODEL ?? "claude-sonnet-4-6";
  const seen = new Set<string>();
  const found: ResearchedSupplier[] = [];

  const take = (raw: any) => {
    const s = coerce(raw);
    if (!s) return;
    const key = s.name.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    found.push(s);
    handlers.onSupplier?.(s);
  };

  return new Promise((resolve) => {
    let settled = false;
    let stdoutBuf = "";
    let lineBuf = "";
    let errOut = "";
    let lastResult = "";

    const child = spawn(
      "claude",
      [
        "-p",
        prompt,
        "--output-format",
        "stream-json",
        "--verbose",
        "--model",
        model,
        "--allowedTools",
        "WebSearch",
        "WebFetch",
      ],
      { env: process.env, stdio: ["ignore", "pipe", "pipe"] }, // stdin ignored; full env for auth
    );
    control.childSet?.add(child);

    const finish = (why: string) => {
      if (settled) return;
      settled = true;
      control.childSet?.delete(child);
      control.signal?.removeEventListener("abort", onAbort);
      // Fallback: parse any final JSON array we may have missed line-by-line.
      const i = lastResult.indexOf("[");
      const j = lastResult.lastIndexOf("]");
      if (i !== -1 && j > i) {
        try {
          const arr = JSON.parse(lastResult.slice(i, j + 1));
          if (Array.isArray(arr)) arr.forEach(take);
        } catch {
          /* ignore */
        }
      }
      try {
        appendFileSync(
          DEBUG_LOG,
          `\n[${new Date().toISOString()}] item=${a.item} why=${why} found=${found.length} stdout=${stdoutBuf.length}\nSTDERR: ${errOut.slice(0, 400)}\n`,
        );
      } catch {
        /* ignore */
      }
      resolve(found);
    };

    const timer = setTimeout(() => {
      try {
        child.kill("SIGTERM");
      } catch {
        /* ignore */
      }
      finish("timeout");
    }, 1200000); // 20 min

    // Cancel cleanly when the owning run is aborted (new run / reset / shutdown).
    const onAbort = () => {
      clearTimeout(timer);
      try {
        child.kill("SIGTERM");
      } catch {
        /* ignore */
      }
      finish("aborted");
    };
    if (control.signal) {
      if (control.signal.aborted) onAbort();
      else control.signal.addEventListener("abort", onAbort);
    }

    // Scan plain text for streamed "SUPPLIER: {…}" lines.
    const scanText = (text: string) => {
      for (const line of text.split("\n")) {
        const m = line.match(/SUPPLIER:\s*(\{.*\})\s*$/);
        if (m) {
          try {
            take(JSON.parse(m[1]!));
          } catch {
            /* partial/garbled — ignore */
          }
        }
      }
    };

    const handleEvent = (evt: any) => {
      if (!evt || typeof evt !== "object") return;
      if (evt.type === "assistant" && evt.message?.content) {
        for (const block of evt.message.content) {
          if (block.type === "text" && typeof block.text === "string") scanText(block.text);
          if (block.type === "tool_use") {
            const name = block.name;
            const input = block.input ?? {};
            let label: string | undefined;
            if (name === "WebSearch") label = "Searching: " + (input.query ?? input.q ?? "web");
            else if (name === "WebFetch") label = "Reading: " + hostOf(String(input.url ?? ""));
            if (label) handlers.onActivity?.({ id: "rs-" + block.id, label, kind: "web" });
          }
        }
      }
      if (evt.type === "user" && Array.isArray(evt.message?.content)) {
        for (const block of evt.message.content) {
          if (block.type === "tool_result" && block.tool_use_id)
            handlers.onActivity?.({ id: "rs-" + block.tool_use_id, done: true });
        }
      }
      if (evt.type === "result" && typeof evt.result === "string") lastResult = evt.result;
    };

    child.stdout.on("data", (d) => {
      const chunk = d.toString();
      stdoutBuf += chunk;
      lineBuf += chunk;
      let nl: number;
      while ((nl = lineBuf.indexOf("\n")) !== -1) {
        const line = lineBuf.slice(0, nl).trim();
        lineBuf = lineBuf.slice(nl + 1);
        if (!line) continue;
        try {
          handleEvent(JSON.parse(line));
        } catch {
          // not a JSON event line — still scan for SUPPLIER markers as a safety net
          scanText(line);
        }
      }
    });
    child.stderr.on("data", (d) => (errOut += d.toString()));
    child.on("error", () => {
      clearTimeout(timer);
      finish("spawn-error");
    });
    child.on("close", () => {
      clearTimeout(timer);
      if (lineBuf.trim()) {
        try {
          handleEvent(JSON.parse(lineBuf.trim()));
        } catch {
          scanText(lineBuf);
        }
      }
      finish("closed");
    });
  });
}
