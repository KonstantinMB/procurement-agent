---
name: savings-tracking
description: The run state schema and how to compute and report the monitored result (dollars and percent saved, time elapsed). Use to read/write run state and to produce the hero metric the dashboard displays.
---

# Savings Tracking (the monitored result)

The whole project is judged on a believable, verified saving. This skill defines the single source
of truth and the math.

## State file: `state/run-<id>.json`
```json
{
  "id": "run_001",
  "need": { "product": "Ergonomic office chairs", "quantity": 500,
            "specs": "...", "region": "EU", "targetPrice": 74, "budgetPrice": 90 },
  "status": "sourcing|rfq_sent|quoting|negotiating|voice|done",
  "startedAt": "ISO", "finishedAt": "ISO",
  "suppliers": [
    { "id": "sup_1", "name": "...", "contact": "...", "source": "web|seed", "fitScore": 88,
      "rfq": { "subject": "...", "body": "...", "createdAt": "ISO" },
      "quote": { "unitPrice": 84, "quantity": 500, "leadTime": "3w",
                 "paymentTerms": "net-30", "freight": "FOB", "landedUnit": 86, "receivedAt": "ISO" },
      "negotiationRounds": [
        { "channel": "email", "offer": 71, "counter": 80, "ts": "ISO", "rationale": "..." },
        { "channel": "voice", "offer": 73, "counter": 76, "ts": "ISO" }
      ],
      "floorPrice": 72
    }
  ],
  "baselineTotal": 43000,
  "ranking": ["sup_1", "sup_3", "sup_2"],
  "deal": { "supplierId": "sup_1", "finalUnit": 74, "finalTotal": 37000,
            "savings": 6000, "pct": 0.14, "verified": true },
  "metrics": { "suppliersContacted": 5, "quotesReceived": 4, "rounds": 3,
               "elapsedMs": 360000, "humanBaselineHours": 24 }
}
```
> `floorPrice` is supplier-simulator-internal. Never surface it in buyer-facing output.

## Math
- `landedUnit` = unitPrice + freight-per-unit + payment-term cost adjustment.
- `baselineTotal` = min(best initial landed total across suppliers, budgetPrice x quantity).
- `finalTotal` = finalUnit x quantity (+ landed adjustments).
- `savings` = baselineTotal - finalTotal; `pct` = savings / baselineTotal.
- `elapsed` = finishedAt - startedAt. Compare to `humanBaselineHours` for the "X days -> Y min" line.

## Verification (always before reporting)
Recompute savings from raw fields; confirm finalUnit appears in the last negotiation round;
confirm quantity unchanged; set `deal.verified=true` only if it all reconciles. Otherwise flag.

## Dashboard hero metrics
`$ saved` (animated counter), `% off baseline`, `elapsed vs human`, plus live counts of suppliers /
quotes / rounds. The Next.js dashboard polls this file (or its DB mirror) every ~1s.
