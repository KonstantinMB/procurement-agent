import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { streamSSE } from "hono/streaming";
import { config } from "dotenv";
import { bus } from "./bus";
import { rfqs } from "./state";
import { startAgentRun, pushUserMessage, answerQuestion } from "./agent";
import { handleVapiWebhook } from "./voice";
import { sendPurchaseOrder } from "./email";
import type { RunSummary } from "./events";

config();

const app = new Hono();
app.use("*", cors());

// ─── runId generator ──────────────────────────────────────────────────────
let _seq = 0;
function newRunId(): string {
  _seq += 1;
  return `run_${Date.now().toString(36)}_${_seq.toString(36)}`;
}

function summarise(): RunSummary[] {
  return rfqs.all().map((r) => {
    const s = r.computeSummary();
    return {
      runId: r.runId,
      title: r.title,
      createdAt: r.createdAt,
      status: r.derivedStatus(),
      request: r.request,
      suppliers: r.all().length,
      bestPrice: s.bestPrice || undefined,
      savings: s.savings || undefined,
      currency: s.currency,
      withinBudget: s.withinBudget,
      ordered: !!r.ordered,
    };
  });
}

app.get("/health", (c) => c.json({ ok: true }));

// ─── SSE: every event on the wire is tagged with runId so the client can
// route it to the correct run-bucket. New SSE subscribers get a replay of
// the current state for ALL active runs so multi-run UI stays coherent.
app.get("/events", (c) =>
  streamSSE(c, async (stream) => {
    const unsub = bus.subscribe((e) => {
      void stream.writeSSE({ data: JSON.stringify(e) });
    });
    stream.onAbort(() => unsub());
    await stream.writeSSE({
      data: JSON.stringify({ type: "status", phase: "connected", runId: "" }),
    });
    // Replay every run's current state so a fresh client gets a coherent view.
    for (const r of rfqs.all()) {
      if (r.request)
        await stream.writeSSE({
          data: JSON.stringify({ type: "rfq.request", request: r.request, runId: r.runId }),
        });
      for (const v of r.all())
        await stream.writeSSE({
          data: JSON.stringify({ type: "rfq.supplier_added", vendor: v, runId: r.runId }),
        });
    }
    while (!stream.aborted) {
      await stream.sleep(15000);
      if (stream.aborted) break;
      await stream.writeSSE({ data: "", event: "ping" });
    }
    unsub();
  })
);

// ─── Create a new RFQ run ─────────────────────────────────────────────────
app.post("/api/command", async (c) => {
  const body = await c.req.json().catch(() => ({}) as any);
  const text = String(body?.text ?? "");
  const runId = newRunId();
  const r = rfqs.create(runId, text.slice(0, 80) || "New RFQ");
  r.setRequest({ raw: text });
  bus.emit(runId, { type: "rfq.request", request: { raw: text } });
  startAgentRun(runId, text);
  return c.json({ ok: true, runId });
});

// ─── List all RFQ runs (for the RFQs page) ────────────────────────────────
app.get("/api/runs", (c) => c.json({ runs: summarise() }));

app.post("/api/chat", async (c) => {
  const body = await c.req.json().catch(() => ({}) as any);
  const text = String(body?.text ?? "");
  const runId = body?.runId ? String(body.runId) : undefined;
  if (text && runId) pushUserMessage(runId, text);
  return c.json({ ok: true });
});

app.post("/api/answer", async (c) => {
  const body = await c.req.json().catch(() => ({}) as any);
  const runId = body?.runId ? String(body.runId) : undefined;
  if (body?.id && runId) answerQuestion(runId, String(body.id), body.answers ?? {});
  return c.json({ ok: true });
});

app.post("/api/order", async (c) => {
  const body = await c.req.json().catch(() => ({}) as any);
  const runId = body?.runId ? String(body.runId) : undefined;
  const vendorId = body?.vendorId ? String(body.vendorId) : undefined;
  if (!runId) return c.json({ ok: false, error: "runId required" }, 400);
  const r = rfqs.get(runId);
  if (!r) return c.json({ ok: false, error: "unknown runId" }, 404);
  bus.emit(runId, { type: "order.placed", vendorId: vendorId ?? "" });
  const invoice = r.makeInvoice(vendorId);
  const vendor = vendorId ? r.get(vendorId) : r.bestVendor();
  if (invoice && vendor) {
    r.ordered = { vendorId: vendor.id, invoice };
    void sendPurchaseOrder({ vendor, invoice, request: r.request });
  }
  setTimeout(() => {
    if (invoice) bus.emit(runId, { type: "order.receipt", invoice });
  }, 900);
  return c.json({ ok: true, invoice });
});

app.post("/api/reset", async (c) => {
  const body = await c.req.json().catch(() => ({}) as any);
  const runId = body?.runId ? String(body.runId) : undefined;
  if (runId) rfqs.delete(runId);
  return c.json({ ok: true });
});

app.post("/webhooks/vapi", async (c) => {
  const payload = await c.req.json().catch(() => ({}) as any);
  const res = handleVapiWebhook(payload);
  return c.json(res ?? { ok: true });
});

const port = Number(process.env.PORT ?? 8787);
serve({ fetch: app.fetch, port });
// eslint-disable-next-line no-console
console.log(`[procura] server listening on http://localhost:${port}`);
