import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import NumberFlow from "@number-flow/react";
import {
  Brain,
  Check,
  Globe,
  Handshake,
  Hourglass,
  Mail,
  Phone,
  Sparkles,
  Trophy,
  Zap,
} from "lucide-react";
import { useStore } from "@/store";
import { SPRING } from "@/lib/motion";

// ── Pipeline stages — the agent's high-level journey ─────────────────────────
const STAGES = [
  { id: "source", label: "Source", icon: Globe },
  { id: "rfq", label: "RFQ", icon: Mail },
  { id: "quote", label: "Quote", icon: Sparkles },
  { id: "negotiate", label: "Negotiate", icon: Handshake },
  { id: "close", label: "Close", icon: Trophy },
] as const;

// ── Pre-written narrative beats. We blend these with live tool counts so the
//    copy feels alive without depending on the agent emitting structured beats.
const BEATS: { atSec: number; copy: string }[] = [
  { atSec: 0, copy: "Spinning up the procurement agent…" },
  { atSec: 4, copy: "Parsing your request…" },
  { atSec: 10, copy: "Mapping the supplier landscape across the web…" },
  { atSec: 22, copy: "Crawling industry directories and trade catalogs…" },
  { atSec: 38, copy: "Filtering candidates by capability, capacity and location…" },
  { atSec: 55, copy: "Verifying contact details and lead times…" },
  { atSec: 75, copy: "Ranking the shortlist and drafting personalized RFQs…" },
  { atSec: 95, copy: "Almost there — preparing outreach…" },
];

const FACTS = [
  "Manual RFQ cycles average 12 days. Procura targets 12 minutes.",
  "First-round counter-offers typically save 8–14% off the opening quote.",
  "Negotiating MOQ down by 25% is achievable in ~60% of B2B deals.",
  "Anchoring 18–22% below the opening price is the sweet spot for B2B buying.",
  "Procura runs sourcing, RFQ, and negotiation in parallel — humans run them serially.",
];

