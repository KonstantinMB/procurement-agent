import { bus } from "./bus";
import { rfqs } from "./state";
import type { Invoice, RfqRequest, Vendor } from "./events";

// ─────────────────────────────────────────────────────────────────────────
// RFQ email. Sends a real Gmail message when GMAIL_USER + GMAIL_APP_PASSWORD
// are present; otherwise it just simulates. Either way it always drives the
// event stream so the demo works fully offline: vendor → "emailing", then a
// simulated inbound reply ~5s later → "quoted". Nothing here may throw.
// ─────────────────────────────────────────────────────────────────────────

export interface EmailArgs {
  runId: string;
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
function simulatedQuote(runId: string, vendorId: string): SimQuote {
  if (vendorId === "acme") {
    return { unitPrice: 61, leadTimeDays: 6, meetsDeadline: true };
  }
  if (vendorId === "shenzhen") {
    return { unitPrice: 54, leadTimeDays: 21, meetsDeadline: false };
  }
  const target = rfqs.get(runId)?.request?.targetUnitPrice ?? 60;
  const unitPrice = Math.round((target + (Math.random() * 4 - 2)) * 100) / 100;
  return { unitPrice, leadTimeDays: 7, meetsDeadline: true };
}

export async function sendRfqEmail(args: EmailArgs): Promise<void> {
  const runId = args.runId;
  // 1) Mark the email as sent + flip the vendor to "emailing".
  bus.emit(runId, {
    type: "email.sent",
    vendorId: args.vendorId,
    to: args.to,
    subject: args.subject,
    body: args.body,
    at: Date.now(),
  });
  const r = rfqs.get(runId);
  if (r) r.patchVendor(args.vendorId, { status: "emailing" });
  bus.emit(runId, {
    type: "rfq.supplier_updated",
    id: args.vendorId,
    patch: { status: "emailing" },
  });

  // 2) Best-effort real send via Gmail. Failures are swallowed by design.
  if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) {
    try {
      const nodemailer = await import("nodemailer");
      const t = nodemailer.createTransport({
        service: "gmail",
        auth: {
          user: process.env.GMAIL_USER,
          pass: process.env.GMAIL_APP_PASSWORD,
        },
      });
      await t.sendMail({
        from: process.env.GMAIL_USER,
        to: args.to,
        subject: args.subject,
        text: args.body,
      });
    } catch {
      /* offline / bad creds — the simulated reply below still drives the demo */
    }
  }

  // 3) Only fabricate an inbound reply when Gmail is NOT configured (dev/offline).
  if (!(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD)) {
    const vendorId = args.vendorId;
    const from = args.to;
    setTimeout(() => {
      try {
        const { unitPrice, leadTimeDays, meetsDeadline } = simulatedQuote(runId, vendorId);
        const r2 = rfqs.get(runId);
        const vendorName = r2?.get(vendorId)?.name ?? "Supplier";
        const cur = r2?.request?.currency ?? "EUR";
        const replySubject = `Re: ${args.subject}`;
        const replyBody = [
          `Hello,`,
          ``,
          `Thank you for your enquiry. Based on the volume you mentioned we can offer ${unitPrice} ${cur} per unit, delivered in approximately ${leadTimeDays} business days.`,
          ``,
          `This price assumes confirmation within the next 5 business days and payment on Net 30 terms. Let us know if you'd like to proceed or discuss further.`,
          ``,
          `Best regards,`,
          `${vendorName} Sales`,
        ].join("\n");

        bus.emit(runId, {
          type: "email.reply",
          vendorId,
          from,
          subject: replySubject,
          body: replyBody,
          unitPrice,
          leadTimeDays,
          at: Date.now(),
        });
        const patch = {
          status: "quoted" as const,
          initialPrice: unitPrice,
          negotiatedPrice: unitPrice,
          leadTimeDays,
          meetsDeadline,
        };
        if (r2) r2.patchVendor(vendorId, patch);
        bus.emit(runId, { type: "rfq.supplier_updated", id: vendorId, patch });
      } catch {
        /* never let a timer crash the process */
      }
    }, 5000);
  }
}

// ─────────────────────────────────────────────────────────────────────────
// PURCHASE ORDER email via Resend.
// Fires when the human clicks Order on a row. In demo mode
// (DEMO_DIAL_FALLBACK=true) the PO is sent to BUYER_EMAIL instead of the real
// supplier so you can show the inbox at the pitch without bothering anyone.
// ─────────────────────────────────────────────────────────────────────────

interface SendPOArgs {
  vendor: Vendor;
  invoice: Invoice;
  request?: RfqRequest;
}

function envFlag(name: string): boolean {
  const v = process.env[name];
  return !!v && /^(1|true|yes|on)$/i.test(v.trim());
}

function fmtMoney(n: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-DE", { style: "currency", currency }).format(n);
  } catch {
    return `${n.toFixed(2)} ${currency}`;
  }
}

