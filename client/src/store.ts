import { create } from "zustand";
import type {
  AskQuestion,
  CallSpeaker,
  Invoice,
  RfqRequest,
  RunSummary,
  ToolKind,
  ToolStatus,
  Vendor,
  WireEvent,
} from "@/lib/events";

export type ViewKey = "rfq" | "dashboard" | "calls" | "suppliers" | "settings";
export type RailTab = "activity" | "assistant";

const RAIL_WIDTH_KEY = "procura:rail-width";
const RAIL_TAB_KEY = "procura:rail-tab";
const VIEW_KEY = "procura:view";

const RAIL_MIN = 320;
const RAIL_MAX = 720;

function readNumber(key: string, fallback: number): number {
  if (typeof window === "undefined") return fallback;
  const raw = window.localStorage.getItem(key);
  const n = raw == null ? NaN : Number(raw);
  return Number.isFinite(n) ? n : fallback;
}
function readString<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  if (typeof window === "undefined") return fallback;
  const raw = window.localStorage.getItem(key);
  return (allowed as readonly string[]).includes(raw ?? "") ? (raw as T) : fallback;
}

// ─── Per-run types ────────────────────────────────────────────────────────
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
  qid: string;
  questions: AskQuestion[];
  answered: boolean;
  answers?: Record<string, string>;
}
export interface ChatMessage {
  id: number;
  role: "user" | "agent";
  text: string;
  kind?: "text" | "question";
  question?: ChatQuestion;
}

/** A single email captured for a vendor's RFQ thread. */
export interface VendorEmail {
  id: number;
  direction: "out" | "in";
  to?: string;
  from?: string;
  subject?: string;
  body?: string;
  unitPrice?: number;
  leadTimeDays?: number;
  at: number;
}

/** Per-vendor archive of every email + every call transcript line we've seen. */
export interface VendorThread {
  emails: VendorEmail[];
  transcript: TranscriptLine[];
}

/** All per-run state in one bag — what an RFQ pipeline carries from start to finish. */
export interface RunData {
  runId: string;
  title: string;
  createdAt: number;
  running: boolean;
  thinking: boolean;
  model?: string;
  apiKeySource?: string;
  request?: RfqRequest;
  status?: { phase: string; message?: string };
  toolCalls: Record<string, ToolCallItem>;
  toolOrder: string[];
  subagents: Record<string, SubagentItem>;
  subagentOrder: string[];
  vendors: Record<string, Vendor>;
  vendorOrder: string[];
  vendorThreads: Record<string, VendorThread>;
  summary?: Summary;
  call: CallState;
  chat: ChatMessage[];
  question: { id: string; questions: AskQuestion[] } | null;
  order?: { placed: boolean; invoice?: Invoice };
}

const initialCall: CallState = { active: false, phase: "idle", transcript: [] };

function newRunData(runId: string, title = "New RFQ"): RunData {
  return {
    runId,
    title,
    createdAt: Date.now(),
    running: false,
    thinking: false,
    toolCalls: {},
    toolOrder: [],
    subagents: {},
    subagentOrder: [],
    vendors: {},
    vendorOrder: [],
    vendorThreads: {},
    call: { ...initialCall, transcript: [] },
    chat: [],
    question: null,
  };
}

function pushEmail(r: RunData, vendorId: string, email: VendorEmail): RunData {
  const prev = r.vendorThreads[vendorId] ?? { emails: [], transcript: [] };
  return {
    ...r,
    vendorThreads: {
      ...r.vendorThreads,
      [vendorId]: { ...prev, emails: [...prev.emails, email] },
    },
  };
}

function pushTranscript(
  r: RunData,
  vendorId: string,
  line: TranscriptLine,
): RunData {
  const prev = r.vendorThreads[vendorId] ?? { emails: [], transcript: [] };
  return {
    ...r,
    vendorThreads: {
      ...r.vendorThreads,
      [vendorId]: { ...prev, transcript: [...prev.transcript, line] },
    },
  };
}

// ─── Top-level state — UI + a mirror of the current run for legacy selectors ──
interface AppState {
  connected: boolean;
  runs: Record<string, RunData>;
  runOrder: string[]; // newest-first
  currentRunId?: string;
  runSummaries: RunSummary[]; // from /api/runs

