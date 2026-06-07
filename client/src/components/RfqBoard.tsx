import { useMemo } from "react";
import { AnimatePresence } from "motion/react";
import { useStore } from "@/store";
import AgentGlyph from "./AgentGlyph";
import VendorCard from "./VendorCard";

function effectivePrice(price?: number, fallback?: number): number {
  return price ?? fallback ?? Infinity;
}

export default function RfqBoard() {
  const vendorOrder = useStore((s) => s.vendorOrder);
  const vendors = useStore((s) => s.vendors);

  const order = useMemo(() => {
    return [...vendorOrder].sort((a, b) => {
      const va = vendors[a];
      const vb = vendors[b];
      if (!va || !vb) return 0;
      const aWon = va.status === "won" ? 0 : 1;
      const bWon = vb.status === "won" ? 0 : 1;
      if (aWon !== bWon) return aWon - bWon;
      const pa = effectivePrice(va.negotiatedPrice, va.initialPrice);
      const pb = effectivePrice(vb.negotiatedPrice, vb.initialPrice);
      return pa - pb;
    });
  }, [vendorOrder, vendors]);

  return (
    <section aria-label="RFQ vendor comparison" className="flex flex-col gap-3">
      <p className="eyebrow">RFQ — Vendor Comparison</p>

      {order.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-surface/40 py-14 text-center">
          <AgentGlyph kind="web" className="h-7 w-7 text-faint" />
          <span className="text-sm text-faint">Scouting suppliers…</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <AnimatePresence initial={false}>
            {order.map((id) => (
              <VendorCard key={id} id={id} />
            ))}
          </AnimatePresence>
        </div>
      )}
    </section>
  );
}
