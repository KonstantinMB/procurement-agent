import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { bus } from "./bus";
import { rfqs, type RfqState } from "./state";
import { sendRfqEmail } from "./email";
import { callSupplier } from "./voice";
import { runClaudeResearch } from "./research";
import type { Vendor, VendorStatus } from "./events";

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const VALID_VENDOR_STATUSES = new Set<VendorStatus>([
  "discovered",
  "emailing",
  "calling",
  "quoted",
  "negotiating",
  "won",
  "lost",
]);

/** The LLM occasionally invents free-form statuses ("researching", "ranking",
 *  etc.). Coerce anything we don't recognize into a safe known value so the
 *  client renderer never receives an unmapped string. */
function coerceVendorStatus(raw: string | undefined): VendorStatus | undefined {
  if (!raw) return undefined;
  if (VALID_VENDOR_STATUSES.has(raw as VendorStatus)) return raw as VendorStatus;
  const lower = raw.toLowerCase();
  if (lower.includes("won") || lower.includes("agreed") || lower.includes("close")) return "won";
  if (lower.includes("lost") || lower.includes("declin") || lower.includes("reject")) return "lost";
  if (lower.includes("negot")) return "negotiating";
  if (lower.includes("call") || lower.includes("ring")) return "calling";
  if (lower.includes("email") || lower.includes("rfq") || lower.includes("outreach")) return "emailing";
  if (lower.includes("quote") || lower.includes("price")) return "quoted";
  return "discovered";
}

/**
 * Build a per-run MCP server. Every tool emits events stamped with this runId
 * and mutates only this run's RfqState — so concurrent RFQ runs stay isolated.
 */
export function createAppServer(runId: string) {
  const getRfq = (): RfqState => rfqs.getOrThrow(runId);

  return createSdkMcpServer({
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
          const r = getRfq();
          const prev = r.request ?? { raw: "" };
          const request = {
            ...prev,
            ...(item !== undefined ? { item } : {}),
            ...(quantity !== undefined ? { quantity } : {}),
            ...(deadline !== undefined ? { deadline } : {}),
            ...(targetUnitPrice !== undefined ? { targetUnitPrice } : {}),
            ...(currency !== undefined ? { currency } : {}),
          };
          r.setRequest(request);
          bus.emit(runId, { type: "rfq.request", request });
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
          const r = getRfq();
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
              ? { initialPrice: unitPrice, currency: r.request?.currency }
              : {}),
          };
          r.upsertVendor(vendor);
          bus.emit(runId, { type: "rfq.supplier_added", vendor });
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
          const r = getRfq();
          const addedIds = new Set<string>();
          const addedRows: Array<{ id: string; name: string; phone?: string; email?: string }> = [];
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
            addedRows.push({ id, name: s.name, phone: s.phone, email: s.email });
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
                ? { initialPrice: s.unitPrice, currency: currency ?? r.request?.currency }
                : {}),
            };
            r.upsertVendor(vendor);
            bus.emit(runId, { type: "rfq.supplier_added", vendor });
          };

          const all = await runClaudeResearch(
            { item, quantity, region, targetPrice, currency, count },
            {
              onSupplier: addOne,
              onActivity: (act) => {
                if (act.done) {
                  bus.emit(runId, { type: "tool.result", id: act.id, status: "done" });
                } else {
                  bus.emit(runId, {
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
          for (const s of all) addOne(s);

          if (addedRows.length === 0) {
            return {
              content: [
                {
                  type: "text",
                  text: `No suppliers found via research for ${item}; broaden the query or add one manually.`,
                },
              ],
            };
          }
          const lines = addedRows.map(
            (rr) =>
              `- id="${rr.id}" · name="${rr.name}"` +
              (rr.phone ? ` · phone=${rr.phone}` : "") +
              (rr.email ? ` · email=${rr.email}` : ""),
          );
          return {
            content: [
              {
                type: "text",
                text:
                  `Added ${addedRows.length} real suppliers for ${item}. ` +
                  `When you call_supplier or update_quote, pass one of these EXACT ids as vendorId:\n` +
                  lines.join("\n"),
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
          const r = getRfq();
          const patch: Partial<Vendor> = {};
          if (status !== undefined) {
            const coerced = coerceVendorStatus(status);
            if (coerced) patch.status = coerced;
          }
          if (unitPrice !== undefined) {
            patch.negotiatedPrice = unitPrice;
            const existing = r.get(id);
            if (existing?.initialPrice == null) patch.initialPrice = unitPrice;
          }
          if (leadTimeDays !== undefined) patch.leadTimeDays = leadTimeDays;
          if (note !== undefined) patch.note = note;
          if (meetsDeadline !== undefined) patch.meetsDeadline = meetsDeadline;
          r.patchVendor(id, patch);
          bus.emit(runId, { type: "rfq.supplier_updated", id, patch });
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
          const r = getRfq();
          const currency = r.request?.currency ?? "EUR";
          bus.emit(runId, {
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
          const r = getRfq();
          const vendor = r.get(vendorId);
          const to = vendor?.contact?.email ?? "sales@example.com";
          await sendRfqEmail({
            runId,
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
          const r = getRfq();
          const vendor = r.get(vendorId);
          const currency = vendor?.currency ?? r.request?.currency ?? "EUR";
          const others = r
            .all()
            .filter((v) => v.id !== vendorId)
            .map((v) => ({ name: v.name, price: v.negotiatedPrice ?? v.initialPrice }))
            .filter((x) => typeof x.price === "number");
          const benchmarks =
            others.length > 0
              ? others.map((x) => `${x.name}: ${x.price} ${currency}/unit`).join("; ")
              : "";
          const res = await callSupplier({
            runId,
            vendorId,
            vendorName: vendor?.name ?? vendorId,
            phone: vendor?.contact?.phone ?? "",
            goal: goal ?? r.request?.item ?? "negotiate a quote",
            quantity: r.request?.quantity,
            targetPrice,
            walkAway,
            leadTimeDays,
            currency,
            benchmarks,
          });
          const priceText =
            res.unitPrice != null ? "agreed " + res.unitPrice + " per unit" : "no quote";
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
}
