import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import NumberFlow from "@number-flow/react";
import { Phone, TrendingDown, Clock, CircleCheck, CircleX } from "lucide-react";
import { useStore } from "@/store";
import { SPRING } from "@/lib/motion";
import VoiceOrb from "./VoiceOrb";
import Transcript from "./Transcript";

const TARGET_BASELINE = 62; // initial hero-call price to measure savings against

function RingingDots() {
  return (
    <span className="inline-flex items-center gap-[3px] pl-0.5" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="inline-block h-1 w-1 rounded-full bg-call"
          animate={{ opacity: [0.25, 1, 0.25] }}
          transition={{
            duration: 1.1,
            repeat: Infinity,
            ease: "easeInOut",
            delay: i * 0.18,
          }}
        />
      ))}
    </span>
  );
}

function formatTimer(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function StatusChip({
  phase,
  outcome,
}: {
  phase: "idle" | "ringing" | "connected" | "ended";
  outcome?: "success" | "failed" | "no-answer";
}) {
  if (phase === "ringing") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md bg-call/10 px-2 py-0.5 text-xs font-semibold text-call">
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-call/60" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-call" />
        </span>
        Ringing
      </span>
    );
  }
  if (phase === "connected") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md bg-brand/10 px-2 py-0.5 text-xs font-semibold text-brand">
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand/60" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-brand" />
        </span>
        Live
      </span>
    );
  }
  if (phase === "ended") {
    if (outcome === "no-answer") {
      return (
        <span className="inline-flex items-center gap-1.5 rounded-md bg-hover px-2 py-0.5 text-xs font-medium text-muted">
          <CircleX size={12} strokeWidth={2.4} />
          No answer
        </span>
      );
    }
    if (outcome === "failed") {
      return (
        <span className="inline-flex items-center gap-1.5 rounded-md bg-danger/10 px-2 py-0.5 text-xs font-medium text-danger">
          <CircleX size={12} strokeWidth={2.4} />
          Failed
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md bg-success/10 px-2 py-0.5 text-xs font-medium text-success">
        <CircleCheck size={12} strokeWidth={2.4} />
        Completed
      </span>
    );
  }
  return null;
}

export default function CallPanel() {
  const call = useStore((s) => s.call);
  const vendorThreads = useStore((s) => s.vendorThreads);
  const open = call.phase !== "idle";

  // Elapsed-time timer: starts when the call connects, frozen once ended.
  const [elapsed, setElapsed] = useState(0);
  const startedRef = useRef<number | null>(null);
  const finalElapsedRef = useRef<number>(0);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (call.phase === "connected") {
      if (startedRef.current == null) startedRef.current = Date.now();
      const id = setInterval(() => {
        if (startedRef.current != null) {
          setElapsed(Math.floor((Date.now() - startedRef.current) / 1000));
        }
      }, 1000);
      return () => clearInterval(id);
    }
    if (call.phase === "idle") {
      startedRef.current = null;
      setElapsed(0);
      finalElapsedRef.current = 0;
    }
    if (call.phase === "ended" && startedRef.current != null) {
      finalElapsedRef.current = Math.floor((Date.now() - startedRef.current) / 1000);
    }
  }, [call.phase]);

  // Bring the live call into view the instant it starts — it's the hero moment.
  useEffect(() => {
    if (call.phase === "ringing" || call.phase === "connected") {
      const t = setTimeout(
        () => panelRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }),
        140,
      );
      return () => clearTimeout(t);
    }
  }, [call.phase]);

  // If the live `call.transcript` is empty after the call ends (e.g. the Vapi
  // webhook didn't deliver transcript events to dev), fall back to the
  // per-vendor archive so we still show whatever lines did arrive.
  const transcriptLines = useMemo(() => {
    if (call.transcript.length > 0) return call.transcript;
    if (call.phase === "ended" && call.vendorId) {
      return vendorThreads[call.vendorId]?.transcript ?? [];
    }
    return [];
  }, [call.transcript, call.phase, call.vendorId, vendorThreads]);

  const quote = call.quote;
  const delta = quote ? TARGET_BASELINE - quote.unitPrice : 0;
  const currency = quote?.currency ?? "EUR";
  const showElapsed =
    call.phase === "connected" ? elapsed : finalElapsedRef.current;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={panelRef}
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 40 }}
          transition={SPRING}
          className={`rounded-2xl border border-border bg-surface shadow-[var(--shadow-pop)] ${
            call.active ? "ring-2 ring-brand/40" : ""
          }`}
          role="region"
          aria-label="Live supplier call"
        >
          {/* Header — orb + vendor + status pill + timer */}
          <div className="flex items-center gap-4 border-b border-border px-5 py-4">
            <VoiceOrb
              active={call.active}
              speaking={call.speaking ?? null}
              size={64}
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate text-base font-semibold text-ink">
                  {call.vendorName ?? "Supplier"}
                </span>
                <StatusChip phase={call.phase} outcome={call.outcome} />
              </div>
              <div className="mt-0.5 flex items-center gap-2 text-sm text-muted">
                <Phone size={13} className="text-faint" aria-hidden />
                {call.phase === "ringing" && (
                  <span className="text-call">
                    Ringing <RingingDots />
                  </span>
                )}
                {call.phase === "connected" && (
                  <>
                    <span className="font-mono tnum text-ink">
                      {formatTimer(elapsed)}
                    </span>
                    <span className="text-faint">elapsed</span>
                  </>
                )}
                {call.phase === "ended" && (
                  <>
                    <Clock size={12} className="text-faint" />
                    <span className="text-faint">
                      Duration{" "}
                      <span className="font-mono tnum text-ink">
                        {formatTimer(showElapsed)}
                      </span>
                    </span>
                    <span className="text-faint">·</span>
                    <span className="text-faint">
                      {transcriptLines.length} transcript line
                      {transcriptLines.length === 1 ? "" : "s"}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Transcript — gets the room it deserves */}
          <div className="px-5 py-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="eyebrow">Transcript</span>
              {transcriptLines.length > 0 && (
                <span className="tnum text-xs text-faint">
                  {transcriptLines.length} line
                  {transcriptLines.length === 1 ? "" : "s"}
                </span>
              )}
            </div>
            <Transcript
              lines={transcriptLines}
              phase={call.phase}
              outcome={call.outcome}
              large
            />
          </div>

          {/* Negotiated quote callout — pinned at the bottom of the card */}
          <AnimatePresence>
            {quote && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={SPRING}
                className="mx-5 mb-5 rounded-xl border border-quote/30 bg-quote/10 p-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex flex-col">
                    <span className="eyebrow text-quote">Negotiated</span>
                    <div className="mt-0.5 flex items-baseline gap-1">
                      <NumberFlow
                        value={quote.unitPrice}
                        format={{
                          style: "currency",
                          currency,
                          maximumFractionDigits: 2,
                        }}
                        locales="de-DE"
                        className="font-mono tnum text-lg font-semibold text-ink"
                      />
                      <span className="text-xs text-muted">/unit</span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    {delta > 0 && (
                      <span className="inline-flex items-center gap-1 rounded-md bg-success/10 px-1.5 py-0.5 text-xs font-medium text-success">
                        <TrendingDown size={12} strokeWidth={2.4} />
                        <NumberFlow
                          value={delta}
                          format={{
                            style: "currency",
                            currency,
                            maximumFractionDigits: 2,
                          }}
                          locales="de-DE"
                          className="tnum"
                        />
                      </span>
                    )}
                    <span className="text-xs text-muted">
                      delivered in{" "}
                      <span className="font-mono tnum text-ink">
                        {quote.leadTimeDays}d
                      </span>
                    </span>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