function buildPoText(a: SendPOArgs): string {
  const { vendor, invoice, request } = a;
  const item = request?.item ?? "—";
  const lead = `${invoice.leadTimeDays} day${invoice.leadTimeDays === 1 ? "" : "s"}`;
  return [
    `PURCHASE ORDER ${invoice.poNumber}`,
    `Date: ${new Date(invoice.date).toLocaleDateString("en-GB")}`,
    ``,
    `Supplier: ${vendor.name}${vendor.location ? ` (${vendor.location})` : ""}`,
    `Buyer:    Procura — AI Procurement Officer`,
    ``,
    `Item:          ${item}`,
    `Quantity:      ${invoice.quantity}`,
    `Unit price:    ${fmtMoney(invoice.unitPrice, invoice.currency)}`,
    `Total:         ${fmtMoney(invoice.total, invoice.currency)}`,
    `Delivery:      ${lead} from order date`,
    `Payment terms: Net 30 from invoice receipt`,
    ``,
    vendor.note ? `Notes: ${vendor.note}` : "",
    ``,
    `This PO was generated from a negotiated price agreed via Procura's AI procurement workflow.`,
    `Please confirm by replying to this email or sending an order acknowledgement.`,
  ]
    .filter(Boolean)
    .join("\n");
}

function buildPoHtml(a: SendPOArgs): string {
  const { vendor, invoice, request } = a;
  const item = request?.item ?? "—";
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
          <div style="margin-top:4px;font-weight:600;color:#0f172a">${vendor.name}</div>
          ${vendor.location ? `<div style="color:#64748b;font-size:13px">${vendor.location}</div>` : ""}
          ${vendor.contact?.email ? `<div style="color:#64748b;font-size:13px">${vendor.contact.email}</div>` : ""}
          ${vendor.contact?.phone ? `<div style="color:#64748b;font-size:13px">${vendor.contact.phone}</div>` : ""}
        </div>
      </div>
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-top:1px solid #e5e7eb;margin-top:8px">
        ${row("Item", item)}
        ${row("Quantity", String(invoice.quantity))}
        ${row("Unit price", fmtMoney(invoice.unitPrice, invoice.currency))}
        ${row("Total", `<strong>${fmtMoney(invoice.total, invoice.currency)}</strong>`)}
        ${row("Delivery", `${lead} from order date`)}
        ${row("Payment terms", "Net 30 from invoice receipt")}
      </table>
      ${
        vendor.note
          ? `<div style="margin-top:16px;padding:12px;background:#f1f5f9;border-radius:8px;color:#0f172a;font-size:13px"><strong>Notes:</strong> ${vendor.note}</div>`
          : ""
      }
      <div style="margin-top:20px;padding-top:16px;border-top:1px solid #e5e7eb;color:#94a3b8;font-size:12px">
        This Purchase Order was generated from a price negotiated via Procura's autonomous procurement workflow. Please confirm by replying to this email or sending an order acknowledgement.
      </div>
    </td></tr>
  </table>
</body></html>`;
}

export async function sendPurchaseOrder(
  args: SendPOArgs,
): Promise<{ ok: boolean; messageId?: string; recipient?: string; error?: string }> {
  if (!process.env.RESEND_API_KEY) {
    // eslint-disable-next-line no-console
    console.warn("[po] RESEND_API_KEY not set — skipping PO email.");
    return { ok: false, error: "RESEND_API_KEY not set" };
  }

  const supplierEmail = args.vendor.contact?.email;
  const buyerEmail = process.env.BUYER_EMAIL;
  const demoMode = envFlag("DEMO_DIAL_FALLBACK");

  // Demo: always send to YOUR inbox (BUYER_EMAIL) — safe + showable on stage.
  // Production: send to supplier, CC the buyer.
  const to = demoMode ? buyerEmail ?? supplierEmail : supplierEmail ?? buyerEmail;
  const cc =
    !demoMode && buyerEmail && buyerEmail !== to ? [buyerEmail] : undefined;

  if (!to) {
    // eslint-disable-next-line no-console
    console.warn(
      `[po] No recipient — supplier has no email${buyerEmail ? "" : " and BUYER_EMAIL is unset"}.`,
    );
    return { ok: false, error: "no recipient" };
  }

  const from = process.env.RESEND_FROM_EMAIL ?? "Procura <onboarding@resend.dev>";
  const subject = `Purchase Order ${args.invoice.poNumber} — ${args.request?.item ?? "Procurement"}`;
  const html = buildPoHtml(args);
  const text = buildPoText(args);

  try {
    const { Resend } = await import("resend");
    const client = new Resend(process.env.RESEND_API_KEY);
    const result = await client.emails.send({
      from,
      to,
      ...(cc ? { cc } : {}),
      subject,
      html,
      text,
    });
    if ((result as any).error) {
      // eslint-disable-next-line no-console
      console.error("[po] Resend error:", (result as any).error);
      return { ok: false, error: String((result as any).error?.message ?? (result as any).error), recipient: to };
    }
    const id = (result as any).data?.id;
    // eslint-disable-next-line no-console
    console.log(
      `[po] PO ${args.invoice.poNumber} → ${to}${cc ? ` (cc: ${cc.join(",")})` : ""} · id=${id ?? "n/a"} · demoMode=${demoMode}`,
    );
    return { ok: true, messageId: id, recipient: to };
  } catch (e: any) {
    // eslint-disable-next-line no-console
    console.error("[po] Resend exception:", e?.message ?? e);
    return { ok: false, error: String(e?.message ?? e), recipient: to };
  }
}
