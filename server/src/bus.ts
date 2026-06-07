import type { AgentEvent, WireEvent } from "./events";

type Listener = (e: WireEvent) => void;

/**
 * Central event bus. Every source of truth (the Claude Agent SDK stream mapper,
 * the Vapi/email handlers, the per-run tools) calls `bus.emit(event, runId)`.
 * The bus stamps the runId onto the event so the SSE endpoint can forward it and
 * the browser can route it into the right run's slice. The UI is a pure
 * projection of this stream.
 */
class EventBus {
  private listeners = new Set<Listener>();

  emit(e: AgentEvent, runId?: string): void {
    const wire: WireEvent = runId ? { ...e, runId } : e;
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
