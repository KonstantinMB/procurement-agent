import { Phone, PhoneOff } from "lucide-react";
import { useStore } from "@/store";
import CallPanel from "../CallPanel";
import Transcript from "../Transcript";

export default function CallsView() {
  const call = useStore((s) => s.call);
  const live = call.phase === "ringing" || call.phase === "connected";

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-6">
      <div className="flex items-center gap-2">
        <h1 className="text-xl font-semibold text-ink">Calls</h1>
        <span
          className={`ml-2 inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium ${
            live
              ? "bg-call/10 text-call"
              : "bg-hover text-muted"
          }`}
        >
          {live ? (
            <>
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-current opacity-60" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-current" />
              </span>
              Live
            </>
          ) : (
            "Idle"
          )}
        </span>
      </div>

      <CallPanel />

      {!live && call.phase === "idle" && (
        <div className="grid place-items-center rounded-xl border border-dashed border-border p-12 text-center">
          <PhoneOff className="h-8 w-8 text-faint" />
          <p className="mt-2 text-sm text-muted">No active call.</p>
          <p className="text-xs text-faint">
            Calls launched by the agent will appear here in real time.
          </p>
        </div>
      )}

      {call.phase === "ended" && call.transcript.length > 0 && (
        <section className="rounded-xl border border-border bg-surface p-4 shadow-[var(--shadow-card)]">
          <div className="mb-3 flex items-center gap-2">
            <Phone size={14} className="text-muted" />
            <span className="text-sm font-medium text-ink">
              {call.vendorName ?? "Supplier"}
            </span>
            <span className="ml-auto text-xs text-faint">
              {call.outcome ?? "ended"}
            </span>
          </div>
          <Transcript lines={call.transcript} />
        </section>
      )}
    </div>
  );
}
