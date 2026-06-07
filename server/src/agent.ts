import { query } from "@anthropic-ai/claude-agent-sdk";
import { createAppServer } from "./tools";
import { SUBAGENTS } from "./subagents";
import { SYSTEM_PROMPT } from "./prompts";
import { createRun, getRun, type RunContext } from "./runs";
import { makeMockSupplier } from "./mock-supplier";
import type { AgentEvent, AskQuestion, ToolKind } from "./events";

// ─── pending AskUserQuestion resolvers ─────────────────────────────────────
// Keyed by question id (globally unique). Each carries the emit of the run that
// asked, so the answer routes back to the right card.
const pendingQuestions = new Map<
  string,
  { resolve: (answers: Record<string, string>) => void; emit: (e: AgentEvent) => void }
>();
let qCounter = 0;

export function answerQuestion(id: string, answers: Record<string, string>): void {
  const q = pendingQuestions.get(id);
  if (q) {
    pendingQuestions.delete(id);
    q.resolve(answers);
    q.emit({ type: "question.answered", id, answers });
  }
}

function userMsg(text: string): any {
  return { type: "user", message: { role: "user", content: text }, parent_tool_use_id: null };
}

/** Mid-run chat follow-up → inject into a specific run's live query. */
export function pushUserMessage(runId: string, text: string): void {
  getRun(runId)?.pushUserMessage?.(text);
}

/**
 * Start a brand-new PARALLEL run and return its id. Each run is fully
 * independent: its own RfqState, AbortController, MCP tool server, and
 * runId-stamped event stream. Starting a run never touches the others.
 */
export function runAgent(text: string): string {
  const ctx = createRun();
  ctx.state.setRequest({ raw: text });
  ctx.emit({ type: "run.created", request: { raw: text }, createdAt: ctx.createdAt, running: true });
  ctx.emit({ type: "rfq.request", request: { raw: text } });
  // Seed the one controlled supplier we actually negotiate against (phone + email)
  // so the hero call always has a safe target — Procura never cold-contacts a real
  // sourced business. The web-discovered suppliers set the price baseline; this one
  // is the live-negotiation target. See mock-supplier.ts / voice.ts / email.ts.
  const mock = makeMockSupplier();
  ctx.state.upsertVendor(mock);
  ctx.emit({ type: "rfq.supplier_added", vendor: mock });
  void startRun(ctx, text);
  return ctx.id;
}

function canUseToolFor(ctx: RunContext) {
  return async (toolName: string, input: any): Promise<any> => {
    if (toolName === "AskUserQuestion") {
      const questions = (input?.questions ?? []) as AskQuestion[];
      const id = "q-" + ++qCounter;
      ctx.emit({ type: "question.ask", id, questions });
      const answers = await new Promise<Record<string, string>>((resolve) => {
        pendingQuestions.set(id, { resolve, emit: ctx.emit });
        setTimeout(() => {
          if (pendingQuestions.has(id)) {
            pendingQuestions.delete(id);
            resolve({});
          }
        }, 300000);
      });
      return { behavior: "allow", updatedInput: { ...input, answers } };
    }
    return { behavior: "allow", updatedInput: input };
  };
}

function kindFor(name: string): ToolKind {
  if (name.includes("call_supplier")) return "call";
  if (name.includes("send_rfq_email")) return "email";
  if (name.includes("update_quote") || name.includes("set_summary")) return "quote";
  if (name.includes("research_suppliers")) return "web";
  if (name.includes("add_supplier")) return "web";
  if (name === "WebSearch" || name === "WebFetch") return "web";
  if (name === "Agent") return "web";
  if (name === "AskUserQuestion") return "question";
  return "other";
}

function labelFor(name: string, input: any): string {
  const short = name.replace(/^mcp__app__/, "");
  switch (short) {
    case "research_suppliers":
      return "Researching suppliers" + (input?.item ? " · " + input.item : "");
    case "add_supplier":
      return "Adding supplier " + (input?.name ?? "");
    case "update_quote":
      return "Updating quote · " + (input?.id ?? "");
    case "set_summary":
      return "Summarising results";
    case "send_rfq_email":
      return "Emailing " + (input?.vendorId ?? "supplier");
    case "call_supplier":
      return "Calling " + (input?.vendorId ?? "supplier");
    case "WebSearch":
      return "Searching: " + (input?.query ?? "suppliers");
    case "WebFetch":
      return "Reading " + (input?.url ?? "page");
    case "Agent":
      return "Dispatching " + (input?.subagent_type ?? "supplier-scout");
    case "AskUserQuestion":
      return "Asking you a question";
    default:
      return short;
  }
}

