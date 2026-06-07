import { Toaster } from "sonner";
import { useAgentStream } from "@/lib/sse";
import Sidebar from "@/components/Sidebar";
import TopBar from "@/components/TopBar";
import Headline from "@/components/Headline";
import CallPanel from "@/components/CallPanel";
import MasterTable from "@/components/MasterTable";
import ActivityPanel from "@/components/ActivityPanel";
import Chat from "@/components/Chat";
import OrderNow from "@/components/OrderNow";

export default function App() {
  useAgentStream();

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-app text-ink">
      <Sidebar />

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />

        <div className="flex min-h-0 flex-1">
          {/* Center: request headline → live call (when active) → master table */}
          <main className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 p-6">
            <Headline />
            <CallPanel />
            <MasterTable />
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
      </div>

      <OrderNow />
      <Toaster position="top-right" richColors closeButton />
    </div>
  );
}
