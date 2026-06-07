// ─────────────────────────────────────────────────────────────────────────
// RUN REGISTRY — one live ProcurementRun per buyer request.
//
// Each request spawns an independent RunContext: its own RfqState, its own
// AbortController (so cancelling one run never touches another), its own set of
// research subprocesses, and an `emit` bound to its runId so every event it
// produces is routed to the right card on the dashboard. Multiple runs execute
// concurrently — the whole point of the parallel dashboard.
// ─────────────────────────────────────────────────────────────────────────

import type { ChildProcess } from "node:child_process";
import { bus } from "./bus";
import { RfqState } from "./state";
import type { AgentEvent } from "./events";

export interface RunContext {
  id: string;
  state: RfqState;
  abort: AbortController;
  createdAt: number;
  running: boolean;
  /** Emit an event stamped with this run's id. */
  emit: (e: AgentEvent) => void;
  /** Inject a mid-run chat follow-up into the live query (set by the agent). */
  pushUserMessage: ((text: string) => void) | null;
  /** Headless `claude -p` research children to kill on cancel. */
  researchChildren: Set<ChildProcess>;
}

const runs = new Map<string, RunContext>();
let counter = 0;

export function createRun(): RunContext {
  const id = `run-${++counter}-${Date.now().toString(36)}`;
  const ctx: RunContext = {
    id,
    state: new RfqState(),
    abort: new AbortController(),
    createdAt: Date.now(),
    running: true,
    emit: (e) => bus.emit(e, id),
    pushUserMessage: null,
    researchChildren: new Set(),
  };
  runs.set(id, ctx);
  return ctx;
}

export const getRun = (id: string): RunContext | undefined => runs.get(id);
export const allRuns = (): RunContext[] => [...runs.values()];

/** Abort a run, kill its research subprocesses, drop it, and tell the UI. */
export function removeRun(id: string): void {
  const ctx = runs.get(id);
  if (!ctx) return;
  ctx.running = false;
  try {
    ctx.abort.abort();
  } catch {
    /* already gone */
  }
  for (const c of ctx.researchChildren) {
    try {
      c.kill("SIGTERM");
    } catch {
      /* already gone */
    }
  }
  ctx.researchChildren.clear();
  runs.delete(id);
  ctx.emit({ type: "run.removed" });
}

/** Tear down every run (the global dashboard reset). */
export function resetAllRuns(): void {
  for (const ctx of runs.values()) {
    try {
      ctx.abort.abort();
    } catch {
      /* already gone */
    }
    for (const c of ctx.researchChildren) {
      try {
        c.kill("SIGTERM");
      } catch {
        /* already gone */
      }
    }
    ctx.researchChildren.clear();
  }
  runs.clear();
  bus.emit({ type: "run.reset" });
}
