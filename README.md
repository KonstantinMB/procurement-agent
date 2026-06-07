# Procura — AI Procurement Officer

Brief it in one sentence — *"I need 50 brushless motors delivered by Friday under €60/unit"* — and Procura runs the whole procurement cycle live: searches the web for suppliers (a sub-agent swarm), **calls a supplier and negotiates by voice**, emails RFQs, fills a real-time comparison dashboard, and closes the deal on one **Order Now** button. The entire UI is a live projection of a server event stream.

Built on the **Claude Agent SDK** (Opus 4.8, `effort: max`) with **Vapi** for the live phone call (Claude as the brain, ElevenLabs voice).

## Stack
- **Client:** Vite + React 19 + TypeScript + Tailwind v4, `motion`, `@xyflow/react` (swarm graph), `@number-flow/react`, `canvas-confetti`, `zustand`. SSE for live updates.
- **Server:** Hono (Node) running the Claude Agent SDK headless; in-process MCP tools; Vapi + Nodemailer integrations. One typed event bus → SSE.

## Run
```bash
# from the project root
npm --prefix server install && npm --prefix client install   # first time
npm run dev                                                   # starts both (server :8787, client :5173)
```
Open http://localhost:5173 and click **Try demo** (or type a request and hit Run).

> Run the servers separately if you prefer: `npm run dev:server` and `npm run dev:client`.

## Two modes
- **Demo mode (default):** a fully scripted, deterministic run — zero external dependencies, perfect for the stage. `Try demo` or any request triggers it.
- **Real mode:** set `AGENT_MODE=real` in `server/.env` to drive the live Claude Agent SDK (real web-search sub-agents, real Vapi call, real Gmail). Auth comes from your logged-in `claude` CLI — no `ANTHROPIC_API_KEY` needed. Provide the keys below for the side-effects you want live; anything unconfigured gracefully **simulates** (still emits realistic events).

## Environment (`server/.env`, see `server/.env.example`)
| Var | Purpose |
|---|---|
| `AGENT_MODE=real` | Switch the command bar from demo → live agent |
| `VAPI_API_KEY`, `VAPI_ASSISTANT_ID`, `VAPI_PHONE_NUMBER_ID`, `VAPI_WEBHOOK_SECRET` | Live phone call (Vapi: Claude LLM + ElevenLabs voice). Webhook: `POST /webhooks/vapi` |
| `ELEVENLABS_API_KEY` | Voice (configured inside Vapi) |
| `GMAIL_USER`, `GMAIL_APP_PASSWORD` | Real RFQ emails via Nodemailer |
| `TWILIO_*` | Only if bringing your own number into Vapi |
| `OPENAI_API_KEY` | Optional (Vapi's default transcriber suffices) |

## How the live showcase works
The agent drives the dashboard **through its tool calls** — `add_supplier`, `update_quote`, `call_supplier`, `send_rfq_email` — each handler emits a typed event onto the bus, which streams to the browser over SSE and animates the swarm graph, the RFQ board, the activity feed, and the cinematic call panel in real time. See `docs/CONTRACTS.md` for the full event contract and `/Users/mac/.claude/plans/…-tender-turing.md` for the design.