  // Mirror of runs[currentRunId] — read these from components as before.
  running: boolean;
  thinking: boolean;
  model?: string;
  apiKeySource?: string;
  request?: RfqRequest;
  status?: { phase: string; message?: string };
  toolCalls: Record<string, ToolCallItem>;
  toolOrder: string[];
  subagents: Record<string, SubagentItem>;
  subagentOrder: string[];
  vendors: Record<string, Vendor>;
  vendorOrder: string[];
  vendorThreads: Record<string, VendorThread>;
  summary?: Summary;
  call: CallState;
  chat: ChatMessage[];
  question: { id: string; questions: AskQuestion[] } | null;
  order?: { placed: boolean; invoice?: Invoice };

  // UI / nav
  view: ViewKey;
  railWidth: number;
  railTab: RailTab;
  setView: (v: ViewKey) => void;
  setRailWidth: (n: number) => void;
  setRailTab: (t: RailTab) => void;

  setConnected: (c: boolean) => void;
  setCurrentRunId: (id: string | undefined) => void;
  ensureRun: (id: string, title?: string) => void;
  setRunSummaries: (s: RunSummary[]) => void;
  applyEvents: (events: WireEvent[]) => void;
  pushChat: (role: "user" | "agent", text: string) => void;
}

let _seq = 1;
const nextSeq = () => _seq++;

/** Pick the fields a component reads — produces the "current run mirror". */
function mirrorOf(r: RunData): Pick<
  AppState,
  | "running"
  | "thinking"
  | "model"
  | "apiKeySource"
  | "request"
  | "status"
  | "toolCalls"
  | "toolOrder"
  | "subagents"
  | "subagentOrder"
  | "vendors"
  | "vendorOrder"
  | "vendorThreads"
  | "summary"
  | "call"
  | "chat"
  | "question"
  | "order"
> {
  return {
    running: r.running,
    thinking: r.thinking,
    model: r.model,
    apiKeySource: r.apiKeySource,
    request: r.request,
    status: r.status,
    toolCalls: r.toolCalls,
    toolOrder: r.toolOrder,
    subagents: r.subagents,
    subagentOrder: r.subagentOrder,
    vendors: r.vendors,
    vendorOrder: r.vendorOrder,
    vendorThreads: r.vendorThreads,
    summary: r.summary,
    call: r.call,
    chat: r.chat,
    question: r.question,
    order: r.order,
  };
}

const emptyMirror = mirrorOf(newRunData("__empty__"));

