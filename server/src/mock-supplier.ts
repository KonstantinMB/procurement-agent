// ─────────────────────────────────────────────────────────────────────────
// MOCK SUPPLIER — the one controlled supplier we actually negotiate against.
//
// A live run discovers REAL suppliers from the web, each with an EMAIL contact;
// those are compared on price and reached by email — Procura must never cold-call
// or cold-email a business it found online. The live phone negotiation (the hero
// call) instead runs against THIS seeded in-network supplier, which carries BOTH
// a phone and an email so the demo can drive it over either channel:
//   • voice  → always rings the controlled demo line (DEMO_SUPPLIER_NUMBER),
//   • email  → goes to its real, owned address (MOCK_SUPPLIER_EMAIL), bypassing
//              the DEMO_SUPPLIER_INBOX catch-all that protects scraped suppliers.
// It is the ONLY row ever really dialed; everyone else falls back to the scripted
// call. See voice.ts (dialing) and email.ts (routing).
// ─────────────────────────────────────────────────────────────────────────

import { slugify } from "./state";
import type { Vendor } from "./events";

/** Display name of the seeded supplier (also referenced in the system prompt). */
export const MOCK_SUPPLIER_NAME = "DirectLine Supply Co.";

/** Canonical id — derived from the name so id and slug can never drift apart. */
export const MOCK_SUPPLIER_ID = slugify(MOCK_SUPPLIER_NAME);

/** Presentable number shown on the board (real routing goes through demoLine). */
const DISPLAY_PHONE = "+31 10 240 0610";

/**
 * The owned inbox that plays the supplier side over email. Env-overridable so it
 * can change per demo without a code edit; defaults to the agreed demo address.
 */
export function mockSupplierEmail(): string {
  return process.env.MOCK_SUPPLIER_EMAIL ?? "konstantin.borimechkov14@gmail.com";
}

/**
 * The controlled line we actually ring for the hero call. Kept in env (gitignored)
 * so no real number is committed; falls back through the legacy var. Empty when
 * unset, in which case the call degrades to the scripted negotiation.
 */
export function demoLine(): string {
  return process.env.DEMO_SUPPLIER_NUMBER ?? process.env.FALLBACK_PHONE_NUMBER ?? "";
}

/**
 * Build the seeded supplier for a run. Carries BOTH a phone and an email, starts
 * "discovered" with no price, and gets its price only via the live negotiation —
 * so the real email suppliers set the baseline and the supplier we actually
 * negotiate sets the cheaper, verified winner.
 */
export function makeMockSupplier(): Vendor {
  return {
    id: MOCK_SUPPLIER_ID,
    name: MOCK_SUPPLIER_NAME,
    location: "Rotterdam, NL",
    rating: 4.5,
    moq: 1,
    source: "call",
    contact: { phone: DISPLAY_PHONE, email: mockSupplierEmail() },
    status: "discovered",
  };
}
