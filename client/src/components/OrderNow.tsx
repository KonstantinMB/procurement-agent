import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { X } from "lucide-react";
import confetti from "canvas-confetti";
import { useStore } from "@/store";
import { SPRING } from "@/lib/motion";
import Receipt from "./Receipt";

/**
 * Order result surface — no more floating CTA. The actionable buttons live in
 * the table (see RowOrderButton). This component only owns the receipt modal +
 * confetti payoff that fire once an `order.receipt` event lands.
 */
export default function OrderNow() {
  const order = useStore((s) => s.order);
  const reduce = useReducedMotion();
  const [hideReceipt, setHideReceipt] = useState(false);

  const invoice = order?.invoice;

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

  return (
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
  );
}
