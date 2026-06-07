// POST helpers — same-origin; Vite proxies /api → http://localhost:8787

async function post(path: string, body?: unknown): Promise<unknown> {
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

export const startCommand = (text: string) => post("/api/command", { text });
export const sendChat = (text: string) => post("/api/chat", { text });
export const answerQuestion = (id: string, answers: Record<string, string>) =>
  post("/api/answer", { id, answers });
export const placeOrder = (vendorId: string) => post("/api/order", { vendorId });
export const startDemo = () => post("/api/demo");
export const resetRun = () => post("/api/reset");
