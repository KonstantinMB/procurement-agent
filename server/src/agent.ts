import { query } from "@anthropic-ai/claude-agent-sdk";
import { bus } from "./bus";
import { rfq } from "./state";
import { appServer } from "./tools";
import { SUBAGENTS } from "./subagents";
import { SYSTEM_PROMPT } from "./prompts";
import type { AskQuestion, ToolKind } from "./events";

// ─── streaming-input inbox (keeps one long-running session open) ───────────
let queue: any[] = [];
let wake: (() => void) | null = null;
let closed = false;
let started = false;

function enqueue(text: string): void {
  queue.push({
    type: "user",
    message: { role: "user", content: text },
    parent_tool_use_id: null,
  });
  wake?.();
}

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

// ─── pending AskUserQuestion resolvers ────────────────────────────────────
const pendingQuestions = new Map<string, (answers: Record<string, string>) => void>();
let qCounter = 0;

export function answerQuestion(id: string, answers: Record<string, string>): void {
  const r = pendingQuestions.get(id);
  if (r) {
    pendingQuestions.delete(id);
    r(answers);
  }
  bus.emit({ type: "question.answered", id, answers });
}

export function pushUserMessage(text: string): void {
  enqueue(text);
}

export function runAgent(text: string): void {
  rfq.reset();
  enqueue(text);
  if (!started) {
    started = true;
    void startLoop();
  }
}

async function canUseTool(toolName: string, input: any): Promise<any> {
  if (toolName === "AskUserQuestion") {
    const questions = (input?.questions ?? []) as AskQuestion[];
    const id = "q-" + ++qCounter;
    bus.emit({ type: "question.ask", id, questions });
    const answers = await new Promise<Record<string, string>>((resolve) => {
      pendingQuestions.set(id, resolve);
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
}

const agentCallIds = new Set<string>();

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

function handleMessage(m: any): void {
  switch (m?.type) {
    case "system":
      if (m.subtype === "init")
        bus.emit({
          type: "agent.ready",
          model: m.model ?? "claude-opus-4-8",
          apiKeySource: m.apiKeySource,
        });
      break;

    case "stream_event": {
      const ev = m.event;
      if (ev?.type === "content_block_delta" && ev.delta?.type === "text_delta")
        bus.emit({
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
            bus.emit({
              type: "subagent.spawned",
              id: block.id,
              role: block.input?.subagent_type ?? "supplier-scout",
            });
          }
          bus.emit({
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
              bus.emit({ type: "subagent.done", id });
            }
            bus.emit({
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
      bus.emit({ type: "agent.thinking", active: false });
      if (m.subtype === "success" && m.result)
        bus.emit({ type: "agent.message", text: m.result });
      bus.emit({ type: "done", ok: m.subtype === "success" });
      break;
  }
}

async function startLoop(): Promise<void> {
  const options: any = {
    model: "claude-opus-4-8",
    effort: "max",
    thinking: { type: "adaptive" },
    includePartialMessages: true,
    settingSources: [],
    systemPrompt: SYSTEM_PROMPT,
    mcpServers: { app: appServer },
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
    canUseTool,
    maxTurns: 80,
  };

  bus.emit({ type: "agent.thinking", active: true });
  try {
    const q = query({ prompt: inbox() as any, options });
    for await (const m of q as any) handleMessage(m);
  } catch (err) {
    bus.emit({ type: "status", phase: "error", message: String(err) });
    bus.emit({ type: "done", ok: false });
  }
}
