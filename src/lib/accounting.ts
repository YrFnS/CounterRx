import { toCsv } from "./export";
import type { Transaction, Expense, ApInvoice } from "../data";
import { invoiceBalance } from "../data";

const SALES_ACCOUNT = "Sales:Pharmacy";
const PAYMENT_ACCOUNT = "Undeposited Funds";

/** Local-date ISO (yyyy-mm-dd) without timezone drift — matches Finance.tsx toISODate. */
export const isoDate = (ts: number) =>
  new Date(ts - new Date(ts).getTimezoneOffset() * 60000).toISOString().slice(0, 10);

const isSale = (tx: Transaction) => !tx.refundOf && !tx.voidedAt;

/* ------------------------------- Sales ------------------------------- */
/** QBO "general journal"/sales CSV: Date, Payee, Memo, Account, Amount (positive). */
export interface SalesRow {
  Date: string; Payee: string; Memo: string; Account: string; Amount: number;
}
export function buildSalesRows(
  txs: Transaction[],
  customerName: (id?: string) => string
): SalesRow[] {
  return txs
    .filter(isSale)
    .map((tx) => {
      const name = customerName(tx.customerId) || "Walk-in";
      return {
        Date: isoDate(tx.at),
        Payee: name,
        Memo: `Sale ${tx.id}`,
        Account: SALES_ACCOUNT,
        Amount: Math.abs(tx.total),
      };
    });
}

/** QBO "receive payment" CSV: Date, Payee, Memo, Account, Amount, Name, Class, Split. */
export interface SalesPaymentRow {
  Date: string; Payee: string; Memo: string; Account: string;
  Amount: number; Name: string; Class: string; Split: string;
}
export function buildSalesPaymentRows(
  txs: Transaction[],
  customerName: (id?: string) => string
): SalesPaymentRow[] {
  return txs
    .filter(isSale)
    .map((tx) => {
      const name = customerName(tx.customerId) || "Walk-in";
      return {
        Date: isoDate(tx.at),
        Payee: name,
        Memo: `Payment for ${tx.id}`,
        Account: PAYMENT_ACCOUNT,
        Amount: Math.abs(tx.total),
        Name: name,
        Class: "",
        Split: "",
      };
    });
}

/* ------------------------------ Expenses ------------------------------ */
/** QBO expense CSV: Date, Payee, Memo, Account (expense category), Amount. */
export interface ExpenseRow {
  Date: string; Payee: string; Memo: string; Account: string; Amount: number;
}
export function buildExpenseRows(expenses: Expense[]): ExpenseRow[] {
  return expenses.map((e) => ({
    Date: isoDate(e.date),
    Payee: e.payee,
    Memo: e.note ? `${e.category} — ${e.note}` : e.category,
    Account: e.category,
    Amount: e.amount,
  }));
}

/* --------------------------- Accounts Payable --------------------------- */
/** QBO AP/bill CSV: only UNPAID invoices — Date, Vendor, Invoice No, Amount, Due Date, Terms. */
export interface ApRow {
  Date: string; Vendor: string; "Invoice No": string;
  Amount: number; "Due Date": string; Terms: string;
}
export function buildApRows(
  invoices: ApInvoice[],
  supplierName: (id: string) => string
): ApRow[] {
  return invoices
    .filter((inv) => invoiceBalance(inv) > 0)
    .map((inv) => ({
      Date: isoDate(inv.date),
      Vendor: supplierName(inv.supplierId),
      "Invoice No": inv.number,
      Amount: invoiceBalance(inv),
      "Due Date": isoDate(inv.date + inv.dueDays * 86_400_000),
      Terms: `Net ${inv.dueDays}`,
    }));
}

/* ------------------------------- CSV wrappers ------------------------------- */
export const salesCsv = (txs: Transaction[], customerName: (id?: string) => string) =>
  toCsv(buildSalesRows(txs, customerName));
export const salesPaymentsCsv = (txs: Transaction[], customerName: (id?: string) => string) =>
  toCsv(buildSalesPaymentRows(txs, customerName));
export const expensesCsv = (expenses: Expense[]) => toCsv(buildExpenseRows(expenses));
export const apCsv = (invoices: ApInvoice[], supplierName: (id: string) => string) =>
  toCsv(buildApRows(invoices, supplierName));
