# W4.3 — E-Prescribing Readiness (Surescripts / EPCS)

**Status:** Code seam only. Real e-prescribing **cannot** be turned on from this
repo — it requires a third-party trading-partner account and certification.
This document records what that takes, and maps it against what CounterRx
already supports in code.

**Scope of this task:** `src/lib/rxmessage.ts` (inbound SCRIPT parser + storage
mapping + outbound `NewRx` builder), this doc, and its tests. No live network
calls, no UI, no certification path.

---

## 1. What real e-prescribing requires

### 1.1 A trading-partner / hub account (the hard blocker)

CounterRx must connect to a pharmacy network hub. In the US that is
**Surescripts** (dominant) or an EHR/processor that is itself a Surescripts
member. You do **not** talk NCPDP SCRIPT directly to prescribers — you talk to
the hub, which routes to the prescriber's EHR.

| Requirement | Why |
|---|---|
| Pharmacy NCPDP ID (9-digit, NPI-linked) | Hub routes messages to *your* pharmacy |
| Surescripts (or member) service agreement | Legal + billing; per-transaction fees |
| Network connection (sandbox → production) | Certified endpoint; certs rotate |
| Vendor/solution certification | Hub validates your software build before go-live |

> This is the "USER ACTION ITEM" from the build plan (item 3 / 4). None of it is
> provisionable in-repo. The `buildNewRxMessage`/`parseNewRx` functions here are
> the **integration seam** a real hub SDK would slot into.

### 1.2 NCPDP SCRIPT standard

Messages are XML against the NCPDP **SCRIPT** standard (current version family
`20170701` and onward). Transaction types we care about:

- `NewRx` — prescriber → pharmacy (inbound here)
- `RefillRequest` / `RefillResponse` — pharmacy ↔ prescriber
- `CancelRx`, `RxChangeRequest` — lifecycle
- `Error` / `Verify` — hub-level acknowledgements

The skeleton in `rxmessage.ts` parses the `NewRx` body fields (patient,
medication, prescriber, pharmacy) and builds the same shape outbound. It is a
**subset** — the full standard has mandated segments (benefits, prior-auth
attachments, structured sig codes) that a certified build must emit.

### 1.3 EPCS (Electronic Prescribing of Controlled Substances)

Controlled-substance e-prescribing has extra DEA requirements on top of SCRIPT:

- **PKI identity proofing** — prescribers issue e-prescriptions under a DEA
  **certificate**, signed by an approved Certificate Authority.
- **Two-factor authentication tokens** — each e-prescription of a controlled
  substance requires a separate, hard-token (or approved soft-token) auth event.
- **Tamper-evident audit** of every EPCS event (credential issued, used, failed).
- Identity proofing at enrollment, re-verified periodically.

CounterRx today has prescriber **NPI/DEA on file** (`Prescriber` interface) but
no PKI material, no EPCS token flow, and no controlled-substance e-sign path.

### 1.4 Audit requirements

EPCS and SCRIPT both demand an immutable, time-stamped audit of who did what:

- CounterRx already emits an `AuditEntry` ledger (`AuditKind: "rx"`) on every Rx
  intake, prescriber change, transfer, and verification — see `withAudit` in
  `src/store.tsx`. This is the right substrate; EPCS would add a credential-use
  sub-audit beside it.
- Records must be tamper-evident and retained per state/federal schedule (audit
  log is capped at 250 rows in-memory today — a real deployment must persist to
  Supabase, not truncate).

### 1.5 Where certification is impossible without an account

- All hub connectivity, message routing, and production certs.
- PKI cert issuance and EPCS token provisioning (external CAs + token vendors).
- Go-live scripts / transaction fees / contractual SLAs.

---

## 2. Readiness checklist — what the codebase already supports

| Capability | Supported? | Evidence |
|---|---|---|
| Prescriber directory (NPI + DEA on file) | ✅ | `Prescriber` interface + `makePrescribers()` in `src/data.ts`; CRUD in `src/store.tsx` (`PRESCRIBER_*`) |
| Prescription / Rx model | ✅ | `Prescription` interface in `src/data.ts`; `NEW_PRESCRIPTION` action builds the same shape |
| Controlled-substance flag | ✅ | `Product.controlled` (DEA schedule C-II…C-V) + till ID/audit gating |
| Rx audit log | ✅ | `AuditEntry` + `AuditKind "rx"` via `withAudit` |
| Patient identity (name, DOB, phone) | ✅ | `Prescription.patient/age/phone`; `Customer` profile (DOB, gender) |
| Drug identity (NDC) | ✅ | `Product.ndc` (5-4-2); `NDC_DIRECTORY` lookup |
| Inbound SCRIPT `NewRx` parse | ✅ (skeleton) | `parseNewRx()` in `src/lib/rxmessage.ts` |
| Storage mapping NewRx → `Prescription` | ✅ (skeleton) | `mapRxMessageToPrescription()` |
| Outbound `NewRx` build | ✅ (skeleton) | `buildNewRxMessage()` |

## 3. Readiness checklist — what is MISSING (the seam)

| Capability | Status | Notes |
|---|---|---|
| Hub / Surescripts account + endpoint | ❌ | External — user action item |
| Network transport (sandbox→prod, cert rotation) | ❌ | `src/lib/sync.ts` pattern is the analog to extend |
| EPCS PKI + two-factor token flow | ❌ | No cert store, no token auth event |
| Full NCPDP SCRIPT coverage (`RefillRequest`, `RxChange`, `Verify`, `Error`) | ❌ | Only `NewRx` skeleton today |
| Structured sig / directions codes | ❌ | Directions stored as free text (`Prescription.note`) |
| Prescriber NPI/DEA → directory auto-resolution on inbound | ⚠️ | `mapRxMessageToPrescription` takes a resolver; not wired to live state |
| Product NDC → catalog id resolution on inbound | ⚠️ | Same — resolver seam, no live lookup |
| Durable / tamper-evident audit (no 250-row cap) | ⚠️ | Must persist to Supabase for EPCS |
| Production certification of the software build | ❌ | Hub-side validation |

---

## 4. How to wire the seam later (no code change needed now)

`src/lib/rxmessage.ts` exposes three pure functions:

- `parseNewRx(xml: string): RxMessage` — inbound.
- `mapRxMessageToPrescription(msg, ctx)` — `ctx` supplies
  `resolvePrescriberId` (NPI→directory id) and `resolveProductId`
  (NDC/description→catalog id) plus `nextRxId()`. The hub integration would
  feed the live `state.prescribers` / `state.products` here.
- `buildNewRxMessage(rx, ctx)` — outbound; `ctx` supplies the patient, product,
  prescriber records and sender NCPDP id.

The store's `NEW_PRESCRIPTION` reducer in `src/store.tsx` builds the identical
`Prescription` shape, so a future certified path can dispatch `NEW_PRESCRIPTION`
after mapping an inbound message — or call the parser/mapper directly.

> Until a hub account exists, treat all of this as a parser/serializer utility,
> exercised by `src/__tests__/rxmessage.test.ts`. Do **not** mark e-prescribing
> "live" without §1.1–§1.4 satisfied.
