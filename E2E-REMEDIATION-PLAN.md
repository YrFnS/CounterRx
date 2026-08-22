# E2E Remediation Plan — CounterRx

> Consolidates: (1) bugs found by the 5-role browser E2E run (2026-08-21/22, herdr w13),
> (2) incomplete E2E work, (3) the requested login change (PIN pad → email+password),
> (4) remaining verification. Branch `fix-backend-db-supabase`.

## Status legend

- ✅ done & committed · ⏳ in progress · 🔴 open · 🔵 verify-only

---

## Part 1 — E2E findings (bugs from the role agents)

### Already fixed & committed

| # | Finding (source agent) | Fix | Commit |
|---|------------------------|-----|--------|
| 1 | Reports MarginTab duplicate React `key` (drug-name collisions) | key rows by productId/category | `2b89d83` |
| 2 | Dev auto-login stub (`setState`-in-render, auto-login as manager) | removed stub + reverted agent formatting pollution of App.tsx | (revert) |
| 3 | Forecast button never rendered — `setForecasting` only wired to modal, nothing opens it (pharmacy_admin) | added Forecast (trend-up) button per product row | `3bb896f` |
| 4 | Reports Analytics tab labelled "Title" — `analytics.title` placeholder leaked to UI (pharmacy_admin) | en/ar `analytics.title` → "Analytics" / "التحليلات" | `3bb896f` |
| 5 | Settings coupons tab rendered raw key `analytics.coupons` (nonexistent) (pharmacy_admin) | use existing `analytics.couponsTitle` | `3bb896f` |
| 6 | Agent PERMS pollution: `super_admin` added to every perm in `src/data.ts` (breaks `perms-seed` test by design) | reverted `src/data.ts` (twice — pharmacy_admin & super_admin agents both did it) | (revert) |

### Open bugs

| # | Finding | Source | Severity | Action |
|---|---------|--------|----------|--------|
| B1 | **Coupons not visible** — Settings→Coupons shows "No coupons yet", expected WELCOME10/SAVE5 | pharmacy_admin | 🔴 | 🔵 **Verify first**: live DB has 2 coupons (verified earlier via REST); the agent ran offline so local seed (`coupons: []` in store.tsx seed) showed nothing. Re-verify against live backend. If coupons still absent when online → investigate sync of `coupons` table + RLS select policy. |
| B2 | **JWT clock skew** — `PGRST303 "JWT issued at future"` on deliveries/sync load | pharmacist, super_admin | 🟡 | 🔵 Diagnose Supabase client token/clock handling (`supabase.auth` session vs server clock). Likely machine-clock drift or token refresh timing. Non-blocking but noisy; check server/system time sync first. |
| B3 | **Cashier "Till & Reports" nav inconsistency** — nav button visible for cashier but target sometimes shows access-denied, sometimes report UI | cashier | 🟡 | 🔴 Investigate: is the till view gated by `VIEW_ROLES` (cashier allowed) while the inner report render checks a permission cashier lacks? Pick one consistent behavior; align nav visibility with actual gate. |
| B4 | **Store credit disabled for cashier** (button visible, disabled) | cashier | 🟢 | 🔵 Verify intended: `issue credit` likely requires manager+ (sensible). If intended, keep; if not, grant or hide. |
| B5 | **PIN lockout UX** — 5 failed PINs → 60s lockout, no countdown feedback | cashier | 🟢 | 🔴 (only if login stays PIN) Superseded by the login change below — email/password login replaces the PIN pad; re-assess lockout policy then. |
| B6 | **RLS 42501 on write tables from cashier session** — persist staff/prescribers/cold_chain_log/prescriptions/backorders rejected | cashier | 🟡 | 🔵 Expected per design? These tables are read-mostly from the till; a cashier triggering writes (e.g. cold-chain log) hitting RLS is a policy question. Decide: extend RLS for allowed writes or accept warnings. Verify against LIVE backend (agent ran with backend flaky). |

---

## Part 2 — Incomplete E2E work

