// ─────────────────────────────────────────────────────────────────────────
// VOICE — Vapi outbound-call integration with hybrid dialing + offline fallback.
//
// callSupplier() is RUN-AWARE: it takes a RunBinding ({ emit, state }) so every
// event it produces is stamped with the owning run's id and every mutation lands
// in that run's RfqState. With VAPI_API_KEY set it places a REAL call via the
// Vapi server SDK; otherwise it runs a generic scripted negotiation that emits
// the same AgentEvent stream the UI projects. Live calls are driven either by
// Vapi webhooks (handleVapiWebhook) or, on a laptop with no public URL, by
// polling the call to completion. Each in-flight call is bound to its run via
// `bindingByCall`, so a transcript/quote always reaches the right card.
// ─────────────────────────────────────────────────────────────────────────

import { MOCK_SUPPLIER_ID, demoLine } from "./mock-supplier";
import type { AgentEvent } from "./events";
import type { RfqState } from "./state";

export interface CallArgs {
  vendorId: string;
  vendorName: string;
  phone: string;
  goal: string;
  quantity?: number;
  targetPrice?: number;
  walkAway?: number;
  leadTimeDays?: number;
  currency?: string;
  /** Other suppliers' prices, passed to the assistant as leverage on the call. */
  benchmarks?: string;
}

export interface CallResult {
  transcript: string;
  unitPrice?: number;
  leadTimeDays?: number;
  success: boolean;
}

/** The hooks the call layer needs from a run: runId-stamped emit + its RfqState. */
export interface RunBinding {
  emit: (e: AgentEvent) => void;
  state: RfqState;
}

const pendingByCall = new Map<string, (r: CallResult) => void>();
const bindingByCall = new Map<string, { b: RunBinding; vendorId: string }>();

/** Loose E.164-ish check — enough to tell a real number from a blank/garbage. */
function isCallableNumber(p?: string): boolean {
  return !!p && /\+?\d[\d\s().-]{6,}/.test(p);
}

/**
 * Place a negotiation call for one run. Dials the controlled demo number (never
 * a real sourced business), emits ringing + flips the vendor to "calling", then
 * drives a live Vapi call (when configured) or a generic scripted fallback.
 */
export async function callSupplier(args: CallArgs, b: RunBinding): Promise<CallResult> {
  const vapiReady = !!(
    process.env.VAPI_API_KEY &&
    process.env.VAPI_ASSISTANT_ID &&
    process.env.VAPI_PHONE_NUMBER_ID
  );
  // Demo-safety: only the controlled MOCK supplier is ever really dialed, and it
  // always rings the configured demo line — never a real sourced business. Any
  // real supplier the agent tries to phone runs the scripted fallback instead, so
  // Procura can't cold-call a company it found on the web.
  const isMock = args.vendorId === MOCK_SUPPLIER_ID;
  const dial = isMock && isCallableNumber(demoLine()) ? demoLine() : "";

  // Always "ring" on the board. The UI shows the supplier's listed number (never
  // the demo line); the negotiation itself runs over a real Vapi call (mock
  // supplier only) or the scripted fallback (which needs no number) — so every
  // called row still moves.
  b.emit({
    type: "call.ringing",
    vendorId: args.vendorId,
    vendorName: args.vendorName,
    phone: args.phone || undefined,
  });
  b.state.patchVendor(args.vendorId, { status: "calling" });
  b.emit({ type: "rfq.supplier_updated", id: args.vendorId, patch: { status: "calling" } });

  if (vapiReady && isCallableNumber(dial)) {
    // eslint-disable-next-line no-console
    console.log(
      `[voice] Placing Vapi call for "${args.vendorName}" → ${dial} (assistantId=${process.env.VAPI_ASSISTANT_ID})`,
    );
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
        console.log(`[voice] Vapi call placed: id=${call.id}`);
        bindingByCall.set(call.id, { b, vendorId: args.vendorId });
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
        return await pollVapiCall(process.env.VAPI_API_KEY!, call.id, args, b);
      }
      // eslint-disable-next-line no-console
      console.error("[voice] Vapi returned no call.id:", call);
    } catch (e: any) {
      // eslint-disable-next-line no-console
      console.error("[voice] Vapi call failed:", e?.statusCode ?? "", e?.body ?? e?.message ?? e);
      /* fall through to the scripted call so it still works without Vapi */
    }
  } else if (!vapiReady) {
    // eslint-disable-next-line no-console
    console.warn("[voice] VAPI not fully configured — using scripted fallback (no phone will ring).");
  }

  return runScriptedCall(args, b);
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

