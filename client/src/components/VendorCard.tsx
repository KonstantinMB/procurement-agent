import { motion } from "motion/react";
import {
  ArrowDown,
  Check,
  Mail,
  Phone,
  Repeat,
  Star,
  X,
} from "lucide-react";
import NumberFlow from "@number-flow/react";
import type { ReactNode } from "react";
import { useStore } from "@/store";
import { cardVariants, formatMoney } from "@/lib/motion";
import type { VendorStatus } from "@/lib/events";

interface StatusBadge {
  label: string;
  className: string;
  icon: ReactNode;
}

function statusBadge(status: VendorStatus): StatusBadge {
  switch (status) {
    case "emailing":
      return {
        label: "Emailing",
        className: "bg-email/10 text-email",
        icon: <Mail className="h-3 w-3 animate-pulse" aria-hidden />,
      };
    case "calling":
      return {
        label: "Calling",
        className: "bg-call/10 text-call",
        icon: (
          <span className="relative inline-flex h-3 w-3 items-center justify-center">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-call/50" />
            <Phone className="relative h-3 w-3" aria-hidden />
          </span>
        ),
      };
    case "quoted":
      return {
        label: "Quoted",
        className: "bg-brand-tint text-brand",
        icon: <Check className="h-3 w-3" aria-hidden />,
      };
    case "negotiating":
      return {
        label: "Negotiating",
        className: "bg-brand-tint text-brand",
        icon: <Repeat className="h-3 w-3" aria-hidden />,
      };
    case "won":
      return {
        label: "Won",
        className: "bg-success/10 text-success",
        icon: <Star className="h-3 w-3 fill-current" aria-hidden />,
      };
    case "lost":
      return {
        label: "Lost",
        className: "bg-hover text-faint opacity-60",
        icon: <X className="h-3 w-3" aria-hidden />,
      };
    case "discovered":
    default:
      return {
        label: "Discovered",
        className: "bg-hover text-muted",
        icon: (
          <span
            className="h-1.5 w-1.5 rounded-full bg-faint"
            aria-hidden
          />
        ),
      };
  }
}

export default function VendorCard({ id }: { id: string }) {
  const v = useStore((s) => s.vendors[id]);
  if (!v) return null;

  const badge = statusBadge(v.status);
  const currency = v.currency || "EUR";
  const isWon = v.status === "won";
  const isCalling = v.status === "calling";

  const hasNegotiation =
    v.negotiatedPrice != null &&
    v.initialPrice != null &&
    v.negotiatedPrice !== v.initialPrice;
  const delta =
    hasNegotiation && v.initialPrice != null && v.negotiatedPrice != null
      ? v.initialPrice - v.negotiatedPrice
      : 0;
  const singlePrice = v.negotiatedPrice ?? v.initialPrice;

  const cardClass = [
    "relative flex flex-col gap-2 rounded-xl border border-border bg-surface p-4",
    isWon
      ? "ring-2 ring-success/60 shadow-[var(--shadow-pop)]"
      : isCalling
        ? "ring-2 ring-call/50 shadow-[var(--shadow-card)]"
        : "shadow-[var(--shadow-card)]",
  ].join(" ");

  return (
    <motion.div
      layout
      variants={cardVariants}
      initial="initial"
      animate={
        isCalling
          ? { opacity: 1, y: 0, scale: [1, 1.012, 1] }
          : "animate"
      }
      transition={
        isCalling
          ? { scale: { duration: 1.6, repeat: Infinity, ease: "easeInOut" } }
          : undefined
      }
      className={cardClass}
    >
      {/* Header: name + location / status badge */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate font-medium text-ink">{v.name}</div>
          {v.location && (
            <div className="truncate text-xs text-faint">{v.location}</div>
          )}
        </div>
        <span
          className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ${badge.className}`}
        >
          {badge.icon}
          {badge.label}
        </span>
      </div>

      {/* Meta row: rating + MOQ */}
      <div className="flex items-center gap-3 font-mono text-xs text-muted tnum">
        {v.rating != null && (
          <span className="inline-flex items-center gap-1">
            <Star className="h-3 w-3 fill-current text-warn" aria-hidden />
            {v.rating.toFixed(1)}
          </span>
        )}
        {v.moq != null && <span>MOQ {v.moq}</span>}
      </div>

      {/* Price row */}
      <div className="flex flex-wrap items-baseline gap-2">
        {hasNegotiation && v.negotiatedPrice != null ? (
          <>
            <span className="font-mono text-xs text-faint line-through tnum">
              {formatMoney(v.initialPrice!, currency)}
            </span>
            <NumberFlow
              value={v.negotiatedPrice}
              format={{ style: "currency", currency }}
              locales="de-DE"
              className="font-mono text-lg text-ink tnum"
            />
            <span className="inline-flex items-center gap-0.5 rounded bg-quote/10 px-1.5 py-0.5 text-xs font-medium text-quote tnum">
              <ArrowDown className="h-3 w-3" aria-hidden />
              {formatMoney(delta, currency)}
            </span>
          </>
        ) : singlePrice != null ? (
          <NumberFlow
            value={singlePrice}
            format={{ style: "currency", currency }}
            locales="de-DE"
            className="font-mono text-lg text-ink tnum"
          />
        ) : (
          <span className="font-mono text-sm text-faint">—</span>
        )}
      </div>

      {/* Lead time + note */}
      <div className="flex items-center justify-between gap-2">
        {v.leadTimeDays != null && (
          <span
            className={`inline-flex items-center gap-1 font-mono text-xs tnum ${
              v.meetsDeadline ? "text-success" : "text-danger"
            }`}
          >
            {v.meetsDeadline ? (
              <Check className="h-3 w-3" aria-hidden />
            ) : (
              <X className="h-3 w-3" aria-hidden />
            )}
            Lead {v.leadTimeDays}d
          </span>
        )}
      </div>

      {v.note && <div className="text-xs text-muted">{v.note}</div>}
    </motion.div>
  );
}
