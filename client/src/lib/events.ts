// ─────────────────────────────────────────────────────────────────────────
// SHARED EVENT CONTRACT  (duplicate of server/src/events.ts — keep in sync)
// The server emits these over SSE; the client renders them. The whole UI is a
// projection of this stream.
// ─────────────────────────────────────────────────────────────────────────

export type ToolKind =
  | "web"
  | "call"
  | "email"
  | "quote"
  | "dashboard"
  | "question"
  | "order"
  | "think"
  | "other";

export type VendorStatus =
  | "discovered"
  | "emailing"
  | "calling"
  | "quoted"
  | "negotiating"
  | "won"
  | "lost";

export const VENDOR_STATUS_ORDER: VendorStatus[] = [
  "discovered",
  "emailing",
  "calling",
  "quoted",
  "negotiating",
  "won",
  "lost",
];

export interface Vendor {
  id: string;
  name: string;
  location?: string;
  rating?: number;
  moq?: number;
  source?: "web" | "email" | "call";
  contact?: { phone?: string; email?: string; url?: string };
  status: VendorStatus;
  initialPrice?: number;
  negotiatedPrice?: number;
  currency?: string;
  leadTimeDays?: number;
  meetsDeadline?: boolean;
  note?: string;
}

export type ToolStatus = "running" | "done" | "error";

export interface RfqRequest {
  raw: string;
  item?: string;
  quantity?: number;
  deadline?: string;
  targetUnitPrice?: number;
  currency?: string;
}

export interface AskQuestionOption {
  label: string;
  description?: string;
}
export interface AskQuestion {
  question: string;
  header: string;
  multiSelect: boolean;
  options: AskQuestionOption[];
}

export interface Invoice {
  poNumber: string;
  vendorName: string;
  unitPrice: number;
  quantity: number;
  total: number;
  currency: string;
  leadTimeDays: number;
  status: "paid";
  date: string;
}

export type CallSpeaker = "agent" | "supplier";

export type AgentEvent =
  | { type: "agent.ready"; model: string; apiKeySource?: string }
  | { type: "agent.thinking"; active: boolean }
  | { type: "agent.text_delta"; text: string; subagentId?: string }
  | { type: "agent.message"; text: string }
  | { type: "status"; phase: string; message?: string }
  | { type: "done"; ok: boolean }
  | { type: "run.reset" } // global clear-all: wipe every run (dashboard reset)
  | { type: "run.created"; request: RfqRequest; createdAt: number; running: boolean }
  | { type: "run.removed" } // remove just this run (runId on the envelope)
  | {
      type: "tool.call";
      id: string;
      name: string;
      label: string;
      kind: ToolKind;
      input?: unknown;
      subagentId?: string;
    }
  | { type: "tool.result"; id: string; status: ToolStatus; summary?: string }
  | { type: "subagent.spawned"; id: string; parentId?: string; role: string }
  | { type: "subagent.done"; id: string }
  | { type: "rfq.request"; request: RfqRequest }
  | { type: "rfq.supplier_added"; vendor: Vendor }
  | { type: "rfq.supplier_updated"; id: string; patch: Partial<Vendor> }
  | {
      type: "rfq.summary";
      headline: string;
      savings: number;
      currency: string;
      withinBudget: boolean;
      quotes: number;
    }
  | { type: "call.ringing"; vendorId: string; vendorName: string; phone?: string }
  | { type: "call.connected"; vendorId: string }
  | {
      type: "call.transcript";
      vendorId: string;
      speaker: CallSpeaker;
      text: string;
      final: boolean;
    }
  | {
      type: "call.quote";
      vendorId: string;
      unitPrice: number;
      currency: string;
      leadTimeDays: number;
    }
  | { type: "call.ended"; vendorId: string; outcome: "success" | "failed" | "no-answer" }
  | { type: "email.sent"; vendorId: string; to: string; subject: string }
  | {
      type: "email.reply";
      vendorId: string;
      from: string;
      unitPrice?: number;
      leadTimeDays?: number;
    }
  | { type: "question.ask"; id: string; questions: AskQuestion[] }
  | { type: "question.answered"; id: string; answers: Record<string, string> }
  | { type: "order.placed"; vendorId: string }
  | { type: "order.receipt"; invoice: Invoice };

export type AgentEventType = AgentEvent["type"];
export type EventOf<T extends AgentEventType> = Extract<AgentEvent, { type: T }>;

/**
 * What actually arrives over SSE: any AgentEvent tagged with the run it belongs
 * to. The server stamps `runId` at emit time; the client routes each event into
 * `runs[runId]`. A few global events (initial connection status, run.reset)
 * arrive with no runId.
 */
export type WireEvent = AgentEvent & { runId?: string };
