import { bus } from "./bus";
import { rfq } from "./state";

// ─────────────────────────────────────────────────────────────────────────
// RFQ email. Sends a real Gmail message when GMAIL_USER + GMAIL_APP_PASSWORD
// are present; otherwise it just simulates. Either way it always drives the
// event stream so the demo works fully offline: vendor → "emailing", then a
// simulated inbound reply ~5s later → "quoted". Nothing here may throw.
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
function simulatedQuote(vendorId: string): SimQuote {
  if (vendorId === "acme") {
    return { unitPrice: 61, leadTimeDays: 6, meetsDeadline: true };
  }
  if (vendorId === "shenzhen") {
    return { unitPrice: 54, leadTimeDays: 21, meetsDeadline: false };
  }
  const target = rfq.request?.targetUnitPrice ?? 60;
  const unitPrice = Math.round((target + (Math.random() * 4 - 2)) * 100) / 100;
  return { unitPrice, leadTimeDays: 7, meetsDeadline: true };
}

export async function sendRfqEmail(args: EmailArgs): Promise<void> {
  // 1) Mark the email as sent + flip the vendor to "emailing".
  bus.emit({
    type: "email.sent",
    vendorId: args.vendorId,
    to: args.to,
    subject: args.subject,
  });
  rfq.patchVendor(args.vendorId, { status: "emailing" });
  bus.emit({
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
  //    With real email sending, prices come from real replies or the live calls.
  if (!(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD)) {
    const vendorId = args.vendorId;
    const from = args.to;
    setTimeout(() => {
      try {
        const { unitPrice, leadTimeDays, meetsDeadline } = simulatedQuote(vendorId);
        bus.emit({ type: "email.reply", vendorId, from, unitPrice, leadTimeDays });
        const patch = {
          status: "quoted" as const,
          initialPrice: unitPrice,
          negotiatedPrice: unitPrice,
          leadTimeDays,
          meetsDeadline,
        };
        rfq.patchVendor(vendorId, patch);
        bus.emit({ type: "rfq.supplier_updated", id: vendorId, patch });
      } catch {
        /* never let a timer crash the process */
      }
    }, 5000);
  }
}
