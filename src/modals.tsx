import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { usePos, money, cartTotals } from "./store";
import { findInteractions, can, creditByCode, hashPin } from "./data";
import type { PayMethod, PaymentLeg, Transaction, Product, StoreCredit } from "./data";
import { applicablePromotions } from "./lib/promotions";
import { Modal, cx } from "./ui";
import { ICash, ICard, IShield, IX, IPrint, ICheck, ISplit, IUsers, IStar, IAlert, ICode, ICopy, IDownload } from "./icons";

const round2 = (n: number) => Math.round(n * 100) / 100;

export function PaymentModal() {
  const { t: tr } = useTranslation();
  const { state, dispatch, product } = usePos();
  const [leg1, setLeg1] = useState<PayMethod>("cash");
  const [leg2, setLeg2] = useState<PayMethod>("card");
  const [split, setSplit] = useState(false);
  const [leg1Amt, setLeg1Amt] = useState("");
  const [discountPct, setDiscountPct] = useState(0);
  const [discMode, setDiscMode] = useState<"pct" | "amt">("pct");
  const [discVal, setDiscVal] = useState("");
  const [tendered, setTendered] = useState("");
  const [idChecked, setIdChecked] = useState(false);
  const [overrideAck, setOverrideAck] = useState(false);
  const [overrideReason, setOverrideReason] = useState("");
  const [rPurchaser, setRPurchaser] = useState("");
  const [rIdType, setRIdType] = useState(tr("modal.driverLicense"));
  const [rIdLast4, setRIdLast4] = useState("");

  const customer = state.customers.find((c) => c.id === state.saleCustomerId) ?? null;
  const [dueDate, setDueDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 14);
    return d.toISOString().split('T')[0];
  });
  const todayStr = new Date().toISOString().split('T')[0];
  const dueDateNum = new Date(dueDate).getTime();
  const formatDate = (ms: number) => new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  const [creditCode, setCreditCode] = useState("");
  const creditMatch: StoreCredit | undefined = creditCode.trim()
    ? creditByCode(state.storeCredits, creditCode)
    : undefined;
  const creditBalance = creditMatch?.balance ?? 0;

  /* Phase F coupon — validate against org coupons: exists, active, not expired, in scope */
  const [couponCode, setCouponCode] = useState("");
  const couponMatch = couponCode.trim()
    ? state.coupons.find((c) => c.code.toUpperCase() === couponCode.trim().toUpperCase())
    : undefined;
  const couponError = couponCode.trim() && !couponMatch ? tr("analytics.couponInvalid", "Unknown coupon code") :
    couponMatch && !couponMatch.active ? tr("analytics.couponInactive", "This coupon is inactive") :
    couponMatch && couponMatch.expiresAt && Date.now() > couponMatch.expiresAt ? tr("analytics.couponExpired", "This coupon has expired") :
    couponMatch && couponMatch.customerId && couponMatch.customerId !== state.saleCustomerId ? tr("analytics.couponScope", "Coupon is for another customer") :
    undefined;
  const couponValid = !!couponMatch && !couponError;

  /* W3.4 promotions engine — rules auto-apply to this cart; a manager PIN can dismiss each one */
  const [dismissedPromos, setDismissedPromos] = useState<Set<string>>(new Set());
  const [promoPin, setPromoPin] = useState<string | null>(null);
  const [promoPinValue, setPromoPinValue] = useState("");
  const appliedPromotions = useMemo(
    () => applicablePromotions(state, state.cart, customer).filter((a) => !dismissedPromos.has(a.promotion.id)),
    [state, state.cart, customer, dismissedPromos]);
  const promoTotal = round2(appliedPromotions.reduce((s, a) => s + a.amount, 0));
  /* dismiss needs a manager PIN unless the user already holds approve_discount */
  const promoPinOk = promoPinValue.length > 0 && (can(state.user?.role, "approve_discount")
    || state.staff.some((s) => can(s.role, "approve_discount") && s.pinHash === hashPin(promoPinValue)));
  const requestDismiss = (id: string) => { setPromoPin(id); setPromoPinValue(""); };
  const confirmDismiss = () => {
    if (!promoPinOk || !promoPin) return;
    dispatch({ type: "AUDIT_LOG", kind: "money", detail: `Promotion dismissed at register — ${state.promotions.find((p) => p.id === promoPin)?.name ?? promoPin} · by ${state.user?.name ?? "staff"} (manager PIN)` });
    setDismissedPromos((prev) => new Set(prev).add(promoPin));
    setPromoPin(null); setPromoPinValue("");
  };

  /* drug–drug interaction check across the cart (§3/§4) */
  const interactions = useMemo(
    () => findInteractions(state.cart.map((c) => c.productId)),
    [state.cart]);
  const major = interactions.filter((i) => i.severity === "major");
  const moderate = interactions.filter((i) => i.severity === "moderate");
  const isPharmacist = can(state.user?.role, "verify_rx");
  const nameOf = (id: string) => product(id)?.name ?? id;

  /* behind-the-counter items require purchaser ID capture (§3) */
  const restrictedLines = state.cart
    .map((c) => ({ qty: c.qty, p: product(c.productId) }))
    .filter((x): x is { qty: number; p: Product } => !!x.p && !!x.p.restricted);
  /* kept for COMPLETE_SALE payload compatibility; tax itself is retired */
  const taxExempt = !!customer?.taxExempt;
  /* coupon discount computed from the pre-coupon subtotal (cartTotals applies it) */
  const preCouponSubtotal = round2(state.cart.reduce((s, c) => {
    const p = state.products.find((x) => x.id === c.productId);
    return p ? s + (c.priceOverride ?? p.price) * c.qty : s;
  }, 0));
  const couponDiscount = couponValid
    ? couponMatch!.type === "percent"
      ? round2((preCouponSubtotal * couponMatch!.value) / 100)
      : Math.min(couponMatch!.value, preCouponSubtotal)
    : 0;
  const invoiceAmtInput = discMode === "amt" ? round2(Math.max(0, parseFloat(discVal) || 0)) : 0;
  const t = useMemo(() => cartTotals(state, discountPct, taxExempt, couponDiscount, invoiceAmtInput, promoTotal), [state, discountPct, taxExempt, couponDiscount, invoiceAmtInput, promoTotal]);
  const hasControlled = state.cart.some((c) => product(c.productId)?.controlled);
  /* redeemable chunks: 100 pts = $5, capped by payable balance */
  const payableNow = Math.max(0, t.subtotal - t.bulkSavings - t.discount - t.coupon);
  const loy = state.settings.loyalty;
  const maxChunks = customer ? Math.min(Math.floor(customer.points / Math.max(1, loy.chunkPts)), Math.floor(payableNow / Math.max(0.01, loy.chunkValue))) : 0;
  const redeeming = state.redeemPoints > 0;

  const tenderedNum = parseFloat(tendered) || 0;
  const change = round2(tenderedNum - t.total);
  const l1 = Math.min(Math.max(0, parseFloat(leg1Amt) || 0), t.total);
  const l2 = round2(t.total - l1);
  const splitValid = split && l1 > 0 && l2 > 0;
  const paymentOk = split ? splitValid : leg1 !== "cash" || tenderedNum >= t.total;
  const controlledOk = !hasControlled || (!!customer && idChecked);
  /* major interactions block checkout unless a pharmacist documents an override */
  const interactionOk = major.length === 0 || overrideAck;
  /* behind-the-counter sales need purchaser name + ID last-4 */
  const restrictedOk = restrictedLines.length === 0 || (rPurchaser.trim().length >= 2 && /^\d{4}$/.test(rIdLast4));
  const payLaterOk = leg1 !== "pay_later" || !!customer;
  const canConfirm = paymentOk && controlledOk && interactionOk && restrictedOk && payLaterOk
    && (leg1 !== "store_credit" || !!creditMatch);
  const hasRx = state.cart.some((c) => product(c.productId)?.rx);

  const methods: { id: PayMethod; label: string; icon: ReactNode; hint: string }[] = [
    { id: "cash", label: "Cash", icon: <ICash size={17} />, hint: tr("modal.drawerOpens") },
    { id: "card", label: "Card", icon: <ICard size={17} />, hint: tr("modal.terminal2") },
    { id: "insurance", label: "Insurance", icon: <IShield size={17} />, hint: tr("modal.claimAutoFiled") },
    { id: "store_credit", label: "Store Credit", icon: <ICard size={17} />, hint: tr("modal.giftOrCredit") },
    { id: "pay_later", label: tr("pos.payLater"), icon: <IUsers size={17} />, hint: tr("pos.payLaterDueDate") },
  ];
  const labelOf = (m: PayMethod) => methods.find((x) => x.id === m)?.label ?? m;

  const confirm = () => {
    if (!canConfirm) return;
    /* pay later requires a customer */
    if (leg1 === "pay_later" && !customer) {
      dispatch({ type: "TOAST", kind: "error", msg: tr("pos.payLaterBlocked") });
      return;
    }
    /* pharmacist override of a major interaction — documented + audited (§3) */
    if (major.length > 0 && overrideAck) {
      dispatch({
        type: "AUDIT_LOG", kind: "rx",
        detail: `Interaction override by ${state.user?.name ?? "pharmacist"} — ${major.map((i) => `${nameOf(i.a)} + ${nameOf(i.b)}`).join("; ")} — reason: ${overrideReason.trim() || "(none given)"}`,
      });
    }
    const payments: PaymentLeg[] = split
      ? [{ method: leg1, amount: round2(l1) }, { method: leg2, amount: l2 }]
      : leg1 === "store_credit"
        ? [{ method: "store_credit", amount: t.total, ref: creditMatch!.id }]
        : leg1 === "pay_later"
        ? [{ method: "pay_later", amount: t.total, dueDate: dueDateNum }]
        : [{ method: leg1, amount: t.total }];
    dispatch({
      type: "COMPLETE_SALE", payments, discountPct, taxExempt, idChecked,
      couponDiscount: couponDiscount > 0 ? couponDiscount : undefined,
      invoiceDiscountAmt: invoiceAmtInput > 0 ? invoiceAmtInput : undefined,
      promotionDiscount: promoTotal > 0 ? promoTotal : undefined,
      promotionNames: appliedPromotions.map((a) => a.promotion.name),
      tendered: !split && leg1 === "cash" ? tenderedNum : undefined,
      restricted: restrictedLines.length > 0
        ? { purchaser: rPurchaser, idType: rIdType, idLast4: rIdLast4 }
        : undefined,
    });
  };

  return (
    <Modal onClose={() => dispatch({ type: "OPEN_PAY", open: false })} width={720} labelledBy="pay-title">
      <div className="flex items-center justify-between px-5 py-4 border-b border-mist">
        <div>
          <h2 id="pay-title" className="font-display font-bold text-lg text-ink leading-none">Take payment</h2>
          <p className="text-xs text-inksoft mt-1">
            {state.cart.reduce((s, c) => s + c.qty, 0)} items · {hasRx && <span className="text-brick-700 font-semibold">includes Rx — pharmacist verified</span>}
          </p>
        </div>
        <button onClick={() => dispatch({ type: "OPEN_PAY", open: false })}
          className="p-2 rounded-lg hover:bg-mist/50 text-inksoft transition" aria-label="Close">
          <IX size={16} />
        </button>
      </div>

      {/* drug–drug interaction gate (§3/§4) */}
      {major.length > 0 && (
        <div className={cx("mx-5 mt-4 rounded-lg border px-4 py-3 anim-fade-up",
          overrideAck ? "border-pine-300 bg-pine-100/50" : "border-brick-500/50 bg-brick-100/40")}>
          <p className={cx("flex items-center gap-1.5 text-[12px] font-bold",
            overrideAck ? "text-pine-800" : "text-brick-700")}>
            <IAlert size={14} />
            {overrideAck ? tr("modal.interactionOverride") : `${major.length} major interaction${major.length === 1 ? "" : "s"} — checkout blocked`}
          </p>
          <ul className="mt-1.5 space-y-1">
            {major.map((i) => (
              <li key={i.a + i.b} className="text-[11px] leading-snug text-ink">
                <span className="font-bold">{nameOf(i.a)}</span> + <span className="font-bold">{nameOf(i.b)}</span>
                <span className="text-inksoft"> — {i.effect} {i.action}</span>
              </li>
            ))}
          </ul>
          {!overrideAck && (isPharmacist ? (
            <div className="mt-2.5 flex gap-2 items-stretch">
              <input value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)}
                placeholder={tr("modal.clinicalReason")}
                className="flex-1 px-3 py-1.5 rounded-md border border-brick-300 bg-card text-xs focus:border-brick-500 focus:outline-none" />
              <button onClick={() => setOverrideAck(true)}
                className="px-3.5 py-1.5 rounded-md bg-brick-700 text-brick-100 text-xs font-bold hover:bg-brick-500 transition active:scale-95 whitespace-nowrap">
                Pharmacist override
              </button>
            </div>
          ) : (
            <p className="mt-2 text-[11px] font-semibold text-brick-700">
              A pharmacist must review and override before this sale can complete.
            </p>
          ))}
        </div>
      )}
      {moderate.length > 0 && (
        <div className="mx-5 mt-3 rounded-lg border border-honey-500/40 bg-honey-100/40 px-4 py-2.5">
          <p className="flex items-center gap-1.5 text-[11px] font-bold text-honey-700"><IAlert size={13} /> Caution — moderate interaction{moderate.length === 1 ? "" : "s"}</p>
          <ul className="mt-1 space-y-0.5">
            {moderate.map((i) => (
              <li key={i.a + i.b} className="text-[10.5px] text-ink leading-snug">
                <span className="font-bold">{nameOf(i.a)}</span> + <span className="font-bold">{nameOf(i.b)}</span>
                <span className="text-inksoft"> — {i.action}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-0 overflow-y-auto scroll-slim mt-4">
        {/* left — totals */}
        <div className="p-5 md:border-r border-mist">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-inksoft">Amount due</p>
          <p className="num text-[40px] font-semibold text-ink leading-tight">{money(t.total)}</p>

          <div className="mt-4 space-y-1.5 text-sm">
            <Row k={tr("modal.subtotal")} v={money(t.subtotal)} />
            {t.bulkSavings > 0 && <Row k={<span className="text-honey-700 font-semibold">Bulk-tier savings</span>} v={<span className="text-honey-700">−{money(t.bulkSavings)}</span>} />}
            <div className="flex items-center justify-between py-0.5">
              <span className="text-inksoft">Discount</span>
              <span className="flex items-center gap-1">
                {[0, 5, 10].map((d) => (
                  <button key={d} onClick={() => { setDiscMode("pct"); setDiscountPct(d); setDiscVal(""); }}
                    className={cx("num px-2 py-0.5 rounded-md text-xs border transition",
                      discMode === "pct" && discountPct === d ? "bg-pine-700 text-pine-50 border-pine-700" : "bg-card border-mist text-inksoft hover:border-pine-400")}>
                    {d}%
                  </button>
                ))}
                <input value={discVal} onChange={(e) => {
                    const v = e.target.value.replace(/[^\d.]/g, "");
                    setDiscVal(v);
                    if (v) { setDiscMode("amt"); setDiscountPct(0); }
                  }}
                  placeholder="$ off" inputMode="decimal"
                  className="num w-16 px-1.5 py-0.5 rounded-md text-xs border border-mist bg-card text-ink focus:border-pine-500 focus:outline-none placeholder:text-inksoft/60" />
              </span>
            </div>
            {discountPct > 0 && (
              <Row k={tr("discounts.pctRow")} v={<span className="text-brick-700">−{money(round2((t.subtotal * discountPct) / 100))}</span>} />
            )}
            {t.invoiceAmt > 0 && (
              <Row k={tr("discounts.invoiceRow")} v={<span className="text-brick-700">−{money(t.invoiceAmt)}</span>} />
            )}
            {t.promo > 0 && <Row k={<span className="text-pine-700 font-semibold">{tr("pos.promotionsApplied")}</span>} v={<span className="text-pine-700">−{money(t.promo)}</span>} />}
            {t.loyaltyDeduct > 0 && <Row k={<span className="text-pine-700 font-semibold">Points redeemed · {state.redeemPoints} pts</span>} v={<span className="text-pine-700">−{money(t.loyaltyDeduct)}</span>} />}
            <div className="receipt-dash pt-2 mt-2">
              <Row k={<span className="font-semibold text-ink">Total</span>} v={<span className="font-bold text-pine-800">{money(t.total)}</span>} />
            </div>
          </div>

          {customer && (
            <div className="mt-3 rounded-lg border border-honey-300/60 bg-honey-100/50 px-3 py-2.5 anim-fade-up">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-bold text-honey-800 flex items-center gap-1.5 min-w-0">
                  <IUsers size={13} className="shrink-0" /> <span className="truncate">{customer.name}</span>
                  <span className="num shrink-0 text-[10px] font-semibold text-honey-700">· {customer.points} pts · earns +{Math.floor(t.total)}</span>
                </p>
              </div>
              {maxChunks > 0 && (
                <button onClick={() => dispatch({ type: "SET_REDEEM", points: redeeming ? 0 : maxChunks * loy.chunkPts })}
                  className={cx("mt-2 w-full flex items-center justify-between px-2.5 py-2 rounded-md border text-xs font-bold transition-all",
                    redeeming
                      ? "border-pine-600 bg-pine-700 text-pine-50"
                      : "border-honey-400 bg-card text-honey-700 hover:bg-honey-100")}>
                  <span className="flex items-center gap-1.5"><IStar size={12} /> {redeeming ? `Redeeming ${state.redeemPoints} pts` : `Redeem ${maxChunks * loy.chunkPts} pts`}</span>
                  <span className="num">{redeeming ? `−${money(t.loyaltyDeduct)} ✓` : `−${money(maxChunks * loy.chunkValue)}`}</span>
                </button>
              )}
            </div>
          )}

          {hasControlled && (
            <div className="mt-3 rounded-lg border-2 border-brick-400 bg-brick-100/60 px-3 py-2.5 anim-fade-up">
              <p className="text-xs font-bold text-brick-800 flex items-center gap-1.5">
                <IAlert size={13} className="shrink-0" /> Controlled substance — DEA record required
              </p>
              {!customer ? (
                <p className="text-[11px] text-brick-700 mt-1 font-semibold">
                  Attach a customer on the register before payment — photo ID must be sighted.
                </p>
              ) : (
                <label className="mt-1.5 flex items-center gap-2 cursor-pointer select-none">
                  <button onClick={() => setIdChecked(!idChecked)} aria-pressed={idChecked}
                    className={cx("grid place-items-center w-5 h-5 rounded border-2 transition-all",
                      idChecked ? "bg-pine-700 border-pine-700 text-pine-50 scale-105" : "bg-card border-brick-400")}>
                    {idChecked && <ICheck size={11} />}
                  </button>
                  <span className={cx("text-[11px] font-bold", idChecked ? "text-pine-800" : "text-brick-700")}>
                    I sighted {customer.name}'s photo ID — log the sale
                  </span>
                </label>
              )}
            </div>
          )}

          {restrictedLines.length > 0 && (
            <div className="mt-3 rounded-lg border-2 border-honey-400 bg-honey-100/50 px-3 py-2.5 anim-fade-up">
              <p className="text-xs font-bold text-honey-800 flex items-center gap-1.5">
                <IAlert size={13} className="shrink-0" /> Behind-the-counter — log required
              </p>
              <p className="text-[10px] text-honey-700 font-semibold mt-0.5">
                {restrictedLines.map((r) => `${r.qty}× ${r.p.name}`).join(" · ")} — limit {restrictedLines[0].p.restricted?.limitPerSale}/sale
              </p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <input value={rPurchaser} onChange={(e) => setRPurchaser(e.target.value)} placeholder={tr("modal.purchaserName")}
                  className="col-span-2 px-2.5 py-1.5 rounded-md border border-honey-300 bg-card text-xs focus:border-honey-500 focus:outline-none transition" />
                <select value={rIdType} onChange={(e) => setRIdType(e.target.value)}
                  className="px-2 py-1.5 rounded-md border border-honey-300 bg-card text-xs focus:border-honey-500 focus:outline-none transition">
                  {[tr("modal.driverLicense"), tr("modal.stateId"), "Passport"].map((o) => <option key={o}>{o}</option>)}
                </select>
                <input value={rIdLast4} onChange={(e) => setRIdLast4(e.target.value.replace(/\D/g, "").slice(0, 4))}
                  placeholder={tr("modal.idLast4")} inputMode="numeric"
                  className="num px-2.5 py-1.5 rounded-md border border-honey-300 bg-card text-xs tracking-[0.2em] focus:border-honey-500 focus:outline-none transition" />
              </div>
            </div>
          )}

          {t.lines.length > 0 && (
            <div className="mt-4 max-h-28 overflow-y-auto scroll-slim text-xs space-y-1 pe-1">
              {t.lines.map((l) => (
                <div key={l.name} className="flex justify-between text-inksoft">
                  <span className="truncate pe-2">{l.qty} × {l.name}</span>
                  <span className="num shrink-0">{money(l.price * l.qty)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* right — method */}
        <div className="p-5 bg-pine-50/50">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-inksoft">
              {split ? tr("modal.payment1of2") : tr("modal.paymentMethod")}
            </p>
            <button onClick={() => setSplit(!split)}
              className={cx("flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-bold transition-all duration-200",
                split
                  ? "bg-honey-500 border-honey-500 text-pine-950 shadow-lift"
                  : "bg-card border-mist text-inksoft hover:border-honey-500 hover:text-honey-700")}>
              <ISplit size={12} /> {split ? tr("modal.splitOn") : tr("modal.splitTender")}
            </button>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {methods.map((m) => (
              <button key={m.id} onClick={() => {
                setLeg1(m.id);
                if (split && m.id === leg2) setLeg2(m.id === "card" ? "cash" : "card");
              }}
                className={cx("flex flex-col items-center gap-1.5 p-3 rounded-lg border-2 transition-all duration-200",
                  leg1 === m.id
                    ? "border-pine-600 bg-pine-700 text-pine-50 shadow-lift -translate-y-0.5"
                    : "border-mist bg-card text-ink hover:border-pine-300 hover:-translate-y-0.5")}>
                {m.icon}
                <span className="text-xs font-semibold">{m.label}</span>
                <span className={cx("text-[10px]", leg1 === m.id ? "text-pine-200" : "text-inksoft")}>{m.hint}</span>
              </button>
            ))}
          </div>

          {split && (
            <div className="mt-4 anim-fade-up space-y-3">
              <div>
                <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-inksoft">
                  {labelOf(leg1)} amount — leg 1
                </label>
                <div className="flex gap-1.5 mt-1.5">
                  <input autoFocus value={leg1Amt} onChange={(e) => setLeg1Amt(e.target.value.replace(/[^\d.]/g, ""))}
                    onKeyDown={(e) => e.key === "Enter" && confirm()}
                    inputMode="decimal" placeholder="0.00"
                    className="num flex-1 px-3 py-2 rounded-lg border-2 border-mist bg-card text-base font-semibold text-ink focus:border-pine-500 focus:outline-none transition" />
                  {[25, 50, 75].map((pct) => (
                    <Quick key={pct} label={`${pct}%`} onClick={() => setLeg1Amt(round2((t.total * pct) / 100).toFixed(2))} />
                  ))}
                </div>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-inksoft mb-1.5">{tr("modal.payment2Remainder")}</p>
                <div className="grid grid-cols-3 gap-2">
                  {methods.map((m) => (
                    <button key={m.id} onClick={() => setLeg2(m.id)}
                      className={cx("flex items-center justify-center gap-1.5 py-2 rounded-lg border-2 text-xs font-semibold transition-all duration-200",
                        leg2 === m.id
                          ? "border-honey-500 bg-honey-100 text-honey-700 shadow-lift"
                          : "border-mist bg-card text-inksoft hover:border-honey-300")}>
                      {m.icon}{m.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className={cx("px-3 py-2.5 rounded-lg border text-xs font-semibold flex items-center justify-between",
                splitValid ? "bg-pine-100 border-pine-200 text-pine-900" : "bg-honey-100/70 border-honey-300/60 text-honey-700")}>
                {splitValid ? (
                  <>
                    <span className="flex items-center gap-1.5"><ICheck size={13} /> {labelOf(leg1)} {money(round2(l1))} + {labelOf(leg2)} {money(l2)}</span>
                    <span className="num">= {money(t.total)}</span>
                  </>
                ) : (
                  <span>{l1 <= 0 ? tr("modal.enterFirstAmount") : tr("modal.adjustLegs")}</span>
                )}
              </div>
            </div>
          )}

          {!split && leg1 === "cash" && (
            <div className="mt-4">
              <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-inksoft">{tr("modal.cashTendered")}</label>
              <input autoFocus value={tendered} onChange={(e) => setTendered(e.target.value.replace(/[^\d.]/g, ""))}
                onKeyDown={(e) => e.key === "Enter" && confirm()}
                inputMode="decimal" placeholder="0.00"
                className="num w-full mt-1.5 px-3 py-2.5 rounded-lg border-2 border-mist bg-card text-lg font-semibold text-ink focus:border-pine-500 focus:outline-none transition" />
              <div className="flex gap-1.5 mt-2">
                <Quick label={tr("modal.exact")} onClick={() => setTendered(t.total.toFixed(2))} />
                {[20, 50, 100].map((v) => (
                  <Quick key={v} label={`$${v}`} onClick={() => setTendered(String(v))} />
                ))}
              </div>
              <div className={cx("mt-3 flex items-center justify-between px-3 py-2.5 rounded-lg border",
                change >= 0 ? "bg-pine-100 border-pine-200 text-pine-900" : "bg-brick-100 border-brick-300/60 text-brick-700")}>
                <span className="text-xs font-semibold uppercase tracking-wide">{change >= 0 ? "Change due" : "Short"}</span>
                <span className="num text-lg font-bold">{money(Math.abs(change))}</span>
              </div>
            </div>
          )}

          {!split && leg1 === "card" && (
            <div className="mt-4 px-3 py-3 rounded-lg bg-card border border-mist text-xs text-inksoft leading-relaxed">
              Terminal #2 is listening — insert, tap or swipe. Amount <span className="num font-semibold text-ink">{money(t.total)}</span> will be sent automatically.
            </div>
          )}
          {!split && leg1 === "insurance" && (
            <div className="mt-4 px-3 py-3 rounded-lg bg-card border border-mist text-xs text-inksoft leading-relaxed">
              Claim will be filed to <span className="font-semibold text-ink">BlueCross PBM</span>. Patient co-pay is collected at pickup.
            </div>
          )}
          {!split && leg1 === "store_credit" && (
            <div className="mt-4 anim-fade-up space-y-2">
              <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-inksoft">{tr("modal.creditCode")}</label>
              <input value={creditCode} onChange={(e) => setCreditCode(e.target.value)} placeholder={tr("modal.scanOrEnterCode")}
                className="w-full px-3 py-2.5 rounded-lg border-2 border-mist bg-card text-base font-semibold text-ink focus:border-pine-500 focus:outline-none transition" />
              {creditCode.trim() && !creditMatch && (
                <p className="text-xs text-brick-700 font-semibold">{tr("modal.creditNotFound")}</p>
              )}
              {creditMatch && (
                <div className={cx("rounded-lg px-3 py-2 text-sm flex justify-between", creditBalance >= t.total ? "bg-pine-100 text-pine-800" : "bg-honey-100 text-honey-800")}>
                  <span>{creditMatch.code ? `${tr("modal.giftCard")} ${creditMatch.code}` : tr("modal.storeCredit")}</span>
                  <span className="num font-bold">{money(creditBalance)} {creditBalance < t.total && `· ${tr("modal.remainingDue")} ${money(t.total - creditBalance)}`}</span>
                </div>
              )}
            </div>
          )}

          {state.coupons.length > 0 && (
            <div className="rounded-lg border border-mist p-3 space-y-2">
              <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-inksoft">{tr("analytics.couponCode", "Coupon code")}</label>
              <input value={couponCode} onChange={(e) => setCouponCode(e.target.value)} placeholder="WELCOME10"
                className="w-full px-3 py-2.5 rounded-lg border-2 border-mist bg-card text-base font-semibold text-ink focus:border-pine-500 focus:outline-none transition" />
              {couponError && (
                <p className="text-xs text-brick-700 font-semibold">{couponError}</p>
              )}
              {couponValid && (
                <div className="rounded-lg px-3 py-2 text-sm bg-pine-100 text-pine-800 flex justify-between">
                  <span className="font-bold">{couponMatch!.code}</span>
                  <span className="num font-bold">−{money(couponDiscount)}</span>
                </div>
              )}
            </div>
          )}
          {appliedPromotions.length > 0 && (
            <div className="rounded-lg border border-pine-300 bg-pine-100/60 p-3 space-y-2">
              <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-pine-800">{tr("pos.promotionsApplied")}</label>
              {appliedPromotions.map((a) => (
                <div key={a.promotion.id} className="flex items-center justify-between gap-2 text-sm bg-card rounded-md px-2.5 py-1.5">
                  <span className="font-bold truncate">{a.promotion.name}</span>
                  <span className="flex items-center gap-2 shrink-0">
                    <span className="num font-bold text-pine-700">−{money(a.amount)}</span>
                    {!split && (
                      <button onClick={() => requestDismiss(a.promotion.id)}
                        className="text-[10px] font-bold uppercase tracking-wide text-inksoft hover:text-brick-600 transition"
                        title={tr("pos.promoOverrideHint")}>
                        {tr("pos.promoOverride")}
                      </button>
                    )}
                  </span>
                </div>
              ))}
              {promoPin && (
                <div className="anim-fade-up space-y-1.5">
                  {promoPinValue.length > 0 && !promoPinOk && (
                    <p className="text-[11px] text-brick-700 font-semibold">{tr("supply.woPinBad")}</p>
                  )}
                  <div className="flex gap-2">
                    <input autoFocus value={promoPinValue}
                      onChange={(e) => setPromoPinValue(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))}
                      onKeyDown={(e) => e.key === "Enter" && confirmDismiss()}
                      inputMode="numeric" placeholder="••••"
                      className="num flex-1 px-3 py-1.5 rounded-md border border-mist bg-card text-sm tracking-[0.3em] focus:border-pine-500 focus:outline-none" />
                    <button onClick={confirmDismiss} disabled={!promoPinOk}
                      className={cx("px-3 py-1.5 rounded-md text-xs font-bold transition whitespace-nowrap",
                        promoPinOk ? "bg-brick-600 text-brick-50 hover:bg-brick-500" : "bg-mist text-inksoft cursor-not-allowed")}>
                      {tr("pos.promoOverrideConfirm")}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
          {!split && leg1 === "pay_later" && (
            <div className="mt-4 anim-fade-up space-y-2">
              <div className="flex items-center gap-2 text-xs font-bold text-honey-800 bg-honey-100 border border-honey-300 rounded-lg px-3 py-2">
                <IAlert size={14} className="shrink-0" />
                <span>{tr("pos.payLaterRequiresCustomer")}</span>
              </div>
              <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-inksoft">{tr("pos.payLaterDueDate")}</label>
              <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} min={todayStr}
                className="w-full px-3 py-2.5 rounded-lg border-2 border-mist bg-card text-lg font-semibold text-ink focus:border-pine-500 focus:outline-none transition" />
              <p className="text-xs text-inksoft">{tr("pos.payLaterDefaultDays")} — {tr("pos.payLaterNotice")} {formatDate(dueDateNum)}</p>
            </div>
          )}

          <button onClick={confirm} disabled={!canConfirm}
            className={cx("w-full mt-5 py-3 rounded-lg font-display font-bold text-[15px] transition-all duration-200 flex items-center justify-center gap-2",
              canConfirm
                ? "bg-pine-700 text-pine-50 hover:bg-pine-600 active:scale-[0.98] shadow-lift"
                : "bg-mist text-inksoft cursor-not-allowed")}>
            <ICheck size={16} />
            {split
              ? `Confirm split · ${labelOf(leg1)} ${money(round2(l1))} + ${labelOf(leg2)} ${money(l2)}`
              : `Confirm ${money(t.total)} · ${labelOf(leg1)}`}
          </button>
          <p className="text-[10px] text-inksoft text-center mt-2">Enter ↵ confirms · Esc cancels</p>
        </div>
      </div>
    </Modal>
  );
}

function Quick({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className="num flex-1 px-2 py-1.5 rounded-md bg-card border border-mist text-xs font-semibold text-ink hover:border-pine-400 hover:bg-pine-50 transition">
      {label}
    </button>
  );
}

function Row({ k, v }: { k: ReactNode; v: ReactNode }) {
  return (
    <div className="flex items-center justify-between py-0.5">
      <span className="text-inksoft">{k}</span>
      <span className="num font-medium text-ink">{v}</span>
    </div>
  );
}

/* ---------------- Receipt ---------------- */

function ReceiptBody({ tx }: { tx: Transaction }) {
  const { t: tr } = useTranslation();
  const { state } = usePos();
  const customerName = state.customers.find((c) => c.id === tx.customerId)?.name;
  return (
    <div className="bg-white border border-mist rounded-lg p-5 num text-[12px] text-ink leading-relaxed">
      <div className="text-center">
        <p className="font-bold text-[14px] tracking-wide">{state.settings.orgName.toUpperCase()}</p>
        <p className="text-inksoft">{state.settings.branch}</p>
        <p className="text-inksoft">{state.settings.address} · {state.settings.phone}</p>
        <p className="text-inksoft">{state.settings.license}</p>
      </div>
      <div className="receipt-dash my-3" />
      {tx.refundOf && (
        <p className="text-center font-bold text-[11px] tracking-[0.2em] text-ink mb-1.5">— REFUND · REVERSAL OF {tx.refundOf} —</p>
      )}
      <div className="flex justify-between"><span>Receipt</span><span className="font-semibold">{tx.id}</span></div>
      <div className="flex justify-between"><span>Date</span><span>{new Date(tx.at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span></div>
      <div className="flex justify-between"><span>Cashier</span><span>{tx.cashier}</span></div>
      {customerName && (
        <div className="flex justify-between"><span>Customer</span><span>{customerName}</span></div>
      )}
      <div className="receipt-dash my-3" />
      {tx.lines.map((l) => (
        <div key={l.productId} className="mb-1.5">
          <div className="flex justify-between gap-2">
            <span className="font-medium truncate">{l.name}{l.rx ? " ℞" : ""}</span>
            <span className="shrink-0">{money(l.price * l.qty)}</span>
          </div>
          <div className="flex justify-between text-inksoft text-[11px]">
            <span className="truncate">{l.form}{l.override && <span className="text-pine-700 font-bold"> · price override</span>}</span>
            <span>
              {l.qty} × {money(l.price)}
              {l.override && l.listPrice !== undefined && <span className="line-through opacity-60 ms-1">{money(l.listPrice)}</span>}
            </span>
          </div>
          {l.note && <p className="text-[10px] text-inksoft italic">↳ {l.note}</p>}
          {l.substituted && <p className="text-[10px] text-pine-700 font-semibold">↪ generic substitution for {l.substituted}</p>}
          {l.daw && <p className="text-[10px] text-inksoft">DAW-{l.daw} · dispensed as written ({l.daw === 1 ? "prescriber directed" : "patient requested"})</p>}
          {l.ndc && <p className="text-[10px] text-inksoft num">NDC {l.ndc}</p>}
          {l.alloc && l.alloc.length > 0 && (
            <div className="text-[10px] text-inksoft num">FEFO lots: {l.alloc.map((a) => `${a.batch}×${a.qty}`).join(" · ")}</div>
          )}
        </div>
      ))}
      <div className="receipt-dash my-3" />
      <div className="flex justify-between"><span>Subtotal</span><span>{money(tx.subtotal)}</span></div>
      {tx.bulkSavings && tx.bulkSavings > 0 && <div className="flex justify-between"><span>Bulk-tier savings</span><span>−{money(tx.bulkSavings)}</span></div>}
      {tx.discount > 0 && (tx.invoiceDiscountAmt ?? 0) <= 0 && <div className="flex justify-between"><span>Discount</span><span>−{money(tx.discount)}</span></div>}
      {tx.invoiceDiscountAmt && tx.invoiceDiscountAmt > 0 && (
        <>
          <div className="flex justify-between"><span>{tr("discounts.invoiceRow")}</span><span>−{money(tx.invoiceDiscountAmt)}</span></div>
          {(tx.discount - tx.invoiceDiscountAmt) > 0 && (
            <div className="flex justify-between"><span>Discount</span><span>−{money(tx.discount - tx.invoiceDiscountAmt)}</span></div>
          )}
        </>
      )}
      {tx.loyaltyDeduct && tx.loyaltyDeduct > 0 && <div className="flex justify-between"><span>Points · {tx.pointsRedeemed} pts</span><span>−{money(tx.loyaltyDeduct)}</span></div>}
      {tx.promotionDiscount && tx.promotionDiscount > 0 && (
        <div className="flex justify-between">
          <span>{tx.promotionNames?.length ? `Promotions · ${tx.promotionNames.join(", ")}` : "Promotions"}</span>
          <span>−{money(tx.promotionDiscount)}</span>
        </div>
      )}
      <div className="flex justify-between font-bold text-[14px] mt-1"><span>TOTAL</span><span>{money(tx.total)}</span></div>
      <div className="receipt-dash my-3" />
      {(tx.payments ?? [{ method: tx.method, amount: tx.total }]).map((pg, i) => (
        <div key={i} className="flex justify-between">
          <span className="uppercase">{i === 0 ? "Paid by" : "+ then"} {pg.method}</span>
          <span>{money(pg.amount)}</span>
        </div>
      ))}
      {tx.pointsEarned !== undefined && (
        <div className="flex justify-between font-semibold"><span>Loyalty earned</span><span>+{tx.pointsEarned} pts</span></div>
      )}
      {tx.tendered !== undefined && (
        <>
          <div className="flex justify-between"><span>Cash</span><span>{money(tx.tendered)}</span></div>
          <div className="flex justify-between"><span>Change</span><span>{money(tx.change ?? 0)}</span></div>
        </>
      )}
      {tx.lines.some((l) => l.rx) && state.settings.receiptTerms && (
        <p className="mt-3 text-center text-[10px] text-inksoft">{state.settings.receiptTerms}</p>
      )}
      {state.settings.showBarcode && (
        <>
          <div className="mt-4 h-8 barcode-stripes opacity-90" />
          <p className="text-center text-[10px] mt-1.5 tracking-[0.3em] text-inksoft">{tx.id.replace("T-", "8 9 0 ")}</p>
        </>
      )}
      {state.settings.receiptFooter && (
        <p className="text-center text-[10px] text-inksoft mt-2">{state.settings.receiptFooter}</p>
      )}
    </div>
  );
}

export function ReceiptModal({ tx, onClose }: { tx: Transaction; onClose: () => void }) {
  return (
    <Modal onClose={onClose} width={400} labelledBy="rcpt-title">
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-mist">
        <h2 id="rcpt-title" className="font-display font-bold text-ink">Receipt {tx.id}</h2>
        <button onClick={onClose} className="p-2 rounded-lg hover:bg-mist/50 text-inksoft transition" aria-label="Close">
          <IX size={15} />
        </button>
      </div>

      <div className="overflow-y-auto scroll-slim p-5">
        <ReceiptBody tx={tx} />
      </div>

      {createPortal(
        <div id="print-root"><div id="receipt-print"><ReceiptBody tx={tx} /></div></div>,
        document.body,
      )}

      <div className="flex gap-2 px-5 py-4 border-t border-mist">
        <button onClick={() => window.print()}
          className="flex-1 py-2.5 rounded-lg bg-ink text-paper font-display font-semibold text-sm hover:bg-pine-900 transition flex items-center justify-center gap-2">
          <IPrint size={15} /> Print receipt
        </button>
        <button onClick={onClose}
          className="flex-1 py-2.5 rounded-lg bg-pine-700 text-pine-50 font-display font-semibold text-sm hover:bg-pine-600 transition">
          New sale
        </button>
      </div>
    </Modal>
  );
}

/* Local data-exchange surface (6.8) — the app is offline-first, so external
   systems integrate by reading/writing the JSON documents it persists. */
export function DataExchangeModal({ onClose }: { onClose: () => void }) {
  const { state, dispatch } = usePos();

  const collections = useMemo(() => [
    { name: "products", count: state.products.length, desc: "Catalog + lots, pricing, custom fields", data: state.products },
    { name: "transactions", count: state.transactions.length, desc: "Sales ledger incl. refunds & splits", data: state.transactions },
    { name: "prescriptions", count: state.prescriptions.length, desc: "Rx queue, status & insurance", data: state.prescriptions },
    { name: "customers", count: state.customers.length, desc: "Loyalty book & purchase links", data: state.customers },
    { name: "transfers", count: state.transfers.length, desc: "Inter-branch stock movements", data: state.transfers },
    { name: "audit", count: state.audit.length, desc: "Append-only event log (webhook source)", data: state.audit },
  ], [state]);

  const [copied, setCopied] = useState<string | null>(null);

  const copy = async (name: string, data: unknown) => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
      setCopied(name);
      dispatch({ type: "TOAST", kind: "success", msg: `${name}.json copied to clipboard` });
      setTimeout(() => setCopied(null), 1400);
    } catch {
      dispatch({ type: "TOAST", kind: "error", msg: "Clipboard unavailable in this browser" });
    }
  };

  const download = (name: string, data: unknown) => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `counterrx-${name}.json`;
    a.click(); URL.revokeObjectURL(url);
    dispatch({ type: "TOAST", kind: "success", msg: `${name}.json downloaded` });
  };

  return (
    <Modal onClose={onClose} width={680} labelledBy="api-title">
      <div className="px-5 py-4 border-b border-mist flex items-start justify-between">
        <div>
          <h2 id="api-title" className="font-display font-bold text-ink flex items-center gap-2">
            <ICode size={17} className="text-pine-700" /> Data-exchange surface
          </h2>
          <p className="text-xs text-inksoft mt-0.5">
            Offline-first ledger — integrate by reading/writing these JSON documents
          </p>
        </div>
        <button onClick={onClose} className="p-1.5 rounded-md hover:bg-mist/60 text-inksoft" aria-label="Close"><IX size={14} /></button>
      </div>

      <div className="p-5">
        <div className="rounded-lg bg-pine-950 text-pine-100 px-4 py-3 mb-4 num text-[11px] leading-relaxed">
          <p className="text-pine-300">base&nbsp;=&nbsp;<span className="text-honey-300">localStorage["counterrx:v4"]</span></p>
          <p className="text-pine-300">GET&nbsp;&nbsp;/products&nbsp;&nbsp;/transactions&nbsp;&nbsp;/prescriptions&nbsp;&nbsp;/customers&nbsp;&nbsp;/transfers&nbsp;&nbsp;/audit</p>
          <p className="text-pine-200/60">events&nbsp;→&nbsp;audit stream (append-only, mirrors every POS mutation)</p>
        </div>

        <div className="space-y-2 max-h-[330px] overflow-y-auto scroll-slim">
          {collections.map((c) => (
            <div key={c.name} className="flex items-center gap-3 rounded-lg border border-mist bg-card px-3.5 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-ink num">/{c.name}
                  <span className="ms-2 px-1.5 py-0.5 rounded bg-mist/60 text-[10px] font-bold text-inksoft">{c.count} records</span>
                </p>
                <p className="text-[10px] text-inksoft truncate">{c.desc}</p>
              </div>
              <button onClick={() => copy(c.name, c.data)}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-mist text-[11px] font-bold text-inksoft hover:text-pine-700 hover:border-pine-400 transition shrink-0">
                <ICopy size={11} /> {copied === c.name ? "Copied" : "Copy JSON"}
              </button>
              <button onClick={() => download(c.name, c.data)}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-ink text-paper text-[11px] font-bold hover:bg-pine-900 transition shrink-0">
                <IDownload size={11} /> .json
              </button>
            </div>
          ))}
        </div>

        <p className="mt-3.5 text-[10px] text-inksoft leading-relaxed">
          Every register action (sale, refund, adjustment, transfer, dispense) appends to <span className="num font-semibold">/audit</span>,
          so a downstream system can poll or tail that stream for near-real-time sync. Restore a full snapshot any time via
          sidebar <span className="font-semibold">Backup / Restore</span>.
        </p>
      </div>
    </Modal>
  );
}
