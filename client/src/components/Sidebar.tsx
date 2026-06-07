import {
  Sparkles,
  Layers,
  LayoutDashboard,
  Phone,
  Boxes,
  Settings,
  type LucideIcon,
} from "lucide-react";
import { motion } from "motion/react";
import { Wordmark } from "./Logo";
import { useStore, type ViewKey } from "@/store";
import { SPRING } from "@/lib/motion";
import { useRoute, navigate, routes } from "@/lib/router";

type NavItem =
  | { kind: "view"; view: ViewKey; icon: LucideIcon; label: string }
  | { kind: "route"; route: string; icon: LucideIcon; label: string };

const NAV: NavItem[] = [
  { kind: "route", route: routes.newRfq, icon: Sparkles, label: "New RFQ" },
  { kind: "route", route: routes.list, icon: Layers, label: "RFQs" },
  { kind: "view", view: "dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { kind: "view", view: "calls", icon: Phone, label: "Calls" },
  { kind: "view", view: "suppliers", icon: Boxes, label: "Suppliers" },
  { kind: "view", view: "settings", icon: Settings, label: "Settings" },
];

function NavRow({
  item,
  active,
  onClick,
  badge,
}: {
  item: NavItem;
  active: boolean;
  onClick: () => void;
  badge?: number;
}) {
  const Icon = item.icon;
  return (
    <motion.button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      whileHover={{ x: active ? 0 : 2 }}
      whileTap={{ scale: 0.98 }}
      transition={SPRING}
      className={
        active
          ? "relative flex items-center gap-3 rounded-lg bg-brand-tint px-3 py-2 text-sm font-medium text-brand"
          : "relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted transition hover:bg-hover hover:text-ink"
      }
    >
      {active && (
        <motion.span
          layoutId="nav-indicator"
          transition={SPRING}
          className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full bg-brand"
        />
      )}
      <Icon size={17} strokeWidth={2} className="shrink-0" />
      <span className="flex-1 text-left">{item.label}</span>
      {badge != null && badge > 0 && (
        <span
          className={
            active
              ? "tnum rounded-md bg-brand/15 px-1.5 py-0.5 text-[10px] font-semibold text-brand"
              : "tnum rounded-md bg-hover px-1.5 py-0.5 text-[10px] font-semibold text-muted"
          }
        >
          {badge}
        </span>
      )}
    </motion.button>
  );
}

export default function Sidebar() {
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);
  const running = useStore((s) => s.running);
  const connected = useStore((s) => s.connected);
  const vendorCount = useStore((s) => s.vendorOrder.length);
  const callPhase = useStore((s) => s.call.phase);
  const callsActive = callPhase === "ringing" || callPhase === "connected" ? 1 : 0;
  const runCount = useStore((s) => s.runOrder.length);
  const route = useRoute();

  const onRfqRoute = route.name === "new" || route.name === "list" || route.name === "detail";

  const isActive = (item: NavItem): boolean => {
    if (item.kind === "view") return view === item.view && !onRfqRoute;
    if (item.route === routes.newRfq) return view === "rfq" && route.name === "new";
    if (item.route === routes.list) return view === "rfq" && route.name === "list";
    return false;
  };

  const onClick = (item: NavItem) => {
    if (item.kind === "view") {
      // Do NOT touch the hash here. Hijacking it to "/" makes useRouteRunSync
      // clear currentRunId, which wipes the vendor/call mirror — the very data
      // these views (Suppliers, Calls, Dashboard) are meant to show. Leave the
      // route alone; CurrentView dispatches on `view` first when it isn't "rfq".
      setView(item.view);
    } else {
      setView("rfq");
      navigate(item.route);
    }
  };

  const badgeFor = (item: NavItem): number | undefined => {
    if (item.kind === "view") {
      if (item.view === "suppliers") return vendorCount;
      if (item.view === "calls") return callsActive;
    } else if (item.route === routes.list) {
      return runCount;
    }
    return undefined;
  };

  return (
    <aside className="flex w-64 shrink-0 flex-col gap-1 border-r border-border bg-sidebar p-4">
      <button
        type="button"
        onClick={() => {
          setView("rfq");
          navigate(routes.newRfq);
        }}
        className="mb-5 flex flex-col gap-2 px-1 text-left"
        aria-label="Procura home"
      >
        <div className="flex items-center gap-2.5">
          <Wordmark />
        </div>
        <span className="eyebrow pl-0.5">Procurement</span>
      </button>

      <nav className="flex flex-col gap-1">
        {NAV.map((item, i) => (
          <NavRow
            key={i}
            item={item}
            active={isActive(item)}
            onClick={() => onClick(item)}
            badge={badgeFor(item)}
          />
        ))}
      </nav>

      <motion.div
        whileHover={{ y: -1 }}
        transition={SPRING}
        className="mt-auto rounded-xl border border-border bg-surface p-3 shadow-[var(--shadow-card)]"
      >
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            {running && (
              <motion.span
                className="absolute inline-flex h-full w-full rounded-full bg-brand"
                animate={{ scale: [1, 2.2], opacity: [0.55, 0] }}
                transition={{ duration: 1.4, repeat: Infinity, ease: "easeOut" }}
              />
            )}
            <span
              className={
                running
                  ? "relative inline-flex h-2 w-2 rounded-full bg-brand"
                  : "relative inline-flex h-2 w-2 rounded-full bg-faint"
              }
            />
          </span>
          <span className="text-sm font-medium text-ink">
            {running ? "Live" : "Idle"}
          </span>
          <span className="eyebrow ml-auto">
            {connected ? "Online" : "Offline"}
          </span>
        </div>
        <div className="mt-1.5 truncate text-xs text-faint">
          Procura Agent Pro
        </div>
      </motion.div>
    </aside>
  );
}
