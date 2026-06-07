import { useStore } from "@/store";

function Row({
  label,
  value,
  hint,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="flex flex-col gap-1 border-b border-border py-3 last:border-b-0 sm:flex-row sm:items-center">
      <div className="sm:w-56">
        <div className="text-sm font-medium text-ink">{label}</div>
        {hint && <div className="text-xs text-muted">{hint}</div>}
      </div>
      <div className="text-sm text-muted sm:flex-1">{value}</div>
    </div>
  );
}

export default function SettingsView() {
  const model = useStore((s) => s.model);
  const apiKeySource = useStore((s) => s.apiKeySource);
  const connected = useStore((s) => s.connected);
  const railWidth = useStore((s) => s.railWidth);
  const setRailWidth = useStore((s) => s.setRailWidth);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-6">
      <div>
        <h1 className="text-xl font-semibold text-ink">Settings</h1>
        <p className="mt-0.5 text-sm text-muted">
          Operator console preferences and agent metadata.
        </p>
      </div>

      <section className="rounded-xl border border-border bg-surface p-4 shadow-[var(--shadow-card)]">
        <h2 className="eyebrow mb-1">Agent</h2>
        <Row
          label="Model"
          value={
            model ? (
              <span className="font-mono text-xs">{model}</span>
            ) : (
              <span className="text-faint">Unknown</span>
            )
          }
        />
        <Row
          label="API key source"
          value={
            apiKeySource ? (
              <span className="font-mono text-xs">{apiKeySource}</span>
            ) : (
              <span className="text-faint">—</span>
            )
          }
          hint="Where the Claude key was loaded from."
        />
        <Row
          label="Connection"
          value={
            <span
              className={
                connected
                  ? "inline-flex items-center gap-1.5 rounded-md bg-success/10 px-2 py-0.5 text-xs font-medium text-success"
                  : "inline-flex items-center gap-1.5 rounded-md bg-hover px-2 py-0.5 text-xs font-medium text-muted"
              }
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  connected ? "bg-success" : "bg-faint"
                }`}
              />
              {connected ? "Connected" : "Offline"}
            </span>
          }
        />
      </section>

      <section className="rounded-xl border border-border bg-surface p-4 shadow-[var(--shadow-card)]">
        <h2 className="eyebrow mb-1">Layout</h2>
        <Row
          label="Right rail width"
          hint="Drag the rail edge or use this slider. Resets next session if cleared."
          value={
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={320}
                max={720}
                step={4}
                value={railWidth}
                onChange={(e) => setRailWidth(Number(e.target.value))}
                className="flex-1 accent-[color:var(--color-brand)]"
              />
              <span className="tnum w-12 text-right text-xs text-muted">
                {railWidth}px
              </span>
            </div>
          }
        />
      </section>
    </div>
  );
}
