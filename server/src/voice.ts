// ─────────────────────────────────────────────────────────────────────────
// VOICE — Vapi outbound-call integration with hybrid dialing + offline fallback.
//
// Each call is bound to a runId (which RFQ it belongs to) so concurrent runs
// stay isolated and Vapi webhooks route events back to the right run.
// callSupplier() dials the supplier's discovered number when present, else
// FALLBACK_PHONE_NUMBER. With DEMO_DIAL_FALLBACK=true, always dials FALLBACK.
// ─────────────────────────────────────────────────────────────────────────

import { bus } from "./bus";
import { rfqs } from "./state";

export interface CallArgs {
  runId: string;
  vendorId: string;
  vendorName: string;
  phone: string;
  goal: string;
  quantity?: number;
  targetPrice?: number;
  walkAway?: number;
  leadTimeDays?: number;
  currency?: string;
  benchmarks?: string;
}

export interface CallResult {
  transcript: string;
  unitPrice?: number;
  leadTimeDays?: number;
  success: boolean;
}

const pendingByCall = new Map<string, (r: CallResult) => void>();
const callRoute = new Map<string, { runId: string; vendorId: string }>();

function isCallableNumber(p?: string): boolean {
  return !!p && /\+?\d[\d\s().-]{6,}/.test(p);
}

function envFlag(name: string): boolean {
  const v = process.env[name];
  return !!v && /^(1|true|yes|on)$/i.test(v.trim());
}

export async function callSupplier(args: CallArgs): Promise<CallResult> {
  const runId = args.runId;
  const fallback = process.env.FALLBACK_PHONE_NUMBER ?? "";
  const demoForce = envFlag("DEMO_DIAL_FALLBACK");
  const dial =
    demoForce && isCallableNumber(fallback)
      ? fallback
      : isCallableNumber(args.phone)
        ? args.phone
        : fallback;
  if (demoForce) {
    // eslint-disable-next-line no-console
    console.log(
      `[voice][${runId}] DEMO_DIAL_FALLBACK on → routing call for "${args.vendorName}" to ${fallback || "(unset)"} (discovered: ${args.phone || "none"})`,
    );
  }

  if (!isCallableNumber(dial)) {
    bus.emit(runId, { type: "call.ended", vendorId: args.vendorId, outcome: "no-answer" });
    const r = rfqs.get(runId);
    if (r) {
      r.patchVendor(args.vendorId, { note: "No phone number available" });
      bus.emit(runId, {
        type: "rfq.supplier_updated",
        id: args.vendorId,
        patch: { note: "No phone number available" },
      });
    }
    return { transcript: "", success: false };
  }

  bus.emit(runId, {
    type: "call.ringing",
    vendorId: args.vendorId,
    vendorName: args.vendorName,
    phone: dial,
  });
  const ringingPatch: Partial<{ status: "calling"; note: string }> = { status: "calling" };
  if (demoForce) ringingPatch.note = "Demo · routing call to your number";
  const r = rfqs.get(runId);
  if (r) r.patchVendor(args.vendorId, ringingPatch);
  bus.emit(runId, { type: "rfq.supplier_updated", id: args.vendorId, patch: ringingPatch });

  if (process.env.VAPI_API_KEY) {
    if (!process.env.VAPI_ASSISTANT_ID || !process.env.VAPI_PHONE_NUMBER_ID) {
      // eslint-disable-next-line no-console
      console.error(
        "[voice] VAPI_API_KEY is set but VAPI_ASSISTANT_ID or VAPI_PHONE_NUMBER_ID is missing — cannot place a real call.",
      );
    } else {
      // eslint-disable-next-line no-console
      console.log(
        `[voice][${runId}] Placing Vapi call for "${args.vendorName}" → ${dial} (assistantId=${process.env.VAPI_ASSISTANT_ID})`,
      );
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
              qty: String(args.quantity ?? ""),
              target_price: String(args.targetPrice ?? ""),
              walk_away: String(args.walkAway ?? ""),
              lead_time: String(args.leadTimeDays ?? ""),
              currency: args.currency ?? "EUR",
              benchmarks: args.benchmarks ?? "no other quotes yet",
            },
          },
        } as any);
        if (call?.id) {
          // eslint-disable-next-line no-console
          console.log(`[voice][${runId}] Vapi call placed: id=${call.id}`);
          callRoute.set(call.id, { runId, vendorId: args.vendorId });
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
        // eslint-disable-next-line no-console
        console.error("[voice] Vapi returned no call.id:", call);
      } catch (e: any) {
        // eslint-disable-next-line no-console
        console.error("[voice] Vapi call failed:", e?.statusCode ?? "", e?.body ?? e?.message ?? e);
      }
    }
  } else {
    // eslint-disable-next-line no-console
    console.warn("[voice] VAPI_API_KEY not set — using scripted fallback (no phone will ring).");
  }

  return runScriptedCall(args);
}

