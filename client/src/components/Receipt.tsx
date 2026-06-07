import type { ReactNode } from "react";
import NumberFlow from "@number-flow/react";
import { Check } from "lucide-react";
import type { Invoice } from "@/lib/events";

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

interface RowProps {
  label: string;
  children: ReactNode;
}
function Row({ label, children }: RowProps) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <span className="text-muted">{label}</span>
      <span className="tnum text-ink">{children}</span>
    </div>
  );
}

export default function Receipt({ invoice }: { invoice: Invoice }) {
  const {
    poNumber,
    vendorName,
    unitPrice,
    quantity,
    total,
    currency,
    leadTimeDays,
    date,
  } = invoice;

  return (
    <div className="bg-surface rounded-2xl p-6 shadow-[var(--shadow-pop)] max-w-sm w-full">
      <header className="flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-full bg-success text-white">
          <Check className="h-5 w-5" strokeWidth={2.5} aria-hidden />
        </span>
        <div>
          <div className="font-semibold text-ink">Order confirmed</div>
          <div className="text-xs text-muted">Purchase order issued</div>
        </div>
      </header>

      <div className="mt-5 divide-y divide-border font-mono text-sm">
        <Row label="PO number">{poNumber}</Row>
        <Row label="Vendor">{vendorName}</Row>
        <Row label="Unit price">
          <NumberFlow
            value={unitPrice}
            format={{ style: "currency", currency }}
            locales="de-DE"
          />
        </Row>
        <Row label="Quantity">
          <NumberFlow value={quantity} />
        </Row>
        <Row label="Lead time">
          {leadTimeDays} {leadTimeDays === 1 ? "day" : "days"}
        </Row>
        <div className="flex items-center justify-between gap-4 py-3">
          <span className="font-semibold text-ink">Total</span>
          <span className="tnum text-base font-semibold text-ink">
            <NumberFlow
              value={total}
              format={{ style: "currency", currency }}
              locales="de-DE"
            />
          </span>
        </div>
      </div>

      <footer className="mt-5 flex items-center gap-2 text-xs text-muted">
        <span className="h-2 w-2 rounded-full bg-success" aria-hidden />
        <span>Payment simulated · Paid</span>
        <span className="text-faint">·</span>
        <span className="tnum">{formatDate(date)}</span>
      </footer>
    </div>
  );
}
