import { useEffect } from "react";
import { motion } from "motion/react";
import { Loader2, Phone, Search, ShoppingBag, Sparkles, Check } from "lucide-react";
import NumberFlow from "@number-flow/react";
import { useStore } from "@/store";
import { listRuns } from "@/lib/api";
import { routes, useNavigate } from "@/lib/router";
import { SPRING_SNAPPY } from "@/lib/motion";
import type { RunSummary } from "@/lib/events";

const STATUS_META: Record<
  RunSummary["status"],
  { label: string; cls: string; Icon: typeof Loader2 }
> = {
  researching: { label: "Researching", cls: "bg-brand/10 text-brand", Icon: Search },
  calling: { label: "Calling", cls: "bg-call/10 text-call", Icon: Phone },
  quoted: { label: "Quoted", cls: "bg-brand/10 text-brand", Icon: Sparkles },
  ordered: { label: "Ordered", cls: "bg-success/10 text-success", Icon: ShoppingBag },
  done: { label: "Done", cls: "bg-hover text-muted", Icon: Check },
};

function timeAgo(t: number): string {
  const diff = Math.max(0, Date.now() - t);
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function mergeRuns(): RunSummary[] {
  const { runs, runOrder, runSummaries } = useStore.getState();
  const seen = new Set<string>();
  const out: RunSummary[] = [];
  // Server-known runs first (have richer derived fields).
  for (const s of runSummaries) {
    seen.add(s.runId);
    out.push(s);
  }
  // Then any local-only runs (newly created, not yet in /api/runs response).
  for (const id of runOrder) {
    if (seen.has(id)) continue;
    const r = runs[id];
    if (!r) continue;
    out.push({
      runId: id,
      title: r.title,
      createdAt: r.createdAt,
      status: r.order?.placed ? "ordered" : r.running ? "researching" : "researching",
      request: r.request,
      suppliers: r.vendorOrder.length,
      bestPrice: r.summary ? undefined : undefined,
      savings: r.summary?.savings,
      currency: r.summary?.currency ?? "EUR",
      withinBudget: r.summary?.withinBudget,
      ordered: !!r.order?.placed,
    });
  }
  return out.sort((a, b) => b.createdAt - a.createdAt);
}

export default function RfqList() {
  const navigate = useNavigate();
  const summaries = useStore((s) => s.runSummaries);
  const runs = useStore((s) => s.runs);
  const runOrder = useStore((s) => s.runOrder);
  const setRunSummaries = useStore((s) => s.setRunSummaries);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      const r = await listRuns();
      if (alive) setRunSummaries(r);
    };
    void tick();
    const id = window.setInterval(tick, 4000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [setRunSummaries]);

  // Re-read on render — selectors above subscribe to relevant slices.
  const rows = mergeRuns();
  void summaries;
  void runs;
  void runOrder;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 p-6">
      <div className="flex items-end justify-between">
        <div>
          <div className="eyebrow">RFQs</div>
          <h1 className="mt-1 text-lg font-semibold text-ink">All procurement processes</h1>
        </div>
        <button
          type="button"
          onClick={() => navigate(routes.newRfq)}
          className="inline-flex items-center gap-2 rounded-lg bg-brand px-3.5 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-brand-hover"
        >
          <Sparkles size={14} strokeWidth={2.5} />
          New RFQ
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-[var(--shadow-card)]">
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 z-10 bg-elevated">
              <tr>
                {["#", "Title", "Status", "Suppliers", "Best price", "Savings", "Created", ""].map(
                  (h, i) => (
                    <th
                      key={i}
                      className={`border-b border-border px-3 py-2 text-xs font-medium uppercase tracking-wide text-faint ${
                        i === 0 ? "w-10 text-right" : i >= 3 && i <= 5 ? "text-right" : "text-left"
                      }`}
                    >
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-16 text-center">
                    <div className="flex flex-col items-center gap-2 text-faint">
                      <Sparkles size={20} />
                      <span className="text-sm">No RFQs yet — start one from the New RFQ tab</span>
                    </div>
                  </td>
                </tr>
              ) : (
                rows.map((r, i) => {
                  const meta = STATUS_META[r.status];
                  const Icon = meta.Icon;
                  return (
                    <motion.tr
                      key={r.runId}
                      layout
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={SPRING_SNAPPY}
                      onClick={() => navigate(routes.detail(r.runId))}
                      className={`cursor-pointer hover:bg-hover/60 ${
                        i % 2 === 1 ? "bg-app/40" : "bg-surface"
                      }`}
                    >
                      <td className="px-3 py-2.5 text-right font-mono text-xs text-faint">{i + 1}</td>
                      <td className="px-3 py-2.5 font-medium text-ink">
                        <div className="flex items-center gap-2">
                          <span className="truncate" title={r.title}>
                            {r.title}
                          </span>
                          {r.ordered && (
                            <span className="inline-flex items-center gap-1 rounded-md bg-success/10 px-1.5 py-0.5 text-[10px] font-medium text-success">
                              <Check size={10} strokeWidth={2.6} />
                              PO sent
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium ${meta.cls}`}
                        >
                          <Icon size={11} strokeWidth={2.4} />
                          {meta.label}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-xs text-muted">
                        {r.suppliers}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-sm text-ink">
                        {r.bestPrice != null ? (
                          <NumberFlow
                            value={r.bestPrice}
                            format={{ style: "currency", currency: r.currency, maximumFractionDigits: 2 }}
                            locales="de-DE"
                            className="tnum"
                          />
                        ) : (
                          <span className="text-faint">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-sm">
                        {r.savings != null && r.savings > 0 ? (
                          <span className="text-success">
                            <NumberFlow
                              value={r.savings}
                              format={{ style: "currency", currency: r.currency, maximumFractionDigits: 0 }}
                              locales="de-DE"
                              className="tnum"
                            />
                          </span>
                        ) : (
                          <span className="text-faint">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-muted">{timeAgo(r.createdAt)}</td>
                      <td className="px-3 py-2.5 text-right">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(routes.detail(r.runId));
                          }}
                          className="rounded-md border border-border bg-surface px-2 py-1 text-xs text-muted transition-colors hover:border-brand hover:text-brand"
                        >
                          Open
                        </button>
                      </td>
                    </motion.tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
