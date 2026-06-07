import { bus } from "./bus";
import { rfq } from "./state";
import type { RfqRequest, Vendor } from "./events";

// ─────────────────────────────────────────────────────────────────────────
// Fully scripted Procura demo.
//
// Drives the entire procurement story by emitting AgentEvents over time via
// `bus.emit` while mirroring authoritative RFQ state into `rfq` so the
// `/api/order` endpoint can compute the winner, savings, and invoice.
//
// Timing uses a cumulative scheduler so every step is sequenced relative to
// the previous one; the full run lands at ~28s. All numbers are EXACT and the
// control flow never depends on randomness.
// ─────────────────────────────────────────────────────────────────────────

const REQUEST: RfqRequest = {
  raw: "I need 50 brushless motors delivered by Friday under €60/unit",
  item: "brushless motors",
  quantity: 50,
  deadline: "Friday",
  targetUnitPrice: 60,
  currency: "EUR",
};

// Canonical vendor dataset — all start "discovered"; quotes arrive over time.
const bolt: Vendor = {
  id: "bolt",
  name: "Bolt Industrial",
  location: "Berlin, DE",
  rating: 4.6,
  moq: 25,
  source: "web",
  contact: { phone: "+49 30 5550 1820", url: "https://boltindustrial.de" },
  status: "discovered",
};

const eurodrive: Vendor = {
  id: "eurodrive",
  name: "EuroDrive Systems",
  location: "Eindhoven, NL",
  rating: 4.7,
  moq: 20,
  source: "web",
  contact: { url: "https://eurodrive-systems.nl" },
  status: "discovered",
};

const acme: Vendor = {
  id: "acme",
  name: "Acme Motors",
  location: "Munich, DE",
  rating: 4.3,
  moq: 50,
  source: "email",
  contact: { email: "sales@acme-motors.de" },
  status: "discovered",
};

const shenzhen: Vendor = {
  id: "shenzhen",
  name: "Shenzhen MotorWorks",
  location: "Shenzhen, CN",
  rating: 4.1,
  moq: 100,
  source: "email",
  contact: { email: "sales@shenzhen-motorworks.cn" },
  status: "discovered",
};

// Hero-call transcript (verbatim from CONTRACTS), alternating agent/supplier.
const CALL_SCRIPT: { speaker: "agent" | "supplier"; text: string }[] = [
  {
    speaker: "agent",
    text:
      "Hi, this is Procura calling on behalf of a buyer. We need 50 brushless motors delivered by Friday — could you give me your best unit price?",
  },
  {
    speaker: "supplier",
    text:
      "Sure. For 50 units we're around 62 euros per unit, delivered early next week.",
  },
  {
    speaker: "agent",
    text:
      "Friday is firm for us, and our target is under 60 a unit. If you can hit Friday at 58, we'll order today.",
  },
  {
    speaker: "supplier",
    text: "Friday is tight… I could do 59 if you confirm now.",
  },
  {
    speaker: "agent",
    text:
      "Let's meet in the middle — 57.60 a unit, 50 units, delivered Friday, and we sign right now.",
  },
  {
    speaker: "supplier",
    text: "Alright. 57.60 it is, delivered Friday. I'll send the confirmation.",
  },
  {
    speaker: "agent",
    text: "Perfect — you'll have the PO within the hour. Thank you.",
  },
];

/**
 * Run the full scripted demo. Returns immediately; the story unfolds over
 * timers driven by a cumulative scheduler.
 */
let demoTimers: ReturnType<typeof setTimeout>[] = [];

/** Cancel any pending demo timers — aborts an in-flight scripted run. */
export function stopDemo(): void {
  for (const id of demoTimers) clearTimeout(id);
  demoTimers = [];
}

