import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { usePos, money, cartTotals } from "./store";
import { TAX_RATE } from "./data";
import type { PayMethod, PaymentLeg, Transaction } from "./data";
import { Modal, cx } from "./ui";
import { ICash, ICard, IShield, IX, IPrint, ICheck, ISplit, IUsers, IStar, IAlert, ICode, ICopy, IDownload } from "./icons";

const round2 = (n: number) => Math.round(n * 100) / 100;

export function PaymentModal() {
  const { state, dispatch, product } = usePos();
  const [leg1, setLeg1] = useState<PayMethod>("cash");
  const [leg2, setLeg2] = useState<PayMethod>("card");
  const [split, setSplit] = useState(false);
  const [leg1Amt, setLeg1Amt] = useState("");
  const [discountPct, setDiscountPct] = useState(0);
  const [tendered, setTendered] = useState("");
  const [exemptToggle, setExemptToggle] = useState(false);
  const [idChecked, setIdChecked] = useState(false);

  const customer = state.customers.find((c) => c.id === state.saleCustomerId) ?? null;
  const taxExempt = !!(customer?.taxExempt || exemptToggle);
  const t = useMemo(() => cartTotals(state, discountPct, taxExempt), [state, discountPct, taxExempt]);
  const hasControlled = state.cart.some((c) => product(c.productId)?.controlled);
  /* redeemable chunks: 100 pts = $5, capped by payable balance */
  const payableNow = Math.max(0, t.subtotal - t.bulkSavings - t.discount);
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
  const canConfirm = paymentOk && controlledOk;
  const hasRx = state.cart.some((c) => product(c.productId)?.rx);

  const methods: { id: PayMethod; label: string; icon: ReactNode; hint: string }[] = [
    { id: "cash", label: "Cash", icon: <ICash size={17} />, hint: "Drawer opens" },
    { id: "card", label: "Card", icon: <ICard size={17} />, hint: "Terminal #2" },
    { id: "insurance", label: "Insurance", icon: <IShield size={17} />, hint: "Claim auto-filed" },
  ];
  const labelOf = (m: PayMethod) => methods.find((x) => x.id === m)?.label ?? m;

  const confirm = () => {
    if (!canConfirm) return;
    const payments: PaymentLeg[] = split
      ? [{ method: leg1, amount: round2(l1) }, { method: leg2, amount: l2 }]
      : [{ method: leg1, amount: t.total }];
    dispatch({
      type: "COMPLETE_SALE", payments, discountPct, taxExempt, idChecked,
      tendered: !split && leg1 === "cash" ? tenderedNum : undefined,
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

      <div className="grid md:grid-cols-2 gap-0 overflow-y-auto scroll-slim">
        {/* left — totals */}
        <div className="p-5 md:border-r border-mist">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-inksoft">Amount due</p>
          <p className="num text-[40px] font-semibold text-ink leading-tight">{money(t.total)}</p>

          <div className="mt-4 space-y-1.5 text-sm">
            <Row k="Subtotal" v={money(t.subtotal)} />
            {t.bulkSavings > 0 && <Row k={<span className="text-honey-700 font-semibold">Bulk-tier savings</span>} v={<span className="text-honey-700">−{money(t.bulkSavings)}</span>} />}
            <div className="flex items-center justify-between py-0.5">
              <span className="text-inksoft">Discount</span>
              <span className="flex items-center gap-1">
                {[0, 5, 10].map((d) => (
                  <button key={d} onClick={() => setDiscountPct(d)}
                    className={cx("num px-2 py-0.5 rounded-md text-xs border transition",
                      discountPct === d ? "bg-pine-700 text-pine-50 border-pine-700" : "bg-card border-mist text-inksoft hover:border-pine-400")}>
                    {d}%
                  </button>
                ))}
                <span className="num text-brick-700 font-semibold ml-1">−{money(t.discount)}</span>
              </span>
            </div>
            {t.loyaltyDeduct > 0 && <Row k={<span className="text-pine-700 font-semibold">Points redeemed · {state.redeemPoints} pts</span>} v={<span className="text-pine-700">−{money(t.loyaltyDeduct)}</span>} />}
            <Row
              k={
                <span className="flex items-center gap-2">
                  {`Tax (${(TAX_RATE * 100).toFixed(0)}%)`}
                  {taxExempt && <span className="px-1.5 py-px rounded bg-pine-700 text-pine-50 text-[9px] font-bold tracking-wide">EXEMPT</span>}
                  {!taxExempt && !customer?.taxExempt && (
                    <button onClick={() => setExemptToggle(true)}
                      className="text-[9px] font-bold uppercase tracking-wide text-inksoft hover:text-pine-700 border border-mist hover:border-pine-400 rounded px-1 py-px transition">
                      exempt
                    </button>
                  )}
                </span>
              }
              v={<span className={taxExempt ? "line-through text-inksoft" : ""}>{money(taxExempt ? round2(t.tax === 0 ? (t.subtotal - t.bulkSavings - t.discount - t.loyaltyDeduct) * TAX_RATE : t.tax) : t.tax)}</span>} />
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
              {customer.taxExempt && (
                <p className="mt-2 flex items-center gap-1.5 text-[10px] font-bold text-pine-700">
                  <ICheck size={11} /> Tax-exempt account — resale certificate on file
                </p>
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

          {t.lines.length > 0 && (
            <div className="mt-4 max-h-28 overflow-y-auto scroll-slim text-xs space-y-1 pr-1">
              {t.lines.map((l) => (
                <div key={l.name} className="flex justify-between text-inksoft">
                  <span className="truncate pr-2">{l.qty} × {l.name}</span>
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
              {split ? "Payment 1 of 2" : "Payment method"}
            </p>
            <button onClick={() => setSplit(!split)}
              className={cx("flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-bold transition-all duration-200",
                split
                  ? "bg-honey-500 border-honey-500 text-pine-950 shadow-lift"
                  : "bg-card border-mist text-inksoft hover:border-honey-500 hover:text-honey-700")}>
              <ISplit size={12} /> {split ? "Split on" : "Split tender"}
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
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-inksoft mb-1.5">Payment 2 · remainder</p>
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
                  <span>{l1 <= 0 ? "Enter the first payment amount" : "Adjust — legs must cover the total exactly"}</span>
                )}
              </div>
            </div>
          )}

          {!split && leg1 === "cash" && (
            <div className="mt-4">
              <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-inksoft">Cash tendered</label>
              <input autoFocus value={tendered} onChange={(e) => setTendered(e.target.value.replace(/[^\d.]/g, ""))}
                onKeyDown={(e) => e.key === "Enter" && confirm()}
                inputMode="decimal" placeholder="0.00"
                className="num w-full mt-1.5 px-3 py-2.5 rounded-lg border-2 border-mist bg-card text-lg font-semibold text-ink focus:border-pine-500 focus:outline-none transition" />
              <div className="flex gap-1.5 mt-2">
                <Quick label="Exact" onClick={() => setTendered(t.total.toFixed(2))} />
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
              {l.override && l.listPrice !== undefined && <span className="line-through opacity-60 ml-1">{money(l.listPrice)}</span>}
            </span>
          </div>
          {l.note && <p className="text-[10px] text-inksoft italic">↳ {l.note}</p>}
          {l.alloc && l.alloc.length > 0 && (
            <div className="text-[10px] text-inksoft num">FEFO lots: {l.alloc.map((a) => `${a.batch}×${a.qty}`).join(" · ")}</div>
          )}
        </div>
      ))}
      <div className="receipt-dash my-3" />
      <div className="flex justify-between"><span>Subtotal</span><span>{money(tx.subtotal)}</span></div>
      {tx.bulkSavings && tx.bulkSavings > 0 && <div className="flex justify-between"><span>Bulk-tier savings</span><span>−{money(tx.bulkSavings)}</span></div>}
      {tx.discount > 0 && <div className="flex justify-between"><span>Discount</span><span>−{money(tx.discount)}</span></div>}
      {tx.loyaltyDeduct && tx.loyaltyDeduct > 0 && <div className="flex justify-between"><span>Points · {tx.pointsRedeemed} pts</span><span>−{money(tx.loyaltyDeduct)}</span></div>}
      <div className="flex justify-between">
        <span>Tax 8%{tx.taxExempt && <span className="ml-1 px-1 py-px bg-ink text-paper text-[8px] font-bold tracking-widest">EXEMPT</span>}</span>
        <span className={tx.taxExempt ? "text-inksoft" : ""}>{money(tx.tax)}</span>
      </div>
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
                  <span className="ml-2 px-1.5 py-0.5 rounded bg-mist/60 text-[10px] font-bold text-inksoft">{c.count} records</span>
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
