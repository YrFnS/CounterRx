import * as X from "xlsx";

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
