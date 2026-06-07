import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { streamSSE } from "hono/streaming";
import { config } from "dotenv";
import { bus } from "./bus";
import { runAgent, pushUserMessage, answerQuestion } from "./agent";
import { allRuns, getRun, removeRun, resetAllRuns } from "./runs";
import { handleVapiWebhook } from "./voice";
import { sendOrderEmail } from "./email";
import type { RunSummary } from "./events";

config();

const app = new Hono();
app.use("*", cors());

/** Project the live run registry into the RunSummary list the RFQs page reads. */
function summarise(): RunSummary[] {
  return allRuns().map((ctx) => {
    const r = ctx.state;
    const s = r.computeSummary();
    return {
      runId: ctx.id,
      title: r.title,
      createdAt: ctx.createdAt,
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
    await stream.writeSSE({ data: JSON.stringify({ type: "status", phase: "connected" }) });

    // Replay every live run so a page reload rebuilds the whole dashboard. Each
    // event is tagged with its run's id — the same shape the bus stamps live.
    for (const ctx of allRuns()) {
      const runId = ctx.id;
      await stream.writeSSE({
        data: JSON.stringify({
          type: "run.created",
          request: ctx.state.request ?? { raw: "" },
          createdAt: ctx.createdAt,
          running: ctx.running,
          runId,
        }),
      });
      if (ctx.state.request)
        await stream.writeSSE({
          data: JSON.stringify({ type: "rfq.request", request: ctx.state.request, runId }),
        });
      for (const v of ctx.state.all())
        await stream.writeSSE({
          data: JSON.stringify({ type: "rfq.supplier_added", vendor: v, runId }),
        });
    }

    while (!stream.aborted) {
      await stream.sleep(15000);
      if (stream.aborted) break;
      await stream.writeSSE({ data: "", event: "ping" });
    }
    unsub();
  }),
);

// ─── Create a new RFQ run ─────────────────────────────────────────────────
app.post("/api/command", async (c) => {
  const body = await c.req.json().catch(() => ({}) as any);
  const text = String(body?.text ?? "");
  if (!text) return c.json({ ok: false, error: "empty request" }, 400);
  // Each command starts a NEW parallel run — existing runs keep going.
  const runId = runAgent(text);
  return c.json({ ok: true, runId });
});

// ─── List all RFQ runs (for the RFQs page) ────────────────────────────────
app.get("/api/runs", (c) => c.json({ runs: summarise() }));

app.post("/api/chat", async (c) => {
  const body = await c.req.json().catch(() => ({}) as any);
  const runId = String(body?.runId ?? "");
  const text = String(body?.text ?? "");
  if (runId && text) pushUserMessage(runId, text);
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
  const runId = String(body?.runId ?? "");
  const vendorId = body?.vendorId ? String(body.vendorId) : undefined;
  const ctx = getRun(runId);
  if (!ctx) return c.json({ ok: false, error: "unknown run" }, 404);

  ctx.emit({ type: "order.placed", vendorId: vendorId ?? "" });
  const invoice = ctx.state.makeInvoice(vendorId);

  // Send the purchase order to the winning supplier. Fire-and-forget so the
  // response (and the receipt) isn't held up by the network round-trip;
  // sendOrderEmail never throws and routes to the demo inbox when configured.
  if (invoice) {
    const winner = vendorId ? ctx.state.resolve(vendorId) : ctx.state.bestVendor();
    if (winner) ctx.state.ordered = { vendorId: winner.id, invoice };
    void sendOrderEmail({
      to: winner?.contact?.email ?? "sales@example.com",
      invoice,
      item: ctx.state.request?.item,
      deadline: ctx.state.request?.deadline,
      vendorId: winner?.id,
    }).then((sent) => {
      // eslint-disable-next-line no-console
      console.log(
        `[procura] PO ${invoice.poNumber} for ${invoice.vendorName}: ${sent ? "emailed" : "skipped (no mail creds)"}`,
      );
    });
    setTimeout(() => ctx.emit({ type: "order.receipt", invoice }), 900);
  }
  return c.json({ ok: true, invoice });
});

app.post("/api/run/remove", async (c) => {
  const body = await c.req.json().catch(() => ({}) as any);
  if (body?.runId) removeRun(String(body.runId));
  return c.json({ ok: true });
});

app.post("/api/reset", async (c) => {
  // Per-run remove when a runId is supplied; otherwise a global dashboard reset.
  const body = await c.req.json().catch(() => ({}) as any);
  const runId = body?.runId ? String(body.runId) : undefined;
  if (runId) removeRun(runId);
  else resetAllRuns();
  return c.json({ ok: true });
});

app.post("/webhooks/vapi", async (c) => {
  const payload = await c.req.json().catch(() => ({}) as any);
  const res = handleVapiWebhook(payload);
  return c.json(res ?? { ok: true });
});

const port = Number(process.env.PORT ?? 8787);
const server = serve({ fetch: app.fetch, port });
// eslint-disable-next-line no-console
console.log(`[procura] server listening on http://localhost:${port}`);

// Close the listener on shutdown so `tsx watch` can rebind the port cleanly on
// the next reload — otherwise the new process races the dying one → EADDRINUSE.
// The 1s safety timer forces exit if a long-lived SSE stream won't drain.
for (const sig of ["SIGTERM", "SIGINT"] as const) {
  process.once(sig, () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 1000).unref();
  });
}
