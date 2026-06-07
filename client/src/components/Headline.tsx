import { motion } from "motion/react";
import NumberFlow from "@number-flow/react";
import { Check, TriangleAlert, Loader2 } from "lucide-react";
import { useStore } from "@/store";
import { fadeUp, formatMoney } from "@/lib/motion";

/**
 * Headline — the live "bottom line" of the run.
 * When a summary exists it foregrounds the negotiated savings (animated) plus
 * budget / quote-count chips, and restates the original request on the right.
 * Before any summary it shows a quiet analyzing state echoing the raw request.
 */
export default function Headline() {
  const summary = useStore((s) => s.summary);
  const request = useStore((s) => s.request);

  // ── Pre-summary: faint analyzing state ──────────────────────────────────
  if (!summary) {
    if (!request) return null;
    return (
      <motion.div
        variants={fadeUp}
        initial="initial"
        animate="animate"
        className="flex items-center gap-3 px-1 py-1 text-muted"
      >
        <Loader2 size={15} className="animate-spin text-faint" aria-hidden />
        <span className="text-sm">
          Analyzing&nbsp;
          <span className="text-ink">{request.raw}</span>
        </span>
      </motion.div>
    );
  }

  // ── Restated request, e.g. "50 × brushless motors · by Friday" ──────────
  const parts: string[] = [];
  if (request?.item) {
    parts.push(
      request.quantity != null
        ? `${request.quantity} × ${request.item}`
        : request.item,
    );
  }
  if (request?.deadline) parts.push(`by ${request.deadline}`);
  const restated = parts.join(" · ");

  return (
    <motion.div
      variants={fadeUp}
      initial="initial"
      animate="animate"
      className="bg-surface border border-border rounded-xl px-5 py-4 shadow-[var(--shadow-card)] flex items-center gap-5"
    >
      {/* Big animated savings number */}
      <div className="flex items-baseline gap-2">
        <NumberFlow
          value={summary.savings}
          format={{
            style: "currency",
            currency: summary.currency,
            maximumFractionDigits: 0,
          }}
          className="text-3xl font-mono font-semibold text-ink tnum"
          aria-label={`${formatMoney(summary.savings, summary.currency)} saved`}
        />
        <span className="text-muted text-sm">saved</span>
      </div>

      {/* Status chips */}
      <div className="flex items-center gap-2">
        {summary.withinBudget ? (
          <span className="inline-flex items-center gap-1 rounded-md bg-quote/10 px-2 py-0.5 text-xs font-medium text-quote">
            <Check size={13} aria-hidden />
            within budget
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-md bg-call/10 px-2 py-0.5 text-xs font-medium text-call">
            <TriangleAlert size={13} aria-hidden />
            over budget
          </span>
        )}
        <span className="inline-flex items-center rounded-md bg-hover px-2 py-0.5 text-xs text-muted tnum">
          {summary.quotes} quotes
        </span>
      </div>

      {/* Restated request */}
      {restated && (
        <div className="ml-auto text-muted text-sm truncate">{restated}</div>
      )}
    </motion.div>
  );
}
