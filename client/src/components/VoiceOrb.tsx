import { motion, useReducedMotion } from "motion/react";
import { useFakeAmplitude } from "@/lib/motion";

type Speaking = "agent" | "supplier" | null;

function colorFor(speaking: Speaking): string {
  if (speaking === "agent") return "#2563eb";
  if (speaking === "supplier") return "#d97706";
  return "#94a3b8";
}

/**
 * Original SVG voice orb: a soft filled core with concentric stroked rings
 * whose radius breathes with a believable speaking amplitude. No background.
 */
export default function VoiceOrb({
  active,
  speaking = null,
  size = 160,
}: {
  active: boolean;
  speaking?: "agent" | "supplier" | null;
  size?: number;
}) {
  const reduced = useReducedMotion();
  const amp = useFakeAmplitude(active, !!speaking);
  const color = colorFor(speaking);

  const cx = size / 2;
  const cy = size / 2;
  // Largest ring sits a hair inside the box so glow/stroke never clips.
  const maxR = size / 2 - 6;
  const coreBase = maxR * 0.42;
  const rings = [0.6, 0.78, 0.96]; // fractions of maxR for the three rings

  // Gentle idle breathing only when active and nobody is speaking.
  const breathing = active && !speaking && !reduced;
  const grow = reduced ? 0 : amp;

  const coreR = coreBase * (1 + grow * 0.18);

  return (
    <div
      style={{ width: size, height: size }}
      className="relative flex items-center justify-center"
      role="img"
      aria-label={
        speaking === "agent"
          ? "Procura is speaking"
          : speaking === "supplier"
            ? "Supplier is speaking"
            : active
              ? "Listening"
              : "Idle"
      }
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        fill="none"
        aria-hidden="true"
      >
        {/* Soft halo behind the core */}
        <motion.circle
          cx={cx}
          cy={cy}
          r={coreBase * 1.5}
          fill={color}
          style={{ filter: `blur(${size * 0.06}px)` }}
          animate={{ opacity: 0.1 + grow * 0.14 }}
          transition={{ duration: 0.12 }}
        />

        {/* Concentric stroked rings — radius scales with amplitude, fade outward */}
        {rings.map((frac, i) => {
          const base = maxR * frac;
          const r = base * (1 + grow * 0.35);
          const ringOpacity = (0.5 - i * 0.14) * (active ? 1 : 0.45);
          return (
            <motion.circle
              key={i}
              cx={cx}
              cy={cy}
              r={base}
              fill="none"
              stroke={color}
              strokeWidth={2 - i * 0.4}
              initial={false}
              animate={{ r, opacity: ringOpacity }}
              transition={{ type: "spring", stiffness: 220, damping: 26 }}
            />
          );
        })}

        {/* Filled core */}
        <motion.circle
          cx={cx}
          cy={cy}
          r={coreR}
          fill={color}
          initial={false}
          animate={
            breathing
              ? { r: [coreR * 0.96, coreR * 1.06, coreR * 0.96], opacity: 0.9 }
              : { r: coreR, opacity: active ? 0.92 : 0.6 }
          }
          transition={
            breathing
              ? { duration: 3.4, repeat: Infinity, ease: "easeInOut" }
              : { type: "spring", stiffness: 240, damping: 24 }
          }
        />

        {/* Bright inner highlight for depth */}
        <motion.circle
          cx={cx}
          cy={cy}
          r={coreR * 0.34}
          fill="#ffffff"
          initial={false}
          animate={{ r: coreR * 0.34, opacity: 0.22 + grow * 0.1 }}
          transition={{ duration: 0.12 }}
        />
      </svg>
    </div>
  );
}
