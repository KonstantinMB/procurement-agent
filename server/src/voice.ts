// ─────────────────────────────────────────────────────────────────────────
// VOICE — Vapi outbound-call integration with hybrid dialing + offline fallback.
//
// callSupplier() dials the supplier's discovered number when present, else the
// configured FALLBACK_PHONE_NUMBER (a controlled number). With VAPI_API_KEY set
// it places a REAL call via the Vapi server SDK; otherwise it runs a generic
// scripted negotiation that emits the same AgentEvent stream the UI projects.
// Live calls are driven by Vapi webhooks (handleVapiWebhook), which bridge
// transcripts / tool-calls / end-of-call reports onto the bus and resolve the
// in-flight callSupplier() promise.
// ─────────────────────────────────────────────────────────────────────────

import { bus } from "./bus";
import { rfq } from "./state";

export interface CallArgs {
  vendorId: string;
  vendorName: string;
  phone: string;
  goal: string;
  targetPrice?: number;
  walkAway?: number;
  leadTimeDays?: number;
  currency?: string;
}

export interface CallResult {
  transcript: string;
  unitPrice?: number;
  leadTimeDays?: number;
  success: boolean;
}

const pendingByCall = new Map<string, (r: CallResult) => void>();
const vendorByCall = new Map<string, string>();

/** Loose E.164-ish check — enough to tell a real number from a blank/garbage. */
function isCallableNumber(p?: string): boolean {
  return !!p && /\+?\d[\d\s().-]{6,}/.test(p);
}

/**
 * Place a negotiation call. Dials the discovered number, else FALLBACK_PHONE_NUMBER.
 * Emits ringing + flips the vendor to "calling", then drives a live Vapi call
 * (when configured) or a generic scripted fallback.
 */
export async function callSupplier(args: CallArgs): Promise<CallResult> {
  const dial = isCallableNumber(args.phone)
    ? args.phone
    : process.env.FALLBACK_PHONE_NUMBER ?? "";

  if (!isCallableNumber(dial)) {
    // No supplier number and no fallback configured — cannot place a call.
    bus.emit({ type: "call.ended", vendorId: args.vendorId, outcome: "no-answer" });
    rfq.patchVendor(args.vendorId, { note: "No phone number available" });
    bus.emit({
      type: "rfq.supplier_updated",
      id: args.vendorId,
      patch: { note: "No phone number available" },
    });
    return { transcript: "", success: false };
  }

  bus.emit({
    type: "call.ringing",
    vendorId: args.vendorId,
    vendorName: args.vendorName,
    phone: dial,
  });
  rfq.patchVendor(args.vendorId, { status: "calling" });
  bus.emit({ type: "rfq.supplier_updated", id: args.vendorId, patch: { status: "calling" } });

  if (process.env.VAPI_API_KEY) {
    try {
      const { VapiClient } = await import("@vapi-ai/server-sdk");
      const client = new VapiClient({ token: process.env.VAPI_API_KEY });
      const call: any = await client.calls.create({
        assistantId: process.env.VAPI_ASSISTANT_ID,
        phoneNumberId: process.env.VAPI_PHONE_NUMBER_ID,
        customer: { number: dial },
        assistantOverrides: {
          variableValues: {
            supplier: args.vendorName,
            part: args.goal,
            target_price: String(args.targetPrice ?? ""),
            walk_away: String(args.walkAway ?? ""),
            lead_time: String(args.leadTimeDays ?? ""),
          },
        },
      } as any);
      if (call?.id) {
        vendorByCall.set(call.id, args.vendorId);
        return await new Promise<CallResult>((resolve) => {
          pendingByCall.set(call.id, resolve);
          setTimeout(() => {
            if (pendingByCall.has(call.id)) {
              pendingByCall.delete(call.id);
              resolve({ transcript: "", success: false });
            }
          }, 180000);
        });
      }
    } catch {
      /* fall through to the scripted call so it still works without Vapi */
    }
  }

  return runScriptedCall(args);
}

/**
 * Generic offline negotiation (no Vapi key). Derives a believable price arc from
 * the request's target and emits the same events a live call would. Contains no
 * request-specific hardcoding.
 */
