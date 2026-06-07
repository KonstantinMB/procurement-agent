import { AnimatePresence, motion } from "motion/react";

import ToolCard from "./ToolCard";
import { cardVariants } from "@/lib/motion";
import { useStore } from "@/store";

export default function ActivityPanel() {
  const running = useStore((s) => s.running);
  const thinking = useStore((s) => s.thinking);
  const toolOrder = useStore((s) => s.toolOrder);
  const workerCount = useStore((s) => s.subagentOrder.length);

  // newest-first without mutating the store's array
  const ordered = [...toolOrder].reverse();

  return (
    <section className="bg-surface h-full flex flex-col min-h-0">
      <header className="px-3 py-2 border-b border-border flex items-center gap-2">
        {running ? (
          <motion.span
            aria-hidden
            className="h-1.5 w-1.5 rounded-full bg-brand"
            animate={{ opacity: [1, 0.3, 1], scale: [1, 0.85, 1] }}
            transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
          />
        ) : (
          <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-faint" />
        )}
        <span className="text-xs text-muted">
          {running ? "Streaming" : "Idle"}
        </span>
        {workerCount > 0 && (
          <span className="ml-auto text-faint text-xs tnum">
            {workerCount} {workerCount === 1 ? "worker" : "workers"}
          </span>
        )}
      </header>

      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
        {thinking && (
          <div className="bg-hover rounded-lg p-2 flex items-center gap-2.5">
            <span className="shimmer h-4 w-4 rounded-full shrink-0" aria-hidden />
            <span className="text-muted text-sm">Thinking…</span>
          </div>
        )}

        <AnimatePresence initial={false}>
          {ordered.map((id) => (
            <motion.div
              key={id}
              layout
              variants={cardVariants}
              initial="initial"
              animate="animate"
              exit="exit"
            >
              <ToolCard id={id} />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </section>
  );
}
