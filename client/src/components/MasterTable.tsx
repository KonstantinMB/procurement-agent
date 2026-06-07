import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import NumberFlow from "@number-flow/react";
import { Phone, Mail, Globe, Check, X, Star, Loader2, Search } from "lucide-react";
import { useStore } from "@/store";
import { SPRING_SNAPPY, formatMoney } from "@/lib/motion";
import type { Vendor, VendorStatus } from "@/lib/events";

// ─── status → label + pill classes ────────────────────────────────────────
const STATUS: Record<VendorStatus, { label: string; cls: string; live?: boolean }> = {
  discovered: { label: "Discovered", cls: "bg-hover text-muted" },
  emailing: { label: "Emailing", cls: "bg-call/10 text-call", live: true },
  calling: { label: "Calling", cls: "bg-call/10 text-call", live: true },
  negotiating: { label: "Negotiating", cls: "bg-brand/10 text-brand", live: true },
  quoted: { label: "Quoted", cls: "bg-brand/10 text-brand" },
  won: { label: "Won", cls: "bg-success/10 text-success" },
  lost: { label: "Lost", cls: "bg-hover text-faint" },
};

/** Briefly flag true whenever `value` changes (drives the cell flash). */
function useFlash(value: unknown): boolean {
  const [flash, setFlash] = useState(false);
  const prev = useRef(value);
  useEffect(() => {
    if (prev.current !== value && prev.current !== undefined) {
      setFlash(true);
      const t = setTimeout(() => setFlash(false), 700);
      prev.current = value;
      return () => clearTimeout(t);
    }
    prev.current = value;
  }, [value]);
  return flash;
}

