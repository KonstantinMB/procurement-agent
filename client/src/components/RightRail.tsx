import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { Activity, MessageSquare } from "lucide-react";
import { useStore, type RailTab } from "@/store";
import { SPRING } from "@/lib/motion";
import ActivityPanel from "./ActivityPanel";
import Chat from "./Chat";

const RAIL_MIN = 320;
const RAIL_MAX = 720;

interface TabDef {
  id: RailTab;
  label: string;
  icon: typeof Activity;
}

const TABS: TabDef[] = [
  { id: "activity", label: "Live activity", icon: Activity },
  { id: "assistant", label: "Assistant", icon: MessageSquare },
];

export default function RightRail() {
  const railWidth = useStore((s) => s.railWidth);
  const setRailWidth = useStore((s) => s.setRailWidth);
  const railTab = useStore((s) => s.railTab);
  const setRailTab = useStore((s) => s.setRailTab);
  const question = useStore((s) => s.question);

  const [dragging, setDragging] = useState(false);
  const railRef = useRef<HTMLDivElement>(null);

  // Drag from the left edge resizes the rail (right side stays fixed).
  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      const startX = e.clientX;
      const startW = railWidth;
      setDragging(true);
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);

      const onMove = (ev: PointerEvent) => {
        const next = startW + (startX - ev.clientX);
        setRailWidth(next);
      };
      const onUp = () => {
        setDragging(false);
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [railWidth, setRailWidth]
  );

  // Surface inline decision prompts: pulse the Assistant tab + auto-focus it once.
  const lastQid = useRef<string | null>(null);
  useEffect(() => {
    if (question && question.id !== lastQid.current) {
      lastQid.current = question.id;
      if (railTab !== "assistant") setRailTab("assistant");
    }
    if (!question) lastQid.current = null;
  }, [question, railTab, setRailTab]);

  return (
    <aside
      ref={railRef}
      style={{ width: railWidth }}
      className="relative flex h-full min-h-0 shrink-0 flex-col border-l border-border bg-surface"
    >
      {/* Drag handle — sits on the left edge */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize panel"
        aria-valuemin={RAIL_MIN}
        aria-valuemax={RAIL_MAX}
        aria-valuenow={railWidth}
        onPointerDown={onPointerDown}
        onDoubleClick={() => setRailWidth(380)}
        title="Drag to resize · double-click to reset"
        className={`group absolute left-0 top-0 z-10 h-full w-1.5 -translate-x-1/2 cursor-col-resize select-none ${
          dragging ? "" : ""
        }`}
      >
        <div
          className={`absolute inset-y-0 left-1/2 -translate-x-1/2 transition-all ${
            dragging
              ? "w-[3px] bg-brand"
              : "w-px bg-transparent group-hover:w-[3px] group-hover:bg-brand/40"
          }`}
        />
      </div>

      {/* Tabs */}
      <div className="flex shrink-0 items-center gap-1 border-b border-border px-2 pt-2">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = railTab === t.id;
          const pulse = t.id === "assistant" && !!question && !active;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setRailTab(t.id)}
              aria-current={active ? "page" : undefined}
              className={`relative inline-flex items-center gap-1.5 rounded-t-lg px-3 py-2 text-xs font-medium transition-colors ${
                active
                  ? "text-ink"
                  : "text-muted hover:bg-hover hover:text-ink"
              }`}
            >
              <Icon size={13} strokeWidth={2.2} />
              <span>{t.label}</span>
              {pulse && (
                <motion.span
                  aria-hidden
                  className="h-1.5 w-1.5 rounded-full bg-brand"
                  animate={{ opacity: [1, 0.3, 1], scale: [1, 0.85, 1] }}
                  transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
                />
              )}
              {active && (
                <motion.span
                  layoutId="rail-tab-indicator"
                  transition={SPRING}
                  className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-brand"
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Panes — both mounted so SSE state isn't lost on tab switch */}
      <div className="relative min-h-0 flex-1">
        <div
          className={`absolute inset-0 ${railTab === "activity" ? "" : "pointer-events-none invisible"}`}
        >
          <ActivityPanel />
        </div>
        <div
          className={`absolute inset-0 ${railTab === "assistant" ? "" : "pointer-events-none invisible"}`}
        >
          <Chat />
        </div>
      </div>
    </aside>
  );
}
