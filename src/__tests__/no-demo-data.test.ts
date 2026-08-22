import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/* P5 grep-gate: hardcoded demo strings must never ship in app source.
 * They either render fake data on screen or imply the ledger is local-only. */
const FORBIDDEN = [
  "Branch 04",
  "Maple Avenue",
  "demo dataset",
  "local ledger",
  "SCANNER LIVE",
  "Reset demo data",
  "A. Okafor", // hardcoded cashier persona
];

const ROOTS = [join(import.meta.dirname, "..", "views"), join(import.meta.dirname, ".."), join(import.meta.dirname, "..", "lib")];
const SKIP = new Set(["__tests__", "locales", "node_modules"]);

function* walk(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) yield* walk(p);
    else if (/\.(tsx?|jsx?)$/.test(name)) yield p;
  }
}

describe("no hardcoded demo data in source (P5 gate)", () => {
  it("src/ contains none of the retired demo strings", () => {
    const offenders: string[] = [];
    const seen = new Set<string>();
    for (const root of ROOTS) {
      if (seen.has(root)) continue;
      seen.add(root);
      for (const file of walk(root)) {
        const text = readFileSync(file, "utf8");
        for (const needle of FORBIDDEN) {
          if (text.includes(needle)) offenders.push(`${file}: "${needle}"`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
