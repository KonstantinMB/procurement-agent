import { create } from "zustand";
import { removeRun as apiRemoveRun } from "@/lib/api";
import type {
  AskQuestion,
  CallSpeaker,
  Invoice,
  RfqRequest,
  ToolKind,
  ToolStatus,
  Vendor,
  WireEvent,
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
export interface ChatMessage {
  id: number;
  role: "user" | "agent";
  text: string;
}

/** Everything that belongs to ONE run. The dashboard holds a map of these. */
export interface RunSlice {
  id: string;
  createdAt: number;
  request?: RfqRequest;
  running: boolean;
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
  question: { id: string; questions: AskQuestion[] } | null;
  order?: { placed: boolean; invoice?: Invoice };
}

let _seq = 1;
const nextSeq = () => _seq++;

// Stable empty references so the "no active run" mirror never triggers spurious
// re-renders (zustand compares each selector's result by Object.is).
const EMPTY_OBJ = Object.freeze({}) as Record<string, never>;
const EMPTY_ARR = Object.freeze([]) as never[];
const EMPTY_CALL: CallState = Object.freeze({ active: false, phase: "idle", transcript: [] });

function freshSlice(id: string, createdAt: number, request?: RfqRequest): RunSlice {
  return {
    id,
    createdAt,
    request,
    running: true,
    thinking: false,
    toolCalls: {},
    toolOrder: [],
    subagents: {},
    subagentOrder: [],
    vendors: {},
    vendorOrder: [],
    call: { active: false, phase: "idle", transcript: [] },
    chat: [],
    question: null,
  };
}

/** Pure per-run reducer: fold one event into one slice, returning a new slice. */
function reduceSlice(slice: RunSlice, e: WireEvent): RunSlice {
  switch (e.type) {
    case "run.created":
      return { ...slice, request: e.request, createdAt: e.createdAt, running: e.running };
    case "agent.ready":
      return { ...slice, running: true };
    case "agent.thinking":
      return { ...slice, thinking: e.active };
    case "status":
      return { ...slice, status: { phase: e.phase, message: e.message } };
    case "agent.message":
      return { ...slice, chat: [...slice.chat, { id: nextSeq(), role: "agent", text: e.text }] };
    case "done":
      return { ...slice, running: false, thinking: false };

    case "tool.call": {
      if (e.name === "mcp__app__set_request") return slice; // header-only, not feed noise
      const toolCalls = {
        ...slice.toolCalls,
        [e.id]: {
          id: e.id,
          name: e.name,
          label: e.label,
          kind: e.kind,
          status: "running" as ToolStatus,
          subagentId: e.subagentId,
          seq: nextSeq(),
        },
      };
      const toolOrder = slice.toolOrder.includes(e.id)
        ? slice.toolOrder
        : [...slice.toolOrder, e.id];
      return { ...slice, toolCalls, toolOrder };
    }
    case "tool.result": {
      const t = slice.toolCalls[e.id];
      if (!t) return slice;
      return {
        ...slice,
        toolCalls: { ...slice.toolCalls, [e.id]: { ...t, status: e.status, summary: e.summary } },
      };
    }
    case "subagent.spawned": {
      const subagents = {
        ...slice.subagents,
        [e.id]: { id: e.id, role: e.role, parentId: e.parentId, done: false },
      };
      const subagentOrder = slice.subagentOrder.includes(e.id)
        ? slice.subagentOrder
        : [...slice.subagentOrder, e.id];
      return { ...slice, subagents, subagentOrder };
    }
    case "subagent.done": {
      const sa = slice.subagents[e.id];
      if (!sa) return slice;
      return { ...slice, subagents: { ...slice.subagents, [e.id]: { ...sa, done: true } } };
    }

    case "rfq.request":
      return { ...slice, request: e.request };
    case "rfq.supplier_added": {
      const vendors = { ...slice.vendors, [e.vendor.id]: e.vendor };
      const vendorOrder = slice.vendorOrder.includes(e.vendor.id)
        ? slice.vendorOrder
        : [...slice.vendorOrder, e.vendor.id];
      return { ...slice, vendors, vendorOrder };
    }
    case "rfq.supplier_updated": {
      const v = slice.vendors[e.id];
      if (!v) return slice;
      return { ...slice, vendors: { ...slice.vendors, [e.id]: { ...v, ...e.patch } } };
    }
    case "rfq.summary":
      return {
        ...slice,
        summary: {
          headline: e.headline,
          savings: e.savings,
          currency: e.currency,
          withinBudget: e.withinBudget,
          quotes: e.quotes,
        },
      };

    case "call.ringing": {
      const call: CallState = {
        active: true,
        vendorId: e.vendorId,
        vendorName: e.vendorName,
        phase: "ringing",
        transcript: [],
      };
      const v = slice.vendors[e.vendorId];
      const vendors = v
        ? { ...slice.vendors, [e.vendorId]: { ...v, status: "calling" as const } }
        : slice.vendors;
      return { ...slice, call, vendors };
    }
    case "call.connected":
      return { ...slice, call: { ...slice.call, active: true, phase: "connected" } };
    case "call.transcript":
      return {
        ...slice,
        call: {
          ...slice.call,
          speaking: e.speaker,
          transcript: [
            ...slice.call.transcript,
            { id: nextSeq(), speaker: e.speaker, text: e.text, final: e.final },
          ],
        },
      };
    case "call.quote": {
      const call = {
        ...slice.call,
        quote: { unitPrice: e.unitPrice, currency: e.currency, leadTimeDays: e.leadTimeDays },
      };
      const vid = slice.call.vendorId;
      const v = vid ? slice.vendors[vid] : undefined;
      const vendors =
        vid && v
          ? {
              ...slice.vendors,
              [vid]: {
                ...v,
                negotiatedPrice: e.unitPrice,
                currency: e.currency,
                leadTimeDays: e.leadTimeDays,
                status: "negotiating" as const,
              },
            }
          : slice.vendors;
      return { ...slice, call, vendors };
    }
    case "call.ended":
      return {
        ...slice,
        call: { ...slice.call, phase: "ended", active: false, outcome: e.outcome, speaking: undefined },
      };

    case "email.sent": {
      const v = slice.vendors[e.vendorId];
      if (!v) return slice;
      return {
        ...slice,
        vendors: {
          ...slice.vendors,
          [e.vendorId]: { ...v, status: v.status === "discovered" ? "emailing" : v.status },
        },
      };
    }
    case "email.reply": {
      const v = slice.vendors[e.vendorId];
      if (!v) return slice;
      return {
        ...slice,
        vendors: {
          ...slice.vendors,
          [e.vendorId]: {
            ...v,
            status: "quoted",
            initialPrice: e.unitPrice ?? v.initialPrice,
            negotiatedPrice: v.negotiatedPrice ?? e.unitPrice,
            leadTimeDays: e.leadTimeDays ?? v.leadTimeDays,
          },
        },
      };
    }

    case "question.ask":
      return { ...slice, question: { id: e.id, questions: e.questions } };
    case "question.answered":
      return { ...slice, question: null };

    case "order.placed":
      return { ...slice, order: { placed: true } };
    case "order.receipt":
      return { ...slice, order: { placed: true, invoice: e.invoice } };

    default:
      return slice; // agent.text_delta, run.reset, run.removed handled in applyEvents
  }
}

/** The flat per-run fields the detail components read — mirrored from the active run. */
interface Mirror {
  request?: RfqRequest;
  running: boolean;
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
  question: { id: string; questions: AskQuestion[] } | null;
  order?: { placed: boolean; invoice?: Invoice };
}

function mirrorOf(slice: RunSlice | undefined): Mirror {
  return {
    request: slice?.request,
    running: slice?.running ?? false,
    thinking: slice?.thinking ?? false,
    status: slice?.status,
    toolCalls: slice?.toolCalls ?? EMPTY_OBJ,
    toolOrder: slice?.toolOrder ?? EMPTY_ARR,
    subagents: slice?.subagents ?? EMPTY_OBJ,
    subagentOrder: slice?.subagentOrder ?? EMPTY_ARR,
    vendors: slice?.vendors ?? EMPTY_OBJ,
    vendorOrder: slice?.vendorOrder ?? EMPTY_ARR,
    summary: slice?.summary,
    call: slice?.call ?? EMPTY_CALL,
    chat: slice?.chat ?? EMPTY_ARR,
    question: slice?.question ?? null,
    order: slice?.order,
  };
}

interface AppState extends Mirror {
  connected: boolean;
  model?: string;
  apiKeySource?: string;

  // multi-run
  runs: Record<string, RunSlice>;
  runOrder: string[];
  activeRunId: string | null;
  view: "dashboard" | "run";

  // actions
  applyEvents: (events: WireEvent[]) => void;
  pushChat: (role: "user" | "agent", text: string) => void;
  setConnected: (c: boolean) => void;
  reset: () => void;
  openRun: (runId: string, requestRaw?: string) => void;
  setActiveRun: (runId: string) => void;
  showDashboard: () => void;
  closeRun: (runId: string) => void;
}

export const useStore = create<AppState>()((set) => ({
  connected: false,
  runs: {},
  runOrder: [],
  activeRunId: null,
  view: "dashboard",
  ...mirrorOf(undefined),

  setConnected: (c) => set({ connected: c }),

  pushChat: (role, text) =>
    set((s) => {
      const rid = s.activeRunId;
      const slice = rid ? s.runs[rid] : undefined;
      if (!rid || !slice) return {};
      const updated = { ...slice, chat: [...slice.chat, { id: nextSeq(), role, text }] };
      return { runs: { ...s.runs, [rid]: updated }, chat: updated.chat };
    }),

  reset: () =>
    set({ runs: {}, runOrder: [], activeRunId: null, view: "dashboard", ...mirrorOf(undefined) }),

  openRun: (runId, requestRaw) =>
    set((s) => {
      const runs = { ...s.runs };
      let runOrder = s.runOrder;
      if (!runs[runId]) {
        runs[runId] = freshSlice(runId, Date.now(), requestRaw ? { raw: requestRaw } : undefined);
        runOrder = runOrder.includes(runId) ? runOrder : [...runOrder, runId];
      }
      return { runs, runOrder, activeRunId: runId, view: "run", ...mirrorOf(runs[runId]) };
    }),

  setActiveRun: (runId) =>
    set((s) => ({ activeRunId: runId, view: "run", ...mirrorOf(s.runs[runId]) })),

  showDashboard: () => set({ view: "dashboard" }),

  closeRun: (runId) => {
    void apiRemoveRun(runId);
    set((s) => {
      const runs = { ...s.runs };
      delete runs[runId];
      const runOrder = s.runOrder.filter((x) => x !== runId);
      const activeRunId = s.activeRunId === runId ? null : s.activeRunId;
      const view = s.activeRunId === runId ? "dashboard" : s.view;
      return {
        runs,
        runOrder,
        activeRunId,
        view,
        ...mirrorOf(activeRunId ? runs[activeRunId] : undefined),
      };
    });
  },

  applyEvents: (events) =>
    set((s) => {
      const runs = { ...s.runs };
      let runOrder = s.runOrder;
      let activeRunId = s.activeRunId;
      let view = s.view;
      const globalPatch: Partial<AppState> = {};

      for (const e of events) {
        const rid = e.runId;

        if (e.type === "run.reset") {
          for (const k of Object.keys(runs)) delete runs[k];
          runOrder = [];
          activeRunId = null;
          view = "dashboard";
          continue;
        }
        if (e.type === "agent.ready") {
          globalPatch.model = e.model;
          globalPatch.apiKeySource = e.apiKeySource;
          globalPatch.connected = true;
        }

        if (!rid) continue; // truly global event (connection status) — nothing per-run

        if (e.type === "run.removed") {
          delete runs[rid];
          runOrder = runOrder.filter((x) => x !== rid);
          if (activeRunId === rid) {
            activeRunId = null;
            view = "dashboard";
          }
          continue;
        }

        let slice = runs[rid];
        if (!slice) {
          slice = freshSlice(rid, Date.now());
          runOrder = runOrder.includes(rid) ? runOrder : [...runOrder, rid];
        }
        runs[rid] = reduceSlice(slice, e);
      }

      const active = activeRunId ? runs[activeRunId] : undefined;
      return { ...globalPatch, runs, runOrder, activeRunId, view, ...mirrorOf(active) };
    }),
}));
