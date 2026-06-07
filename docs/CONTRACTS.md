# Procura — Build Contracts (read fully before writing code)

You are ONE of many parallel agents building **Procura**, an AI procurement officer
(React 19 + Vite + Tailwind v4 client; Hono + Claude Agent SDK server). **Build
only your assigned file(s)**; conform to these contracts so everything composes
and typechecks. Project root: `/Users/mac/Downloads/Digithon ` (note the trailing
space — always quote paths).

## The product / demo scenario
Buyer types: **"I need 50 brushless motors delivered by Friday under €60/unit"**.
The agent finds suppliers, emails RFQs, places a live phone call to negotiate,
fills a real-time comparison dashboard, and closes on one "Order Now" button.
The UI is a **pure live projection of a server SSE event stream**.

### Canonical demo dataset (use these exact ids/names everywhere)
- request: `{ raw: "I need 50 brushless motors delivered by Friday under €60/unit", item: "brushless motors", quantity: 50, deadline: "Friday", targetUnitPrice: 60, currency: "EUR" }`
- vendors:
  - `bolt` — "Bolt Industrial", "Berlin, DE", rating 4.6, moq 25, source "web" → **HERO CALL**: initial €62 → negotiated €57.60, leadTimeDays 4, meetsDeadline true → **WON**
  - `eurodrive` — "EuroDrive Systems", "Eindhoven, NL", rating 4.7, moq 20, source "web" → quoted €59, lead 5, meetsDeadline true
  - `acme` — "Acme Motors", "Munich, DE", rating 4.3, moq 50, source "email" → email reply €61, lead 6, meetsDeadline true
  - `shenzhen` — "Shenzhen MotorWorks", "Shenzhen, CN", rating 4.1, moq 100, source "email" → €54 but lead 21, **meetsDeadline false**
- winner: `bolt`; savings €220; within budget; 4 quotes.

### Hero-call negotiation transcript (use verbatim in demo.ts AND voice.ts fallback)
1. agent: "Hi, this is Procura calling on behalf of a buyer. We need 50 brushless motors delivered by Friday — could you give me your best unit price?"
2. supplier: "Sure. For 50 units we're around 62 euros per unit, delivered early next week."
3. agent: "Friday is firm for us, and our target is under 60 a unit. If you can hit Friday at 58, we'll order today."
4. supplier: "Friday is tight… I could do 59 if you confirm now."
5. agent: "Let's meet in the middle — 57.60 a unit, 50 units, delivered Friday, and we sign right now."
6. supplier: "Alright. 57.60 it is, delivered Friday. I'll send the confirmation."
7. agent: "Perfect — you'll have the PO within the hour. Thank you."
→ quote: unitPrice 57.6, currency EUR, leadTimeDays 4.

## Coding standards (STRICT — the project must typecheck)
- TypeScript + React 19 function components. **Default-export** the main component of each file.
- tsconfig: `verbatimModuleSyntax: true` → **`import type { … }` for type-only imports**. `noUnusedLocals`/`noUnusedParameters` ON → zero unused.
- Client imports use the `@/` alias: `import { useStore } from "@/store"`.
- Animation lib is **`motion/react`** (NOT framer-motion): `import { motion, AnimatePresence } from "motion/react"`.
- Libs: icons `lucide-react`; toasts `sonner`; animated numbers `@number-flow/react` (`import NumberFlow from "@number-flow/react"`); graph `@xyflow/react` (also `import "@xyflow/react/dist/style.css"`); confetti `canvas-confetti`.
- **Server imports are extensionless** (tsx): `import { bus } from "./bus"`. Use `zod` for tool schemas.

