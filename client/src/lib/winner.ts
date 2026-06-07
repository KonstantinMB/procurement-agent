import type { Vendor } from "./events";

export function effectivePrice(v: Vendor): number | undefined {
  return v.negotiatedPrice ?? v.initialPrice;
}

/**
 * Pick the recommended supplier from the live table.
 * Tier 1: any vendor explicitly marked `status: "won"` by the agent.
 * Tier 2: cheapest eligible vendor (has a price AND meetsDeadline ≠ false).
 */
export function pickWinner(
  vendors: Record<string, Vendor>,
  order: string[],
): Vendor | undefined {
  const list = order.map((id) => vendors[id]).filter(Boolean) as Vendor[];
  const won = list.find((v) => v.status === "won");
  if (won) return won;
  const eligible = list.filter(
    (v) => effectivePrice(v) != null && v.meetsDeadline !== false,
  );
  if (eligible.length === 0) return undefined;
  return eligible.reduce((best, v) =>
    effectivePrice(v)! < effectivePrice(best)! ? v : best,
  );
}