/** Reducer over one run for one event (everything except agent.text_delta). */
function applyOne(r: RunData, e: WireEvent): RunData {
  switch (e.type) {
    case "agent.ready":
      return { ...r, model: e.model, apiKeySource: e.apiKeySource, running: true };
    case "agent.thinking":
      return { ...r, thinking: e.active };
    case "status":
      return { ...r, status: { phase: e.phase, message: e.message } };
    case "agent.message":
      return { ...r, chat: [...r.chat, { id: nextSeq(), role: "agent", text: e.text }] };
    case "done":
      return { ...r, running: false, thinking: false };
    case "tool.call": {
      const toolCalls = {
        ...r.toolCalls,
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
      const toolOrder = r.toolOrder.includes(e.id) ? r.toolOrder : [...r.toolOrder, e.id];
      return { ...r, toolCalls, toolOrder };
    }
    case "tool.result": {
      const prev = r.toolCalls[e.id];
      if (!prev) return r;
      return { ...r, toolCalls: { ...r.toolCalls, [e.id]: { ...prev, status: e.status, summary: e.summary } } };
    }
    case "subagent.spawned": {
      const subagents = { ...r.subagents, [e.id]: { id: e.id, role: e.role, parentId: e.parentId, done: false } };
      const subagentOrder = r.subagentOrder.includes(e.id) ? r.subagentOrder : [...r.subagentOrder, e.id];
      return { ...r, subagents, subagentOrder };
    }
    case "subagent.done": {
      const prev = r.subagents[e.id];
      if (!prev) return r;
      return { ...r, subagents: { ...r.subagents, [e.id]: { ...prev, done: true } } };
    }
    case "rfq.request": {
      const title = e.request.item ?? e.request.raw?.slice(0, 80) ?? r.title;
      return { ...r, request: e.request, title };
    }
    case "rfq.supplier_added": {
      const vendors = { ...r.vendors, [e.vendor.id]: e.vendor };
      const vendorOrder = r.vendorOrder.includes(e.vendor.id) ? r.vendorOrder : [...r.vendorOrder, e.vendor.id];
      return { ...r, vendors, vendorOrder };
    }
    case "rfq.supplier_updated": {
      const prev = r.vendors[e.id];
      if (!prev) return r;
      return { ...r, vendors: { ...r.vendors, [e.id]: { ...prev, ...e.patch } } };
    }
    case "rfq.summary":
      return {
        ...r,
        summary: {
          headline: e.headline,
          savings: e.savings,
          currency: e.currency,
          withinBudget: e.withinBudget,
          quotes: e.quotes,
        },
      };
    case "call.ringing": {
      const call = {
        active: true,
        vendorId: e.vendorId,
        vendorName: e.vendorName,
        phase: "ringing" as const,
        transcript: [],
      };
      const prev = r.vendors[e.vendorId];
      const vendors = prev ? { ...r.vendors, [e.vendorId]: { ...prev, status: "calling" as const } } : r.vendors;
      return { ...r, call, vendors };
    }
    case "call.connected":
      return { ...r, call: { ...r.call, active: true, phase: "connected" } };
    case "call.transcript": {
      const line: TranscriptLine = {
        id: nextSeq(),
        speaker: e.speaker,
        text: e.text,
        final: e.final,
      };
      const withCall = {
        ...r,
        call: {
          ...r.call,
          speaking: e.speaker,
          transcript: [...r.call.transcript, line],
        },
      };
      // Archive on the vendor thread so it survives past the current call.
      // Belt-and-braces: write to BOTH the event's vendorId and the live
      // call.vendorId when they differ. In practice Vapi will occasionally
      // emit transcript events with a different vendorId than the one we set
      // on call.ringing (or the agent passes the wrong id to call_supplier).
      // Without this duplication the live CallPanel would show the lines
      // (sourced from call.transcript) while the supplier-row expander would
      // show "No transcript captured" — exactly the bug we just hit.
      const callVid = withCall.call.vendorId;
      let next = pushTranscript(withCall, e.vendorId, line);
      if (callVid && callVid !== e.vendorId) {
        next = pushTranscript(next, callVid, line);
      }
      return next;
    }
    case "call.quote": {
      const call = {
        ...r.call,
        quote: { unitPrice: e.unitPrice, currency: e.currency, leadTimeDays: e.leadTimeDays },
      };
      const vid = call.vendorId;
      const prev = vid ? r.vendors[vid] : undefined;
      const vendors =
        vid && prev
          ? {
              ...r.vendors,
              [vid]: {
                ...prev,
                negotiatedPrice: e.unitPrice,
                currency: e.currency,
                leadTimeDays: e.leadTimeDays,
                status: "negotiating" as const,
              },
            }
          : r.vendors;
      return { ...r, call, vendors };
    }
    case "call.ended":
      return { ...r, call: { ...r.call, phase: "ended", active: false, outcome: e.outcome, speaking: undefined } };
    case "email.sent": {
      const prev = r.vendors[e.vendorId];
      const withVendor = prev
        ? {
            ...r,
            vendors: {
              ...r.vendors,
              [e.vendorId]: {
                ...prev,
                status: prev.status === "discovered" ? ("emailing" as const) : prev.status,
              },
            },
          }
        : r;
      return pushEmail(withVendor, e.vendorId, {
        id: nextSeq(),
        direction: "out",
        to: e.to,
        subject: e.subject,
        body: e.body,
        at: e.at ?? Date.now(),
      });
    }
    case "email.reply": {
      const prev = r.vendors[e.vendorId];
      const withVendor = prev
        ? {
            ...r,
            vendors: {
              ...r.vendors,
              [e.vendorId]: {
                ...prev,
                status: "quoted" as const,
                initialPrice: e.unitPrice ?? prev.initialPrice,
                negotiatedPrice: prev.negotiatedPrice ?? e.unitPrice,
                leadTimeDays: e.leadTimeDays ?? prev.leadTimeDays,
              },
            },
          }
        : r;
      return pushEmail(withVendor, e.vendorId, {
        id: nextSeq(),
        direction: "in",
        from: e.from,
        subject: e.subject,
        body: e.body,
        unitPrice: e.unitPrice,
        leadTimeDays: e.leadTimeDays,
        at: e.at ?? Date.now(),
      });
    }
    case "question.ask":
      return { ...r, question: { id: e.id, questions: e.questions } };
    case "question.answered":
      return { ...r, question: null };
    case "order.placed":
      return { ...r, order: { placed: true } };
    case "order.receipt":
      return { ...r, order: { placed: true, invoice: e.invoice } };
    case "agent.text_delta":
      return r;
  }
}

export const useStore = create<AppState>()((set) => ({
  connected: false,
  runs: {},
  runOrder: [],
  currentRunId: undefined,
  runSummaries: [],

  ...emptyMirror,

  view: readString<ViewKey>(VIEW_KEY, ["rfq", "dashboard", "calls", "suppliers", "settings"], "rfq"),
  railWidth: Math.min(RAIL_MAX, Math.max(RAIL_MIN, readNumber(RAIL_WIDTH_KEY, 380))),
  railTab: readString<RailTab>(RAIL_TAB_KEY, ["activity", "assistant"], "activity"),

  setView: (v) => {
    if (typeof window !== "undefined") window.localStorage.setItem(VIEW_KEY, v);
    set({ view: v });
  },
  setRailWidth: (n) => {
    const clamped = Math.min(RAIL_MAX, Math.max(RAIL_MIN, Math.round(n)));
    if (typeof window !== "undefined") window.localStorage.setItem(RAIL_WIDTH_KEY, String(clamped));
    set({ railWidth: clamped });
  },
  setRailTab: (t) => {
    if (typeof window !== "undefined") window.localStorage.setItem(RAIL_TAB_KEY, t);
    set({ railTab: t });
  },

  setConnected: (c) => set({ connected: c }),

  setCurrentRunId: (id) =>
    set((s) => {
      if (!id) return { currentRunId: undefined, ...emptyMirror };
      const r = s.runs[id];
      if (!r) return { currentRunId: id };
      return { currentRunId: id, ...mirrorOf(r) };
    }),

  ensureRun: (id, title) =>
    set((s) => {
      if (s.runs[id]) return {};
      const data = newRunData(id, title);
      return {
        runs: { ...s.runs, [id]: data },
        runOrder: s.runOrder.includes(id) ? s.runOrder : [id, ...s.runOrder],
      };
    }),

  setRunSummaries: (rs) => set({ runSummaries: rs }),

  pushChat: (role, text) =>
    set((s) => {
      const id = s.currentRunId;
      if (!id) return {};
      const prev = s.runs[id];
      if (!prev) return {};
      const updated: RunData = {
        ...prev,
        chat: [...prev.chat, { id: nextSeq(), role, text }],
      };
      const runs = { ...s.runs, [id]: updated };
      return { runs, ...mirrorOf(updated) };
    }),

  applyEvents: (events) =>
    set((s) => {
      let runs = s.runs;
      let runOrder = s.runOrder;
      const touched = new Set<string>();
      for (const e of events) {
        const id = e.runId;
        if (!id) continue;
        let r = runs[id];
        if (!r) {
          r = newRunData(id);
          runOrder = runOrder.includes(id) ? runOrder : [id, ...runOrder];
        }
        const next = applyOne(r, e);
        if (next !== r) {
          runs = { ...runs, [id]: next };
          touched.add(id);
        }
      }
      const partial: Partial<AppState> = { runs, runOrder };
      const cur = s.currentRunId;
      if (cur && touched.has(cur) && runs[cur]) {
        Object.assign(partial, mirrorOf(runs[cur]!));
      }
      return partial;
    }),
}));
