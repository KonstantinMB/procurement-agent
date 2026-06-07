import { AnimatePresence } from "motion/react";
import { LayoutGrid } from "lucide-react";
import { useStore } from "@/store";
import RunCard from "./RunCard";

/**
 * The parallel-runs dashboard: one card per live ProcurementRun. Each request
 * from the command bar spawns a new card that fills in independently; click a
 * card to drill into its full table / activity / call / chat view.
 */
export default function Dashboard() {
  const runOrder = useStore((s) => s.runOrder);

  return (
    <main className="min-h-0 flex-1 overflow-auto p-6">
      <div className="mb-4 flex items-center gap-2">
        <h2 className="text-sm font-semibold text-ink">Runs</h2>
        <span className="font-mono text-xs text-faint">{runOrder.length}</span>
        <span className="ml-auto text-xs text-faint">
          Each request runs in parallel — start as many as you like.
        </span>
      </div>

      {runOrder.length === 0 ? (
        <div className="grid place-items-center rounded-xl border border-dashed border-border py-24 text-center">
          <LayoutGrid className="mb-3 h-6 w-6 text-faint" aria-hidden />
          <p className="max-w-sm text-sm text-muted">
            No runs yet. Enter a procurement request in the bar above to start sourcing — every
            request opens its own parallel run.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          <AnimatePresence initial={false}>
            {runOrder.map((id) => (
              <RunCard key={id} id={id} />
            ))}
          </AnimatePresence>
        </div>
      )}
    </main>
  );
}
