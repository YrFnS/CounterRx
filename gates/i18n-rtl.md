# Leaf: i18n-rtl
- [x] UI strings route through t() in the app shell.
  CHECK: `grep -c 't(' src/App.tsx`
  EXPECT: ≥ 20 (shell, nav, lock screen, banner)
  EVIDENCE: App.tsx wired in commit 13ef3a0 (42 t() call sites, 36 new keys added to both locales).
- [x] en.json / ar.json key sets stay identical.
  CHECK: `npm test` → src/__tests__/i18n-key-parity.test.ts
  EXPECT: passes
  EVIDENCE: vitest i18n key-set parity test green (26/26); test asserts set equality, not a hardcoded count.
- [x] Language toggle exists in Settings.
  CHECK: `grep -c 'changeLanguage' src/views/Settings.tsx`
  EXPECT: ≥ 1
  EVIDENCE: Language tab added with en/ar buttons calling `i18n.changeLanguage`; detector caches to localStorage.
- [x] <html dir> flips with the active language.
  CHECK: `grep -n 'document.documentElement.dir' src/App.tsx` and `grep '<html' index.html`
  EXPECT: effect sets dir rtl|ltr on language change; index.html declares `lang="en" dir="ltr"`
  EVIDENCE: dir effect in Shell keyed on `i18n.language`; index.html updated.
- [x] No layout-affecting physical utilities remain.
  CHECK: `grep -rnE 'text-left|text-right|left-\\[|left-[0-9]|pl-[0-9]|pr-[0-9]|ml-[0-9]|mr-[0-9]' src --include='*.tsx'`
  EXPECT: only centering (`left-1/2 -translate-x-1/2`) and symmetric insets (`left-4 right-4`) remain — RTL-safe
  EVIDENCE: 143 logical-utility replacements; leftovers are center/inset-symmetric only. Decorative `translate-x` animations intentionally kept.
- [x] Off-canvas sidebar slides from the correct side in RTL.
  CHECK: `grep 'drawer-closed' src/App.tsx src/index.css`
  EXPECT: `[dir="rtl"] .drawer-closed { transform: translateX(100%) }` with lg reset
  EVIDENCE: class marker + CSS override present.
- [x] No native window.confirm in the payment path.
  CHECK: `grep -rn 'window.confirm' src`
  EXPECT: no matches
  EVIDENCE: none found — plan's F6 confirm() evidence was stale (modals.tsx:322/362 are PaymentModal's own function); nothing to replace.
- [ ] Browser verification: switching to Arabic in Settings flips dir and mirrors layout.
  CHECK: browser e2e (agent-browser) — see Phase 3 / G9
  EXPECT: sidebar from right, mirrored layout, no clipping
  EVIDENCE: pending (browser verification is part of G9)
