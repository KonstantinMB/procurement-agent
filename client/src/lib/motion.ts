import { useEffect, useRef, useState } from "react";

// ─── Spring presets — near-critically-damped, never bouncy ────────────────
export const SPRING = { type: "spring", stiffness: 300, damping: 30 } as const;
export const SPRING_SNAPPY = { type: "spring", stiffness: 380, damping: 30 } as const;
export const SPRING_SOFT = { type: "spring", stiffness: 120, damping: 22 } as const;

// Card / list-item enter+exit (RFQ board, activity panel)
export const cardVariants = {
  initial: { opacity: 0, y: 24, scale: 0.97 },
  animate: { opacity: 1, y: 0, scale: 1, transition: SPRING_SNAPPY },
  exit: { opacity: 0, scale: 0.96, transition: { duration: 0.18 } },
};

export const fadeUp = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: SPRING },
  exit: { opacity: 0, y: -6, transition: { duration: 0.15 } },
};

// ─── Fake voice amplitude (0..1) — no real audio, driven by who's speaking ─
function smoothNoise(table: number[], x: number): number {
  const i = Math.floor(x);
  const f = x - i;
  const a = table[i & 255]!;
  const b = table[(i + 1) & 255]!;
  const t = f * f * (3 - 2 * f); // smoothstep
  return a + (b - a) * t;
}

/**
 * Believable speaking amplitude with fast attack / slow decay and idle
 * micro-motion. Feed the returned value into the VoiceOrb.
 */
export function useFakeAmplitude(active: boolean, speaking: boolean): number {
  const [amp, setAmp] = useState(0);
  const raf = useRef(0);
  const tRef = useRef(0);
  const valRef = useRef(0);
  const tableRef = useRef<number[]>([]);
  if (tableRef.current.length === 0) {
    tableRef.current = Array.from({ length: 256 }, () => Math.random());
  }

  useEffect(() => {
    if (!active) {
      setAmp(0);
      valRef.current = 0;
      return;
    }
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      tRef.current += dt;
      const target = speaking
        ? 0.35 + 0.65 * smoothNoise(tableRef.current, tRef.current * 11)
        : 0.05 + 0.07 * smoothNoise(tableRef.current, tRef.current * 2);
      const rate = target > valRef.current ? dt / 0.04 : dt / 0.18; // attack / decay
      valRef.current += (target - valRef.current) * Math.min(1, rate);
      setAmp(valRef.current);
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [active, speaking]);

  return amp;
}

// ─── Currency formatting helper for data cells ────────────────────────────
export function formatMoney(value: number, currency = "EUR"): string {
  try {
    return new Intl.NumberFormat("de-DE", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currency}`;
  }
}
