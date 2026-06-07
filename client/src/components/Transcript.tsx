import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Phone, PhoneOff, Hourglass, MessageSquare } from "lucide-react";
import { fadeUp } from "@/lib/motion";

interface Line {
  id: number;
  speaker: "agent" | "supplier";
  text: string;
  final: boolean;
}

type Phase = "idle" | "ringing" | "connected" | "ended";
type Outcome = "success" | "failed" | "no-answer" | undefined;

interface Props {
  lines: Line[];
  phase?: Phase;
  outcome?: Outcome;
  /** When true, the transcript area gets more vertical room (call panel) */
  large?: boolean;
}

function EmptyState({ phase, outcome }: { phase: Phase; outcome: Outcome }) {
  if (phase === "ringing") {
    return (
      <Stub
        Icon={Phone}
        title="Ringing the supplier…"
        body="The conversation will appear here as soon as they pick up."
        tone="call"
      />
    );
  }
  if (phase === "connected") {
    return (
      <Stub
        Icon={Hourglass}
        title="Connected — waiting for the first words…"
        body="The transcript streams in live as Procura and the supplier speak."
        tone="brand"
      />
    );
  }
  if (phase === "ended") {
    if (outcome === "no-answer") {
      return (
        <Stub
          Icon={PhoneOff}
          title="No answer"
          body="The supplier didn't pick up. No transcript was captured."
          tone="muted"
        />
      );
    }
    return (
      <Stub
        Icon={MessageSquare}
        title="Transcript not captured"
        body="The call ended but no transcript came through. If you're using Vapi, check that your public webhook is reachable from Vapi's servers."
        tone="muted"
      />
    );
  }
  return (
    <Stub
      Icon={Phone}
      title="No active call"
      body="Procura will dial a supplier when it's time to negotiate."
      tone="muted"
    />
  );
}

function Stub({
  Icon,
  title,
  body,
  tone,
}: {
  Icon: typeof Phone;
  title: string;
  body: string;
  tone: "brand" | "call" | "muted";
}) {
  const ring =
    tone === "brand"
      ? "bg-brand-tint text-brand"
      : tone === "call"
        ? "bg-call/10 text-call"
        : "bg-hover text-muted";
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 px-6 py-8 text-center">
      <span className={`grid h-10 w-10 place-items-center rounded-xl ${ring}`}>
        <Icon size={18} strokeWidth={2.2} />
      </span>
      <span className="text-sm font-medium text-ink">{title}</span>
      <span className="max-w-sm text-xs text-muted">{body}</span>
    </div>
  );
}

/**
 * Two-speaker live transcript. Agent bubbles align right (brand tint),
 * supplier bubbles align left (hover gray). Auto-scrolls to the newest line
 * only when the viewer is already near the bottom.
 */
export default function Transcript({
  lines,
  phase = "idle",
  outcome,
  large = false,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (nearBottom) {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    }
  }, [lines.length]);

  const heightCls = large
    ? "min-h-[280px] max-h-[420px]"
    : "max-h-[220px]";

  return (
    <div
      ref={scrollRef}
      className={`flex ${heightCls} flex-col gap-2 overflow-y-auto pr-1`}
      aria-live="polite"
    >
      {lines.length === 0 ? (
        <EmptyState phase={phase} outcome={outcome} />
      ) : (
        <AnimatePresence initial={false}>
          {lines.map((line) => {
            const isAgent = line.speaker === "agent";
            return (
              <motion.div
                key={line.id}
                layout
                variants={fadeUp}
                initial="initial"
                animate="animate"
                exit="exit"
                className={
                  isAgent ? "flex flex-col items-end" : "flex flex-col items-start"
                }
              >
                <span className="eyebrow mb-0.5 px-1">
                  {isAgent ? "Procura" : "Supplier"}
                </span>
                <div
                  className={
                    isAgent
                      ? "max-w-[85%] rounded-2xl bg-brand-tint px-3 py-2 text-sm leading-snug text-ink"
                      : "max-w-[85%] rounded-2xl bg-hover px-3 py-2 text-sm leading-snug text-ink"
                  }
                  style={{ opacity: line.final ? 1 : 0.75 }}
                >
                  {line.text}
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      )}
    </div>
  );
}
