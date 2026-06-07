// Procura logomark — a connected-node "A" inside a rounded hub.
// Geometry: three outer nodes (apex + two feet) form a triangular "A", joined by
// edges, with a central hub node and a crossbar — a compass / network motif.
// Brand blue (#2563eb) for the live edges + hub, ink (#0f172a) for the frame.

const BRAND = "#2563eb";
const INK = "#0f172a";

export default function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      role="img"
      aria-label="Procura"
      shapeRendering="geometricPrecision"
    >
      {/* rounded-square hub frame */}
      <rect
        x="2.25"
        y="2.25"
        width="27.5"
        height="27.5"
        rx="8"
        stroke={INK}
        strokeWidth="2"
      />

      {/* edges of the node-graph "A" */}
      <g stroke={BRAND} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {/* left leg: apex → bottom-left */}
        <path d="M16 8 L9.5 23.5" />
        {/* right leg: apex → bottom-right */}
        <path d="M16 8 L22.5 23.5" />
        {/* crossbar through the hub */}
        <path d="M11.3 18 L20.7 18" />
      </g>

      {/* nodes */}
      <g>
        {/* apex node */}
        <circle cx="16" cy="8" r="2.6" fill={BRAND} />
        {/* central hub node (filled, on ink for contrast) */}
        <circle cx="16" cy="18" r="3" fill="#ffffff" stroke={BRAND} strokeWidth="2" />
        {/* foot nodes */}
        <circle cx="9.5" cy="23.5" r="2.3" fill={INK} />
        <circle cx="22.5" cy="23.5" r="2.3" fill={INK} />
      </g>
    </svg>
  );
}

export function Wordmark({ size = 28 }: { size?: number }) {
  return (
    <span className="inline-flex items-center gap-2.5 select-none">
      <Logo size={size} />
      <span className="font-sans font-semibold text-ink tracking-tight text-[19px] leading-none">
        Procura
      </span>
    </span>
  );
}