function summarise(content: any): string | undefined {
  if (typeof content === "string") return content.slice(0, 120);
  if (Array.isArray(content)) {
    const t = content.find((b: any) => b?.type === "text");
    if (t?.text) return String(t.text).slice(0, 120);
  }
  return undefined;
}

function handleMessage(ctx: RunContext, agentCallIds: Set<string>, m: any): void {
  const emit = ctx.emit;
  switch (m?.type) {
    case "system":
      if (m.subtype === "init")
        emit({
          type: "agent.ready",
          model: m.model ?? "claude-opus-4-8",
          apiKeySource: m.apiKeySource,
        });
      break;

    case "stream_event": {
      const ev = m.event;
      if (ev?.type === "content_block_delta" && ev.delta?.type === "text_delta")
        emit({
          type: "agent.text_delta",
          text: ev.delta.text,
          subagentId: m.parent_tool_use_id ?? undefined,
        });
      break;
    }

    case "assistant": {
      const content = m.message?.content ?? [];
      for (const block of content) {
        if (block.type === "tool_use") {
          if (block.name === "Agent") {
            agentCallIds.add(block.id);
            emit({
              type: "subagent.spawned",
              id: block.id,
              role: block.input?.subagent_type ?? "supplier-scout",
            });
          }
          emit({
            type: "tool.call",
            id: block.id,
            name: block.name,
            label: labelFor(block.name, block.input),
            kind: kindFor(block.name),
            input: block.input,
            subagentId: m.parent_tool_use_id ?? undefined,
          });
        }
      }
      break;
    }

    case "user": {
      const content = m.message?.content;
      if (Array.isArray(content))
        for (const block of content) {
          if (block.type === "tool_result") {
            const id = block.tool_use_id;
            if (agentCallIds.has(id)) {
              agentCallIds.delete(id);
              emit({ type: "subagent.done", id });
            }
            emit({
              type: "tool.result",
              id,
              status: block.is_error ? "error" : "done",
              summary: summarise(block.content),
            });
          }
        }
      break;
    }

    case "result":
      emit({ type: "agent.thinking", active: false });
      if (m.subtype === "success" && m.result) emit({ type: "agent.message", text: m.result });
      emit({ type: "done", ok: m.subtype === "success" });
      break;
  }
}

async function startRun(ctx: RunContext, text: string): Promise<void> {
  const abort = ctx.abort;
  const agentCallIds = new Set<string>();

  // Per-run streaming inbox (lets chat follow-ups reach this run mid-flight).
  let queue: any[] = [userMsg(text)];
  let wake: (() => void) | null = null;
  let closed = false;
  ctx.pushUserMessage = (t: string) => {
    queue.push(userMsg(t));
    wake?.();
  };
  async function* inbox(): AsyncGenerator<any> {
    while (!closed) {
      if (queue.length) {
        yield queue.shift()!;
        continue;
      }
      await new Promise<void>((r) => (wake = r));
      wake = null;
    }
  }

  const options: any = {
    model: "claude-opus-4-8",
    effort: "max",
    thinking: { type: "adaptive" },
    includePartialMessages: true,
    settingSources: [],
    systemPrompt: SYSTEM_PROMPT,
    mcpServers: { app: createAppServer(ctx) },
    allowedTools: [
      "mcp__app__set_request",
      "mcp__app__research_suppliers",
      "mcp__app__add_supplier",
      "mcp__app__update_quote",
      "mcp__app__set_summary",
      "mcp__app__send_rfq_email",
      "mcp__app__call_supplier",
      "WebSearch",
      "WebFetch",
      "Agent",
      "AskUserQuestion",
    ],
    agents: SUBAGENTS,
    canUseTool: canUseToolFor(ctx),
    maxTurns: 80,
    abortController: abort,
  };

  ctx.emit({ type: "agent.thinking", active: true });
  try {
    const q = query({ prompt: inbox() as any, options });
    for await (const m of q as any) {
      if (abort.signal.aborted) break;
      handleMessage(ctx, agentCallIds, m);
    }
  } catch (err) {
    if (!abort.signal.aborted) {
      ctx.emit({ type: "status", phase: "error", message: String(err) });
      ctx.emit({ type: "done", ok: false });
    }
  } finally {
    closed = true;
    // Cast: the assignment lives in the nested generator, so TS narrows the
    // local to `null` here. Wake the inbox so it observes closed=true and exits.
    (wake as (() => void) | null)?.();
    ctx.running = false;
    ctx.pushUserMessage = null;
  }
}
