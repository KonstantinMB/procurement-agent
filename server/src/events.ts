// ─────────────────────────────────────────────────────────────────────────
// SHARED EVENT CONTRACT
// The server emits these events over SSE; the client renders them.
// This file is duplicated verbatim at client/src/lib/events.ts — keep in sync.
// The whole UI is a projection of this stream: the dashboard *is* the agent's
// tool-calls, streamed live.
// ─────────────────────────────────────────────────────────────────────────

export type ToolKind =
  | "web"        // web search / supplier discovery
  | "call"       // phone call
  | "email"      // RFQ email
  | "quote"      // quote received / dashboard update
  | "dashboard"  // generic board mutation
  | "question"   // AskUserQuestion
  | "order"      // place order
  | "think"      // reasoning
  | "other";

export type VendorStatus =
  | "discovered"
  | "emailing"
  | "calling"
  | "quoted"
  | "negotiating"
  | "won"
  | "lost";

/** Order used for sorting / progress in the UI. */
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
  rating?: number; // 0–5, e.g. 4.6
  moq?: number; // minimum order quantity
  source?: "web" | "email" | "call";
  contact?: { phone?: string; email?: string; url?: string };
  status: VendorStatus;
  initialPrice?: number; // per unit
  negotiatedPrice?: number; // per unit, after negotiation
  currency?: string; // ISO, e.g. "EUR"
  leadTimeDays?: number;
  meetsDeadline?: boolean;
  note?: string; // latest agent note shown on the card
}

export type ToolStatus = "running" | "done" | "error";

export interface RfqRequest {
  raw: string; // the buyer's original sentence
  item?: string;
  quantity?: number;
  deadline?: string; // human string, e.g. "Friday"
  targetUnitPrice?: number;
  currency?: string;
}

export interface AskQuestionOption {
  label: string;
  description?: string;
}
export interface AskQuestion {
  question: string;
  header: string; // ≤12-char chip label
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

// ── The discriminated union every component switches on ───────────────────
export type AgentEvent =
  // lifecycle / narration
  | { type: "agent.ready"; model: string; apiKeySource?: string }
  | { type: "agent.thinking"; active: boolean }
  | { type: "agent.text_delta"; text: string; subagentId?: string }
  | { type: "agent.message"; text: string } // finalized assistant message
  | { type: "status"; phase: string; message?: string }
  | { type: "done"; ok: boolean }
  // tool activity (drives the activity panel + swarm)
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
  // RFQ board
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
  // live phone call (the hero)
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
  // email
  | { type: "email.sent"; vendorId: string; to: string; subject: string }
  | {
      type: "email.reply";
      vendorId: string;
      from: string;
      unitPrice?: number;
      leadTimeDays?: number;
    }
  // ask the buyer
  | { type: "question.ask"; id: string; questions: AskQuestion[] }
  | { type: "question.answered"; id: string; answers: Record<string, string> }
  // finale
  | { type: "order.placed"; vendorId: string }
  | { type: "order.receipt"; invoice: Invoice };

export type AgentEventType = AgentEvent["type"];

/** Narrow helper: pick the event object for a given type. */
export type EventOf<T extends AgentEventType> = Extract<AgentEvent, { type: T }>;

/**
 * What goes on the SSE wire: every AgentEvent is tagged with the runId of the
 * RFQ it belongs to so the client can route it to the right run-bucket.
 */
export type WireEvent = AgentEvent & { runId: string };

/** Snapshot of a run used by the RFQ list page. */
export interface RunSummary {
  runId: string;
  title: string;
  createdAt: number;
  status: "researching" | "calling" | "quoted" | "ordered" | "done";
  request?: RfqRequest;
  suppliers: number;
  bestPrice?: number;
  savings?: number;
  currency: string;
  withinBudget?: boolean;
  ordered: boolean;
}