/** Map a Vapi message `role` to our two-speaker enum (bot/assistant = agent). */
function speakerOfRole(role: string): "agent" | "supplier" {
  const r = (role ?? "").toLowerCase();
  return r === "bot" || r === "assistant" || r === "ai" ? "agent" : "supplier";
}

/**
 * Extract the spoken turns, in order, from a Vapi call's LIVE `messages` array
 * (populated turn-by-turn during the call — unlike `artifact.transcript`, which
 * is only finalized at the end). Keeps user + bot turns and drops the system
 * prompt and tool-call plumbing, so the result reads like a conversation.
 */
function linesFromMessages(
  messages: unknown,
): Array<{ speaker: "agent" | "supplier"; text: string }> {
  if (!Array.isArray(messages)) return [];
  const out: Array<{ speaker: "agent" | "supplier"; text: string }> = [];
  for (const m of messages) {
    const role = String((m as any)?.role ?? "").toLowerCase();
    if (role !== "user" && role !== "bot" && role !== "assistant") continue;
    const text = String((m as any)?.message ?? "").trim();
    if (!text) continue;
    out.push({ speaker: speakerOfRole(role), text });
  }
  return out;
}

/**
 * Poll a live Vapi call to completion when no public webhook URL is reachable
 * (e.g. a laptop demo). Emits `call.connected` once it picks up, streams new
 * transcript lines as they appear, and on `ended` publishes the negotiated quote
 * (from the call's structured analysis) and flips the row to "negotiating".
 */