function runScriptedCall(args: CallArgs): Promise<CallResult> {
  const runId = args.runId;
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

    at(1200, () => bus.emit(runId, { type: "call.connected", vendorId: args.vendorId }));

    for (const line of lines) {
      at(2000, () => {
        bus.emit(runId, {
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
        bus.emit(runId, {
          type: "call.quote",
          vendorId: args.vendorId,
          unitPrice,
          currency,
          leadTimeDays,
        });
        const patch = {
          status: "negotiating" as const,
          negotiatedPrice: unitPrice,
          currency,
          leadTimeDays,
        };
        const r = rfqs.get(runId);
        if (r) r.patchVendor(args.vendorId, patch);
        bus.emit(runId, { type: "rfq.supplier_updated", id: args.vendorId, patch });
      }
    });

    at(1200, () => {
      bus.emit(runId, { type: "call.ended", vendorId: args.vendorId, outcome: "success" });
      resolve({
        transcript: lines.map((l) => `${l.speaker}: ${l.text}`).join("\n"),
        unitPrice,
        leadTimeDays,
        success: true,
      });
    });
  });
}

/** Bridge Vapi server webhooks onto the bus, routed by runId. */
export function handleVapiWebhook(
  payload: any,
): { results?: Array<{ toolCallId: string; result: string }> } | void {
  const m = payload?.message;
  const type = m?.type;
  const callId = m?.call?.id;
  const route = callId ? callRoute.get(callId) : undefined;
  if (!route) return; // unknown call — ignore (still ack tool-calls below)
  const { runId, vendorId } = route;

  switch (type) {
    case "status-update": {
      if (m?.status === "in-progress") bus.emit(runId, { type: "call.connected", vendorId });
      if (m?.status === "ended") bus.emit(runId, { type: "call.ended", vendorId, outcome: "success" });
      return;
    }

    case "transcript": {
      bus.emit(runId, {
        type: "call.transcript",
        vendorId,
        speaker: m?.role === "assistant" ? "agent" : "supplier",
        text: m?.transcript ?? "",
        final: m?.transcriptType === "final",
      });
      return;
    }

    case "tool-calls": {
      const list: any[] = m?.toolCallList ?? [];
      const r = rfqs.get(runId);
      for (const t of list) {
        const name = t?.function?.name ?? t?.name;
        if (name === "report_quote") {
          const a = t?.function?.arguments ?? t?.arguments ?? {};
          const unitPrice = Number(a.unitPrice);
          const leadTimeDays = Number(a.leadTimeDays);
          bus.emit(runId, {
            type: "call.quote",
            vendorId,
            unitPrice,
            currency: r?.get(vendorId)?.currency ?? r?.request?.currency ?? "EUR",
            leadTimeDays,
          });
          const patch = {
            status: "negotiating" as const,
            negotiatedPrice: unitPrice,
            leadTimeDays,
          };
          if (r) r.patchVendor(vendorId, patch);
          bus.emit(runId, { type: "rfq.supplier_updated", id: vendorId, patch });
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
      bus.emit(runId, { type: "call.ended", vendorId, outcome: "success" });
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
