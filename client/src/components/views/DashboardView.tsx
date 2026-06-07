import { motion } from "motion/react";
import NumberFlow from "@number-flow/react";
import {
  Activity,
  CircleDollarSign,
  Phone,
  TrendingDown,
  Users,
} from "lucide-react";
import { useStore } from "@/store";
import { formatMoney } from "@/lib/motion";
import type { Vendor } from "@/lib/events";

function effectivePrice(v: Vendor): number | undefined {
  return v.negotiatedPrice ?? v.initialPrice;
}

function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "ink",
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  icon: typeof Activity;
  tone?: "ink" | "brand" | "success" | "call";
}) {
  const toneCls =
    tone === "brand"
      ? "text-brand bg-brand-tint"
      : tone === "success"
        ? "text-success bg-success/10"
        : tone === "call"
          ? "text-call bg-call/10"
          : "text-ink bg-hover";
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-border bg-surface p-4 shadow-[var(--shadow-card)]"
    >
      <div className="flex items-center gap-2">
        <span
          className={`grid h-8 w-8 place-items-center rounded-lg ${toneCls}`}
        >
          <Icon size={15} strokeWidth={2.2} />
        </span>
        <span className="eyebrow">{label}</span>
      </div>
      <div className="mt-3 text-2xl font-semibold text-ink tnum">{value}</div>
      {hint && <div className="mt-1 text-xs text-muted">{hint}</div>}
    </motion.div>
  );
}

export default function DashboardView() {
  const summary = useStore((s) => s.summary);
  const vendors = useStore((s) => s.vendors);
  const vendorOrder = useStore((s) => s.vendorOrder);
  const callPhase = useStore((s) => s.call.phase);
  const running = useStore((s) => s.running);

  const list = vendorOrder.map((id) => vendors[id]).filter(Boolean) as Vendor[];
  const quoted = list.filter((v) => effectivePrice(v) != null);
  const won = list.find((v) => v.status === "won");
  const bestPrice = quoted.length
    ? quoted.reduce((min, v) => Math.min(min, effectivePrice(v)!), Infinity)
    : undefined;
  const currency = won?.currency ?? quoted[0]?.currency ?? "EUR";

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-6">
      <div>
        <h1 className="text-xl font-semibold text-ink">Dashboard</h1>
        <p className="mt-0.5 text-sm text-muted">
          Live overview of the current procurement run.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Savings"
          icon={TrendingDown}
          tone="success"
          value={
            summary ? (
              <NumberFlow
                value={summary.savings}
                format={{
                  style: "currency",
                  currency: summary.currency,
                  maximumFractionDigits: 0,
                }}
                locales="de-DE"
              />
            ) : (
              <span className="text-faint">—</span>
            )
          }
          hint={
            summary
              ? summary.withinBudget
                ? "Within budget"
                : "Over budget"
              : "Run an RFQ to populate"
          }
        />
        <StatCard
          label="Suppliers"
          icon={Users}
          tone="brand"
          value={list.length}
          hint={`${quoted.length} quoted`}
        />
        <StatCard
          label="Best price"
          icon={CircleDollarSign}
          tone="ink"
          value={
            bestPrice != null && bestPrice !== Infinity ? (
              <span>{formatMoney(bestPrice, currency)}</span>
            ) : (
              <span className="text-faint">—</span>
            )
          }
          hint={won ? `Locked with ${won.name}` : "Negotiation ongoing"}
        />
        <StatCard
          label="Call"
          icon={Phone}
          tone={callPhase === "connected" ? "call" : "ink"}
          value={
            callPhase === "idle"
              ? "Idle"
              : callPhase === "ringing"
                ? "Ringing"
                : callPhase === "connected"
                  ? "Live"
                  : "Ended"
          }
          hint={running ? "Run in progress" : "Agent idle"}
        />
      </div>

      <div className="rounded-xl border border-border bg-surface p-4 shadow-[var(--shadow-card)]">
        <div className="flex items-center gap-2">
          <span className="eyebrow">Top suppliers</span>
          <span className="ml-auto text-xs text-faint">
            {list.length} total
          </span>
        </div>
        <div className="mt-3 divide-y divide-border">
          {list.length === 0 && (
            <div className="py-8 text-center text-sm text-faint">
              No suppliers yet — start a new RFQ.
            </div>
          )}
          {list
            .slice()
            .sort((a, b) => {
              const pa = effectivePrice(a) ?? Infinity;
              const pb = effectivePrice(b) ?? Infinity;
              return pa - pb;
            })
            .slice(0, 5)
            .map((v) => (
              <div
                key={v.id}
                className="flex items-center gap-3 py-2.5 text-sm"
              >
                <span className="truncate font-medium text-ink">{v.name}</span>
                <span className="ml-auto tnum text-muted">
                  {effectivePrice(v) != null
                    ? formatMoney(effectivePrice(v)!, v.currency ?? "EUR")
                    : "—"}
                </span>
                <span className="text-xs text-faint capitalize">{v.status}</span>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}