function fmtTime(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// AgentHub — animated central graphic. Concentric rings that breathe + three
// orbiting "channel" dots (web / email / phone) drifting around the core.
// ─────────────────────────────────────────────────────────────────────────────
function AgentHub({ size = 168 }: { size?: number }) {
  const cx = size / 2;
  const cy = size / 2;
  const max = size / 2 - 8;
  const rings = [0.55, 0.74, 0.92];
  // Three channels at staggered angles + radii to give organic motion
  const channels = [
    { color: "#2563eb", angleOffset: 0, label: Globe },
    { color: "#7c3aed", angleOffset: 120, label: Mail },
    { color: "#d97706", angleOffset: 240, label: Phone },
  ];

  return (
    <div
      style={{ width: size, height: size }}
      className="relative grid place-items-center"
      aria-hidden
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="overflow-visible"
      >
        {/* Halo */}
        <motion.circle
          cx={cx}
          cy={cy}
          r={max * 0.55}
          fill="#2563eb"
          style={{ filter: `blur(${size * 0.08}px)` }}
          animate={{ opacity: [0.18, 0.32, 0.18] }}
          transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
        />
        {/* Concentric rings */}
        {rings.map((frac, i) => (
          <motion.circle
            key={i}
            cx={cx}
            cy={cy}
            r={max * frac}
            fill="none"
            stroke="#2563eb"
            strokeWidth={1.5 - i * 0.3}
            strokeOpacity={0.35 - i * 0.08}
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: [0.92, 1.05, 0.92], opacity: [0.35 - i * 0.08, 0.6 - i * 0.1, 0.35 - i * 0.08] }}
            transition={{ duration: 2.6 + i * 0.4, repeat: Infinity, ease: "easeInOut", delay: i * 0.25 }}
            style={{ transformOrigin: `${cx}px ${cy}px` }}
          />
        ))}
        {/* Core */}
        <motion.circle
          cx={cx}
          cy={cy}
          r={max * 0.34}
          fill="#2563eb"
          animate={{ scale: [1, 1.06, 1], opacity: [0.92, 1, 0.92] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
          style={{ transformOrigin: `${cx}px ${cy}px` }}
        />
        <circle cx={cx} cy={cy} r={max * 0.12} fill="#ffffff" opacity={0.9} />
      </svg>

      {/* Orbiting channel chips — outside the SVG so we can use HTML icons */}
      {channels.map(({ color, angleOffset, label: Icon }, i) => {
        const r = max + 18;
        return (
          <motion.div
            key={i}
            className="absolute grid h-9 w-9 place-items-center rounded-full border border-border bg-surface shadow-[var(--shadow-card)]"
            style={{ left: cx - 18, top: cy - 18, color }}
            animate={{
              x: [
                Math.cos((angleOffset * Math.PI) / 180) * r,
                Math.cos(((angleOffset + 360) * Math.PI) / 180) * r,
              ],
              y: [
                Math.sin((angleOffset * Math.PI) / 180) * r,
                Math.sin(((angleOffset + 360) * Math.PI) / 180) * r,
              ],
            }}
            transition={{
              duration: 7 + i * 1.3,
              repeat: Infinity,
              ease: "linear",
            }}
          >
            <Icon size={15} strokeWidth={2.2} />
          </motion.div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PipelineStrip — five-step visual journey with active stage indicator
// ─────────────────────────────────────────────────────────────────────────────
function PipelineStrip({ activeIdx }: { activeIdx: number }) {
  return (
    <div className="flex w-full max-w-xl items-center gap-1">
      {STAGES.map((s, i) => {
        const Icon = s.icon;
        const done = i < activeIdx;
        const active = i === activeIdx;
        return (
          <div key={s.id} className="flex flex-1 items-center gap-1">
            <motion.div
              initial={false}
              animate={{
                scale: active ? [1, 1.06, 1] : 1,
              }}
              transition={
                active
                  ? { duration: 1.8, repeat: Infinity, ease: "easeInOut" }
                  : SPRING
              }
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-2 py-1.5 text-xs font-medium transition-colors ${
                done
                  ? "border-success/30 bg-success/10 text-success"
                  : active
                    ? "border-brand/40 bg-brand-tint text-brand"
                    : "border-border bg-surface text-faint"
              }`}
            >
              {done ? (
                <Check size={12} strokeWidth={2.6} />
              ) : (
                <Icon size={12} strokeWidth={2.2} />
              )}
              <span>{s.label}</span>
            </motion.div>
            {i < STAGES.length - 1 && (
              <span
                aria-hidden
                className={`h-px w-3 ${done ? "bg-success/40" : "bg-border"}`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// StatChip — small animated counter
// ─────────────────────────────────────────────────────────────────────────────
function StatChip({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Globe;
  label: string;
  value: number | string;
}) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 shadow-[var(--shadow-card)]">
      <span className="grid h-7 w-7 place-items-center rounded-md bg-brand-tint text-brand">
        <Icon size={13} strokeWidth={2.2} />
      </span>
      <div className="flex flex-col">
        <span className="text-[10px] font-medium uppercase tracking-wider text-faint">
          {label}
        </span>
        <span className="tnum text-sm font-semibold text-ink">
          {typeof value === "number" ? (
            <NumberFlow value={value} format={{ maximumFractionDigits: 0 }} />
          ) : (
            value
          )}
        </span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SkeletonRow — shimmer row that suggests a supplier is about to appear
// ─────────────────────────────────────────────────────────────────────────────
function SkeletonRow({ delay = 0 }: { delay?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.4, delay, ease: [0.22, 1, 0.36, 1] }}
      className="grid grid-cols-[24px_1fr_120px_72px_88px] items-center gap-3 rounded-lg border border-border bg-surface px-3 py-2"
    >
      <span className="shimmer h-4 w-4 rounded-md" />
      <span className="shimmer h-3.5 w-32 rounded-md" />
      <span className="shimmer h-3 w-20 rounded-md" />
      <span className="shimmer h-3 w-12 rounded-md" />
      <span className="shimmer h-4 w-16 rounded-full" />
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// WarmupCanvas — the headline experience while the agent is bootstrapping
// ─────────────────────────────────────────────────────────────────────────────
export default function WarmupCanvas() {
  const toolCalls = useStore((s) => s.toolCalls);
  const toolOrder = useStore((s) => s.toolOrder);
  const subagentOrder = useStore((s) => s.subagentOrder);
  const request = useStore((s) => s.request);

  const startedAt = useRef<number>(Date.now());
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt.current) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  // Derive live stats
  const stats = useMemo(() => {
    let web = 0;
    let done = 0;
    let running = 0;
    for (const id of toolOrder) {
      const t = toolCalls[id];
      if (!t) continue;
      if (t.kind === "web") web += 1;
      if (t.status === "done") done += 1;
      else if (t.status === "running") running += 1;
    }
    return { web, done, running };
  }, [toolCalls, toolOrder]);

  // Beat narrative based on elapsed + last running tool
  const beat = useMemo(() => {
    let chosen = BEATS[0]!.copy;
    for (const b of BEATS) {
      if (elapsed >= b.atSec) chosen = b.copy;
    }
    return chosen;
  }, [elapsed]);

  const liveRunningTool = useMemo(() => {
    for (let i = toolOrder.length - 1; i >= 0; i--) {
      const t = toolCalls[toolOrder[i]!];
      if (t?.status === "running") return t.label;
    }
    return null;
  }, [toolCalls, toolOrder]);

  // Rotate facts every 6s
  const [factIdx, setFactIdx] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setFactIdx((i) => (i + 1) % FACTS.length), 6000);
    return () => clearInterval(id);
  }, []);

  // Always "Source" stage while in warmup
  const activeStageIdx = 0;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-auto">
      <div className="relative flex flex-col items-center gap-8 px-6 py-10">
        {/* Background flourish */}
        <div className="dotgrid pointer-events-none absolute inset-0 opacity-40" aria-hidden />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 mx-auto h-72 max-w-3xl"
          style={{
            background:
              "radial-gradient(60% 60% at 50% 30%, rgba(37,99,235,0.10) 0%, rgba(37,99,235,0) 70%)",
          }}
        />

        {/* AgentHub */}
        <div className="relative z-10">
          <AgentHub size={172} />
        </div>

        {/* Headline + live request */}
        <div className="relative z-10 flex flex-col items-center gap-1.5 text-center">
          <span className="eyebrow">Run in progress</span>
          <h2 className="text-xl font-semibold text-ink">
            Procura is sourcing for you
          </h2>
          {request?.raw && (
            <p className="max-w-xl text-sm text-muted">
              <span className="text-faint">Request · </span>
              <span className="text-ink">{request.raw}</span>
            </p>
          )}
        </div>

        {/* Pipeline */}
        <div className="relative z-10 w-full max-w-xl">
          <PipelineStrip activeIdx={activeStageIdx} />
        </div>

        {/* Live narrative */}
        <div className="relative z-10 w-full max-w-xl rounded-xl border border-border bg-surface px-4 py-3 shadow-[var(--shadow-card)]">
          <div className="flex items-center gap-3">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand-tint text-brand">
              <Brain size={15} strokeWidth={2.2} />
            </span>
            <div className="min-w-0 flex-1">
              <AnimatePresence mode="wait">
                <motion.p
                  key={beat}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.35 }}
                  className="truncate text-sm font-medium text-ink"
                >
                  {beat}
                </motion.p>
              </AnimatePresence>
              <AnimatePresence mode="wait">
                <motion.p
                  key={liveRunningTool ?? "idle"}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.25 }}
                  className="mt-0.5 truncate font-mono text-xs text-faint"
                >
                  {liveRunningTool ? `↳ ${liveRunningTool}` : "↳ orchestrating workers…"}
                </motion.p>
              </AnimatePresence>
            </div>
            <span className="tnum shrink-0 rounded-md bg-hover px-2 py-0.5 text-xs font-medium text-muted">
              {fmtTime(elapsed)}
            </span>
          </div>
        </div>

        {/* Stat chips */}
        <div className="relative z-10 flex flex-wrap items-center justify-center gap-2">
          <StatChip icon={Globe} label="Sources scanned" value={stats.web} />
          <StatChip icon={Zap} label="Steps completed" value={stats.done} />
          <StatChip icon={Brain} label="Workers active" value={subagentOrder.length} />
          <StatChip icon={Hourglass} label="Elapsed" value={fmtTime(elapsed)} />
        </div>

        {/* Did-you-know */}
        <div className="relative z-10 w-full max-w-xl">
          <AnimatePresence mode="wait">
            <motion.div
              key={factIdx}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.45 }}
              className="rounded-xl border border-dashed border-border bg-surface/60 px-4 py-3 backdrop-blur"
            >
              <div className="flex items-start gap-3">
                <Sparkles size={14} className="mt-0.5 shrink-0 text-brand" strokeWidth={2.2} />
                <p className="text-sm text-muted">
                  <span className="font-medium text-ink">Did you know · </span>
                  {FACTS[factIdx]}
                </p>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Skeleton rows — imply suppliers are about to land */}
        <div className="relative z-10 flex w-full max-w-2xl flex-col gap-2">
          <div className="flex items-center justify-between px-1">
            <span className="eyebrow">Incoming suppliers</span>
            <span className="text-xs text-faint">streaming in…</span>
          </div>
          {[0, 1, 2, 3].map((i) => (
            <SkeletonRow key={i} delay={0.08 * i} />
          ))}
        </div>
      </div>
    </div>
  );
}
