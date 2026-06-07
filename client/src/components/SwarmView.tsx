import { useMemo, memo } from "react";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  type Node,
  type Edge,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { motion, useReducedMotion } from "motion/react";
import AgentGlyph from "./AgentGlyph";
import { useStore } from "@/store";

// ─── role → visual mapping ────────────────────────────────────────────────
type Role = "web" | "scout" | "call" | "email" | "quote" | "officer";
type GlyphKind = "web" | "call" | "email" | "quote" | "officer";

const RING: Record<Role, string> = {
  web: "#2563eb",
  scout: "#2563eb",
  call: "#d97706",
  email: "#7c3aed",
  quote: "#059669",
  officer: "#0f172a",
};

const GLYPH: Record<Role, GlyphKind> = {
  web: "web",
  scout: "web",
  call: "call",
  email: "email",
  quote: "quote",
  officer: "officer",
};

interface AgentData extends Record<string, unknown> {
  role: Role;
  label: string;
  active?: boolean;
}

// ─── node renderer ────────────────────────────────────────────────────────
const AgentNode = memo(function AgentNode({ data }: NodeProps<Node<AgentData>>) {
  const reduce = useReducedMotion();
  const role = data.role;
  const big = role === "officer" || data.active;
  const size = big ? 72 : 56;
  const ring = data.active ? "#d97706" : RING[role];

  return (
    <div className="flex flex-col items-center gap-1.5 select-none">
      <div className="relative" style={{ width: size, height: size }}>
        {data.active && !reduce && (
          <motion.span
            aria-hidden
            className="absolute inset-0 rounded-full"
            style={{ border: "2px solid #d97706" }}
            initial={{ scale: 1, opacity: 0.5 }}
            animate={{ scale: 1.5, opacity: 0 }}
            transition={{ duration: 1.6, repeat: Infinity, ease: "easeOut" }}
          />
        )}
        <motion.div
          className="relative flex h-full w-full items-center justify-center rounded-full bg-surface"
          style={{
            border: `2px solid ${ring}`,
            boxShadow: "var(--shadow-card)",
          }}
          animate={
            data.active && !reduce
              ? { scale: [1, 1.06, 1] }
              : { scale: 1 }
          }
          transition={
            data.active && !reduce
              ? { duration: 1.6, repeat: Infinity, ease: "easeInOut" }
              : { duration: 0.2 }
          }
        >
          <AgentGlyph kind={GLYPH[role]} />
        </motion.div>
      </div>
      <span className="max-w-[110px] truncate text-center text-xs text-muted">
        {data.label}
      </span>
    </div>
  );
});

const nodeTypes = { agent: AgentNode };

const RADIUS = 160;

export default function SwarmView() {
  const subagentOrder = useStore((s) => s.subagentOrder);
  const subagents = useStore((s) => s.subagents);
  const call = useStore((s) => s.call);

  const { nodes, edges } = useMemo(() => {
    const callActive = call.phase === "ringing" || call.phase === "connected";

    // children = subagents (in order) + a synthetic call node when live
    const children: { id: string; role: Role; label: string; active?: boolean }[] =
      subagentOrder.map((id) => {
        const role = (subagents[id]?.role ?? "scout") as Role;
        return {
          id,
          role: role in RING ? role : "scout",
          label: roleLabel(subagents[id]?.role),
        };
      });

    if (callActive) {
      children.push({
        id: "call",
        role: "call",
        label: call.vendorName ?? "Call",
        active: true,
      });
    }

    const center: Node<AgentData> = {
      id: "orchestrator",
      type: "agent",
      position: { x: 0, y: 0 },
      data: { role: "officer", label: "Officer" },
      draggable: false,
      selectable: false,
    };

    const n = children.length;
    const childNodes: Node<AgentData>[] = children.map((c, i) => {
      const angle = (i / Math.max(1, n)) * 2 * Math.PI - Math.PI / 2;
      return {
        id: c.id,
        type: "agent",
        position: {
          x: Math.cos(angle) * RADIUS,
          y: Math.sin(angle) * RADIUS,
        },
        data: { role: c.role, label: c.label, active: c.active },
        draggable: false,
        selectable: false,
      };
    });

    const childEdges: Edge[] = children.map((c) => ({
      id: `orchestrator-${c.id}`,
      source: "orchestrator",
      target: c.id,
      animated: true,
      style: { stroke: "#2563eb", strokeWidth: 2 },
    }));

    return { nodes: [center, ...childNodes], edges: childEdges };
  }, [subagentOrder, subagents, call.phase, call.vendorName]);

  return (
    <div
      className="shrink-0 rounded-xl border border-border bg-surface overflow-hidden"
      style={{ height: 300 }}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        panOnDrag={false}
        zoomOnScroll={false}
        zoomOnPinch={false}
        zoomOnDoubleClick={false}
        proOptions={{ hideAttribution: true }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={22}
          size={1}
          color="#e2e8f0"
        />
      </ReactFlow>
    </div>
  );
}

function roleLabel(role?: string): string {
  switch (role) {
    case "web":
    case "scout":
      return "Scout";
    case "call":
      return "Caller";
    case "email":
      return "Outreach";
    case "quote":
      return "Quotes";
    default:
      return role ? cap(role) : "Agent";
  }
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
