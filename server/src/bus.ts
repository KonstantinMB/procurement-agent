import type { AgentEvent } from "./events";

type Listener = (e: AgentEvent) => void;

/**
 * Central event bus. Every source of truth (the demo emitter, the Claude Agent
 * SDK stream mapper, the Vapi/email handlers) calls `bus.emit(...)`. The SSE
 * endpoint subscribes and forwards each event to the browser. The UI is a pure
 * projection of this stream.
 */
class EventBus {
  private listeners = new Set<Listener>();

  emit(e: AgentEvent): void {
    for (const l of [...this.listeners]) {
      try {
        l(e);
      } catch {
        /* a slow/broken subscriber must not break the emit loop */
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
