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
function simulatedQuote(b: RunBinding, vendorId: string): SimQuote {
  // A couple of seeded web-scraped suppliers quote deterministically so the
  // board tells a consistent story offline; everyone else jitters around target.
  if (vendorId === "acme") {
    return { unitPrice: 61, leadTimeDays: 6, meetsDeadline: true };
  }
  if (vendorId === "shenzhen") {
    return { unitPrice: 54, leadTimeDays: 21, meetsDeadline: false };
  }
  const target = b.state.request?.targetUnitPrice ?? 60;
  const unitPrice = Math.round((target + (Math.random() * 4 - 2)) * 100) / 100;
  return { unitPrice, leadTimeDays: 7, meetsDeadline: true };
}

function fmtMoney(n: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-DE", { style: "currency", currency }).format(n);
  } catch {
    return `${n.toFixed(2)} ${currency}`;
  }
}

/**
 * Deliver one email via Resend (preferred — verified domain → any recipient),
 * falling back to Gmail. Returns true only if a real send succeeded; on no
 * credentials or any failure it returns false so callers can decide what to do
 * offline. Never throws. Optionally carries an HTML alternative for rich PO mail.
 */
async function deliverEmail(
  to: string,
  subject: string,
  text: string,
  html?: string,
): Promise<boolean> {
  if (process.env.RESEND_API_KEY) {
    try {
      const from = process.env.RESEND_FROM || "Procura <procura@vilichki.com>";
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ from, to, subject, text, ...(html ? { html } : {}) }),
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
      await t.sendMail({
        from: process.env.GMAIL_USER,
        to,
        subject,
        text,
        ...(html ? { html } : {}),
      });
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
        const { unitPrice, leadTimeDays, meetsDeadline } = simulatedQuote(b, vendorId);
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

// ─────────────────────────────────────────────────────────────────────────
// PURCHASE ORDER email. Built from the negotiated invoice when the buyer clicks
// "Order Now". A styled HTML body (with plain-text alternative) is delivered via
// the same Resend→Gmail path as RFQs, with the same demo-inbox routing so we
// never cold-mail a web-scraped business.
// ─────────────────────────────────────────────────────────────────────────

function buildPoText(args: OrderEmailArgs): string {
  const { invoice, item, deadline } = args;
  const lead = `${invoice.leadTimeDays} day${invoice.leadTimeDays === 1 ? "" : "s"}`;
  return [
    `PURCHASE ORDER ${invoice.poNumber}`,
    `Date: ${new Date(invoice.date).toLocaleDateString("en-GB")}`,
    ``,
    `Supplier: ${invoice.vendorName}`,
    `Buyer:    Procura — AI Procurement Officer`,
    ``,
    `Item:          ${item ?? "as quoted"}`,
    `Quantity:      ${invoice.quantity}`,
    `Unit price:    ${fmtMoney(invoice.unitPrice, invoice.currency)}`,
    `Total:         ${fmtMoney(invoice.total, invoice.currency)}`,
    `Delivery:      ${lead} from order date`,
    `Payment terms: Net 30 from invoice receipt`,
    ...(deadline ? [`Required by:   ${deadline}`] : []),
    ``,
    `This PO was generated from a negotiated price agreed via Procura's AI procurement workflow.`,
    `Please confirm by replying to this email or sending an order acknowledgement.`,
  ]
    .filter(Boolean)
    .join("\n");
}

function buildPoHtml(args: OrderEmailArgs): string {
  const { invoice, item, deadline } = args;
  const lead = `${invoice.leadTimeDays} day${invoice.leadTimeDays === 1 ? "" : "s"}`;
  const row = (k: string, v: string) =>
    `<tr><td style="padding:8px 0;color:#64748b;width:160px">${k}</td><td style="padding:8px 0;color:#0f172a;font-weight:500">${v}</td></tr>`;
  return `<!doctype html>
<html><body style="margin:0;font-family:ui-sans-serif,system-ui,-apple-system,Helvetica,Arial,sans-serif;background:#f7f8fa;padding:24px;color:#0f172a">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden">
    <tr><td style="padding:24px 28px;border-bottom:1px solid #e5e7eb;background:#fff">
      <div style="font-family:ui-monospace,'SF Mono',monospace;font-size:11px;letter-spacing:0.12em;color:#94a3b8;text-transform:uppercase">Purchase Order</div>
      <div style="margin-top:4px;font-size:22px;font-weight:600;color:#0f172a">${invoice.poNumber}</div>
      <div style="margin-top:2px;font-size:13px;color:#64748b">Issued ${new Date(invoice.date).toLocaleDateString("en-GB")}</div>
    </td></tr>
    <tr><td style="padding:24px 28px">
      <div style="display:flex;gap:24px;margin-bottom:16px">
        <div>
          <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.08em">Supplier</div>
          <div style="margin-top:4px;font-weight:600;color:#0f172a">${invoice.vendorName}</div>
        </div>
      </div>
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-top:1px solid #e5e7eb;margin-top:8px">
        ${row("Item", item ?? "as quoted")}
        ${row("Quantity", String(invoice.quantity))}
        ${row("Unit price", fmtMoney(invoice.unitPrice, invoice.currency))}
        ${row("Total", `<strong>${fmtMoney(invoice.total, invoice.currency)}</strong>`)}
        ${row("Delivery", `${lead} from order date`)}
        ${row("Payment terms", "Net 30 from invoice receipt")}
        ${deadline ? row("Required by", deadline) : ""}
      </table>
      <div style="margin-top:20px;padding-top:16px;border-top:1px solid #e5e7eb;color:#94a3b8;font-size:12px">
        This Purchase Order was generated from a price negotiated via Procura's autonomous procurement workflow. Please confirm by replying to this email or sending an order acknowledgement.
      </div>
    </td></tr>
  </table>
</body></html>`;
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
  const { invoice, item } = args;

  const subject = `Purchase Order ${invoice.poNumber} — ${invoice.quantity} × ${item ?? "units"}`;
  const text = buildPoText(args);
  const html = buildPoHtml(args);
  return deliverEmail(to, subject, text, html);
}
