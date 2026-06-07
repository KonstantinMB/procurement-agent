import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { bus } from "./bus";
import { rfq } from "./state";
import { sendRfqEmail } from "./email";
import { callSupplier } from "./voice";
import { runClaudeResearch } from "./research";
import type { Vendor, VendorStatus } from "./events";

/** Stable slug for vendor ids: lowercase, non-alphanumeric runs → "-", trimmed. */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * In-process MCP server exposing the agent's procurement tools. Every tool is a
 * thin, defensive wrapper that mutates `rfq` and emits the matching `AgentEvent`
 * so the live dashboard stays a pure projection of the agent's actions.
 */
export const appServer = createSdkMcpServer({
  name: "app",
  version: "1.0.0",
  tools: [
    tool(
      "set_request",
      "Record the parsed buyer request (item, quantity, deadline, target unit price, currency) so the dashboard header reflects exactly what is being sourced.",
      {
        item: z.string().optional(),
        quantity: z.number().optional(),
        deadline: z.string().optional(),
        targetUnitPrice: z.number().optional(),
        currency: z.string().optional(),
      },
      async ({ item, quantity, deadline, targetUnitPrice, currency }) => {
        const prev = rfq.request ?? { raw: "" };
        const request = {
          ...prev,
          ...(item !== undefined ? { item } : {}),
          ...(quantity !== undefined ? { quantity } : {}),
          ...(deadline !== undefined ? { deadline } : {}),
          ...(targetUnitPrice !== undefined ? { targetUnitPrice } : {}),
          ...(currency !== undefined ? { currency } : {}),
        };
        rfq.setRequest(request);
        bus.emit({ type: "rfq.request", request });
        return { content: [{ type: "text", text: "Request recorded" }] };
      },
    ),

    tool(
      "add_supplier",
      "Add a discovered supplier to the live table. Include unitPrice ONLY when a real public/list price exists.",
      {
        name: z.string(),
        location: z.string().optional(),
        rating: z.number().optional(),
        moq: z.number().optional(),
        source: z.string().optional(),
        phone: z.string().optional(),
        email: z.string().optional(),
        url: z.string().optional(),
        unitPrice: z.number().optional(),
      },
      async ({ name, location, rating, moq, source, phone, email, url, unitPrice }) => {
        const vendor: Vendor = {
          id: slugify(name),
          name,
          location,
          rating,
          moq,
          source: source as Vendor["source"],
          contact: { phone, email, url },
          status: "discovered",
          ...(unitPrice !== undefined
            ? { initialPrice: unitPrice, currency: rfq.request?.currency }
            : {}),
        };
        rfq.upsertVendor(vendor);
        bus.emit({ type: "rfq.supplier_added", vendor });
        return { content: [{ type: "text", text: "Added " + name }] };
      },
    ),

    tool(
      "research_suppliers",
      "Discover REAL suppliers by running a headless `claude -p` web-search call, then add them to the live table. This is the primary discovery step.",
      {
        item: z.string(),
        quantity: z.number().optional(),
        region: z.string().optional(),
        targetPrice: z.number().optional(),
        currency: z.string().optional(),
        count: z.number().optional(),
      },
      async ({ item, quantity, region, targetPrice, currency, count }) => {
        const addedIds = new Set<string>();
        const addOne = (s: {
          name: string;
          location?: string;
          phone?: string;
          email?: string;
          url?: string;
          moq?: number;
          unitPrice?: number;
          rating?: number;
        }) => {
          if (!s?.name) return;
          const id = slugify(s.name);
          if (!id || addedIds.has(id)) return;
          addedIds.add(id);
          const vendor: Vendor = {
            id,
            name: s.name,
            location: s.location,
            rating: typeof s.rating === "number" ? s.rating : undefined,
            moq: typeof s.moq === "number" ? s.moq : undefined,
            source: "web",
            contact: { phone: s.phone, email: s.email, url: s.url },
            status: "discovered",
            ...(typeof s.unitPrice === "number"
              ? { initialPrice: s.unitPrice, currency: currency ?? rfq.request?.currency }
              : {}),
          };
          rfq.upsertVendor(vendor);
          bus.emit({ type: "rfq.supplier_added", vendor });
        };

        // Stream: rows + the research agent's searches appear live as it explores.
        const all = await runClaudeResearch(
          { item, quantity, region, targetPrice, currency, count },
          {
            onSupplier: addOne,
            onActivity: (act) => {
              if (act.done) {
                bus.emit({ type: "tool.result", id: act.id, status: "done" });
              } else {
                bus.emit({
                  type: "tool.call",
                  id: act.id,
                  name: "web",
                  label: act.label ?? "Researching",
                  kind: "web",
                });
              }
            },
          },
        );
        for (const s of all) addOne(s); // safety net for any missed by the stream

        return {
          content: [
            {
              type: "text",
              text:
                addedIds.size > 0
                  ? `Researched and added ${addedIds.size} real suppliers for ${item}.`
                  : `No suppliers found via research for ${item}; broaden the query or add one manually.`,
            },
          ],
        };
      },
    ),

    tool(
      "update_quote",
      "Update a supplier's quote, status, lead time, or note on the board.",
      {
        id: z.string(),
        unitPrice: z.number().optional(),
        leadTimeDays: z.number().optional(),
        status: z.string().optional(),
        note: z.string().optional(),
        meetsDeadline: z.boolean().optional(),
      },
      async ({ id, unitPrice, leadTimeDays, status, note, meetsDeadline }) => {
        const patch: Partial<Vendor> = {};
        if (status !== undefined) patch.status = status as VendorStatus;
        if (unitPrice !== undefined) {
          patch.negotiatedPrice = unitPrice;
          const existing = rfq.get(id);
          if (existing?.initialPrice == null) patch.initialPrice = unitPrice;
        }
        if (leadTimeDays !== undefined) patch.leadTimeDays = leadTimeDays;
        if (note !== undefined) patch.note = note;
        if (meetsDeadline !== undefined) patch.meetsDeadline = meetsDeadline;
        rfq.patchVendor(id, patch);
        bus.emit({ type: "rfq.supplier_updated", id, patch });
        return { content: [{ type: "text", text: "Updated " + id }] };
      },
    ),

    tool(
      "set_summary",
      "Publish the headline summary (savings, budget status, quote count).",
      {
        savings: z.number(),
        withinBudget: z.boolean(),
        quotes: z.number(),
        headline: z.string().optional(),
      },
      async ({ savings, withinBudget, quotes, headline }) => {
        const currency = rfq.request?.currency ?? "EUR";
        bus.emit({
          type: "rfq.summary",
          headline: headline ?? savings + " saved",
          savings,
          withinBudget,
          quotes,
          currency,
        });
        return { content: [{ type: "text", text: "Summary updated" }] };
      },
    ),

    tool(
      "send_rfq_email",
      "Send an RFQ email to a supplier.",
      {
        vendorId: z.string(),
        subject: z.string().optional(),
        body: z.string().optional(),
      },
      async ({ vendorId, subject, body }) => {
        const vendor = rfq.get(vendorId);
        const to = vendor?.contact?.email ?? "sales@example.com";
        await sendRfqEmail({
          vendorId,
          to,
          subject: subject ?? "RFQ",
          body: body ?? "",
        });
        return {
          content: [{ type: "text", text: "Sent RFQ email to " + to }],
        };
      },
    ),

    tool(
      "call_supplier",
      "Place a phone call to negotiate a quote with a supplier.",
      {
        vendorId: z.string(),
        goal: z.string().optional(),
        targetPrice: z.number().optional(),
        walkAway: z.number().optional(),
        leadTimeDays: z.number().optional(),
      },
      async ({ vendorId, goal, targetPrice, walkAway, leadTimeDays }) => {
        const vendor = rfq.get(vendorId);
        const res = await callSupplier({
          vendorId,
          vendorName: vendor?.name ?? vendorId,
          phone: vendor?.contact?.phone ?? "",
          goal: goal ?? "negotiate a quote",
          targetPrice,
          walkAway,
          leadTimeDays,
          currency: vendor?.currency ?? "EUR",
        });
        const priceText =
          res.unitPrice != null
            ? "agreed " + res.unitPrice + " per unit"
            : "no quote";
        return {
          content: [
            {
              type: "text",
              text:
                "Call with " +
                (vendor?.name ?? vendorId) +
                ": " +
                priceText +
                ". " +
                res.transcript,
            },
          ],
        };
      },
    ),
  ],
});
