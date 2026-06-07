---
name: vapi-voice
description: How to set up and trigger the live AI-vs-AI phone negotiation with Vapi (or Retell/Bland) - two assistants, an outbound call, and transcript streaming into run state. Use for the voice close.
---

# Vapi Voice (AI-vs-AI live call)

The WOW moment: the procurement assistant phones the supplier assistant and they negotiate live,
with the transcript streaming to the dashboard.

## Setup (once)
1. **Supplier assistant (inbound):** a Vapi assistant whose system prompt = the `supplier-simulator`
   persona + hidden floor. Attach to a phone number.
2. **Procurement assistant (outbound):** a Vapi assistant whose system prompt = buyer negotiator
   using the `negotiation-playbook`, with dynamic variables for product, quantity, currentPrice,
   target, walkAway.
3. **Webhook:** point Vapi server messages (transcript, end-of-call-report) at your Next.js route
   `/api/vapi/webhook`, which appends rounds to `state/run-<id>.json`.

## Trigger an outbound call
```bash
curl -X POST https://api.vapi.ai/call \
  -H "Authorization: Bearer $VAPI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "assistantId": "<procurement_assistant_id>",
    "phoneNumberId": "<your_vapi_number_id>",
    "customer": { "number": "<supplier_assistant_number>" },
    "assistantOverrides": {
      "variableValues": { "product": "office chairs", "quantity": 500,
                          "currentPrice": 80, "target": 74, "walkAway": 80 }
    }
  }'
```

## Capture results
On `end-of-call-report`, parse the transcript for the final agreed price and terms; write a
`channel: "voice"` round + `voiceFinalPrice` to state; hand to `quote-analyst`.

## Demo tips
- Keep it < 90s: prompt both assistants to be decisive.
- Have the procurement assistant restate final terms aloud before hangup (clean extraction + great TV).
- **Fallback:** pre-record one good call transcript; if the live call errors, replay it through the
  same UI path so the dashboard still completes. Log that fallback was used.
- Alternatives with the same pattern: Retell, Bland.
