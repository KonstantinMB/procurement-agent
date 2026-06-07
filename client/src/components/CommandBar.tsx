import { useState } from "react";
import type { FormEvent } from "react";
import { ArrowRight, Command, Play, RotateCcw } from "lucide-react";
import { useStore } from "@/store";
import { startCommand, startDemo, resetRun } from "@/lib/api";

const PLACEHOLDER =
  "I need 50 brushless motors delivered by Friday under EUR 60/unit";

export default function CommandBar() {
  const [text, setText] = useState("");
  const running = useStore((s) => s.running);

  function run() {
    const value = text.trim();
    if (!value) return;
    useStore.getState().reset();
    useStore.getState().pushChat("user", value);
    startCommand(value);
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    run();
  }

  function tryDemo() {
    useStore.getState().reset();
    void startDemo();
  }

  function resetAll() {
    useStore.getState().reset();
    void resetRun();
  }

  return (
    <div className="flex w-full items-center gap-3">
      <form onSubmit={onSubmit} className="flex-1">
        <div className="flex h-12 items-center gap-3 rounded-xl border border-border bg-surface px-4 transition-colors focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/20">
          <Command className="h-4 w-4 shrink-0 text-faint" aria-hidden />
          <input
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={PLACEHOLDER}
            aria-label="Procurement request"
            spellCheck={false}
            autoComplete="off"
            className="min-w-0 flex-1 border-0 bg-transparent text-sm text-ink placeholder:text-faint focus:outline-none"
          />
          <button
            type="submit"
            disabled={running || !text.trim()}
            className="inline-flex h-9 shrink-0 items-center gap-1 rounded-lg bg-brand px-4 text-sm font-medium text-white transition-colors hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            Run
            <ArrowRight className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </form>

      <button
        type="button"
        onClick={tryDemo}
        disabled={running}
        className="inline-flex h-12 shrink-0 items-center gap-2 rounded-xl bg-brand px-4 text-sm font-medium text-white transition-colors hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Play className="h-4 w-4" aria-hidden />
        Try demo
      </button>

      <button
        type="button"
        onClick={resetAll}
        aria-label="Reset run"
        title="Reset / abort"
        className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-border bg-surface text-muted transition-colors hover:border-brand hover:text-brand"
      >
        <RotateCcw className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}
