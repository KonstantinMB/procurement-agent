import { motion } from "motion/react";
import { Check, Zap } from "lucide-react";
import { useStore } from "@/store";
import { placeOrder } from "@/lib/api";
import { pickWinner, effectivePrice } from "@/lib/winner";

/**
 * Per-row purchase action. Only the recommended supplier's row gets a live,
 * clickable Order button; everyone else is shown as a blurred placeholder so
 * the table reads like a real procurement console with a single actionable row.
 */
export default function RowOrderButton({ vendorId }: { vendorId: string }) {
  const vendors = useStore((s) => s.vendors);
  const vendorOrder = useStore((s) => s.vendorOrder);
  const order = useStore((s) => s.order);
  const runId = useStore((s) => s.currentRunId);

  const v = vendors[vendorId];
  if (!v) return null;

  const winner = pickWinner(vendors, vendorOrder);
  const isWinner = winner?.id === vendorId;
  const eligible =
    isWinner && effectivePrice(v) != null && v.meetsDeadline !== false;
  const placed = order?.placed ?? false;

  if (placed && isWinner) {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-success/10 px-2 py-1 text-xs font-medium text-success">
        <Check size={12} strokeWidth={2.6} />
        Ordered
      </span>
    );
  }

  if (!eligible) {
    return (
      <span
        aria-disabled="true"
        className="inline-flex select-none items-center rounded-md bg-hover px-2 py-1 text-xs text-faint opacity-50 blur-[0.4px]"
        title="Not the recommended supplier"
      >
        Not selected
      </span>
    );
  }

  return (
    <motion.button
      type="button"
      whileHover={{ scale: placed ? 1 : 1.03 }}
      whileTap={{ scale: placed ? 1 : 0.96 }}
      disabled={placed}
      onClick={() => {
        if (!placed && runId) void placeOrder(runId, vendorId);
      }}
      aria-label={`Order from ${v.name}`}
      className={`inline-flex items-center gap-1.5 rounded-md bg-brand px-2.5 py-1 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-brand-hover ${
        placed ? "pointer-events-none opacity-60" : ""
      }`}
    >
      <Zap size={12} strokeWidth={2.6} />
      Order
    </motion.button>
  );
}
