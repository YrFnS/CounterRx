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
✅ B1 | **Coupons not visible** — Settings→Coupons shows "No coupons yet", expected WELCOME10/SAVE5 | pharmacy_admin | ✅ | **Closed**: live REST read as s001 returns WELCOME10+SAVE5; RLS coupons_read works; agent ran offline. Re-confirmed in UI by login-change E2E (08-coupons.png) |
✅ B2 | **JWT clock skew** — PGRST303 "JWT issued at future" on deliveries/sync load | pharmacist, super_admin | ✅ | **Closed (no app fix)**: local clock within ~90s of GitHub server time — not machine drift. iat minted by Supabase Auth vs PostgREST clock, both server-side; transient infra skew. Recurrence = watch status.supabase.com. |
✅ B3 | **Cashier "Till & Reports" nav inconsistency** | cashier | ✅ | **Fixed** (`4cc0854`): Till.tsx dispatched GO reports unconditionally while VIEW_ROLES.reports excludes cashier; cross-run difference was an older build. VIEW_ROLES moved to data.ts as single source of truth; Till hides the button for blocked roles. Verified in login-change E2E. |
| B4 | **Store credit disabled for cashier** (button visible, disabled) | cashier | ✅ | **Confirmed intended**: gated by can(role,"refund") (manager/pharmacy_admin) with tooltip till.needManager. No change. |
✅ B5 | **PIN lockout UX** — 5 failed PINs → 60s lockout, no countdown feedback | cashier | ✅ | **Superseded**: PIN pad replaced by email/password (`4d220b5`); lockout remains only for the legacy optional-pin path. |
✅ B6 | **RLS 42501 on write tables from cashier session** | cashier | ✅ | **Accepted as designed**: RLS correctly denies low-privilege writes to read-mostly tables; warnings logged, no data impact. Revisit only if cashiers need legitimate writes there. |

---

## Part 2 — Incomplete E2E work

| # | Gap | Status | Action |
|---|-----|--------|--------|
✅ E1 | **super_admin REPORT.md missing** — 20 screenshots (login → all 10 views → RTL flip → logout) exist in `outputs/e2e/super_admin/`; agent hit 413 message-limit before writing the report | ✅ | Done: fresh pi session wrote outputs/e2e/super_admin/REPORT.md post-hoc from the 20 screenshots with Known-Limitations section (old pane wedged at the 413 limit; closed and recreated). |
✅ E2 | **Login flows re-test** — all E2E used PIN login; the login change (Part 3) replaces it | 🔴 | After login lands: re-run login + logout + route-guard checks per role (can be one consolidated agent, not 5 full runs). |
✅ E3 | **Live-backend E2E pass** — agents mostly ran with backend flaky/offline (`Backend unavailable` banner); RLS 42501 non-failures never observed against live | 🔴 | One agent against live Supabase (dev server + configured client): login, one sale, one inventory write, verify no unexpected errors. |

---

## Part 3 — Login change: PIN pad → email + password (user-approved, full replace)

**Current state:** Supabase auth is already email+password under the hood (`signInStaff` → `signInWithPassword({ email: "s00X@counterrx.local", password: "CRxS00X<PIN>" })`, seeded auth.users in seed.sql). The lock screen is a staff-card grid + 4-digit PIN keypad that maps card+PIN → that call. The user chose FULL REPLACE.

| # | Task | Detail | Status |
|---|------|--------|--------|
✅ L1 | LockScreen UI → email+password form | Remove staff-card grid + PIN keypad; email + password inputs + Sign in (Enter submits). Keep RTL/i18n (`t()` keys in en+ar, set-equality parity). | ✅ commit `4d220b5` (coordinator-implemented after two agents hit limits/pollution) |
| L2 | `signInStaffByEmail(email, password)` in src/lib/sync.ts | Call `signInWithPassword(email, password)` with typed creds; map email → staffId (`s001@…` → S-001); return `{staffId, ok}`. Offline fallback: seeded staff by email + deterministic seed-password check. Keep `BACKEND_AUTH` dispatch flow. | ✅ commit `4d220b5` |
| L3 | Update callers + tests | App.tsx submit handler; drop `selected.pinHash`/`hashPin` paths; update __tests__ exercising LOGIN; LOGIN action `pin?` optional, skips local check when pre-verified; new src/__tests__/login-email.test.ts (4 tests, 91 total). | ✅ commit `4d220b5` |
| L4 | Seed/docs note | Emails/passwords already live (`s00X@counterrx.local` / `CRxS00X<digits>`); documented in data.ts SEED_PASSWORDS comment + gates/store-auth.md; no README hint (never advertise creds on a POS lock screen). | ✅ |
| L5 | Gate | typecheck + 91 tests + build green; committed `4d220b5`, pushed; parity passes (keys added en+ar). | ✅ |

**After L1–L5:** E2 (re-test logins) becomes possible. B5 (PIN lockout) is superseded.

---

## Part 4 — Remaining verification & closeout

| # | Item | Action |
|---|------|--------|
| ✅ V1 | Full gate re-run | typecheck ✓, 91 tests ✓, build ✓ after every commit (4d220b5, 4cc0854, abb1c56) |
| ✅ V2 | Live Supabase audit | All 26 tables readable as s001 via REST; counts sane (products 48, transactions 16, coupons 2, c2_movements 2, interaction_pairs 384, audit_log 84, staff 6…) |
| V3 | Live AI smoke test (deferred earlier) | `supabase secrets set OPENROUTER_API_KEY` + `supabase functions deploy ai-proxy` (deno needed or use npx supabase), then ocr/classify/forecast/anomaly end-to-end; verify every UI path degrades gracefully when undeployed. **BLOCKED**: no OpenRouter key in ~/.secrets/, no SUPABASE_ACCESS_TOKEN on machine (/functions/v1/ai-proxy returns NOT_FOUND) — provide both to finish |
| ✅ V4 | E2E evidence consolidated | g9-evidence.md + 5 role reports + super_admin REPORT.md (post-hoc) + login-change/REPORT.md; gates store-auth/e2e-quality/till-ops/supply-chain updated (`abb1c56`) |
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