## Design system (clean professional LIGHT theme — "operator console")
Tailwind v4 token utilities (defined in client/src/index.css `@theme`):
`bg-app bg-surface bg-elevated bg-hover bg-sidebar bg-brand bg-brand-tint`,
`text-ink text-muted text-faint text-brand`,
`border-border border-border-strong`,
status: `text-call bg-call` (amber #d97706), `text-email` (violet), `text-quote text-success` (emerald), `text-web text-brand` (blue), `text-danger` (red), `text-warn`.
Shadows: `shadow-[var(--shadow-card)]`, `shadow-[var(--shadow-pop)]`. Radius `rounded-xl` (12), `rounded-2xl` (16), `rounded-lg` (8). Mono data: `font-mono tnum`. Eyebrow labels: `className="eyebrow"`. Dotgrid bg: `className="dotgrid"`.
Rules: white cards, hairline `border border-border`, soft card shadow. ONE accent (brand blue) for primary actions + active state; status colors ONLY on live/active. NO gradients, NO glassmorphism, NO pure-black text (use text-ink), no emoji as primary iconography (use lucide or our AgentGlyph). Calm, dense, precise.

## Client state — read from the store; most components take NO props
`import { useStore } from "@/store"`. Select narrow slices, e.g. `const vendors = useStore(s => s.vendors)`. Shapes live in `client/src/store.ts`; domain types in `client/src/lib/events.ts` — **READ BOTH**. Slices: `connected, running, model, request, thinking, status, toolCalls, toolOrder, subagents, subagentOrder, vendors, vendorOrder, summary, call, question, chat, order`. Actions: `applyEvents, pushChat, reset`. `useAgentStream()` is wired in App — do not call it yourself.
Helpers: `import { SPRING, SPRING_SNAPPY, cardVariants, fadeUp, useFakeAmplitude, formatMoney } from "@/lib/motion"`.
API: `import { startCommand, startDemo, sendChat, answerQuestion, placeOrder, resetRun } from "@/lib/api"`.

## Layout (so you know where your component lives)
`[ Sidebar (left nav, 256px) ][ center work area ][ ActivityPanel (right, ~320px) ]` with a `TopBar` (containing CommandBar) across the top of the center+right. Center work area stacks: `Headline` → `SwarmView` → `RfqBoard`; `CallPanel` overlays the lower center when a call is active; `Chat` sits in the right column under ActivityPanel (or a tab). Desktop-first; below `lg` the panels can stack. App.tsx composes everything — components self-source from the store.

## Server contract (for server-module files)
- `import { bus } from "./bus"` → `bus.emit(e)` where `e` is an `AgentEvent` from `./events`.
- `import { rfq } from "./state"` → `rfq.setRequest, upsertVendor, patchVendor, get, all, bestVendor, computeSummary, makeInvoice, reset`.
- Module interfaces other files import (match these EXACTLY):
  - `server/src/demo.ts` → `export function runDemo(): void`
  - `server/src/prompts.ts` → `export const SYSTEM_PROMPT: string`, `export const SCOUT_PROMPT: string`, `export const NEGOTIATION_PROMPT: string`
  - `server/src/tools.ts` → `export const appServer` (result of `createSdkMcpServer`)
  - `server/src/subagents.ts` → `export const SUBAGENTS: Record<string, AgentDefinition>` (type from `@anthropic-ai/claude-agent-sdk`)
  - `server/src/voice.ts` → `export interface CallArgs { vendorId: string; vendorName: string; phone: string; goal: string; targetPrice?: number; walkAway?: number; leadTimeDays?: number; currency?: string }`, `export interface CallResult { transcript: string; unitPrice?: number; leadTimeDays?: number; success: boolean }`, `export async function callSupplier(args: CallArgs): Promise<CallResult>`, `export function handleVapiWebhook(payload: any): { results?: Array<{ toolCallId: string; result: string }> } | void`
  - `server/src/email.ts` → `export interface EmailArgs { vendorId: string; to: string; subject: string; body: string }`, `export async function sendRfqEmail(args: EmailArgs): Promise<void>`
- All side-effecting server functions must `bus.emit(...)` the matching events AND keep `rfq` updated. When env keys are missing, **simulate** (still emit realistic events) so the app works offline.

## Quality bar
Production-grade, visually polished, accessible (aria where relevant), `useReducedMotion()` respected for big motion. No TODOs, no placeholder text other than the demo dataset. Return a one-line status when done.
