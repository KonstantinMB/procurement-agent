import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { streamSSE } from "hono/streaming";
import { config } from "dotenv";
import { bus } from "./bus";
import { rfq } from "./state";
import { runDemo } from "./demo";
import { runAgent, pushUserMessage, answerQuestion } from "./agent";
import { handleVapiWebhook } from "./voice";

config();

const app = new Hono();
app.use("*", cors());

app.get("/health", (c) => c.json({ ok: true }));

app.get("/events", (c) =>
  streamSSE(c, async (stream) => {
    const unsub = bus.subscribe((e) => {
      void stream.writeSSE({ data: JSON.stringify(e) });
    });
    stream.onAbort(() => unsub());
    await stream.writeSSE({ data: JSON.stringify({ type: "status", phase: "connected" }) });
    // replay current state so a page reload mid-run catches up
    if (rfq.request)
      await stream.writeSSE({ data: JSON.stringify({ type: "rfq.request", request: rfq.request }) });
    for (const v of rfq.all())
      await stream.writeSSE({ data: JSON.stringify({ type: "rfq.supplier_added", vendor: v }) });
    while (!stream.aborted) {
      await stream.sleep(15000);
      if (stream.aborted) break;
      await stream.writeSSE({ data: "", event: "ping" });
    }
    unsub();
  })
);

app.post("/api/command", async (c) => {
  const body = await c.req.json().catch(() => ({}) as any);
  const text = String(body?.text ?? "");
  rfq.reset();
  // Show the request on the dashboard instantly; the agent refines it via set_request.
  rfq.setRequest({ raw: text });
  bus.emit({ type: "rfq.request", request: { raw: text } });
  runAgent(text);
  return c.json({ ok: true });
});

app.post("/api/demo", (c) => {
  rfq.reset();
  runDemo();
  return c.json({ ok: true });
});

app.post("/api/chat", async (c) => {
  const body = await c.req.json().catch(() => ({}) as any);
  const text = String(body?.text ?? "");
  if (text) pushUserMessage(text);
  return c.json({ ok: true });
});

app.post("/api/answer", async (c) => {
  const body = await c.req.json().catch(() => ({}) as any);
  if (body?.id) answerQuestion(String(body.id), body.answers ?? {});
  return c.json({ ok: true });
});

app.post("/api/order", async (c) => {
  const body = await c.req.json().catch(() => ({}) as any);
  const vendorId = body?.vendorId ? String(body.vendorId) : undefined;
  bus.emit({ type: "order.placed", vendorId: vendorId ?? "" });
  const invoice = rfq.makeInvoice(vendorId);
  setTimeout(() => {
    if (invoice) bus.emit({ type: "order.receipt", invoice });
  }, 900);
  return c.json({ ok: true, invoice });
});

app.post("/api/reset", (c) => {
  rfq.reset();
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
