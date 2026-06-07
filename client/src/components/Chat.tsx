import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Check, Send } from "lucide-react";
import { useStore } from "@/store";
import { sendChat, answerQuestion } from "@/lib/api";
import { fadeUp, SPRING_SNAPPY } from "@/lib/motion";
import Markdown from "./Markdown";

export default function Chat() {
  const chat = useStore((s) => s.chat);
  const question = useStore((s) => s.question);
  const runId = useStore((s) => s.currentRunId);
  const reduce = useReducedMotion();
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  // Local accumulator for the user's picks within a single multi-question round.
  // Server only resolves the round when every sub-question has an answer, so we
  // batch the clicks and submit once all are picked.
  const [pending, setPending] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const lastQid = useRef<string | null>(null);

  // Reset whenever the question id changes (new round or round cleared).
  useEffect(() => {
    const qid = question?.id ?? null;
    if (qid !== lastQid.current) {
      lastQid.current = qid;
      setPending({});
      setSubmitting(false);
    }
  }, [question?.id]);

  // Auto-scroll to the latest message / inline question.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chat, question, pending]);

  const totalQuestions = question?.questions.length ?? 0;
  const answeredCount = useMemo(
    () => (question ? question.questions.filter((q) => pending[q.question]).length : 0),
    [question, pending],
  );

  function submit() {
    const text = draft.trim();
    if (!text || !runId) return;
    setDraft("");
    useStore.getState().pushChat("user", text);
    void sendChat(runId, text);
  }

  function selectOption(qText: string, optLabel: string) {
    if (submitting || !question || !runId) return;
    const next = { ...pending, [qText]: optLabel };
    setPending(next);

    const allAnswered = question.questions.every((q) => next[q.question]);
    if (allAnswered) {
      setSubmitting(true);
      // Persist the Q&A in the chat thread so the Assistant tab keeps the
      // record after the server emits `question.answered` and clears the
      // inline prompt from state.
      const summary = question.questions
        .map((q) => `${q.question}\n→ ${next[q.question]}`)
        .join("\n\n");
      useStore.getState().pushChat("user", summary);
      void answerQuestion(runId, question.id, next);
    }
  }

  return (
    <section className="flex h-full min-h-0 flex-col bg-surface">
      {/* Thread — messages + any inline decision prompts. */}
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
                    ? "max-w-[85%] rounded-2xl rounded-br-md bg-brand px-3.5 py-2 text-sm leading-relaxed text-white [&_a]:text-white"
                    : "max-w-[85%] rounded-2xl rounded-bl-md bg-hover px-3.5 py-2 text-sm leading-relaxed text-ink [&_a]:text-brand"
                }
              >
                <Markdown text={m.text} />
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {chat.length === 0 && !question && (
          <p className="px-1 pt-1 text-sm text-faint">
            Procura will keep you posted here and ask when it needs a decision.
          </p>
        )}

        {/* Inline decision prompts */}
        <AnimatePresence initial={false}>
          {question && (
            <motion.div
              key={`q:${question.id}`}
              layout={!reduce}
              variants={fadeUp}
              initial="initial"
              animate="animate"
              exit="exit"
              className="rounded-xl border border-brand/30 bg-brand-tint p-3 shadow-[var(--shadow-pop)]"
            >
              {totalQuestions > 1 && (
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-brand">
                    Procura needs your input
                  </span>
                  <span className="tnum text-[11px] text-brand">
                    {answeredCount}/{totalQuestions}
                  </span>
                </div>
              )}

              <div className="space-y-3">
                {question.questions.map((q, i) => {
                  const picked = pending[q.question];
                  return (
                    <div
                      key={`${question.id}:${i}`}
                      className={`rounded-lg ${i > 0 ? "border-t border-brand/15 pt-3" : ""}`}
                    >
                      <p className="text-sm font-medium text-ink">{q.question}</p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {q.options.map((option) => {
                          const selected = picked === option.label;
                          const disabled = submitting;
                          return (
                            <motion.button
                              key={option.label}
                              type="button"
                              title={option.description}
                              onClick={() => selectOption(q.question, option.label)}
                              whileHover={
                                reduce || disabled
                                  ? undefined
                                  : { y: -1, transition: SPRING_SNAPPY }
                              }
                              whileTap={disabled ? undefined : { scale: 0.97 }}
                              disabled={disabled}
                              className={
                                selected
                                  ? "inline-flex items-center gap-1.5 rounded-lg border border-brand bg-brand px-3 py-1.5 text-sm font-medium text-white shadow-[var(--shadow-card)] transition-colors"
                                  : "inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-ink transition-colors hover:border-brand disabled:opacity-50"
                              }
                            >
                              {selected && (
                                <Check size={12} strokeWidth={2.6} aria-hidden />
                              )}
                              {option.label}
                            </motion.button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>

              {submitting && (
                <div className="mt-3 flex items-center gap-2 text-xs text-brand">
                  <span
                    aria-hidden
                    className="h-3 w-3 animate-spin rounded-full border-2 border-brand/30 border-t-brand"
                  />
                  <span>Sending your choices…</span>
                </div>
              )}
            </motion.div>
          )}
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
