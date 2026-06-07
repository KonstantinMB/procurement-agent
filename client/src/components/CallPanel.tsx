import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import NumberFlow from "@number-flow/react";
import { Phone, TrendingDown } from "lucide-react";
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

export default function CallPanel() {
  const call = useStore((s) => s.call);
  const open = call.phase !== "idle";

  // Elapsed-time timer: starts when the call connects, frozen once ended.
  const [elapsed, setElapsed] = useState(0);
  const startedRef = useRef<number | null>(null);
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
    }
  }, [call.phase]);

  // Bring the live call into view the instant it starts — it's the hero moment.
  useEffect(() => {
    if (call.phase === "ringing" || call.phase === "connected") {
      const t = setTimeout(
        () => panelRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }),
        140
      );
      return () => clearTimeout(t);
    }
  }, [call.phase]);

  const quote = call.quote;
  const delta = quote ? TARGET_BASELINE - quote.unitPrice : 0;
  const currency = quote?.currency ?? "EUR";

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={panelRef}
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 40 }}
          transition={SPRING}
          className={`rounded-2xl border border-border bg-surface p-5 shadow-[var(--shadow-pop)] ${
            call.active ? "ring-2 ring-brand/40" : ""
          }`}
          role="region"
          aria-label="Live supplier call"
        >
          {/* Header */}
          <div className="flex items-center gap-3">
            <span
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                call.active ? "bg-call/10 text-call" : "bg-hover text-muted"
              }`}
            >
              <Phone size={16} strokeWidth={2.2} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium text-ink">
                {call.vendorName ?? "Supplier"}
              </div>
              <div className="flex items-center gap-1.5 text-sm text-muted">
                {call.phase === "ringing" && (
                  <>
                    <span className="text-call">Ringing</span>
                    <RingingDots />
                  </>
                )}
                {call.phase === "connected" && (
                  <>
                    <span className="text-success">Connected</span>
                    <span className="text-faint">·</span>
                    <span className="font-mono tnum text-muted">
                      {formatTimer(elapsed)}
                    </span>
                  </>
                )}
                {call.phase === "ended" && (
                  <span className="text-muted">Call ended</span>
                )}
              </div>
            </div>
          </div>

          {/* Body */}
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-[120px_1fr] sm:items-center">
            <div className="flex justify-center">
              <VoiceOrb
                active={call.active}
                speaking={call.speaking ?? null}
                size={110}
              />
            </div>
            <Transcript lines={call.transcript} />
          </div>

          {/* Negotiated quote callout */}
          <AnimatePresence>
            {quote && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={SPRING}
                className="mt-4 rounded-xl border border-quote/30 bg-quote/10 p-3"
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
