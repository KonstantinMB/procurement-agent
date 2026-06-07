import { Check, Loader2, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";

import AgentGlyph, { type GlyphKind } from "./AgentGlyph";
import { SPRING_SNAPPY } from "@/lib/motion";
import { useStore } from "@/store";
import type { ToolKind } from "@/lib/events";

// Tailwind text-color utility per tool kind (status colors stay reserved for
// live/active states — these tint only the small leading glyph chip).
const KIND_TEXT: Record<ToolKind, string> = {
  web: "text-brand",
  call: "text-call",
  email: "text-email",
  quote: "text-quote",
  question: "text-brand",
  order: "text-brand",
  think: "text-muted",
  dashboard: "text-muted",
  other: "text-muted",
};

// Map a tool kind onto an AgentGlyph kind. Dashboard reuses the quote glyph;
// everything else passes through, with a safe "web" fallback.
function glyphFor(kind: ToolKind): GlyphKind {
  switch (kind) {
    case "call":
      return "call";
    case "email":
      return "email";
    case "quote":
    case "dashboard":
      return "quote";
    case "order":
      return "order";
    case "think":
    case "question":
      return "think";
    case "web":
    case "other":
    default:
      return "web";
  }
}

export default function ToolCard({ id }: { id: string }) {
  const t = useStore((s) => s.toolCalls[id]);
  if (!t) return null;

  const tint = KIND_TEXT[t.kind] ?? "text-muted";

  return (
    <div className="rounded-lg border border-border bg-surface p-2.5 flex gap-2.5 items-start">
      {/* leading glyph chip — tinted by kind, faint ring of the same color */}
      <div
        className={`relative h-7 w-7 shrink-0 rounded-md grid place-items-center bg-hover ring-1 ring-current/15 ${tint}`}
      >
        <AgentGlyph kind={glyphFor(t.kind)} size={16} />
        {t.status === "running" && (
          <span className="absolute inset-0 grid place-items-center rounded-md bg-surface/60">
            <Loader2 size={12} className="animate-spin text-faint" />
          </span>
        )}
      </div>

      {/* body — label + optional summary */}
      <div className="flex-1 min-w-0">
        <div className="font-medium text-ink text-sm truncate">{t.label}</div>
        {t.summary && (
          <div className="text-muted text-xs mt-0.5 leading-snug">{t.summary}</div>
        )}
      </div>

      {/* trailing status indicator */}
      <div className="shrink-0 grid place-items-center pt-0.5">
        <AnimatePresence mode="wait" initial={false}>
          {t.status === "running" ? (
            <motion.span
              key="running"
              initial={{ opacity: 0, scale: 0.7 }}
              animate={{ opacity: 1, scale: 1, transition: SPRING_SNAPPY }}
              exit={{ opacity: 0, scale: 0.7, transition: { duration: 0.12 } }}
              aria-label="Running"
            >
              <Loader2 size={15} className="animate-spin text-faint" />
            </motion.span>
          ) : t.status === "error" ? (
            <motion.span
              key="error"
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1, transition: SPRING_SNAPPY }}
              exit={{ opacity: 0, scale: 0.7, transition: { duration: 0.12 } }}
              aria-label="Error"
            >
              <X size={15} className="text-danger" />
            </motion.span>
          ) : (
            <motion.span
              key="done"
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1, transition: SPRING_SNAPPY }}
              exit={{ opacity: 0, scale: 0.7, transition: { duration: 0.12 } }}
              aria-label="Done"
            >
              <Check size={15} className="text-success" />
            </motion.span>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
