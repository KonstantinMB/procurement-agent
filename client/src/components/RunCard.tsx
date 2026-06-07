import type { ReactNode } from "react";
import { motion } from "motion/react";
import { Phone, Loader2, CheckCircle2, X, Building2, ShoppingBag } from "lucide-react";
import { useStore } from "@/store";
import { formatMoney } from "@/lib/motion";
import type { Vendor } from "@/lib/events";

function effPrice(v: Vendor): number | undefined {
  return v.negotiatedPrice ?? v.initialPrice;
}

interface StatusInfo {
  label: string;
  cls: string;
  icon: ReactNode;
  live?: boolean;
}

/** A single parallel run on the dashboard. Click to drill into its full view. */
export default function RunCard({ id }: { id: string }) {
  const run = useStore((s) => s.runs[id]);
  const setActiveRun = useStore((s) => s.setActiveRun);
  const closeRun = useStore((s) => s.closeRun);
  if (!run) return null;

  const vendors = run.vendorOrder
    .map((vid) => run.vendors[vid])
    .filter(Boolean) as Vendor[];
  const priced = vendors.filter((v) => effPrice(v) != null);
  const best = priced.reduce<Vendor | undefined>(
    (b, v) => (!b || effPrice(v)! < effPrice(b)! ? v : b),
    undefined,
  );
  const currency = run.request?.currency ?? best?.currency ?? "EUR";

  const status: StatusInfo = run.order?.placed
    ? { label: "Ordered", cls: "bg-success/10 text-success", icon: <ShoppingBag size={12} /> }
    : run.call.active
      ? { label: "On a call", cls: "bg-call/10 text-call", icon: <Phone size={12} />, live: true }
      : run.running
        ? { label: "Working", cls: "bg-brand/10 text-brand", icon: <Loader2 size={12} className="animate-spin" /> }
        : run.summary
          ? { label: "Recommended", cls: "bg-success/10 text-success", icon: <CheckCircle2 size={12} /> }
          : { label: "Idle", cls: "bg-hover text-muted", icon: null };

  const title = run.request?.item ?? run.request?.raw ?? "New request";

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      role="button"
      tabIndex={0}
      onClick={() => setActiveRun(id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setActiveRun(id);
        }
      }}
      className="group relative flex cursor-pointer flex-col gap-3 rounded-xl border border-border bg-surface p-4 text-left shadow-[var(--shadow-card)] transition-colors hover:border-brand"
    >
      <button
        type="button"
        aria-label="Remove run"
        onClick={(e) => {
          e.stopPropagation();
          closeRun(id);
        }}
        className="absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-md text-faint opacity-0 transition hover:bg-hover hover:text-ink group-hover:opacity-100"
      >
        <X size={14} />
      </button>

      <p className="line-clamp-2 pr-6 text-sm font-medium leading-snug text-ink">{title}</p>

      <span
        className={`inline-flex w-fit items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium ${status.cls}`}
      >
        {status.live && (
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-current opacity-60" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-current" />
          </span>
        )}
        {status.icon}
        {status.label}
      </span>

      <div className="mt-1 flex items-center justify-between text-xs">
        <span className="inline-flex items-center gap-1 text-muted">
          <Building2 size={13} className="text-faint" />
          {vendors.length} supplier{vendors.length === 1 ? "" : "s"}
        </span>
        {best && effPrice(best) != null ? (
          <span className="font-mono font-semibold tabular-nums text-ink">
            {formatMoney(effPrice(best)!, currency)}
          </span>
        ) : (
          <span className="text-faint">—</span>
        )}
      </div>

      {run.summary && run.summary.savings > 0 && (
        <div className="rounded-lg bg-success/5 px-2.5 py-1.5 text-xs font-medium text-success">
          Saved {formatMoney(run.summary.savings, run.summary.currency)}
        </div>
      )}
    </motion.div>
  );
}