function StatusPill({ status }: { status: VendorStatus }) {
  const s = STATUS[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium ${s.cls}`}
    >
      {s.live && (
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-current opacity-60" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-current" />
        </span>
      )}
      {s.label}
    </span>
  );
}

function Contact({ contact }: { contact: Vendor["contact"] }) {
  if (!contact) return <span className="text-faint">—</span>;
  if (contact.phone)
    return (
      <span className="inline-flex items-center gap-1.5 text-muted">
        <Phone size={13} className="shrink-0 text-faint" />
        <span className="truncate">{contact.phone}</span>
      </span>
    );
  if (contact.email)
    return (
      <span className="inline-flex items-center gap-1.5 text-muted">
        <Mail size={13} className="shrink-0 text-faint" />
        <span className="truncate">{contact.email}</span>
      </span>
    );
  if (contact.url)
    return (
      <a
        href={contact.url}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1.5 text-brand hover:underline"
      >
        <Globe size={13} className="shrink-0" />
        <span className="truncate">{contact.url.replace(/^https?:\/\/(www\.)?/, "")}</span>
      </a>
    );
  return <span className="text-faint">—</span>;
}

function Money({ value, currency, animate }: { value?: number; currency?: string; animate?: boolean }) {
  if (value == null) return <span className="text-faint">—</span>;
  if (animate)
    return (
      <NumberFlow
        value={value}
        format={{ style: "currency", currency: currency ?? "EUR", maximumFractionDigits: 2 }}
        locales="de-DE"
        className="tnum"
      />
    );
  return <span className="tnum">{formatMoney(value, currency ?? "EUR")}</span>;
}

const COLS = [
  { k: "idx", label: "#", num: true, w: "w-10" },
  { k: "name", label: "Supplier", num: false },
  { k: "loc", label: "Location", num: false },
  { k: "contact", label: "Contact", num: false },
  { k: "moq", label: "MOQ", num: true },
  { k: "est", label: "Est. price", num: true },
  { k: "neg", label: "Negotiated", num: true },
  { k: "lead", label: "Lead", num: true },
  { k: "status", label: "Status", num: false },
  { k: "notes", label: "Notes", num: false },
];

function VendorRow({ id, index }: { id: string; index: number }) {
  const v = useStore((s) => s.vendors[id]);
  const flashNeg = useFlash(v?.negotiatedPrice);
  const flashStatus = useFlash(v?.status);
  if (!v) return null;

  const active = v.status === "calling" || v.status === "negotiating";
  const won = v.status === "won";
  const lost = v.status === "lost";
  const rowBg = won
    ? "bg-success/[0.06]"
    : active
      ? "bg-brand/[0.04]"
      : index % 2 === 1
        ? "bg-app/40"
        : "bg-surface";

  const td = "px-3 py-2.5 border-b border-border align-middle";
  const tdNum = `${td} text-right font-mono tnum`;

  return (
    <motion.tr
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: lost ? 0.55 : 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={SPRING_SNAPPY}
      className={`${rowBg} ${active ? "shadow-[inset_2px_0_0_0_var(--color-brand)]" : won ? "shadow-[inset_2px_0_0_0_var(--color-success)]" : ""} hover:bg-hover/60`}
    >
      <td className={`${tdNum} text-faint`}>{index + 1}</td>
      <td className={`${td} font-medium text-ink`}>
        <div className="flex items-center gap-2">
          <span className="truncate">{v.name}</span>
          {v.rating != null && (
            <span className="inline-flex items-center gap-0.5 text-xs text-faint">
              <Star size={11} className="text-warn" /> {v.rating.toFixed(1)}
            </span>
          )}
        </div>
      </td>
      <td className={`${td} text-muted`}>{v.location ?? <span className="text-faint">—</span>}</td>
      <td className={`${td} max-w-[200px] text-xs`}>
        <Contact contact={v.contact} />
      </td>
      <td className={tdNum + " text-muted"}>{v.moq ?? <span className="text-faint">—</span>}</td>
      <td className={tdNum + " text-muted"}>
        <Money value={v.initialPrice} currency={v.currency} />
      </td>
      <td
        className={`${tdNum} font-semibold text-ink transition-colors duration-700 ${flashNeg ? "bg-success/10" : ""}`}
      >
        <Money value={v.negotiatedPrice} currency={v.currency} animate />
      </td>
      <td className={tdNum + " text-muted"}>
        {v.leadTimeDays != null ? (
          <span className="inline-flex items-center justify-end gap-1">
            {v.leadTimeDays}d
            {v.meetsDeadline === true && <Check size={13} className="text-success" />}
            {v.meetsDeadline === false && <X size={13} className="text-danger" />}
          </span>
        ) : (
          <span className="text-faint">—</span>
        )}
      </td>
      <td className={`${td} transition-colors duration-700 ${flashStatus ? "bg-brand/5" : ""}`}>
        <StatusPill status={v.status} />
      </td>
      <td className={`${td} max-w-[240px] text-xs text-muted`}>
        <span className="line-clamp-2">{v.note ?? ""}</span>
      </td>
    </motion.tr>
  );
}

export default function MasterTable() {
  const vendorOrder = useStore((s) => s.vendorOrder);
  const running = useStore((s) => s.running);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-[var(--shadow-card)]">
      <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
        <span className="eyebrow">Master table — suppliers</span>
        <span className="ml-auto font-mono text-xs text-faint">
          {vendorOrder.length} row{vendorOrder.length === 1 ? "" : "s"}
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-elevated">
            <tr>
              {COLS.map((c) => (
                <th
                  key={c.k}
                  className={`border-b border-border px-3 py-2 text-xs font-medium uppercase tracking-wide text-faint ${
                    c.num ? "text-right" : "text-left"
                  } ${c.w ?? ""}`}
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <AnimatePresence initial={false}>
              {vendorOrder.map((id, i) => (
                <VendorRow key={id} id={id} index={i} />
              ))}
            </AnimatePresence>

            {vendorOrder.length === 0 && (
              <tr>
                <td colSpan={COLS.length} className="px-4 py-16 text-center">
                  <div className="flex flex-col items-center gap-2 text-faint">
                    {running ? (
                      <Loader2 size={20} className="animate-spin text-brand" />
                    ) : (
                      <Search size={20} />
                    )}
                    <span className="text-sm">
                      {running ? "Researching suppliers…" : "Enter a request to start sourcing"}
                    </span>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
