import type { Invoice, RfqRequest, Vendor } from "./events";

/**
 * Stable slug for vendor ids: lowercase, non-alphanumeric runs → "-", trimmed.
 * The SINGLE source of truth for ids — both id minting (add_supplier) and id
 * resolution (resolve) must go through this, or a row keyed one way won't be
 * found when looked up the other.
 */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Server-side mirror of ONE run's RFQ so endpoints can compute the winner,
 * savings, and the final invoice. One instance per run (see runs.ts). The
 * browser holds the authoritative UI state; this is just enough for
 * order/summary logic.
 */
export class RfqState {
  readonly runId: string;
  readonly createdAt: number;
  title: string;
  request: RfqRequest | undefined;
  vendors = new Map<string, Vendor>();
  ordered: { vendorId: string; invoice: Invoice } | undefined;
  done = false;

  constructor(runId = "", title = "New RFQ") {
    this.runId = runId;
    this.createdAt = Date.now();
    this.title = title;
  }

  setRequest(r: RfqRequest): void {
    this.request = r;
    if (r.item) this.title = r.item;
    else if (r.raw) this.title = r.raw.slice(0, 80);
  }
  upsertVendor(v: Vendor): void {
    this.vendors.set(v.id, v);
  }
  patchVendor(id: string, patch: Partial<Vendor>): void {
    const v = this.vendors.get(id);
    if (v) this.vendors.set(id, { ...v, ...patch });
  }
  get(id: string): Vendor | undefined {
    return this.vendors.get(id);
  }
  /**
   * Resolve the vendor an agent is referring to. The model routinely passes a
   * human name ("Siboni S.r.l.") or a guessed slug where the canonical id is
   * expected; try the exact id, then the slugified string, then a
   * case-insensitive name match. Returns undefined only when truly unknown.
   * This is what stops a call/quote from silently missing its row.
   */
  resolve(idOrName: string): Vendor | undefined {
    if (!idOrName) return undefined;
    const direct = this.vendors.get(idOrName);
    if (direct) return direct;
    const bySlug = this.vendors.get(slugify(idOrName));
    if (bySlug) return bySlug;
    const lower = idOrName.trim().toLowerCase();
    for (const v of this.vendors.values()) {
      if (v.name.toLowerCase() === lower) return v;
    }
    return undefined;
  }
  all(): Vendor[] {
    return [...this.vendors.values()];
  }

  private priceOf(v: Vendor): number | undefined {
    return v.negotiatedPrice ?? v.initialPrice;
  }

  bestVendor(): Vendor | undefined {
    const priced = this.all().filter((v) => this.priceOf(v) != null);
    const onTime = priced
      .filter((v) => v.meetsDeadline !== false)
      .sort((a, b) => this.priceOf(a)! - this.priceOf(b)!);
    if (onTime[0]) return onTime[0];
    return priced.sort((a, b) => this.priceOf(a)! - this.priceOf(b)!)[0];
  }

  computeSummary() {
    const priced = this.all().filter((v) => this.priceOf(v) != null);
    const best = this.bestVendor();
    const qty = this.request?.quantity ?? 1;
    const initials = priced.map((v) => v.initialPrice ?? this.priceOf(v)!);
    const highest = initials.length ? Math.max(...initials) : 0;
    const bestPrice = best ? this.priceOf(best)! : 0;
    const savings = best ? Math.max(0, Math.round((highest - bestPrice) * qty)) : 0;
    const target = this.request?.targetUnitPrice;
    const withinBudget = best && target != null ? bestPrice <= target : true;
    const currency = this.request?.currency ?? best?.currency ?? "EUR";
    return { quotes: priced.length, savings, currency, withinBudget, bestPrice, best, qty };
  }

  makeInvoice(vendorId?: string): Invoice | undefined {
    const v = vendorId ? this.resolve(vendorId) : this.bestVendor();
    if (!v) return undefined;
    const unit = v.negotiatedPrice ?? v.initialPrice ?? 0;
    const qty = this.request?.quantity ?? 1;
    return {
      poNumber: "PO-2026-" + Math.floor(1000 + Math.random() * 9000),
      vendorName: v.name,
      unitPrice: unit,
      quantity: qty,
      total: Math.round(unit * qty * 100) / 100,
      currency: v.currency ?? this.request?.currency ?? "EUR",
      leadTimeDays: v.leadTimeDays ?? 0,
      status: "paid",
      date: new Date().toISOString(),
    };
  }

  /** Coarse status used by the RFQ list page. */
  derivedStatus(): "researching" | "calling" | "quoted" | "ordered" | "done" {
    if (this.ordered) return "ordered";
    const list = this.all();
    if (list.some((v) => v.status === "calling" || v.status === "negotiating")) return "calling";
    if (list.some((v) => v.status === "won" || v.status === "quoted")) return "quoted";
    if (this.done) return "done";
    return "researching";
  }
}
