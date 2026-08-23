import { describe, it, expect } from "vitest";
import {
  buildSalesRows,
  buildSalesPaymentRows,
  buildExpenseRows,
  buildApRows,
  salesCsv,
  salesPaymentsCsv,
  expensesCsv,
  apCsv,
} from "../lib/accounting";
import type { Transaction, Expense, ApInvoice } from "../data";
import { invoicePaid, invoiceBalance } from "../data";

const tx = (over: Partial<Transaction> = {}): Transaction => ({
  id: "TX-1",
  at: Date.UTC(2026, 0, 15, 10, 0, 0),
  lines: [],
  subtotal: 10,
  discount: 0,
  tax: 0,
  total: 10,
  method: "cash",
  cashier: "ada",
  ...over,
});

const inv = (over: Partial<ApInvoice> = {}): ApInvoice => ({
  id: "AP-1",
  number: "INV-100",
  supplierId: "SUP-01",
  date: Date.UTC(2026, 0, 1),
  dueDays: 30,
  total: 500,
  payments: [],
  credits: [],
  ...over,
});

const customerName = (id?: string) => (id === "C-1" ? "Grace Lin" : "");
const supplierName = (id: string) => (id === "SUP-01" ? "MediSource Ltd" : id);

describe("accounting export builders", () => {
  it("sales rows carry positive amounts and QBO headers", () => {
    const rows = buildSalesRows([tx({ total: -5, refundOf: "TX-0" }), tx({ total: 12.5, customerId: "C-1" })], customerName);
    /* refund filtered out */
    expect(rows).toHaveLength(1);
    expect(rows[0].Amount).toBe(12.5);
    expect(rows[0].Amount).toBeGreaterThan(0);
    expect(rows[0].Date).toBe("2026-01-15");
    expect(rows[0].Payee).toBe("Grace Lin");
    expect(rows[0].Account).toBe("Sales:Pharmacy");
    expect(rows[0].Memo).toContain("TX-1");
  });

  it("sales payments variant includes the extra QBO columns", () => {
    const rows = buildSalesPaymentRows([tx({ total: 8 })], customerName);
    expect(rows[0].Amount).toBe(8);
    expect(rows[0]).toHaveProperty("Name");
    expect(rows[0]).toHaveProperty("Class");
    expect(rows[0]).toHaveProperty("Split");
    expect(rows[0].Account).toBe("Undeposited Funds");
  });

  it("expense rows map category to Account and positive amount", () => {
    const e: Expense = { id: "E-1", category: "Rent", amount: 1200, date: Date.UTC(2026, 2, 4), payee: "Landlord LLC", note: "Mar rent" };
    const rows = buildExpenseRows([e]);
    expect(rows[0].Amount).toBe(1200);
    expect(rows[0].Account).toBe("Rent");
    expect(rows[0].Payee).toBe("Landlord LLC");
  });

  it("AP rows include only unpaid invoices", () => {
    const paid: ApInvoice = { ...inv(), payments: [{ at: 1, amount: 500, method: "bank" }] };
    const partial: ApInvoice = { ...inv({ id: "AP-2", number: "INV-101" }), payments: [{ at: 1, amount: 200, method: "bank" }] };
    const open: ApInvoice = inv({ id: "AP-3", number: "INV-102", total: 300 });
    const rows = buildApRows([paid, partial, open], supplierName);
    /* paid invoice (balance 0) must be excluded */
    expect(invoiceBalance(paid)).toBe(0);
    expect(rows.find((r) => r["Invoice No"] === "INV-100")).toBeUndefined();
    /* partial + open kept, with outstanding balance as Amount */
    expect(rows).toHaveLength(2);
    const p = rows.find((r) => r["Invoice No"] === "INV-101")!;
    expect(p.Amount).toBe(300);
    expect(p.Vendor).toBe("MediSource Ltd");
    expect(p.Terms).toBe("Net 30");
    expect(p["Due Date"]).toBe("2026-01-31");
  });

  it("apCsv includes the required header columns", () => {
    const csv = apCsv([inv()], supplierName);
    const head = csv.split("\n")[0];
    expect(head).toBe("Date,Vendor,Invoice No,Amount,Due Date,Terms");
  });

  it("generated CSV headers match QBO layout and amounts stay positive", () => {
    const sales = salesCsv([tx({ total: 9.99, customerId: "C-1" })], customerName);
    expect(sales.split("\n")[0]).toBe("Date,Payee,Memo,Account,Amount");
    expect(sales.split("\n")[1]).toContain(",9.99");

    const salesPay = salesPaymentsCsv([tx({ total: 9.99 })], customerName);
    expect(salesPay.split("\n")[0]).toBe("Date,Payee,Memo,Account,Amount,Name,Class,Split");

    const exp = expensesCsv([{ id: "E-2", category: "Utilities", amount: 42, date: Date.UTC(2026, 1, 2), payee: "Power Co" }]);
    expect(exp.split("\n")[0]).toBe("Date,Payee,Memo,Account,Amount");
  });
});