async function pollVapiCall(
  token: string,
  callId: string,
  args: CallArgs,
  b: RunBinding,
): Promise<CallResult> {
  const currency = args.currency ?? "EUR";
  const base = process.env.VAPI_API_BASE ?? "https://api.vapi.ai";
  const deadline = Date.now() + 300000; // 5 min ceiling
  let connected = false;
  let emitted = 0; // transcript lines already pushed to the bus

  while (Date.now() < deadline) {
    // Poll briskly so the transcript reads live (each turn shows within ~1.5s
    // of being spoken) without hammering the API over a 5-minute ceiling.
    await sleep(1500);
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
      b.emit({ type: "call.connected", vendorId: args.vendorId });
    }

    // Stream new turns from the LIVE messages array as they land — this is what
    // makes the transcript appear in real time on a laptop (no public webhook).
    // `emitted` is how many lines we've already pushed; emit only the new tail.
    const liveLines = linesFromMessages(data?.messages);
    for (; emitted < liveLines.length; emitted++) {
      const l = liveLines[emitted]!;
      b.emit({
        type: "call.transcript",
        vendorId: args.vendorId,
        speaker: l.speaker,
        text: l.text,
        final: true,
      });
    }

    if (status === "ended") {
      // Fallback: if the live messages never populated, recover the lines from
      // the now-finalized transcript artifact so the panel isn't left empty.
      const artifact = String(data?.artifact?.transcript ?? data?.transcript ?? "");
      if (emitted === 0 && artifact) {
        for (const l of parseTranscript(artifact)) {
          b.emit({
            type: "call.transcript",
            vendorId: args.vendorId,
            speaker: l.speaker,
            text: l.text,
            final: true,
          });
        }
      }

      const sd = data?.analysis?.structuredData ?? {};
      const unitPrice = Number(sd.unitPrice) || Number(sd.price) || undefined;
      const leadTimeDays = Number(sd.leadTimeDays) || args.leadTimeDays;
      if (unitPrice != null && Number.isFinite(unitPrice)) {
        b.emit({
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
        b.state.patchVendor(args.vendorId, patch);
        b.emit({ type: "rfq.supplier_updated", id: args.vendorId, patch });
      }
      b.emit({ type: "call.ended", vendorId: args.vendorId, outcome: "success" });
      bindingByCall.delete(callId);
      const finalTranscript =
        liveLines.map((l) => `${l.speaker}: ${l.text}`).join("\n") || artifact;
      return {
        transcript: finalTranscript,
        unitPrice: unitPrice ?? undefined,
        leadTimeDays: leadTimeDays ?? undefined,
        success: true,
      };
    }
  }

  b.emit({ type: "call.ended", vendorId: args.vendorId, outcome: "no-answer" });
  bindingByCall.delete(callId);
  return { transcript: "", success: false };
}

/**
 * Generic offline negotiation (no Vapi key). Derives a believable price arc from
 * the request's target and emits the same events a live call would. Contains no
 * request-specific hardcoding.
 */
function runScriptedCall(args: CallArgs, b: RunBinding): Promise<CallResult> {
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

    at(1200, () => b.emit({ type: "call.connected", vendorId: args.vendorId }));

    for (const line of lines) {
      at(2000, () => {
        b.emit({
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
        b.emit({ type: "call.quote", vendorId: args.vendorId, unitPrice, currency, leadTimeDays });
        const patch = {
          status: "negotiating" as const,
          negotiatedPrice: unitPrice,
          currency,
          leadTimeDays,
        };
        b.state.patchVendor(args.vendorId, patch);
        b.emit({ type: "rfq.supplier_updated", id: args.vendorId, patch });
      }
    });

    at(1200, () => {
      b.emit({ type: "call.ended", vendorId: args.vendorId, outcome: "success" });
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
 * Bridge Vapi server webhooks onto the right run's bus. Each call id was bound to
 * its run in callSupplier(); we look that up to emit/patch against the correct
 * run. Fully defensive: any field may be absent. For tool-calls it returns the
 * ack payload Vapi expects; else void.
 */
export function handleVapiWebhook(
  payload: any,
): { results?: Array<{ toolCallId: string; result: string }> } | void {
  const m = payload?.message;
  const type = m?.type;
  const callId = m?.call?.id;
  const bound = callId ? bindingByCall.get(callId) : undefined;
  const b = bound?.b;
  const vendorId = bound?.vendorId;

  switch (type) {
    case "status-update": {
      if (m?.status === "in-progress" && b && vendorId) {
        b.emit({ type: "call.connected", vendorId });
      }
      if (m?.status === "ended" && b && vendorId) {
        b.emit({ type: "call.ended", vendorId, outcome: "success" });
      }
      return;
    }

    case "transcript": {
      if (b && vendorId) {
        b.emit({
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
        if (name === "report_quote" && b && vendorId) {
          const a = t?.function?.arguments ?? t?.arguments ?? {};
          const unitPrice = Number(a.unitPrice);
          const leadTimeDays = Number(a.leadTimeDays);
          b.emit({
            type: "call.quote",
            vendorId,
            unitPrice,
            currency: b.state.get(vendorId)?.currency ?? b.state.request?.currency ?? "EUR",
            leadTimeDays,
          });
          const patch = {
            status: "negotiating" as const,
            negotiatedPrice: unitPrice,
            leadTimeDays,
          };
          b.state.patchVendor(vendorId, patch);
          b.emit({ type: "rfq.supplier_updated", id: vendorId, patch });
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
      if (b && vendorId) {
        b.emit({ type: "call.ended", vendorId, outcome: "success" });
      }
      const r = callId ? pendingByCall.get(callId) : undefined;
      if (r && callId) {
        pendingByCall.delete(callId);
        bindingByCall.delete(callId);
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
