import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import NumberFlow from "@number-flow/react";
import { Check, X, Zap } from "lucide-react";
import confetti from "canvas-confetti";
import { useStore } from "@/store";
import { placeOrder } from "@/lib/api";
import { SPRING } from "@/lib/motion";
import type { Vendor } from "@/lib/events";
import Receipt from "./Receipt";

function effectivePrice(v: Vendor): number | undefined {
  return v.negotiatedPrice ?? v.initialPrice;
}

export default function OrderNow() {
  const vendors = useStore((s) => s.vendors);
  const vendorOrder = useStore((s) => s.vendorOrder);
  const order = useStore((s) => s.order);
  const request = useStore((s) => s.request);
  const summary = useStore((s) => s.summary);
  const activeRunId = useStore((s) => s.activeRunId);
  const reduce = useReducedMotion();

  const [hideReceipt, setHideReceipt] = useState(false);

  const winner = useMemo<Vendor | undefined>(() => {
    const list = vendorOrder.map((id) => vendors[id]).filter(Boolean) as Vendor[];
    const won = list.find((v) => v.status === "won");
    if (won) return won;
    // Before the run concludes, keep the CTA hidden: a mid-run quote (e.g.
    // EuroDrive) must not let the operator order the wrong vendor before the
    // hero call closes. Only fall back to cheapest-eligible once a summary exists.
    if (!summary) return undefined;
    const eligible = list.filter(
      (v) => effectivePrice(v) != null && v.meetsDeadline !== false,
    );
    if (eligible.length === 0) return undefined;
    return eligible.reduce((best, v) =>
      effectivePrice(v)! < effectivePrice(best)! ? v : best,
    );
  }, [vendors, vendorOrder, summary]);

  const placed = order?.placed ?? false;
  const invoice = order?.invoice;
  const quantity = request?.quantity ?? 1;
  const unit = winner ? effectivePrice(winner) ?? 0 : 0;
  const total = unit * quantity;
  const currency = winner?.currency ?? request?.currency ?? "EUR";

  // Fire confetti the first time an invoice appears.
  useEffect(() => {
    if (!invoice) return;
    confetti({
      particleCount: 140,
      spread: 75,
      origin: { y: 0.7 },
      disableForReducedMotion: true,
    });
  }, [invoice]);

  // A fresh receipt should always be visible.
  useEffect(() => {
    if (invoice) setHideReceipt(false);
  }, [invoice]);

  if (!winner) return null;

  return (
    <>
      <motion.button
        type="button"
        layout
        onClick={() => {
          if (!placed && activeRunId) void placeOrder(activeRunId, winner.id);
        }}
        disabled={placed}
        aria-label={`Order ${quantity} from ${winner.name}`}
        transition={SPRING}
        className={`fixed bottom-6 right-6 z-40 inline-flex h-14 items-center gap-3 rounded-xl bg-brand px-6 text-white shadow-[var(--shadow-pop)] hover:bg-brand-hover ${
          placed ? "pointer-events-none opacity-60" : ""
        }`}
      >
        <AnimatePresence mode="wait" initial={false}>
          {invoice ? (
            <motion.span
              key="done"
              layout
              initial={{ opacity: 0, scale: 0.7 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.7 }}
              transition={SPRING}
              className="inline-flex items-center gap-2"
            >
              <Check className="h-5 w-5" strokeWidth={2.5} aria-hidden />
              <span className="font-semibold">Ordered</span>
            </motion.span>
          ) : placed ? (
            <motion.span
              key="placing"
              layout
              initial={{ opacity: 0, scale: 0.7 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.7 }}
              transition={SPRING}
              className="inline-flex items-center gap-2"
            >
              <span
                className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white"
                aria-hidden
              />
              <span className="font-semibold">Placing…</span>
            </motion.span>
          ) : (
            <motion.span
              key="cta"
              layout
              initial={{ opacity: 0, scale: 0.7 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.7 }}
              transition={SPRING}
              className="inline-flex items-center gap-3"
            >
              <Zap className="h-5 w-5" strokeWidth={2.25} aria-hidden />
              <span className="font-semibold">Order Now</span>
              <span className="tnum font-semibold tabular-nums">
                <NumberFlow
                  value={total}
                  format={{ style: "currency", currency }}
                  locales="de-DE"
                />
              </span>
            </motion.span>
          )}
        </AnimatePresence>
      </motion.button>

      <AnimatePresence>
        {invoice && !hideReceipt && (
          <motion.div
            key="receipt-overlay"
            className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => setHideReceipt(true)}
          >
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label="Order receipt"
              className="relative"
              initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.94, y: 12 }}
              animate={reduce ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 8 }}
              transition={SPRING}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={() => setHideReceipt(true)}
                aria-label="Close receipt"
                className="absolute -right-3 -top-3 grid h-8 w-8 place-items-center rounded-full bg-surface text-muted shadow-[var(--shadow-card)] hover:text-ink"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
              <Receipt invoice={invoice} />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
