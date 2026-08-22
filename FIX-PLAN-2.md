# FIX-PLAN-2.md — Post-launch UX & correctness round (2026-08-23)

Source: user feedback after live deployment. Coordinator merges agent branches
in order, runs gates, deploys, verifies live headless, answers how-to questions
(returns, shifts) in the final recap.

## R1 — Stay signed in on reload ✦ branch `fix/stay-signed-in`
Root cause: reboot-recovery effect in `PosProvider` (src/store.tsx ~line 1777)
returns early when `!state.user`, making the "rehydrate user from session"
branch unreachable. Fix the guard so a live Supabase session restores the user
(LOGIN + BACKEND_AUTH) on refresh. Auto-idle logout stays.

## R2 — Password reset replaces Reset PIN ✦ same branch
Team tab: replace PIN modal with "Set new password" (temp password shown once)
via new Edge Function `admin-set-password` (service-role `auth.admin.updateUserById`,
admin-only allowlist check server-side). If function cannot be deployed from
this machine, fall back to `supabase.auth.resetPasswordForEmail` button and
document the deploy step. Remove SET_STAFF_PIN UI surface (action stays for
seed compat). i18n en+ar.

## R3 — Discount visibility & stability ✦ branch `feat/discount-ux`
Payment modal: quick-% chips AND a dedicated `$ off` field that never wipes
when switching; separate summary rows ("Discount %" / "Invoice $ off");
receipt prints the same breakdown. cartTotals already returns `invoiceAmt`
and combined `discount` — render both, no math changes.

## R4 — UI cleanups ✦ branch `chore/ui-cleanups`
- Remove "Supabase · connected" sidebar badge (keep offline banner in main area).
- Remove scan-chip (green sweep) beside the search box.
- Vertically-center the search icon (align with input box height).
- Add missing i18n keys surfaced by audit: toast.couponCreated/Updated/Deleted,
  pos.inStock (en+ar).
- Extend i18n parity test: every dotted `t("…")` literal used in src must exist
  in BOTH locales (fails CI on future drift).

## R5 — Suppliers CRUD ✦ branch `feat/suppliers-crud`
Suppliers are DB-synced but have no UI. Add Suppliers manager (Inventory view,
new sub-tab mirroring Coupons/Categories patterns): create/edit/archive,
contact/terms/lead-days/min-order fields. Store actions SUPPLIER_SAVE /
SUPPLIER_DELETE (perm-gated manage_settings or equivalent), audit entries.
sync.ts already persists suppliers — no migration needed.
Plus: sweep remaining hardcoded UI constants (BRANCHES list, expense
categories, etc.), move obvious ones into settings/DB, write
`outputs/hardcoded-audit.md` with what remains and why.

## R6 — Pay later (after R1–R5 merge) ✦ branch `feat/pay-later`
Minimal AR: "Pay later" becomes a PaymentLeg method (requires attached
customer, manager-or-owner perm optional); outstanding = sum of unsettled
pay_later legs; customer profile shows balance; History gains "Settle"
(collect payment, append settling leg, mark settled flag on the leg JSONB).
No migration (payments are JSONB).

## Merge order
R1+R2 → R3 → R4 → R5 → R6, gates + full build/test after each, deploy once at
end, live headless verification of sign-in persistence, discounts, suppliers.

## How-to answers (no code): refunds/returns via History row → Refund;
shift open/close via Register shift bar; X/Z summaries via History → Shift summary.
