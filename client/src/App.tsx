import { useEffect } from "react";
import { Toaster } from "sonner";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { useAgentStream } from "@/lib/sse";
import Sidebar from "@/components/Sidebar";
import TopBar from "@/components/TopBar";
import Headline from "@/components/Headline";
import CallPanel from "@/components/CallPanel";
import MasterTable from "@/components/MasterTable";
import RightRail from "@/components/RightRail";
import OrderNow from "@/components/OrderNow";
import HomeHero from "@/components/HomeHero";
import DashboardView from "@/components/views/DashboardView";
import CallsView from "@/components/views/CallsView";
import SuppliersView from "@/components/views/SuppliersView";
import SettingsView from "@/components/views/SettingsView";
import RfqList from "@/pages/RfqList";
import { useStore } from "@/store";
import { useRoute } from "@/lib/router";

const EASE = [0.22, 1, 0.36, 1] as const;

function RfqWorkspace() {
  return (
    <main className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 p-6">
      <Headline />
      <CallPanel />
      <MasterTable />
    </main>
  );
}

/** Sync the route's runId into the store so legacy components keep working. */
function useRouteRunSync() {
  const route = useRoute();
  const setCurrentRunId = useStore((s) => s.setCurrentRunId);
  const ensureRun = useStore((s) => s.ensureRun);

  useEffect(() => {
    if (route.name === "detail") {
      ensureRun(route.runId);
      setCurrentRunId(route.runId);
    } else if (route.name === "new") {
      // Fresh-start hero: clear current run so the empty state shows.
      setCurrentRunId(undefined);
    }
  }, [route.name === "detail" ? route.runId : route.name, ensureRun, setCurrentRunId]);
}

function RfqRoute() {
  const route = useRoute();

  if (route.name === "list") return <RfqList />;
  if (route.name === "detail") return <RfqWorkspace />;

  // "new"
  return <HomeHero />;
}

function CurrentView() {
  const view = useStore((s) => s.view);
  const route = useRoute();
  const onRfqRoute = route.name === "new" || route.name === "list" || route.name === "detail";

  // When on an RFQ-route, the hash decides the sub-page. Otherwise the legacy
  // "view" selector picks Dashboard/Calls/Suppliers/Settings.
  if (onRfqRoute && view === "rfq") return <RfqRoute />;

  switch (view) {
    case "dashboard":
      return <DashboardView />;
    case "calls":
      return <CallsView />;
    case "suppliers":
      return <SuppliersView />;
    case "settings":
      return <SettingsView />;
    case "rfq":
    default:
      return <RfqRoute />;
  }
}

export default function App() {
  useAgentStream();
  useRouteRunSync();

  const route = useRoute();
  const view = useStore((s) => s.view);

  const isIdle = useStore(
    (s) =>
      !s.running &&
      !s.request &&
      s.vendorOrder.length === 0 &&
      !s.summary &&
      s.chat.length === 0,
  );

  const onNewRfqRoute = view === "rfq" && route.name === "new";
  const showHero = isIdle && onNewRfqRoute;
  const showRail = view !== "settings" && !showHero && route.name !== "list";

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-app text-ink">
      <Sidebar />

      <div className="relative flex min-w-0 flex-1 flex-col">
        <LayoutGroup>
          <AnimatePresence initial={false}>
            {!showHero && (
              <motion.div
                key="topbar"
                initial={{ y: -64, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: -64, opacity: 0 }}
                transition={{ duration: 0.45, ease: EASE }}
              >
                <TopBar />
              </motion.div>
            )}
          </AnimatePresence>

          <div className="relative flex min-h-0 flex-1">
            <AnimatePresence mode="popLayout" initial={false}>
              {showHero ? (
                <HomeHero key="hero" />
              ) : (
                <motion.div
                  key="workspace"
                  initial={{ opacity: 0, y: 18 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 12 }}
                  transition={{ duration: 0.5, ease: EASE, delay: 0.12 }}
                  className="flex min-h-0 min-w-0 flex-1"
                >
                  <CurrentView />
                  {showRail && <RightRail />}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </LayoutGroup>
      </div>

      <OrderNow />
      <Toaster position="top-right" richColors closeButton />
    </div>
  );
}