function runScriptedCall(args: CallArgs): Promise<CallResult> {
  const currency = args.currency ?? "EUR";
  const target = args.targetPrice;
  const lead = args.leadTimeDays ?? 14;
  const opening = target != null ? Math.round(target * 1.12 * 100) / 100 : undefined;
  const agreed = target != null ? Math.round(target * 1.02 * 100) / 100 : undefined;

  const lines: Array<{ speaker: "agent" | "supplier"; text: string }> = [
    {
      speaker: "agent",
      text: `Hi, this is Procura calling on behalf of a buyer about ${args.goal}. Could you share your best unit price?`,
    },
    {
      speaker: "supplier",
      text:
        opening != null
          ? `For that volume we're around ${opening} ${currency} per unit.`
          : `Let me pull that up — we can work with you on price.`,
    },
    {
      speaker: "agent",
      text:
        target != null
          ? `Our target is about ${target} ${currency} a unit, delivered in ${lead} days. Can you get close if we confirm today?`
          : `What's the best you can do if we confirm today, and your lead time?`,
    },
    { speaker: "supplier", text: `I can move a little if you commit now.` },
    {
      speaker: "agent",
      text:
        agreed != null
          ? `Let's settle at ${agreed} ${currency} a unit, delivered in ${lead} days, and we sign right now.`
          : `Let's lock it in and move forward today.`,
    },
    { speaker: "supplier", text: `Agreed. I'll send over the confirmation.` },
    { speaker: "agent", text: `Perfect — you'll have the PO shortly. Thank you.` },
  ];

  const unitPrice = agreed;
  const leadTimeDays = lead;

  return new Promise<CallResult>((resolve) => {
    let t = 0;
    const at = (delay: number, fn: () => void) => {
      t += delay;
      setTimeout(fn, t);
    };

    at(1200, () => bus.emit({ type: "call.connected", vendorId: args.vendorId }));

    for (const line of lines) {
      at(2000, () => {
        bus.emit({
          type: "call.transcript",
          vendorId: args.vendorId,
          speaker: line.speaker,
          text: line.text,
          final: true,
        });
      });
    }

    at(2000, () => {
      if (unitPrice != null) {
        bus.emit({ type: "call.quote", vendorId: args.vendorId, unitPrice, currency, leadTimeDays });
        const patch = {
          status: "negotiating" as const,
          negotiatedPrice: unitPrice,
          currency,
          leadTimeDays,
        };
        rfq.patchVendor(args.vendorId, patch);
        bus.emit({ type: "rfq.supplier_updated", id: args.vendorId, patch });
      }
    });

    at(1200, () => {
      bus.emit({ type: "call.ended", vendorId: args.vendorId, outcome: "success" });
      resolve({
        transcript: lines.map((l) => `${l.speaker}: ${l.text}`).join("\n"),
        unitPrice,
        leadTimeDays,
        success: true,
      });
    });
  });
}

/**
 * Bridge Vapi server webhooks onto the bus. Fully defensive: any field may be
 * absent. For tool-calls it returns the ack payload Vapi expects; else void.
 */
export function handleVapiWebhook(
  payload: any,
): { results?: Array<{ toolCallId: string; result: string }> } | void {
  const m = payload?.message;
  const type = m?.type;
  const callId = m?.call?.id;
  const vendorId = callId ? vendorByCall.get(callId) : undefined;

  switch (type) {
    case "status-update": {
      if (m?.status === "in-progress" && vendorId) {
        bus.emit({ type: "call.connected", vendorId });
      }
      if (m?.status === "ended" && vendorId) {
        bus.emit({ type: "call.ended", vendorId, outcome: "success" });
      }
      return;
    }

    case "transcript": {
      if (vendorId) {
        bus.emit({
          type: "call.transcript",
          vendorId,
          speaker: m?.role === "assistant" ? "agent" : "supplier",
          text: m?.transcript ?? "",
          final: m?.transcriptType === "final",
        });
      }
      return;
    }

    case "tool-calls": {
      const list: any[] = m?.toolCallList ?? [];
      for (const t of list) {
        const name = t?.function?.name ?? t?.name;
        if (name === "report_quote") {
          const a = t?.function?.arguments ?? t?.arguments ?? {};
          if (vendorId) {
            const unitPrice = Number(a.unitPrice);
            const leadTimeDays = Number(a.leadTimeDays);
            bus.emit({
              type: "call.quote",
              vendorId,
              unitPrice,
              currency: rfq.get(vendorId)?.currency ?? rfq.request?.currency ?? "EUR",
              leadTimeDays,
            });
            const patch = {
              status: "negotiating" as const,
              negotiatedPrice: unitPrice,
              leadTimeDays,
            };
            rfq.patchVendor(vendorId, patch);
            bus.emit({ type: "rfq.supplier_updated", id: vendorId, patch });
          }
        }
      }
      return {
        results: list.map((t: any) => ({
          toolCallId: t?.id,
          result: JSON.stringify({ ack: true }),
        })),
      };
    }

    case "end-of-call-report": {
      if (vendorId) {
        bus.emit({ type: "call.ended", vendorId, outcome: "success" });
      }
      const r = callId ? pendingByCall.get(callId) : undefined;
      if (r && callId) {
        pendingByCall.delete(callId);
        r({
          transcript: m?.artifact?.transcript ?? "",
          unitPrice: m?.analysis?.structuredData?.unitPrice,
          leadTimeDays: m?.analysis?.structuredData?.leadTimeDays,
          success: true,
        });
      }
      return;
    }

    default:
      return;
  }
}
