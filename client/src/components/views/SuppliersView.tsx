import MasterTable from "../MasterTable";
import { useStore } from "@/store";

export default function SuppliersView() {
  const count = useStore((s) => s.vendorOrder.length);
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 p-6">
      <div>
        <h1 className="text-xl font-semibold text-ink">Suppliers</h1>
        <p className="mt-0.5 text-sm text-muted">
          {count === 0
            ? "No suppliers yet — start a new RFQ from the sidebar."
            : `${count} supplier${count === 1 ? "" : "s"} discovered in the current run.`}
        </p>
      </div>
      <MasterTable />
    </div>
  );
}
