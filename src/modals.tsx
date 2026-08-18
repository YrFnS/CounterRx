import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { usePos, money } from "./store";
import { TAX_RATE, STORE } from "./data";
import type { PayMethod, Transaction } from "./data";
import { Modal, cx } from "./ui";
import { ICash, ICard, IShield, IX, IPrint, ICheck } from "./icons";

const round2 = (n: number) => Math.round(n * 100) / 100;

export function PaymentModal() {
  const { state, dispatch, product } = usePos();
  const [method, setMethod] = useState<PayMethod>("cash");
  const [discountPct, setDiscountPct] = useState(0);
  const [tendered, setTendered] = useState("");

  const t = useMemo(() => {
    const lines = state.cart.map((c) => {
      const p = product(c.productId)!;
      return { name: p.name, qty: c.qty, price: p.price, total: c.qty * p.price };
    });
    const subtotal = round2(lines.reduce((s, l) => s + l.total, 0));
    const discount = round2((subtotal * discountPct) / 100);
    const tax = round2((subtotal - discount) * TAX_RATE);
    return { lines, subtotal, discount, tax, total: round2(subtotal - discount + tax) };
  }, [state.cart, discountPct, product]);

  const tenderedNum = parseFloat(tendered) || 0;
  const change = round2(tenderedNum - t.total);
  const canConfirm = method !== "cash" || tenderedNum >= t.total;
  const hasRx = state.cart.some((c) => product(c.productId)?.rx);

  const methods: { id: PayMethod; label: string; icon: ReactNode; hint: string }[] = [
    { id: "cash", label: "Cash", icon: <ICash size={17} />, hint: "Drawer opens" },
    { id: "card", label: "Card", icon: <ICard size={17} />, hint: "Terminal #2" },
    { id: "insurance", label: "Insurance", icon: <IShield size={17} />, hint: "Claim auto-filed" },
  ];

  const confirm = () => {
    if (!canConfirm) return;
    dispatch({ type: "COMPLETE_SALE", method, tendered: method === "cash" ? tenderedNum : t.total, discountPct });
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
            <Row k={`Tax (${(TAX_RATE * 100).toFixed(0)}%)`} v={money(t.tax)} />
            <div className="receipt-dash pt-2 mt-2">
              <Row k={<span className="font-semibold text-ink">Total</span>} v={<span className="font-bold text-pine-800">{money(t.total)}</span>} />
            </div>
          </div>

          {t.lines.length > 0 && (
            <div className="mt-4 max-h-28 overflow-y-auto scroll-slim text-xs space-y-1 pr-1">
              {t.lines.map((l) => (
                <div key={l.name} className="flex justify-between text-inksoft">
                  <span className="truncate pr-2">{l.qty} × {l.name}</span>
                  <span className="num shrink-0">{money(l.total)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* right — method */}
        <div className="p-5 bg-pine-50/50">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-inksoft mb-2">Payment method</p>
          <div className="grid grid-cols-3 gap-2">
            {methods.map((m) => (
              <button key={m.id} onClick={() => setMethod(m.id)}
                className={cx("flex flex-col items-center gap-1.5 p-3 rounded-lg border-2 transition-all duration-200",
                  method === m.id
                    ? "border-pine-600 bg-pine-700 text-pine-50 shadow-lift -translate-y-0.5"
                    : "border-mist bg-card text-ink hover:border-pine-300 hover:-translate-y-0.5")}>
                {m.icon}
                <span className="text-xs font-semibold">{m.label}</span>
                <span className={cx("text-[10px]", method === m.id ? "text-pine-200" : "text-inksoft")}>{m.hint}</span>
              </button>
            ))}
          </div>

          {method === "cash" && (
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

          {method === "card" && (
            <div className="mt-4 px-3 py-3 rounded-lg bg-card border border-mist text-xs text-inksoft leading-relaxed">
              Terminal #2 is listening — insert, tap or swipe. Amount <span className="num font-semibold text-ink">{money(t.total)}</span> will be sent automatically.
            </div>
          )}
          {method === "insurance" && (
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
            Confirm {money(t.total)} · {methods.find((m) => m.id === method)?.label}
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
  return (
    <div className="bg-white border border-mist rounded-lg p-5 num text-[12px] text-ink leading-relaxed">
      <div className="text-center">
        <p className="font-bold text-[14px] tracking-wide">{STORE.name.toUpperCase()}</p>
        <p className="text-inksoft">{STORE.branch}</p>
        <p className="text-inksoft">{STORE.address} · {STORE.phone}</p>
        <p className="text-inksoft">{STORE.gstin}</p>
      </div>
      <div className="receipt-dash my-3" />
      {tx.refundOf && (
        <p className="text-center font-bold text-[11px] tracking-[0.2em] text-ink mb-1.5">— REFUND · REVERSAL OF {tx.refundOf} —</p>
      )}
      <div className="flex justify-between"><span>Receipt</span><span className="font-semibold">{tx.id}</span></div>
      <div className="flex justify-between"><span>Date</span><span>{new Date(tx.at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span></div>
      <div className="flex justify-between"><span>Cashier</span><span>{tx.cashier}</span></div>
      <div className="receipt-dash my-3" />
      {tx.lines.map((l) => (
        <div key={l.productId} className="mb-1.5">
          <div className="flex justify-between gap-2">
            <span className="font-medium truncate">{l.name}{l.rx ? " ℞" : ""}</span>
            <span className="shrink-0">{money(l.price * l.qty)}</span>
          </div>
          <div className="flex justify-between text-inksoft text-[11px]">
            <span className="truncate">{l.form}</span>
            <span>{l.qty} × {money(l.price)}</span>
          </div>
          {l.alloc && l.alloc.length > 0 && (
            <div className="text-[10px] text-inksoft num">FEFO lots: {l.alloc.map((a) => `${a.batch}×${a.qty}`).join(" · ")}</div>
          )}
        </div>
      ))}
      <div className="receipt-dash my-3" />
      <div className="flex justify-between"><span>Subtotal</span><span>{money(tx.subtotal)}</span></div>
      {tx.discount > 0 && <div className="flex justify-between"><span>Discount</span><span>−{money(tx.discount)}</span></div>}
      <div className="flex justify-between"><span>Tax 8%</span><span>{money(tx.tax)}</span></div>
      <div className="flex justify-between font-bold text-[14px] mt-1"><span>TOTAL</span><span>{money(tx.total)}</span></div>
      <div className="receipt-dash my-3" />
      <div className="flex justify-between"><span>Paid by</span><span className="uppercase">{tx.method}</span></div>
      {tx.tendered !== undefined && (
        <>
          <div className="flex justify-between"><span>Cash</span><span>{money(tx.tendered)}</span></div>
          <div className="flex justify-between"><span>Change</span><span>{money(tx.change ?? 0)}</span></div>
        </>
      )}
      {tx.lines.some((l) => l.rx) && (
        <p className="mt-3 text-center text-[10px] text-inksoft">℞ items verified & dispensed by licensed pharmacist</p>
      )}
      <div className="mt-4 h-8 barcode-stripes opacity-90" />
      <p className="text-center text-[10px] mt-1.5 tracking-[0.3em] text-inksoft">{tx.id.replace("T-", "8 9 0 ")}</p>
      <p className="text-center text-[10px] text-inksoft mt-2">Get well soon — returns within 7 days with receipt</p>
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
