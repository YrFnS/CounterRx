import * as X from "xlsx";

/** Escape a single CSV cell (RFC 4180: quote if contains comma/quote/newline). */
function csvCell(value: unknown): string {
  const s = value === null || value === undefined ? "" :
    typeof value === "object" ? JSON.stringify(value) : String(value);
  return /[\",\n\r]/.test(s) ? `"${s.replace(/"/g, "\"")}"` : s;
}

/** Convert row objects to a CSV string. Header row uses the first row's keys. */
export function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const cols = Object.keys(rows[0]);
  const head = cols.map(csvCell).join(",");
  const body = rows.map((r) => cols.map((c) => csvCell(r[c])).join(",")).join("\n");
  return `${head}\n${body}`;
}

/** Build an .xlsx workbook from row objects. Column order follows the first row's key order. */
export function buildXlsx(
  rows: Record<string, unknown>[],
  _filename: string,
  sheetName = "Sheet1"
): Uint8Array<ArrayBuffer> {
  const ws = X.utils.json_to_sheet(rows);
  const wb = X.utils.book_new();
  X.utils.book_append_sheet(wb, ws, sheetName);
  const buf = X.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  return new Uint8Array(buf);
}
