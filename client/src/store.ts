import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type {
  AgentEvent,
  AskQuestion,
  CallSpeaker,
  Invoice,
  RfqRequest,
  ToolKind,
  ToolStatus,
  Vendor,
} from "@/lib/events";

export interface ToolCallItem {
  id: string;
  name: string;
  label: string;
  kind: ToolKind;
  status: ToolStatus;
  summary?: string;
  subagentId?: string;
  seq: number;
}
export interface SubagentItem {
  id: string;
  role: string;
  parentId?: string;
  done: boolean;
}
export interface TranscriptLine {
  id: number;
  speaker: CallSpeaker;
  text: string;
  final: boolean;
}
export interface CallState {
  active: boolean;
  vendorId?: string;
  vendorName?: string;
  phase: "idle" | "ringing" | "connected" | "ended";
  speaking?: CallSpeaker;
  transcript: TranscriptLine[];
  quote?: { unitPrice: number; currency: string; leadTimeDays: number };
  outcome?: "success" | "failed" | "no-answer";
}
export interface Summary {
  headline: string;
  savings: number;
  currency: string;
  withinBudget: boolean;
  quotes: number;
}
export interface ChatQuestion {
  qid: string; // server question id, e.g. "q-1"
  questions: AskQuestion[];
  answered: boolean;
  answers?: Record<string, string>; // chosen labels keyed by question text
}
export interface ChatMessage {
  id: number;
  role: "user" | "agent";
  text: string;
  kind?: "text" | "question"; // defaults to "text"
  question?: ChatQuestion; // present when kind === "question"
}

interface AppState {
  connected: boolean;
  running: boolean;
  model?: string;
  apiKeySource?: string;
  request?: RfqRequest;
  thinking: boolean;
  status?: { phase: string; message?: string };

  toolCalls: Record<string, ToolCallItem>;
  toolOrder: string[];
  subagents: Record<string, SubagentItem>;
  subagentOrder: string[];

  vendors: Record<string, Vendor>;
  vendorOrder: string[];
  summary?: Summary;

  call: CallState;
  chat: ChatMessage[];
  chatSplit: number; // fraction of rail height given to the chat panel (0.2–0.8)
  order?: { placed: boolean; invoice?: Invoice };

  applyEvents: (events: AgentEvent[]) => void;
  pushChat: (role: "user" | "agent", text: string) => void;
  submitAnswer: (qid: string, answers: Record<string, string>) => void;
  setChatSplit: (frac: number) => void;
  setConnected: (c: boolean) => void;
  reset: () => void;
}

let _seq = 1;
const nextSeq = () => _seq++;
const initialCall: CallState = { active: false, phase: "idle", transcript: [] };

