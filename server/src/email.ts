import { MOCK_SUPPLIER_ID } from "./mock-supplier";
import type { Invoice } from "./events";
import type { RunBinding } from "./voice";

// ─────────────────────────────────────────────────────────────────────────
// RFQ + order email. Sends a real message via Resend (preferred) then Gmail when
// configured; otherwise it simulates. `sendRfqEmail` is RUN-AWARE (drives the
// owning run's stream via a RunBinding) so the demo works fully offline: vendor →
// "emailing", then a simulated inbound reply ~5s later → "quoted". Nothing throws.
// ─────────────────────────────────────────────────────────────────────────

export interface EmailArgs {
  vendorId: string;
  to: string;
  subject: string;
  body: string;
}

interface SimQuote {
  unitPrice: number;
  leadTimeDays: number;
  meetsDeadline: boolean;
}

/** Plausible inbound quote for a vendor, for demo realism. */
function simulatedQuote(b: RunBinding): SimQuote {
  const target = b.state.request?.targetUnitPrice ?? 60;
  const unitPrice = Math.round((target + (Math.random() * 4 - 2)) * 100) / 100;
  return { unitPrice, leadTimeDays: 7, meetsDeadline: true };
}

/**
 * Deliver one email via Resend (preferred — verified domain → any recipient),
 * falling back to Gmail. Returns true only if a real send succeeded; on no
 * credentials or any failure it returns false so callers can decide what to do
 * offline. Never throws.
 */
async function deliverEmail(to: string, subject: string, text: string): Promise<boolean> {
  if (process.env.RESEND_API_KEY) {
    try {
      const from = process.env.RESEND_FROM || "Procura <procura@vilichki.com>";
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ from, to, subject, text }),
      });
      if (res.ok) return true;
    } catch {
      /* fall through to Gmail */
    }
  }

  if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) {
    try {
      const nodemailer = await import("nodemailer");
      const t = nodemailer.createTransport({
        service: "gmail",
        auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
      });
      await t.sendMail({ from: process.env.GMAIL_USER, to, subject, text });
      return true;
    } catch {
      /* offline / bad creds */
    }
  }

  return false;
}

export async function sendRfqEmail(args: EmailArgs, b: RunBinding): Promise<void> {
  // The mock supplier is a controlled, owned inbox — mail it directly so the
  // demo's email negotiation actually reaches the person playing the supplier.
  // Real web-scraped suppliers are routed to the safe catch-all inbox instead
  // (when configured) so we never cold-email a business we found online.
  const to =
    args.vendorId === MOCK_SUPPLIER_ID ? args.to : process.env.DEMO_SUPPLIER_INBOX || args.to;

  // 1) Mark the email as sent + flip the vendor to "emailing".
  b.emit({ type: "email.sent", vendorId: args.vendorId, to, subject: args.subject });
  b.state.patchVendor(args.vendorId, { status: "emailing" });
  b.emit({
    type: "rfq.supplier_updated",
    id: args.vendorId,
    patch: { status: "emailing" },
  });

  // 2) Real send via Resend, then Gmail.
  const realSent = await deliverEmail(to, args.subject, args.body || args.subject);

  // 3) Only fabricate an inbound reply when NOTHING real was sent (pure offline
  //    dev). With a real send the quote comes from a real reply or the live call.
  if (!realSent) {
    const vendorId = args.vendorId;
    setTimeout(() => {
      try {
        const { unitPrice, leadTimeDays, meetsDeadline } = simulatedQuote(b);
        b.emit({ type: "email.reply", vendorId, from: to, unitPrice, leadTimeDays });
        const patch = {
          status: "quoted" as const,
          initialPrice: unitPrice,
          negotiatedPrice: unitPrice,
          leadTimeDays,
          meetsDeadline,
        };
        b.state.patchVendor(vendorId, patch);
        b.emit({ type: "rfq.supplier_updated", id: vendorId, patch });
      } catch {
        /* never let a timer crash the process */
      }
    }, 5000);
  }
}

export interface OrderEmailArgs {
  to: string;
  invoice: Invoice;
  item?: string;
  deadline?: string;
  /** Winner's vendor id — lets the mock supplier's PO reach its real inbox. */
  vendorId?: string;
}

/**
 * Send the purchase-order confirmation to the winning supplier when the buyer
 * clicks "Order Now". Routes to the controlled demo inbox when configured (same
 * safety as RFQs — never cold-mail a web-scraped business). Fire-and-forget:
 * returns whether a real send happened, and never throws.
 */
export async function sendOrderEmail(args: OrderEmailArgs): Promise<boolean> {
  // Same routing as RFQs: the mock supplier's PO goes to its real owned inbox;
  // every other (web-scraped) winner is routed to the safe catch-all when set.
  const to =
    args.vendorId === MOCK_SUPPLIER_ID ? args.to : process.env.DEMO_SUPPLIER_INBOX || args.to;
  const { invoice, item, deadline } = args;
  const money = (n: number) => `${n.toFixed(2)} ${invoice.currency}`;

  const body = [
    `Hello ${invoice.vendorName},`,
    ``,
    `Please find our purchase order below, confirming the order on the agreed terms.`,
    ``,
    `PO Number:   ${invoice.poNumber}`,
    `Item:        ${item ?? "as quoted"}`,
    `Quantity:    ${invoice.quantity}`,
    `Unit price:  ${money(invoice.unitPrice)}`,
    `Order total: ${money(invoice.total)}`,
    `Lead time:   ${invoice.leadTimeDays} days`,
    ...(deadline ? [`Required by: ${deadline}`] : []),
    ``,
    `Please confirm receipt and the delivery date. Thank you for your partnership.`,
    ``,
    `— Procura, on behalf of the buyer`,
  ].join("\n");

  const subject = `Purchase Order ${invoice.poNumber} — ${invoice.quantity} × ${item ?? "units"}`;
  return deliverEmail(to, subject, body);
}
