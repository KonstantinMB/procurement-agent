import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "motion/react";
import { fadeUp } from "@/lib/motion";

interface Line {
  id: number;
  speaker: "agent" | "supplier";
  text: string;
  final: boolean;
}

/**
 * Two-speaker live transcript. Agent bubbles align right (brand tint),
 * supplier bubbles align left (hover gray). Auto-scrolls to the newest line
 * only when the viewer is already near the bottom.
 */
export default function Transcript({ lines }: { lines: Line[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const nearBottom =
      el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (nearBottom) {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    }
  }, [lines.length]);

  return (
    <div
      ref={scrollRef}
      className="flex max-h-[220px] flex-col gap-2 overflow-y-auto pr-1"
      aria-live="polite"
    >
      {lines.length === 0 && (
        <p className="py-6 text-center text-sm text-faint">
          Waiting for the conversation to start…
        </p>
      )}
      <AnimatePresence initial={false}>
        {lines.map((line) => {
          const isAgent = line.speaker === "agent";
          return (
            <motion.div
              key={line.id}
              layout
              variants={fadeUp}
              initial="initial"
              animate="animate"
              exit="exit"
              className={
                isAgent
                  ? "flex flex-col items-end"
                  : "flex flex-col items-start"
              }
            >
              <span className="eyebrow mb-0.5 px-1">
                {isAgent ? "Procura" : "Supplier"}
              </span>
              <div
                className={
                  isAgent
                    ? "max-w-[85%] rounded-2xl bg-brand-tint px-3 py-2 text-sm leading-snug text-ink"
                    : "max-w-[85%] rounded-2xl bg-hover px-3 py-2 text-sm leading-snug text-ink"
                }
                style={{ opacity: line.final ? 1 : 0.75 }}
              >
                {line.text}
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
