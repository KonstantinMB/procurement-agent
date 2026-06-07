import { useEffect } from "react";
import { useStore } from "@/store";
import type { AgentEvent } from "@/lib/events";

/**
 * Subscribe to the server's SSE event stream. Events are buffered and flushed
 * once per animation frame into a single batched store update — this prevents
 * re-render storms when many events arrive at once (e.g. a burst of tool calls).
 */
export function useAgentStream(): void {
  const setConnected = useStore((s) => s.setConnected);
  const applyEvents = useStore((s) => s.applyEvents);

  useEffect(() => {
    const es = new EventSource("/events");
    let buffer: AgentEvent[] = [];
    let raf = 0;

    const flush = () => {
      raf = 0;
      if (buffer.length === 0) return;
      const batch = buffer;
      buffer = [];
      applyEvents(batch);
    };

    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);
    es.onmessage = (ev: MessageEvent<string>) => {
      if (!ev.data) return;
      try {
        const parsed = JSON.parse(ev.data) as AgentEvent | AgentEvent[];
        if (Array.isArray(parsed)) buffer.push(...parsed);
        else buffer.push(parsed);
      } catch {
        return;
      }
      if (!raf) raf = requestAnimationFrame(flush);
    };

    return () => {
      es.close();
      if (raf) cancelAnimationFrame(raf);
    };
  }, [applyEvents, setConnected]);
}
