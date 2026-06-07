import {
  Sparkles,
  LayoutDashboard,
  Phone,
  Boxes,
  Settings,
  type LucideIcon,
} from "lucide-react";
import { motion } from "motion/react";
import { Wordmark } from "./Logo";
import { useStore } from "@/store";
import { SPRING } from "@/lib/motion";

interface NavItem {
  icon: LucideIcon;
  label: string;
  active?: boolean;
}

const NAV: NavItem[] = [
  { icon: Sparkles, label: "New RFQ", active: true },
  { icon: LayoutDashboard, label: "Dashboard" },
  { icon: Phone, label: "Calls" },
  { icon: Boxes, label: "Suppliers" },
  { icon: Settings, label: "Settings" },
];

function NavRow({ icon: Icon, label, active }: NavItem) {
  return (
    <motion.button
      type="button"
      aria-current={active ? "page" : undefined}
      whileHover={{ x: active ? 0 : 2 }}
      transition={SPRING}
      className={
        active
          ? "relative flex items-center gap-3 rounded-lg bg-brand-tint px-3 py-2 text-sm font-medium text-brand"
          : "relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted transition hover:bg-hover"
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
      <span>{label}</span>
    </motion.button>
  );
}

export default function Sidebar() {
  const running = useStore((s) => s.running);
  const connected = useStore((s) => s.connected);

  return (
    <aside className="flex w-64 shrink-0 flex-col gap-1 border-r border-border bg-sidebar p-4">
      <div className="mb-5 flex flex-col gap-2 px-1">
        <div className="flex items-center gap-2.5">
          <Wordmark />
        </div>
        <span className="eyebrow pl-0.5">Procurement</span>
      </div>

      <nav className="flex flex-col gap-1">
        {NAV.map((item) => (
          <NavRow key={item.label} {...item} />
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