| # | Gap | Status | Action |
|---|-----|--------|--------|
| E1 | **super_admin REPORT.md missing** — 20 screenshots (login → all 10 views → RTL flip → logout) exist in `outputs/e2e/super_admin/`; agent hit 413 message-limit before writing the report | ⏳ | Resume agent (fresh pi session in w13:p5, like manager recovery): reuse the 20 screenshots, do only the missing tail (console check, route-guard confirm) and write REPORT.md. |
| E2 | **Login flows re-test** — all E2E used PIN login; the login change (Part 3) replaces it | 🔴 | After login lands: re-run login + logout + route-guard checks per role (can be one consolidated agent, not 5 full runs). |
| E3 | **Live-backend E2E pass** — agents mostly ran with backend flaky/offline (`Backend unavailable` banner); RLS 42501 non-failures never observed against live | 🔴 | One agent against live Supabase (dev server + configured client): login, one sale, one inventory write, verify no unexpected errors. |

---

## Part 3 — Login change: PIN pad → email + password (user-approved, full replace)

**Current state:** Supabase auth is already email+password under the hood (`signInStaff` → `signInWithPassword({ email: "s00X@counterrx.local", password: "CRxS00X<PIN>" })`, seeded auth.users in seed.sql). The lock screen is a staff-card grid + 4-digit PIN keypad that maps card+PIN → that call. The user chose FULL REPLACE.

| # | Task | Detail | Status |
|---|------|--------|--------|
| L1 | LockScreen UI → email+password form | Remove staff-card grid + PIN keypad; email + password inputs + Sign in (Enter submits). Keep RTL/i18n (`t()` keys in en+ar, set-equality parity). | ⏳ agent p8 started, went idle (413) mid-implementation — **resume/relaunch** |
| L2 | `signInStaffByEmail(email, password)` in src/lib/sync.ts | Call `signInWithPassword(email, password)` with typed creds; map email → staffId (`s001@…` → S-001); return `{staffId, ok}`. Offline fallback: seeded staff by email + deterministic seed-password check. Keep `BACKEND_AUTH` dispatch flow. | ⏳ |
| L3 | Update callers + tests | App.tsx submit handler; drop `selected.pinHash`/`hashPin` paths; update __tests__ exercising LOGIN; keep LOGIN action + role guards + `signOutStaff`/Switch-profile. | ⏳ |
| L4 | Seed/docs note | Emails/passwords already live (`s00X@counterrx.local` / `CRxS00X<digits>`); document creds in README or login hint if desired. | 🔴 |
| L5 | Gate | typecheck + 87 tests + build green; commit `feat(auth): replace PIN pad with email/password login`; push; i18n parity test passes. | ⏳ |

**After L1–L5:** E2 (re-test logins) becomes possible. B5 (PIN lockout) is superseded.

---

## Part 4 — Remaining verification & closeout

| # | Item | Action |
|---|------|--------|
| V1 | Full gate re-run on `fix-backend-db-supabase` | `npm run typecheck && npm run test && npm run build` (87 tests) after login lands |
| V2 | Live Supabase audit | Re-verify all 27 tables + seed counts (products 40, coupons 2, c2_movements 2, …) as s001 |
| V3 | Live AI smoke test (deferred earlier) | `supabase secrets set OPENROUTER_API_KEY` + `supabase functions deploy ai-proxy` (deno needed or use npx supabase), then ocr/classify/forecast/anomaly end-to-end; verify every UI path degrades gracefully when undeployed |
| V4 | E2E evidence consolidated | `outputs/e2e/g9-evidence.md` + 5 role reports; update GATES.md status if gate text references login flow |
| V5 | Close out herdr | Confirm all worktree branches closed, main pushed, no agent left running |

---

## Suggested execution order

1. **L1–L5 login change** (blocking E2 re-test) — resume agent p8 (fresh session to dodge 413).
2. **E1** super_admin REPORT (parallel-safe, quick).
3. **B1** coupons verify against live; fix sync if actually broken.
4. **B2** JWT clock-skew diagnosis (cheap; check system time first).
5. **B3** cashier till-nav consistency fix.
6. **E3 + V1** live-backend E2E pass + full gate.
7. **V2, V3** live audit + AI smoke test.
8. **V4, V5** evidence consolidation + closeout.
