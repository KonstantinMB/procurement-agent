import type { AgentEvent, WireEvent } from "./events";

type Listener = (e: WireEvent) => void;

/**
 * Central event bus. Tools / agent runtime / voice / email all call
 * `bus.emit(runId, event)`; the bus stamps the runId on the event and fans out
 * to subscribers (the SSE stream forwards each WireEvent to the browser).
 * Every event on the wire carries `runId` so the client can route it to the
 * correct RFQ bucket.
 */
class EventBus {
  private listeners = new Set<Listener>();

  emit(runId: string, e: AgentEvent): void {
    const wire = { ...e, runId } as WireEvent;
    for (const l of [...this.listeners]) {
      try {
        l(wire);
      } catch {
        /* a broken subscriber must not break the emit loop */
      }
    }
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  get size(): number {
    return this.listeners.size;
  }
}

export const bus = new EventBus();
