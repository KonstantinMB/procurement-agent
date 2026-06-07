import { motion } from "motion/react";
import { Sparkles } from "lucide-react";
import Logo from "./Logo";
import CommandBar from "./CommandBar";
import PeekSheet from "./PeekSheet";
import { startCommand } from "@/lib/api";
import { useStore } from "@/store";
import { navigate, routes } from "@/lib/router";

const EXAMPLES = [
  "I need 100 office desks delivered to Berlin",
  "50 brushless motors by Friday under EUR 60/unit",
  "200 m³ FSC oak plywood — cheapest verified supplier",
];

const HERO_EASE = [0.22, 1, 0.36, 1] as const;

function Example({ text }: { text: string }) {
  return (
    <motion.button
      type="button"
      whileHover={{ y: -1 }}
      whileTap={{ scale: 0.98 }}
      onClick={async () => {
        const runId = await startCommand(text);
        if (!runId) return;
        const s = useStore.getState();
        s.ensureRun(runId, text);
        s.setCurrentRunId(runId);
        s.pushChat("user", text);
        navigate(routes.detail(runId));
      }}
      className="rounded-full border border-border bg-surface/70 px-3 py-1.5 text-xs text-muted backdrop-blur transition hover:border-brand/40 hover:text-ink"
    >
      {text}
    </motion.button>
  );
}

export default function HomeHero() {
  return (
    <motion.section
      key="hero"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.35, ease: HERO_EASE }}
      className="relative flex h-full w-full flex-col items-center justify-center overflow-hidden bg-app"
      aria-label="Procura home"
    >
      {/* Subtle dotted backdrop */}
      <div className="dotgrid pointer-events-none absolute inset-0 opacity-60" aria-hidden />
      {/* Soft radial glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-[12%] mx-auto h-[420px] max-w-3xl"
        style={{
          background:
            "radial-gradient(60% 60% at 50% 30%, rgba(37,99,235,0.10) 0%, rgba(37,99,235,0) 70%)",
        }}
      />

      {/* Centered stack */}
      <motion.div
        initial={{ y: 16, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: -8, opacity: 0 }}
        transition={{ duration: 0.45, ease: HERO_EASE, delay: 0.05 }}
        className="relative z-10 flex w-full max-w-2xl flex-col items-center gap-7 px-6 pb-32"
      >
        {/* Eyebrow chip */}
        <motion.span
          initial={{ y: 8, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.15, duration: 0.4, ease: HERO_EASE }}
          className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-1 text-[11px] font-medium text-muted shadow-[var(--shadow-card)]"
        >
          <Sparkles size={12} className="text-brand" strokeWidth={2.4} />
          <span className="tracking-wide">Built on Claude · Agent SDK</span>
        </motion.span>

        {/* Logo + Wordmark + tagline */}
        <div className="flex flex-col items-center gap-5 text-center">
          <div className="flex flex-col items-center gap-3">
            <Logo size={56} />
            <span className="text-[28px] font-semibold leading-none tracking-tight text-ink">
              Procura
            </span>
          </div>
          <div className="flex flex-col items-center gap-2">
            <h1 className="text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
              Procurement, on autopilot.
            </h1>
            <p className="max-w-md text-base text-muted">
              Tell me what you need. I'll source suppliers, negotiate over email
              and voice, and lock the best deal — in minutes.
            </p>
          </div>
        </div>

        {/* Prompt input (shared layoutId — morphs to TopBar on submit) */}
        <div className="w-full">
          <CommandBar variant="hero" />
        </div>

        {/* Examples */}
        <div className="flex flex-wrap items-center justify-center gap-2">
          <span className="text-xs uppercase tracking-wider text-faint">
            Try
          </span>
          {EXAMPLES.map((t) => (
            <Example key={t} text={t} />
          ))}
        </div>
      </motion.div>

      {/* Bottom drag-up sheet that reveals workspace */}
      <PeekSheet />
    </motion.section>
  );
}
