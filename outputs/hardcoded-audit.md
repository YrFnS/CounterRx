# Hardcoded-value audit (R5 sub-item)

Scope: `src/views` and `src/data.ts`. Mirrors the retired `STORE`/`DRIVERS`
sweep — flag UI constants that should be data-driven, but **do not refactor**
this round. The deliverable is this list + a one-line recommendation each.

| Constant | Location(s) | Used for | Recommendation |
|---|---|---|---|
| `BRANCHES` | `src/data.ts:822`; seeded in transfers `src/data.ts:1017-1019` | Inter-branch transfer `toBranch` picker (`TransferModal`) | **Move to DB/settings.** Branches are org config; a growing multi-site pharmacy will need add/edit/remove. Add a `branches` table + settings seed. |
| `EXPENSE_CATEGORIES` | `src/data.ts:342`; used in `src/views/Finance.tsx:4,512,541` | Expense category `<select>` when recording an expense | **Leave (acceptable).** Closed enum of accounting buckets; user-defined categories would complicate P&L rollups. Only revisit if finance asks for custom codes. |
| AP payment method labels (`Cash`/`Card`/`Bank`) | `src/views/Finance.tsx:424-428` inline `methods` array | AP invoice payment method picker | **Leave (acceptable).** The three AP methods are fixed in `ApPayMethod`; labels match `pos.cash`/`pos.card` semantics. Move to i18n only if Arabic copy is needed (currently English literals). |
| POS payment method labels | `src/data.ts` `PayMethod` (`cash`/`card`/`insurance`) rendered via `t("pos.cash")` etc. in `Pos.tsx` | Sale tender selection | **Leave (already i18n).** Already localized through `pos.*` keys; not hardcoded UI constants. |
| Transfer `status` literals (`requested`/`approved`/`shipped`/`received`/`rejected`) | `src/data.ts:818` enum; rendered in `src/views/Inventory.tsx` `TransferModal` via `statusTone` map | Transfer lifecycle badges | **Leave (acceptable).** Fixed lifecycle enum; does not need to be data-driven. |
| Adjustment reason options (`Cycle count correction`, `Damaged / write-off`, …) | `src/views/Inventory.tsx:1234` inline array | Stock adjustment reason picker | **Leave (acceptable).** Small fixed vocabulary; consider i18n only. |
| RTV / write-off reason free-text | n/a | — | N/A — already user-entered, not a constant. |

## Summary
- **1 candidate to move to DB/settings:** `BRANCHES` (multi-site config, currently
  copied into seed transfer rows and the transfer picker).
- **Everything else is fine as a fixed enum** and should not be refactored now.
- No code was changed for this sub-item — this file is the deliverable.
