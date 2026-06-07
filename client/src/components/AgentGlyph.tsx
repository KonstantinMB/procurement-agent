import type { JSX } from "react";

// Inline stroke glyphs for agent capabilities. Color is inherited via
// stroke="currentColor", so callers tint with text-* utilities (e.g. text-call).
// 24×24 viewBox, strokeWidth 1.8, scaled to `size`. Reused by swarm nodes,
// activity cards and vendor source badges.

export type GlyphKind =
  | "web"
  | "call"
  | "email"
  | "quote"
  | "officer"
  | "think"
  | "order";

const PATHS: Record<GlyphKind, JSX.Element> = {
  // web — globe with a search magnifier
  web: (
    <>
      <circle cx="10.5" cy="10.5" r="6.75" />
      <path d="M3.75 10.5h13.5" />
      <path d="M10.5 3.75c2.1 2 3.15 4.35 3.15 6.75S12.6 15.25 10.5 17.25c-2.1-2-3.15-4.35-3.15-6.75S8.4 5.75 10.5 3.75Z" />
      <path d="m15.6 15.6 4.65 4.65" />
    </>
  ),
  // call — phone handset
  call: (
    <path d="M5.25 4.5h3l1.5 3.75-2.1 1.35a10.5 10.5 0 0 0 4.8 4.8l1.35-2.1 3.75 1.5v3a1.5 1.5 0 0 1-1.62 1.5C10.6 19.8 4.2 13.4 3.75 6.12A1.5 1.5 0 0 1 5.25 4.5Z" />
  ),
  // email — envelope
  email: (
    <>
      <rect x="3" y="5.25" width="18" height="13.5" rx="2.25" />
      <path d="m3.75 6.75 7.35 5.4a1.5 1.5 0 0 0 1.8 0l7.35-5.4" />
    </>
  ),
  // quote — price tag with a check
  quote: (
    <>
      <path d="M4.5 4.5h6.13a2 2 0 0 1 1.41.59l7.06 7.06a2 2 0 0 1 0 2.82l-4.13 4.13a2 2 0 0 1-2.82 0L5.09 12.04a2 2 0 0 1-.59-1.41V4.5Z" />
      <circle cx="8.25" cy="8.25" r="1.05" />
      <path d="m11.4 14.1 1.65 1.65 3.3-3.3" />
    </>
  ),
  // officer — central hub with radiating nodes (the Procura agent)
  officer: (
    <>
      <circle cx="12" cy="12" r="2.7" />
      <circle cx="12" cy="3.75" r="1.65" />
      <circle cx="19.14" cy="16.13" r="1.65" />
      <circle cx="4.86" cy="16.13" r="1.65" />
      <path d="M12 9.3V5.4" />
      <path d="m14.1 13.5 3.62 1.8" />
      <path d="m9.9 13.5-3.62 1.8" />
    </>
  ),
  // think — sparkle
  think: (
    <>
      <path d="M12 3.75c.45 3.6 1.65 4.8 5.25 5.25-3.6.45-4.8 1.65-5.25 5.25-.45-3.6-1.65-4.8-5.25-5.25 3.6-.45 4.8-1.65 5.25-5.25Z" />
      <path d="M17.25 14.25c.24 1.62.84 2.22 2.46 2.46-1.62.24-2.22.84-2.46 2.46-.24-1.62-.84-2.22-2.46-2.46 1.62-.24 2.22-.84 2.46-2.46Z" />
    </>
  ),
  // order — lightning bolt
  order: <path d="M13.5 3 5.25 13.5h6L10.5 21l8.25-10.5h-6L13.5 3Z" />,
};

export default function AgentGlyph({
  kind,
  size = 20,
  className,
}: {
  kind: GlyphKind;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[kind]}
    </svg>
  );
}
