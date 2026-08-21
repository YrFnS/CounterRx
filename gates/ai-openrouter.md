# Leaf: ai-openrouter (Phase G — backend)

- [x] OpenRouter called ONLY through the Edge Function (no key in client).
  CHECK: `grep -rn 'OPENROUTER\|openrouter' src/ dist/ 2>/dev/null | grep -v node_modules` + `supabase/functions/ai-proxy/_shared/openrouter.ts`
  EXPECT: the key is read via `Deno.env.get("OPENROUTER_API_KEY")` server-side only; `src/lib/ai.ts` posts to `/functions/v1/ai-proxy/<ep>` with the session token; the built bundle contains no key.
  EVIDENCE: `dist/` grep clean; openrouter.ts is the sole key reader.
- [x] Session-authenticated, CORS-locked.
  CHECK: `grep -n 'getUser\|401\|ALLOWED_ORIGIN' supabase/functions/ai-proxy/index.ts supabase/functions/ai-proxy/_shared/auth.ts supabase/functions/ai-proxy/_shared/cors.ts`
  EXPECT: JWT verified via `supabase.auth.getUser`; unauthenticated → 401; origin echoed only when matching `ALLOWED_ORIGIN`.
  EVIDENCE: auth.ts + cors.ts.
- [x] Four typed endpoints (ocr/classify/forecast/anomaly).
  CHECK: `grep -n '"/ocr"\|"/classify"\|"/forecast"\|"/anomaly"' supabase/functions/ai-proxy/index.ts`
  EXPECT: each route dispatches to a handler; structured JSON errors, no 500 stack traces.
  EVIDENCE: index.ts router.
- [x] Every call logged to `ai_log` (prompt hash, no full PHI).
  CHECK: `grep -n 'ai_log\|prompt_hash\|sha256' supabase/functions/ai-proxy/_shared/ai-log.ts` + migration `20260821000007_ai_log.sql`
  EXPECT: `ai_log` org-scoped (RLS); sha256 prompt hash + truncated input + output summary; inserts as the calling user so `current_org_id()` resolves.
  EVIDENCE: migration 0007 pushed live (table present); ai-log.ts.
- [x] Typed client lib for the UI.
  CHECK: `grep -n 'aiOcr\|aiClassify\|aiForecast\|aiAnomaly' src/lib/ai.ts`
  EXPECT: thin typed client reusing the existing supabase session; no key.
  EVIDENCE: src/lib/ai.ts.
- [x] Full gate green.
  CHECK: `npm run typecheck && npm run test && npm run build`
  EVIDENCE: typecheck clean, 54 tests pass, build OK.

Not run: `deno check` / live function invocation — deno not installed locally. Function self-typechecks (temp Deno ambient stub) and follows the Supabase Edge runtime; live smoke test with a real OpenRouter key is a follow-up (needs `supabase secrets set OPENROUTER_API_KEY`). The 4 UI features (OCR intake, interaction assist, forecasting, alerts) are Phase G UI, not yet built.

## Phase G UI (feat/phase-g-ui)

- [x] Rx OCR intake (Prescriptions, P1).
  CHECK: "OCR prescription" button → photo (native file input `capture="environment"`) or clipboard paste → client-side resize → `aiOcr` → editable review form with fuzzy catalog suggestions → pharmacist confirms → `NEW_PRESCRIPTION` via the existing intake reducer path.
  EVIDENCE: `OcrIntakeModal` in `src/views/Prescriptions.tsx`; every field editable; AI never auto-creates; failure = toast + retry affordance + modal stays usable.
  NOTE: patient age/prescriber are not OCR-extractable from the endpoint shape — defaulted (45 / first active directory prescriber) and surfaced for pharmacist correction during review; recorded here as a known simplification.

- [x] Interaction checker assist (Register, P1).
  CHECK: subtle "AI second pass" action on the cart side → `cartToInteractionPrompt()` builds the prompt CLIENT-side (function receives final strings) → `aiClassify` → novel conflicts parsed into a review dialog for the pharmacist.
  EVIDENCE: `AiSecondPass` block in `src/views/Register.tsx`; never blocks checkout (pure advisory panel); API failure = inline degraded note + no crash.

- [x] Demand forecasting + reorder (Inventory, P1).
  CHECK: per-product "Forecast" action → history pulled from existing `state.transactions` (30-day daily units per product) → `aiForecast(history, products)` → dialog shows predicted demand + suggested reorder qty with a "use as reorder level" action the user can act on.
  EVIDENCE: `ForecastModal` in `src/views/Inventory.tsx`; payload builders in `src/lib/ai-ui.ts`; applying updates only after an explicit user click.

- [x] Anomaly alerts (Dashboard, P1).
  CHECK: alerts panel calls `aiAnomaly(summary)` with a compact summary built from existing state (period sales/returns totals, top products w/ stock-vs-reorder, low-stock count, recent returns) → renders anomaly cards (unusual returns / dead stock / stock-vs-sales divergence).
  EVIDENCE: `AiAlertsPanel` in `src/views/Dashboard.tsx`; panel hides itself entirely when the call fails (degrades to nothing, no error chrome).

- [x] AI usage readout (Dashboard footer, optional feature shipped).
  CHECK: tiny footer line queries `ai_log` count (last 24h) through the EXISTING supabase client (`from("ai_log").select("id", { count: "exact", head: true })`) — RLS scopes it to the org; query errors are swallowed and the line simply doesn't render.
  EVIDENCE: same panel component; no new tables/endpoints/env vars.

- [x] Prompt/payload helpers unit-tested.
  CHECK: `npm run test`
  EVIDENCE: `src/__tests__/ai-ui.test.ts` covers cart→prompt, classify JSON parse (incl. fenced output), history→forecast rows, anomaly summary shape, OCR fuzzy catalog match, and OCR→intake mapping. All prior 54 tests still green alongside the new suite.

- [x] i18n parity for every new string.
  CHECK: key-parity test enforces en/ar set equality
  EVIDENCE: all new strings under the appended `ai:` namespace in BOTH locale files; test passes.

Not run (follow-ups for the coordinator):
- Live end-to-end OCR/forecast/anomaly smoke against a deployed ai-proxy + real OpenRouter key (`supabase secrets set OPENROUTER_API_KEY`, then deploy the function). All UI paths handle rejection gracefully so undeployed functions degrade to toasts/hidden panels.
- `ai_log` has no update policy by design (append-only); marking outputs "reviewed" in-table would need a coordinator-approved migration — out of scope for Phase G UI.