export const useStore = create<AppState>()((set) => ({
  connected: false,
  running: false,
  thinking: false,
  toolCalls: {},
  toolOrder: [],
  subagents: {},
  subagentOrder: [],
  vendors: {},
  vendorOrder: [],
  call: initialCall,
  question: null,
  chat: [],

  setConnected: (c) => set({ connected: c }),
  pushChat: (role, text) =>
    set((s) => ({ chat: [...s.chat, { id: nextSeq(), role, text }] })),

  reset: () =>
    set({
      running: false,
      thinking: false,
      request: undefined,
      status: undefined,
      toolCalls: {},
      toolOrder: [],
      subagents: {},
      subagentOrder: [],
      vendors: {},
      vendorOrder: [],
      summary: undefined,
      call: initialCall,
      question: null,
      order: undefined,
    }),

  applyEvents: (events) =>
    set((s) => {
      const toolCalls = { ...s.toolCalls };
      let toolOrder = s.toolOrder;
      const subagents = { ...s.subagents };
      let subagentOrder = s.subagentOrder;
      const vendors = { ...s.vendors };
      let vendorOrder = s.vendorOrder;
      let call = s.call;
      let chat = s.chat;
      const patch: Partial<AppState> = {};

      for (const e of events) {
        switch (e.type) {
          case "agent.ready":
            patch.model = e.model;
            patch.apiKeySource = e.apiKeySource;
            patch.connected = true;
            patch.running = true;
            break;
          case "agent.thinking":
            patch.thinking = e.active;
            break;
          case "status":
            patch.status = { phase: e.phase, message: e.message };
            break;
          case "agent.message":
            chat = [...chat, { id: nextSeq(), role: "agent", text: e.text }];
            break;
          case "done":
            patch.running = false;
            patch.thinking = false;
            break;

          case "tool.call":
            toolCalls[e.id] = {
              id: e.id,
              name: e.name,
              label: e.label,
              kind: e.kind,
              status: "running" as ToolStatus,
              subagentId: e.subagentId,
              seq: nextSeq(),
            };
            if (!toolOrder.includes(e.id)) toolOrder = [...toolOrder, e.id];
            break;
          case "tool.result": {
            const t = toolCalls[e.id];
            if (t) toolCalls[e.id] = { ...t, status: e.status, summary: e.summary };
            break;
          }
          case "subagent.spawned":
            subagents[e.id] = { id: e.id, role: e.role, parentId: e.parentId, done: false };
            if (!subagentOrder.includes(e.id)) subagentOrder = [...subagentOrder, e.id];
            break;
          case "subagent.done": {
            const sa = subagents[e.id];
            if (sa) subagents[e.id] = { ...sa, done: true };
            break;
          }

          case "rfq.request":
            patch.request = e.request;
            break;
          case "rfq.supplier_added":
            vendors[e.vendor.id] = e.vendor;
            if (!vendorOrder.includes(e.vendor.id)) vendorOrder = [...vendorOrder, e.vendor.id];
            break;
          case "rfq.supplier_updated": {
            const v = vendors[e.id];
            if (v) vendors[e.id] = { ...v, ...e.patch };
            break;
          }
          case "rfq.summary":
            patch.summary = {
              headline: e.headline,
              savings: e.savings,
              currency: e.currency,
              withinBudget: e.withinBudget,
              quotes: e.quotes,
            };
            break;

          case "call.ringing": {
            call = {
              active: true,
              vendorId: e.vendorId,
              vendorName: e.vendorName,
              phase: "ringing",
              transcript: [],
            };
            const v = vendors[e.vendorId];
            if (v) vendors[e.vendorId] = { ...v, status: "calling" };
            break;
          }
          case "call.connected":
            call = { ...call, active: true, phase: "connected" };
            break;
          case "call.transcript":
            call = {
              ...call,
              speaking: e.speaker,
              transcript: [
                ...call.transcript,
                { id: nextSeq(), speaker: e.speaker, text: e.text, final: e.final },
              ],
            };
            break;
          case "call.quote": {
            call = {
              ...call,
              quote: { unitPrice: e.unitPrice, currency: e.currency, leadTimeDays: e.leadTimeDays },
            };
            const vid = call.vendorId;
            const v = vid ? vendors[vid] : undefined;
            if (vid && v)
              vendors[vid] = {
                ...v,
                negotiatedPrice: e.unitPrice,
                currency: e.currency,
                leadTimeDays: e.leadTimeDays,
                status: "negotiating",
              };
            break;
          }
          case "call.ended":
            call = { ...call, phase: "ended", active: false, outcome: e.outcome, speaking: undefined };
            break;

          case "email.sent": {
            const v = vendors[e.vendorId];
            if (v)
              vendors[e.vendorId] = {
                ...v,
                status: v.status === "discovered" ? "emailing" : v.status,
              };
            break;
          }
          case "email.reply": {
            const v = vendors[e.vendorId];
            if (v)
              vendors[e.vendorId] = {
                ...v,
                status: "quoted",
                initialPrice: e.unitPrice ?? v.initialPrice,
                negotiatedPrice: v.negotiatedPrice ?? e.unitPrice,
                leadTimeDays: e.leadTimeDays ?? v.leadTimeDays,
              };
            break;
          }

          case "question.ask":
            patch.question = { id: e.id, questions: e.questions };
            break;
          case "question.answered":
            patch.question = null;
            break;

          case "order.placed":
            patch.order = { placed: true };
            break;
          case "order.receipt":
            patch.order = { placed: true, invoice: e.invoice };
            break;

          case "agent.text_delta":
            // streamed thinking text — not surfaced as chat; ignored here
            break;
        }
      }

      return {
        ...patch,
        toolCalls,
        toolOrder,
        subagents,
        subagentOrder,
        vendors,
        vendorOrder,
        call,
        chat,
      };
    }),
}));
