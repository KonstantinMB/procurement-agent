---
name: supplier-sourcing
description: How to find and vet suppliers from the web plus a seed list, and produce a ranked, contactable list. Use at the start of a procurement run.
---

# Supplier Sourcing

## Strategy: hybrid
- **Live web** proves the capability and finds real options.
- **Seed list** (`data/seed-suppliers.json`) guarantees the demo never dies on a dead page.

## Finding
Run targeted searches: `"<product>" supplier <region>`, `"<product>" wholesale distributor`,
`buy <product> bulk B2B`. Prefer manufacturer/distributor sites and B2B marketplaces. Fetch the
1-2 best to extract company, products, contact email/phone, MOQ signals.

## Vetting checklist
- Supplies this exact product at the needed quantity?
- Region/shipping feasible?
- Legitimacy signals (real site, address, catalog, reviews)?
- Any price-competitiveness signal (wholesale, factory-direct)?

## Output: ranked list with fitScore (0-100)
Weight product match (40), capacity/MOQ fit (25), region/logistics (20), competitiveness signal (15).

## Demo guidance
Cap at ~5 suppliers. Mark contacts you couldn't verify as `null` - never fabricate. Don't auto-email
real businesses during a demo; route outreach to the controlled supplier-simulator.
