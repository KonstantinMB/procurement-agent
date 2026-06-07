// POST/GET helpers — same-origin; Vite proxies /api → http://localhost:8787
import type { RunSummary } from "@/lib/events";

async function post(path: string, body?: unknown): Promise<any> {
  try {
    const r = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    return r.ok ? await r.json().catch(() => ({})) : {};
  } catch {
    return {};
  }
}

async function getJson(path: string): Promise<any> {
  try {
    const r = await fetch(path);
    return r.ok ? await r.json().catch(() => ({})) : {};
  } catch {
    return {};
  }
}

/** Start a new RFQ run. Resolves to the server-assigned runId. */
export async function startCommand(text: string): Promise<string | undefined> {
  const r = await post("/api/command", { text });
  return typeof r?.runId === "string" ? r.runId : undefined;
}

export const sendChat = (runId: string, text: string) =>
  post("/api/chat", { runId, text });

export const answerQuestion = (
  runId: string,
  id: string,
  answers: Record<string, string>,
) => post("/api/answer", { runId, id, answers });

export const placeOrder = (runId: string, vendorId: string) =>
  post("/api/order", { runId, vendorId });

export const resetRun = (runId: string) => post("/api/reset", { runId });

export async function listRuns(): Promise<RunSummary[]> {
  const r = await getJson("/api/runs");
  return Array.isArray(r?.runs) ? (r.runs as RunSummary[]) : [];
}
