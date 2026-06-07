import type { Invoice, RfqRequest, Vendor } from "./events";

/**
 * Server-side mirror of the RFQ so endpoints can compute the winner, savings,
 * and the final invoice. The browser holds the authoritative UI state; this is
 * just enough for order/summary logic.
 */
class RfqState {
  request: RfqRequest | undefined;
  vendors = new Map<string, Vendor>();

  setRequest(r: RfqRequest): void {
    this.request = r;
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
  all(): Vendor[] {
    return [...this.vendors.values()];
  }
  reset(): void {
    this.request = undefined;
    this.vendors.clear();
  }

  private priceOf(v: Vendor): number | undefined {
    return v.negotiatedPrice ?? v.initialPrice;
  }

  /** Cheapest vendor that still meets the deadline (falls back to cheapest). */
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
    const v = vendorId ? this.get(vendorId) : this.bestVendor();
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
}

export const rfq = new RfqState();
