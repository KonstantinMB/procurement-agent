import { useState } from "react";
import { motion, useMotionValue, useTransform, type PanInfo } from "motion/react";
import { ChevronUp, GripHorizontal } from "lucide-react";
import MasterTable from "./MasterTable";
import ActivityPanel from "./ActivityPanel";
import { useStore } from "@/store";

const HANDLE_HEIGHT = 56; // bar height when sheet is closed
const SPRING = { type: "spring", stiffness: 380, damping: 38, mass: 0.9 } as const;

export default function PeekSheet() {
  // 0 = closed (peek only), 1 = fully open. We drive layout off a height-based
  // CSS calc so the sheet snaps to predictable points without measuring the DOM.
  const [open, setOpen] = useState(false);
  const vendorCount = useStore((s) => s.vendorOrder.length);
  const running = useStore((s) => s.running);

  // For drag feedback while the user is mid-gesture
  const drag = useMotionValue(0);
  const hint = useTransform(drag, [-160, 0], [1, 0]);

  function onDragEnd(_: unknown, info: PanInfo) {
    drag.set(0);
    if (info.offset.y < -60 || info.velocity.y < -400) setOpen(true);
    else if (info.offset.y > 60 || info.velocity.y > 400) setOpen(false);
  }

  return (
    <motion.div
      drag="y"
      dragMomentum={false}
      dragElastic={0.18}
      dragConstraints={{ top: 0, bottom: 0 }}
      onDrag={(_, info) => drag.set(info.offset.y)}
      onDragEnd={onDragEnd}
      animate={{ height: open ? "68vh" : `${HANDLE_HEIGHT}px` }}
      transition={SPRING}
      style={{ touchAction: "none" }}
      className="absolute inset-x-0 bottom-0 z-30 overflow-hidden rounded-t-2xl border border-b-0 border-border bg-surface shadow-[0_-12px_32px_-12px_rgba(15,23,42,0.18)]"
      aria-label="Workspace peek drawer"
    >
      {/* Handle bar */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex h-14 w-full cursor-grab items-center justify-center gap-2 px-4 active:cursor-grabbing"
        aria-expanded={open}
        aria-label={open ? "Collapse workspace peek" : "Expand workspace peek"}
      >
        <GripHorizontal className="h-4 w-4 text-faint" aria-hidden />
        <span className="eyebrow flex items-center gap-2">
          {open ? "Drag down to dismiss" : "Live activity · Suppliers"}
        </span>
        {!open && (
          <>
            {vendorCount > 0 && (
              <span className="tnum rounded-md bg-hover px-1.5 py-0.5 text-[11px] font-semibold text-muted">
                {vendorCount}
              </span>
            )}
            {running && (
              <motion.span
                aria-hidden
                className="ml-0.5 h-1.5 w-1.5 rounded-full bg-brand"
                animate={{ opacity: [1, 0.3, 1], scale: [1, 0.85, 1] }}
                transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
              />
            )}
            <motion.span
              style={{ opacity: hint }}
              className="ml-1 inline-flex items-center text-faint"
              aria-hidden
            >
              <ChevronUp className="h-3.5 w-3.5" />
            </motion.span>
          </>
        )}
      </button>

      {/* Body — only meaningful when open */}
      <div className="grid h-[calc(68vh-56px)] grid-cols-1 border-t border-border lg:grid-cols-[1fr_360px]">
        <div className="min-h-0 overflow-hidden p-4">
          <MasterTable />
        </div>
        <div className="hidden min-h-0 border-l border-border lg:block">
          <ActivityPanel />
        </div>
      </div>
    </motion.div>
  );
}
