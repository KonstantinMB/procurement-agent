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
  const vapiReady = !!(
    process.env.VAPI_API_KEY &&
    process.env.VAPI_ASSISTANT_ID &&
    process.env.VAPI_PHONE_NUMBER_ID
  );
  // Demo-safe dialing: when a controlled demo number is configured, ALWAYS ring
  // it — Procura must never cold-call a real sourced business during a demo. Only
  // if no demo number is set do we fall back to the supplier's discovered number.
  const demoNumber = process.env.DEMO_SUPPLIER_NUMBER ?? process.env.FALLBACK_PHONE_NUMBER ?? "";
  const dial = isCallableNumber(demoNumber)
    ? demoNumber
    : isCallableNumber(args.phone)
      ? args.phone
      : "";

  // Always "ring": the negotiation runs over a real Vapi call when fully
  // configured, otherwise the scripted fallback (which needs no phone number) —
  // so a supplier without a public number still gets negotiated on the board.
  bus.emit({
    type: "call.ringing",
    vendorId: args.vendorId,
    vendorName: args.vendorName,
    phone: dial || undefined,
  });
  rfq.patchVendor(args.vendorId, { status: "calling" });
  bus.emit({ type: "rfq.supplier_updated", id: args.vendorId, patch: { status: "calling" } });

  if (vapiReady && isCallableNumber(dial)) {
    try {
      const { VapiClient } = await import("@vapi-ai/server-sdk");
      const client = new VapiClient({ token: process.env.VAPI_API_KEY! });
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
        // With a public webhook URL, Vapi streams events to /webhooks/vapi and
        // handleVapiWebhook resolves this promise. On a laptop (no public URL)
        // we poll the call ourselves instead.
        if (process.env.PUBLIC_WEBHOOK_BASE) {
          return await new Promise<CallResult>((resolve) => {
            pendingByCall.set(call.id, resolve);
            setTimeout(() => {
              if (pendingByCall.has(call.id)) {
                pendingByCall.delete(call.id);
                resolve({ transcript: "", success: false });
              }
            }, 300000);
          });
        }
        return await pollVapiCall(process.env.VAPI_API_KEY!, call.id, args);
      }
    } catch {
      /* fall through to the scripted call so it still works without Vapi */
    }
  }

  return runScriptedCall(args);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Map a Vapi transcript role label ("AI" / "User") to our speaker enum. */
function speakerOf(label: string): "agent" | "supplier" {
  const l = label.trim().toLowerCase();
  return l.startsWith("ai") || l.startsWith("assistant") || l.startsWith("bot")
    ? "agent"
    : "supplier";
}

/** Split a Vapi `artifact.transcript` blob into ordered {speaker,text} lines. */
function parseTranscript(t: string): Array<{ speaker: "agent" | "supplier"; text: string }> {
  const out: Array<{ speaker: "agent" | "supplier"; text: string }> = [];
  for (const raw of t.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const m = line.match(/^([A-Za-z]+)\s*:\s*(.*)$/);
    if (m) out.push({ speaker: speakerOf(m[1]!), text: m[2]! });
    else out.push({ speaker: "supplier", text: line });
  }
  return out;
}

/**
 * Poll a live Vapi call to completion when no public webhook URL is reachable
 * (e.g. a laptop demo). Emits `call.connected` once it picks up, streams new
 * transcript lines as they appear, and on `ended` publishes the negotiated quote
 * (from the call's structured analysis) and flips the row to "negotiating".
 */
async function pollVapiCall(token: string, callId: string, args: CallArgs): Promise<CallResult> {
  const currency = args.currency ?? "EUR";
  const base = process.env.VAPI_API_BASE ?? "https://api.vapi.ai";
  const deadline = Date.now() + 300000; // 5 min ceiling
  let connected = false;
  let emitted = 0; // transcript lines already pushed to the bus

  while (Date.now() < deadline) {
    await sleep(3500);
    let data: any;
    try {
      const res = await fetch(`${base}/call/${callId}`, {
        headers: { Authorization: `Bearer ${token}`, "User-Agent": "Mozilla/5.0 Procura" },
      });
      data = await res.json();
    } catch {
      continue; // transient network blip — retry next tick
    }

    const status = String(data?.status ?? "");
    if (!connected && (status === "in-progress" || status === "forwarding")) {
      connected = true;
      bus.emit({ type: "call.connected", vendorId: args.vendorId });
    }

    // Stream any transcript lines we haven't sent yet.
    const transcript = String(data?.artifact?.transcript ?? data?.transcript ?? "");
    if (transcript) {
      const lines = parseTranscript(transcript);
      for (; emitted < lines.length; emitted++) {
        const l = lines[emitted]!;
        bus.emit({
          type: "call.transcript",
          vendorId: args.vendorId,
          speaker: l.speaker,
          text: l.text,
          final: true,
        });
      }
    }

    if (status === "ended") {
      const sd = data?.analysis?.structuredData ?? {};
      const unitPrice = Number(sd.unitPrice) || Number(sd.price) || undefined;
      const leadTimeDays = Number(sd.leadTimeDays) || args.leadTimeDays;
      if (unitPrice != null && Number.isFinite(unitPrice)) {
        bus.emit({
          type: "call.quote",
          vendorId: args.vendorId,
          unitPrice,
          currency,
          leadTimeDays: leadTimeDays ?? 0,
        });
        const patch = {
          status: "negotiating" as const,
          negotiatedPrice: unitPrice,
          currency,
          ...(leadTimeDays != null ? { leadTimeDays } : {}),
        };
        rfq.patchVendor(args.vendorId, patch);
        bus.emit({ type: "rfq.supplier_updated", id: args.vendorId, patch });
      }
      bus.emit({ type: "call.ended", vendorId: args.vendorId, outcome: "success" });
      return { transcript, unitPrice: unitPrice ?? undefined, leadTimeDays: leadTimeDays ?? undefined, success: true };
    }
  }

  bus.emit({ type: "call.ended", vendorId: args.vendorId, outcome: "no-answer" });
  return { transcript: "", success: false };
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
