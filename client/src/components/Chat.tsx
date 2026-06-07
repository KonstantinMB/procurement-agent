import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowRight, Send } from "lucide-react";
import { useStore } from "@/store";
import { sendChat, answerQuestion } from "@/lib/api";
import { fadeUp } from "@/lib/motion";
import type { AskQuestion } from "@/lib/events";

interface ActiveQuestion {
  id: string;
  questions: AskQuestion[];
}

/**
 * Inline multi-question decision card. The agent's run stays PAUSED until every
 * question has a selection: clicking an option only selects it (single-select
 * replaces the pick, multi-select toggles) — nothing is submitted until the one
 * "Continue" button, which sends every answer at once.
 */
function QuestionPrompt({ q }: { q: ActiveQuestion }) {
  const reduce = useReducedMotion();
  const [picks, setPicks] = useState<Record<string, string[]>>({});

  const toggle = (qText: string, label: string, multi: boolean) =>
    setPicks((prev) => {
      const cur = prev[qText] ?? [];
      if (!multi) return { ...prev, [qText]: [label] };
      return {
        ...prev,
        [qText]: cur.includes(label) ? cur.filter((l) => l !== label) : [...cur, label],
      };
    });

  const allAnswered = q.questions.every((qq) => (picks[qq.question]?.length ?? 0) > 0);

  const submit = () => {
    if (!allAnswered) return;
    const answers: Record<string, string> = {};
    for (const qq of q.questions) answers[qq.question] = (picks[qq.question] ?? []).join(", ");
    void answerQuestion(q.id, answers);
  };

  const showProgress = q.questions.length > 1;

  return (
    <motion.div
      layout={!reduce}
      variants={fadeUp}
      initial="initial"
      animate="animate"
      exit="exit"
      className="rounded-xl border border-brand/30 bg-brand-tint p-3 shadow-[var(--shadow-pop)]"
    >
      {q.questions.map((qq, i) => (
        <div
          key={`${qq.header}:${i}`}
          className={i > 0 ? "mt-3 border-t border-brand/15 pt-3" : ""}
        >
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium text-ink">{qq.question}</p>
            {showProgress && (
              <span className="eyebrow shrink-0">
                {i + 1}/{q.questions.length}
              </span>
            )}
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {qq.options.map((option) => {
              const selected = (picks[qq.question] ?? []).includes(option.label);
              return (
                <button
                  key={option.label}
                  type="button"
                  title={option.description}
                  aria-pressed={selected}
                  onClick={() => toggle(qq.question, option.label, qq.multiSelect)}
                  className={
                    selected
                      ? "rounded-lg border border-brand bg-brand px-3 py-1.5 text-sm font-medium text-white"
                      : "rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-ink transition-colors hover:border-brand"
                  }
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>
      ))}

      <button
        type="button"
        onClick={submit}
        disabled={!allAnswered}
        className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-50"
      >
        Continue
        <ArrowRight className="h-4 w-4" aria-hidden />
      </button>
    </motion.div>
  );
}

export default function Chat() {
  const chat = useStore((s) => s.chat);
  const question = useStore((s) => s.question);
  const reduce = useReducedMotion();
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to the latest message / inline question.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chat, question]);

  function submit() {
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    useStore.getState().pushChat("user", text);
    void sendChat(text);
  }

  return (
    <section className="flex h-full min-h-0 flex-col bg-surface">
      {/* Header */}
      <header className="shrink-0 border-b border-border px-4 py-3">
        <p className="eyebrow">Assistant</p>
      </header>

      {/* Thread — messages + any inline decision prompts. The prompts live
          inside this scroll area (not the footer) so the input below stays
          pinned and fully visible no matter how tall the prompts get. */}
      <div ref={scrollRef} className="min-h-0 flex-1 space-y-2.5 overflow-y-auto px-4 py-4">
        <AnimatePresence initial={false}>
          {chat.map((m) => (
            <motion.div
              key={m.id}
              layout={!reduce}
              variants={fadeUp}
              initial="initial"
              animate="animate"
              exit="exit"
              className={
                m.role === "user" ? "flex justify-end" : "flex justify-start"
              }
            >
              <div
                className={
                  m.role === "user"
                    ? "max-w-[85%] rounded-2xl rounded-br-md bg-brand px-3.5 py-2 text-sm leading-relaxed text-white"
                    : "max-w-[85%] rounded-2xl rounded-bl-md bg-hover px-3.5 py-2 text-sm leading-relaxed text-ink"
                }
              >
                {m.text}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {chat.length === 0 && !question && (
          <p className="px-1 pt-1 text-sm text-faint">
            Procura will keep you posted here and ask when it needs a decision.
          </p>
        )}

        {/* Inline decision prompt — the agent stays paused until EVERY question
            has a selection; one "Continue" submits the whole set. */}
        <AnimatePresence initial={false}>
          {question && <QuestionPrompt key={question.id} q={question} />}
        </AnimatePresence>
      </div>

      {/* Input — pinned at the bottom, always fully visible */}
      <footer className="shrink-0 border-t border-border px-4 py-3">
        <div className="flex items-center gap-1.5 rounded-xl border border-border bg-surface px-1 focus-within:border-brand">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder="Message Procura…"
            aria-label="Message Procura"
            className="flex-1 bg-transparent px-2.5 py-2 text-sm text-ink placeholder:text-faint focus:outline-none"
          />
          <button
            type="button"
            onClick={submit}
            disabled={!draft.trim()}
            aria-label="Send message"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-brand transition-colors hover:bg-brand-tint disabled:text-faint disabled:hover:bg-transparent"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </footer>
    </section>
  );
}
