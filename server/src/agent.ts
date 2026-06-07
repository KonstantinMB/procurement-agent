import { query } from "@anthropic-ai/claude-agent-sdk";
import { bus } from "./bus";
import { rfqs } from "./state";
import { createAppServer } from "./tools";
import { SUBAGENTS } from "./subagents";
import { SYSTEM_PROMPT } from "./prompts";
import type { AskQuestion, ToolKind } from "./events";

/** One agent loop per RFQ run — isolated inbox, pending questions, tool tracking. */
class AgentRuntime {
  readonly runId: string;
  private queue: any[] = [];
  private wake: (() => void) | null = null;
  private closed = false;
  private started = false;
  private pendingQuestions = new Map<string, (answers: Record<string, string>) => void>();
  private qCounter = 0;
  private agentCallIds = new Set<string>();

  constructor(runId: string) {
    this.runId = runId;
  }

  enqueue(text: string): void {
    this.queue.push({
      type: "user",
      message: { role: "user", content: text },
      parent_tool_use_id: null,
    });
    this.wake?.();
  }

  answerQuestion(id: string, answers: Record<string, string>): void {
    const r = this.pendingQuestions.get(id);
    if (r) {
      this.pendingQuestions.delete(id);
      r(answers);
    }
    bus.emit(this.runId, { type: "question.answered", id, answers });
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    void this.loop();
  }

  private async *inbox(): AsyncGenerator<any> {
    while (!this.closed) {
      if (this.queue.length) {
        yield this.queue.shift()!;
        continue;
      }
      await new Promise<void>((r) => (this.wake = r));
      this.wake = null;
    }
  }

  private canUseTool = async (toolName: string, input: any): Promise<any> => {
    if (toolName === "AskUserQuestion") {
      const questions = (input?.questions ?? []) as AskQuestion[];
      const id = "q-" + ++this.qCounter;
      bus.emit(this.runId, { type: "question.ask", id, questions });
      const answers = await new Promise<Record<string, string>>((resolve) => {
        this.pendingQuestions.set(id, resolve);
        setTimeout(() => {
          if (this.pendingQuestions.has(id)) {
            this.pendingQuestions.delete(id);
            resolve({});
          }
        }, 300000);
      });
      return { behavior: "allow", updatedInput: { ...input, answers } };
    }
    return { behavior: "allow", updatedInput: input };
  };

  private handleMessage(m: any): void {
    const runId = this.runId;
    switch (m?.type) {
      case "system":
        if (m.subtype === "init")
          bus.emit(runId, {
            type: "agent.ready",
            model: m.model ?? "claude-opus-4-8",
            apiKeySource: m.apiKeySource,
          });
        break;

      case "stream_event": {
        const ev = m.event;
        if (ev?.type === "content_block_delta" && ev.delta?.type === "text_delta")
          bus.emit(runId, {
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
              this.agentCallIds.add(block.id);
              bus.emit(runId, {
                type: "subagent.spawned",
                id: block.id,
                role: block.input?.subagent_type ?? "supplier-scout",
              });
            }
            bus.emit(runId, {
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
              if (this.agentCallIds.has(id)) {
                this.agentCallIds.delete(id);
                bus.emit(runId, { type: "subagent.done", id });
              }
              bus.emit(runId, {
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
        bus.emit(runId, { type: "agent.thinking", active: false });
        if (m.subtype === "success" && m.result)
          bus.emit(runId, { type: "agent.message", text: m.result });
        bus.emit(runId, { type: "done", ok: m.subtype === "success" });
        const r = rfqs.get(this.runId);
        if (r) r.done = true;
        break;
    }
  }

  private async loop(): Promise<void> {
    const runId = this.runId;
    const options: any = {
      model: "claude-opus-4-8",
      effort: "max",
      thinking: { type: "adaptive" },
      includePartialMessages: true,
      settingSources: [],
      systemPrompt: SYSTEM_PROMPT,
      mcpServers: { app: createAppServer(runId) },
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
      canUseTool: this.canUseTool,
      maxTurns: 80,
    };

    bus.emit(runId, { type: "agent.thinking", active: true });
    try {
      const q = query({ prompt: this.inbox() as any, options });
      for await (const m of q as any) this.handleMessage(m);
    } catch (err) {
      bus.emit(runId, { type: "status", phase: "error", message: String(err) });
      bus.emit(runId, { type: "done", ok: false });
    }
  }
}

// ─── Runtime registry ─────────────────────────────────────────────────────
const runtimes = new Map<string, AgentRuntime>();

export function startAgentRun(runId: string, text: string): void {
  const rt = new AgentRuntime(runId);
  runtimes.set(runId, rt);
  rt.enqueue(text);
  rt.start();
}

export function pushUserMessage(runId: string, text: string): void {
  runtimes.get(runId)?.enqueue(text);
}

export function answerQuestion(runId: string, id: string, answers: Record<string, string>): void {
  runtimes.get(runId)?.answerQuestion(id, answers);
}

// ─── Helpers ──────────────────────────────────────────────────────────────
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
