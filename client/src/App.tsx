import { Toaster } from "sonner";
import { ArrowLeft } from "lucide-react";
import { useAgentStream } from "@/lib/sse";
import { useStore } from "@/store";
import Sidebar from "@/components/Sidebar";
import TopBar from "@/components/TopBar";
import Dashboard from "@/components/Dashboard";
import Headline from "@/components/Headline";
import CallPanel from "@/components/CallPanel";
import MasterTable from "@/components/MasterTable";
import ActivityPanel from "@/components/ActivityPanel";
import Chat from "@/components/Chat";
import OrderNow from "@/components/OrderNow";

function RunDetail() {
  const showDashboard = useStore((s) => s.showDashboard);
  const request = useStore((s) => s.request);

  return (
    <div className="flex min-h-0 flex-1">
      {/* Center: back → request headline → live call → master table */}
      <main className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 p-6">
        <button
          type="button"
          onClick={showDashboard}
          className="inline-flex w-fit items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs font-medium text-muted transition-colors hover:border-brand hover:text-brand"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          All runs
        </button>
        <Headline />
        <CallPanel />
        <MasterTable />
        {!request && (
          <p className="px-1 text-sm text-faint">This run has no data yet.</p>
        )}
      </main>

      {/* Right: clean "what the agent is doing" + assistant */}
      <aside className="flex min-h-0 w-[340px] shrink-0 flex-col border-l border-border">
        <div className="min-h-0 flex-[58]">
          <ActivityPanel />
        </div>
        <div className="min-h-0 flex-[42] border-t border-border">
          <Chat />
        </div>
      </aside>
    </div>
  );
}

export default function App() {
  useAgentStream();
  const view = useStore((s) => s.view);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-app text-ink">
      <Sidebar />

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        {view === "dashboard" ? <Dashboard /> : <RunDetail />}
      </div>

      {view === "run" && <OrderNow />}
      <Toaster position="top-right" richColors closeButton />
    </div>
  );
}
