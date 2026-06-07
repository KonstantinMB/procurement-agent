# AI Procurement Agent — Claude Code Orchestration

An autonomous procurement "employee" built as a Claude Code orchestration: one **orchestrator**
coordinating specialized **subagents**, backed by reusable **skills**. The buyer states a need; the
system sources suppliers, sends RFQs, negotiates over email and a live AI-vs-AI phone call, tracks
everything in realtime, and reports verified savings.

## Layout
```
procurement-agent/
├── CLAUDE.md                      # Orchestrator brain — runs the full pipeline
├── .claude/
│   ├── agents/                    # Subagents (invoked by the orchestrator)
│   │   ├── supplier-sourcer.md    # web + seed -> ranked supplier list
│   │   ├── rfq-writer.md          # personalized RFQ per supplier
│   │   ├── supplier-simulator.md  # plays the SUPPLIER (hidden floor) — demo-safe
│   │   ├── quote-analyst.md       # parse/normalize quotes, owns the savings metric
│   │   ├── email-negotiator.md    # email counteroffer rounds
│   │   ├── voice-negotiator.md    # live Vapi AI-vs-AI phone close (the WOW)
│   │   └── proposal-writer.md     # buyer-facing deal summary
│   └── skills/                    # Reusable know-how
│       ├── negotiation-playbook/  # anchoring, concessions, walk-away
│       ├── rfq-generation/        # how to write RFQs
│       ├── supplier-sourcing/     # find + vet suppliers
│       ├── savings-tracking/      # state schema + savings math (monitored result)
│       └── vapi-voice/            # set up + trigger the AI-vs-AI call
├── data/seed-suppliers.json       # demo-safe supplier seed list (w/ hidden floors)
└── state/                         # run state (single source of truth) + proposals
    └── run-sample.json            # example completed run
```

## How orchestration works
1. Drop this folder into your repo (or point Claude Code at it). The orchestrator reads `CLAUDE.md`.
2. Give it a need: *"Source 500 ergonomic office chairs, EU, budget $90/unit, target $74."*
3. The orchestrator calls subagents in order, writing progress to `state/run-<id>.json` after each step.
4. Subagents pull tactics from the skills automatically.
5. The Next.js dashboard polls the state file (or a DB mirror) and renders the live result.

Pipeline: **sourcer -> rfq-writer -> (send) -> supplier-simulator (quotes) -> quote-analyst
(baseline) -> email-negotiator -> voice-negotiator -> quote-analyst (verify) -> proposal-writer**

## Demo-safety design
- The **supplier side is controlled** (`supplier-simulator` + seed floors), so negotiations are real
  *and* reproducible — no dependence on real businesses answering mid-demo.
- Hybrid sourcing: live web search proves capability; the seed list guarantees the demo runs.
- Voice has a recorded-transcript **fallback** path through the same UI.

## The monitored result
Defined in `skills/savings-tracking`: `$ saved`, `% off baseline`, and `elapsed vs human baseline`,
all recomputed and **verified** before reporting. Wire these to an animated counter on the dashboard.

## To run the voice piece
Set up two Vapi assistants (procurement + supplier) per `skills/vapi-voice/SKILL.md`, set
`VAPI_API_KEY`, and point the webhook at your Next.js `/api/vapi/webhook`. Retell/Bland work with the
same pattern.

## Env you'll likely need
`ANTHROPIC_API_KEY` (or your LLM), `VAPI_API_KEY`, `RESEND_API_KEY` (or Gmail), and a DB URL if you
mirror state to Supabase/sqlite for the dashboard.
