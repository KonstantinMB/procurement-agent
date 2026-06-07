import { useStore } from "@/store";
import CommandBar from "./CommandBar";

export default function TopBar() {
  const connected = useStore((s) => s.connected);
  const model = useStore((s) => s.model);

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-4 border-b border-border bg-surface/85 px-6 backdrop-blur">
      <div className="flex-1">
        <CommandBar />
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <div className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-1.5">
          <span
            className={`h-2 w-2 rounded-full ${
              connected ? "bg-success" : "bg-faint"
            }`}
            aria-hidden
          />
          <span className="text-xs font-medium text-ink">
            {connected ? "Connected" : "Offline"}
          </span>
        </div>
        {model ? (
          <span className="text-xs text-faint">Procura Agent Pro</span>
        ) : null}
      </div>
    </header>
  );
}
