import { useMemo, useState } from "react";
import { motion } from "motion/react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Mail,
  MessageSquare,
  PhoneOff,
} from "lucide-react";
import { useStore } from "@/store";
import type { VendorEmail } from "@/store";

function fmtTime(ts: number): string {
  try {
    return new Date(ts).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function EmailCard({ email }: { email: VendorEmail }) {
  const out = email.direction === "out";
  return (
    <div className="rounded-lg border border-border bg-surface p-3 shadow-[var(--shadow-card)]">
      <div className="mb-1.5 flex items-center gap-2 text-xs">
        <span
          className={`grid h-6 w-6 place-items-center rounded-md ${
            out ? "bg-brand-tint text-brand" : "bg-success/10 text-success"
          }`}
        >
          {out ? (
            <ArrowUpRight size={12} strokeWidth={2.4} />
          ) : (
            <ArrowDownLeft size={12} strokeWidth={2.4} />
          )}
        </span>
        <span className="font-medium text-ink">
          {out ? "Sent" : "Reply"}
        </span>
        <span className="text-faint">·</span>
        <span className="truncate text-muted">
          {out ? `To ${email.to ?? "—"}` : `From ${email.from ?? "—"}`}
        </span>
        <span className="ml-auto shrink-0 tnum text-faint">{fmtTime(email.at)}</span>
      </div>
      {email.subject && (
        <div className="text-sm font-medium text-ink">{email.subject}</div>
      )}
      {email.body && (
        <pre className="mt-1.5 whitespace-pre-wrap break-words font-sans text-xs text-muted">
          {email.body}
        </pre>
      )}
      {(email.unitPrice != null || email.leadTimeDays != null) && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {email.unitPrice != null && (
            <span className="rounded-md bg-quote/10 px-2 py-0.5 text-[11px] font-medium text-quote">
              {email.unitPrice} / unit
            </span>
          )}
          {email.leadTimeDays != null && (
            <span className="rounded-md bg-hover px-2 py-0.5 text-[11px] font-medium text-muted">
              {email.leadTimeDays} day lead
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export default function VendorThread({ vendorId }: { vendorId: string }) {
  const thread = useStore((s) => s.vendorThreads[vendorId]);
  const call = useStore((s) => s.call);
  const vendorName = useStore((s) => s.vendors[vendorId]?.name);
  const emails = thread?.emails ?? [];

  // Fallback chain for the transcript: archived → live call (same vendorId) →
  // live call (matching vendorName when the agent passed a slightly different
  // id to call_supplier). Some Vapi setups will emit transcript events with a
  // different vendorId than the one we set on call.ringing — this stitches
  // those cases back together visually.
  const transcript = useMemo(() => {
    if (thread?.transcript.length) return thread.transcript;
    if (call.transcript.length === 0) return [];
    const sameId = call.vendorId && call.vendorId === vendorId;
    const sameName =
      !sameId &&
      vendorName &&
      call.vendorName &&
      call.vendorName.toLowerCase() === vendorName.toLowerCase();
    if (sameId || sameName) return call.transcript;
    return [];
  }, [thread?.transcript, call.vendorId, call.vendorName, call.transcript, vendorId, vendorName]);

  // Default to whichever tab has something to show.
  const [tab, setTab] = useState<"emails" | "transcript">(() =>
    transcript.length > 0 && emails.length === 0 ? "transcript" : "emails",
  );

  const tabBtn = (key: "emails" | "transcript", label: string, count: number, Icon: typeof Mail) => {
    const active = tab === key;
    return (
      <button
        key={key}
        type="button"
        onClick={() => setTab(key)}
        className={`relative inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
          active
            ? "bg-surface text-ink shadow-[var(--shadow-card)]"
            : "text-muted hover:text-ink"
        }`}
      >
        <Icon size={12} strokeWidth={2.2} />
        <span>{label}</span>
        <span
          className={`tnum rounded px-1 text-[10px] ${
            active ? "bg-brand-tint text-brand" : "bg-hover text-faint"
          }`}
        >
          {count}
        </span>
      </button>
    );
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      className="bg-app/40 px-6 py-4"
    >
      <div className="mb-3 inline-flex items-center gap-0.5 rounded-lg border border-border bg-hover/60 p-1">
        {tabBtn("emails", "Emails", emails.length, Mail)}
        {tabBtn("transcript", "Call transcript", transcript.length, MessageSquare)}
      </div>

      {tab === "emails" ? (
        emails.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-surface/60 px-4 py-6 text-center text-sm text-faint">
            No emails sent yet — Procura will reach out once it picks an outreach lane.
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {emails.map((m) => (
              <EmailCard key={m.id} email={m} />
            ))}
          </div>
        )
      ) : transcript.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-surface/60 px-4 py-6">
          <div className="flex items-start gap-2.5 text-sm">
            <PhoneOff size={14} className="mt-0.5 shrink-0 text-faint" />
            <div className="flex flex-col gap-1">
              <span className="font-medium text-ink">
                No transcript captured for this supplier
              </span>
              <span className="text-xs text-muted">
                If you're using Vapi for live calls, transcript events arrive
                via webhook — make sure Vapi can reach your public URL.
                Otherwise the scripted demo path will emit a transcript
                automatically.
              </span>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {transcript.map((line) => {
            const isAgent = line.speaker === "agent";
            return (
              <div
                key={line.id}
                className={isAgent ? "flex flex-col items-start" : "flex flex-col items-end"}
              >
                <span className="eyebrow mb-0.5 px-1">
                  {isAgent ? "Procura" : "Supplier"}
                </span>
                <div
                  className={
                    isAgent
                      ? "max-w-[85%] rounded-2xl rounded-bl-md bg-brand-tint px-3 py-2 text-sm leading-snug text-ink"
                      : "max-w-[85%] rounded-2xl rounded-br-md bg-hover px-3 py-2 text-sm leading-snug text-ink"
                  }
                  style={{ opacity: line.final ? 1 : 0.75 }}
                >
                  {line.text}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </motion.div>
  );
}