export function runDemo(): void {
  // Cancel any still-pending timers from a prior run so re-triggering the demo
  // never stacks two interleaved timelines, then wipe the client projection.
  stopDemo();
  bus.emit({ type: "run.reset" });

  let t = 0;
  const at = (ms: number, fn: () => void): void => {
    t += ms;
    demoTimers.push(setTimeout(fn, t));
  };

  // 1) Boot + understanding the request ────────────────────────────────────
  at(0, () => {
    bus.emit({ type: "agent.ready", model: "claude-opus-4-8", apiKeySource: "demo" });
    rfq.setRequest(REQUEST);
    bus.emit({ type: "rfq.request", request: REQUEST });
    bus.emit({ type: "status", phase: "Understanding the request" });
    bus.emit({ type: "agent.thinking", active: true });
  });

  // 2) Spawn scouts + run the supplier web search ──────────────────────────
  at(700, () => {
    bus.emit({ type: "status", phase: "Discovering suppliers" });
    bus.emit({ type: "subagent.spawned", id: "scout-1", role: "web" });
  });
  at(300, () => bus.emit({ type: "subagent.spawned", id: "scout-2", role: "web" }));
  at(300, () => bus.emit({ type: "subagent.spawned", id: "scout-3", role: "web" }));

  at(400, () => {
    bus.emit({
      type: "tool.call",
      id: "t-search",
      name: "web_search",
      label: "Searching suppliers for brushless motors",
      kind: "web",
      subagentId: "scout-1",
    });
  });

  at(1300, () => {
    bus.emit({ type: "tool.result", id: "t-search", status: "done", summary: "4 suppliers found" });
    bus.emit({ type: "agent.thinking", active: false });
    bus.emit({ type: "subagent.done", id: "scout-1" });
  });
  at(300, () => bus.emit({ type: "subagent.done", id: "scout-2" }));
  at(300, () => bus.emit({ type: "subagent.done", id: "scout-3" }));

  // 3) Add the discovered vendors, staggered ───────────────────────────────
  const addVendor = (v: Vendor): void => {
    rfq.upsertVendor(v);
    bus.emit({ type: "rfq.supplier_added", vendor: v });
  };
  at(500, () => addVendor(bolt));
  at(450, () => addVendor(eurodrive));
  at(450, () => addVendor(acme));
  at(450, () => addVendor(shenzhen));

  // 4) RFQ emails to Acme & Shenzhen, then their replies ───────────────────
  at(700, () => {
    bus.emit({ type: "status", phase: "Requesting quotes" });
    bus.emit({
      type: "tool.call",
      id: "t-email",
      name: "send_rfq_email",
      label: "Emailing RFQs to Acme & Shenzhen",
      kind: "email",
    });
    bus.emit({
      type: "email.sent",
      vendorId: "acme",
      to: "sales@acme-motors.de",
      subject: "RFQ: 50 brushless motors, delivery by Friday",
    });
  });
  at(500, () =>
    bus.emit({
      type: "email.sent",
      vendorId: "shenzhen",
      to: "sales@shenzhen-motorworks.cn",
      subject: "RFQ: 50 brushless motors, delivery by Friday",
    }),
  );
  at(500, () =>
    bus.emit({ type: "tool.result", id: "t-email", status: "done", summary: "2 RFQs sent" }),
  );

  // Acme reply → quoted, meets the Friday deadline.
  at(1200, () => {
    bus.emit({
      type: "email.reply",
      vendorId: "acme",
      from: "sales@acme-motors.de",
      unitPrice: 61,
      leadTimeDays: 6,
    });
    rfq.patchVendor("acme", {
      status: "quoted",
      initialPrice: 61,
      negotiatedPrice: 61,
      leadTimeDays: 6,
      meetsDeadline: true,
    });
    bus.emit({
      type: "rfq.supplier_updated",
      id: "acme",
      patch: {
        status: "quoted",
        initialPrice: 61,
        negotiatedPrice: 61,
        leadTimeDays: 6,
        meetsDeadline: true,
      },
    });
  });

  // Shenzhen reply → cheapest, but misses the Friday deadline.
  at(900, () => {
    bus.emit({
      type: "email.reply",
      vendorId: "shenzhen",
      from: "sales@shenzhen-motorworks.cn",
      unitPrice: 54,
      leadTimeDays: 21,
    });
    rfq.patchVendor("shenzhen", {
      status: "quoted",
      initialPrice: 54,
      negotiatedPrice: 54,
      leadTimeDays: 21,
      meetsDeadline: false,
      note: "Misses Friday deadline",
    });
    bus.emit({
      type: "rfq.supplier_updated",
      id: "shenzhen",
      patch: {
        status: "quoted",
        initialPrice: 54,
        negotiatedPrice: 54,
        leadTimeDays: 21,
        meetsDeadline: false,
        note: "Misses Friday deadline",
      },
    });
  });

  // 5) EuroDrive returns a quote via its web portal ────────────────────────
  at(1100, () => {
    bus.emit({
      type: "tool.call",
      id: "t-ed",
      name: "update_quote",
      label: "EuroDrive quote in",
      kind: "quote",
    });
    bus.emit({ type: "tool.result", id: "t-ed", status: "done", summary: "EUR 59 · 5 days" });
    rfq.patchVendor("eurodrive", {
      status: "quoted",
      initialPrice: 59,
      negotiatedPrice: 59,
      leadTimeDays: 5,
      meetsDeadline: true,
    });
    bus.emit({
      type: "rfq.supplier_updated",
      id: "eurodrive",
      patch: {
        status: "quoted",
        initialPrice: 59,
        negotiatedPrice: 59,
        leadTimeDays: 5,
        meetsDeadline: true,
      },
    });
  });

  // 6) HERO CALL — negotiate Bolt down live on the phone ────────────────────
  at(1300, () => {
    bus.emit({ type: "status", phase: "Negotiating with Bolt Industrial" });
    bus.emit({
      type: "tool.call",
      id: "t-call",
      name: "call_supplier",
      label: "Calling Bolt Industrial",
      kind: "call",
    });
    bus.emit({
      type: "call.ringing",
      vendorId: "bolt",
      vendorName: "Bolt Industrial",
      phone: "+49 30 5550 1820",
    });
    rfq.patchVendor("bolt", { status: "calling", initialPrice: 62 });
    bus.emit({
      type: "rfq.supplier_updated",
      id: "bolt",
      patch: { status: "calling", initialPrice: 62 },
    });
  });

  at(1500, () => bus.emit({ type: "call.connected", vendorId: "bolt" }));

  // Transcript lines, alternating, spaced ~2000–2600ms.
  const lineGaps = [1800, 2400, 2200, 2600, 2200, 2400, 2000];
  CALL_SCRIPT.forEach((line, i) => {
    at(lineGaps[i], () => {
      bus.emit({
        type: "call.transcript",
        vendorId: "bolt",
        speaker: line.speaker,
        text: line.text,
        final: true,
      });
    });
  });

  // Negotiated outcome lands.
  at(1600, () => {
    bus.emit({
      type: "call.quote",
      vendorId: "bolt",
      unitPrice: 57.6,
      currency: "EUR",
      leadTimeDays: 4,
    });
    // Mirror the agreed quote into server state the instant it streams, so an
    // early "Order Now" invoices the negotiated €57.60 — not the €62 opener.
    // (Matches voice.ts, which already patches rfq on call.quote.)
    rfq.patchVendor("bolt", {
      status: "negotiating",
      negotiatedPrice: 57.6,
      currency: "EUR",
      leadTimeDays: 4,
      meetsDeadline: true,
    });
  });
  at(900, () => {
    bus.emit({ type: "call.ended", vendorId: "bolt", outcome: "success" });
    bus.emit({ type: "tool.result", id: "t-call", status: "done", summary: "Won at EUR 57.60" });
  });

  // 7) Close: mark Bolt won, summarize savings, and finish ──────────────────
  at(700, () => {
    rfq.patchVendor("bolt", {
      status: "won",
      negotiatedPrice: 57.6,
      leadTimeDays: 4,
      meetsDeadline: true,
      note: "Negotiated EUR 4.40/unit off",
    });
    bus.emit({
      type: "rfq.supplier_updated",
      id: "bolt",
      patch: {
        status: "won",
        negotiatedPrice: 57.6,
        leadTimeDays: 4,
        meetsDeadline: true,
        note: "Negotiated EUR 4.40/unit off",
      },
    });
  });

  at(600, () => {
    bus.emit({ type: "status", phase: "Ready to order" });
    bus.emit({
      type: "rfq.summary",
      headline: "EUR 220 saved",
      savings: 220,
      currency: "EUR",
      withinBudget: true,
      quotes: 4,
    });
  });

  at(700, () => {
    bus.emit({
      type: "agent.message",
      text:
        "Done — Bolt Industrial wins at EUR 57.60/unit, delivered Friday: EUR 220 under the next-best option and within your EUR 60 budget. Ready to order.",
    });
    bus.emit({ type: "done", ok: true });
  });
}
