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
