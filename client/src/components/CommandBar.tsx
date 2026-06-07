import { useState } from "react";
import type { FormEvent } from "react";
import { motion } from "motion/react";
import { ArrowRight, Command } from "lucide-react";
import { useStore } from "@/store";
import { startCommand } from "@/lib/api";
import { SPRING } from "@/lib/motion";
import { navigate, routes } from "@/lib/router";

const PLACEHOLDER =
  "I need 50 brushless motors delivered by Friday under EUR 60/unit";

export type CommandBarVariant = "topbar" | "hero";

const LAYOUT_ID = "prompt-shell";

interface Props {
  variant?: CommandBarVariant;
}

export default function CommandBar({ variant = "topbar" }: Props) {
  const [text, setText] = useState("");
  const running = useStore((s) => s.running);

  async function run() {
    const value = text.trim();
    if (!value) return;
    setText("");
    const runId = await startCommand(value);
    if (!runId) return;
    const s = useStore.getState();
    s.ensureRun(runId, value);
    s.setCurrentRunId(runId);
    s.pushChat("user", value);
    navigate(routes.detail(runId));
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    void run();
  }

  const isHero = variant === "hero";
  const shellCls = isHero
    ? "flex h-16 items-center gap-3 rounded-2xl border border-border bg-surface px-5 shadow-[var(--shadow-pop)] transition-colors focus-within:border-brand focus-within:ring-4 focus-within:ring-brand/15"
    : "flex h-12 items-center gap-3 rounded-xl border border-border bg-surface px-4 transition-colors focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/20";
  const inputCls = isHero
    ? "min-w-0 flex-1 border-0 bg-transparent text-base text-ink placeholder:text-faint focus:outline-none"
    : "min-w-0 flex-1 border-0 bg-transparent text-sm text-ink placeholder:text-faint focus:outline-none";
  const buttonCls = isHero
    ? "inline-flex h-11 shrink-0 items-center gap-1.5 rounded-xl bg-brand px-5 text-sm font-semibold text-white transition-colors hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-50"
    : "inline-flex h-9 shrink-0 items-center gap-1 rounded-lg bg-brand px-4 text-sm font-medium text-white transition-colors hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-50";
  const iconSize = isHero ? "h-[18px] w-[18px]" : "h-4 w-4";

  return (
    <motion.form
      layoutId={LAYOUT_ID}
      onSubmit={onSubmit}
      transition={SPRING}
      className="w-full"
    >
      <div className={shellCls}>
        <Command className={`${iconSize} shrink-0 text-faint`} aria-hidden />
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={PLACEHOLDER}
          aria-label="Procurement request"
          spellCheck={false}
          autoComplete="off"
          autoFocus={isHero}
          className={inputCls}
        />
        <button type="submit" disabled={running || !text.trim()} className={buttonCls}>
          {isHero ? "Run" : "Run"}
          <ArrowRight className={iconSize} aria-hidden />
        </button>
      </div>
    </motion.form>
  );
}
