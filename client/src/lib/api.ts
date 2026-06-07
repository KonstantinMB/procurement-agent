// POST helpers — same-origin; Vite proxies /api → http://localhost:8787

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

/** Start a NEW parallel run; resolves to the server-assigned runId. */
export const startCommand = (text: string): Promise<{ runId?: string }> =>
  post("/api/command", { text });
export const sendChat = (runId: string, text: string) => post("/api/chat", { runId, text });
export const answerQuestion = (id: string, answers: Record<string, string>) =>
  post("/api/answer", { id, answers });
export const placeOrder = (runId: string, vendorId: string) =>
  post("/api/order", { runId, vendorId });
/** Remove a single run from the dashboard. */
export const removeRun = (runId: string) => post("/api/run/remove", { runId });
/** Global reset — abort and clear every run. */
export const resetRun = () => post("/api/reset");
