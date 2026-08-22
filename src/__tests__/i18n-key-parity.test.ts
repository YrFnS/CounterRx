import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function flattenKeys(obj: Record<string, unknown>, prefix = ""): string[] {
  return Object.entries(obj).flatMap(([key, value]) => {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return flattenKeys(value as Record<string, unknown>, fullKey);
    }
    return fullKey;
  });
}

function getLeafKeys(obj: Record<string, unknown>, prefix = ""): Set<string> {
  const out = new Set<string>();
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      getLeafKeys(value as Record<string, unknown>, fullKey).forEach((k) => out.add(k));
    } else {
      out.add(fullKey);
    }
  }
  return out;
}

function walk(dir: string, acc: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "__tests__" || e.name === "locales" || e.name === "node_modules") continue;
      walk(p, acc);
    } else if (e.name.endsWith(".ts") || e.name.endsWith(".tsx")) {
      acc.push(p);
    }
  }
  return acc;
}

describe("i18n key-set parity", () => {
  const enPath = path.resolve(__dirname, "../locales/en.json");
  const arPath = path.resolve(__dirname, "../locales/ar.json");
  const en = JSON.parse(fs.readFileSync(enPath, "utf-8"));
  const ar = JSON.parse(fs.readFileSync(arPath, "utf-8"));

  const enKeys = flattenKeys(en).sort();
  const arKeys = flattenKeys(ar).sort();

  it("en.json and ar.json have identical key sets", () => {
    const missingInAr = enKeys.filter((k) => !arKeys.includes(k));
    const missingInEn = arKeys.filter((k) => !enKeys.includes(k));
    expect(missingInAr).toEqual([]);
    expect(missingInEn).toEqual([]);
    expect(enKeys.length).toBe(arKeys.length);
    expect(enKeys.length).toBeGreaterThan(0);
  });

  it("every dotted t(...) literal in src resolves to a leaf in both locales", () => {
    const srcRoot = path.resolve(__dirname, "..");
    const files = walk(srcRoot);
    const re = /(?:i18n\.)?t\(\s*["']([a-zA-Z][\w]*\.[\w.]+)["']/g;
    const enLeaves = getLeafKeys(en);
    const arLeaves = getLeafKeys(ar);
    const missing: string[] = [];
    for (const file of files) {
      const src = fs.readFileSync(file, "utf-8");
      let m: RegExpExecArray | null;
      while ((m = re.exec(src)) !== null) {
        const key = m[1];
        if (!enLeaves.has(key)) missing.push(`${path.relative(srcRoot, file)}:${key} (missing in en)`);
        if (!arLeaves.has(key)) missing.push(`${path.relative(srcRoot, file)}:${key} (missing in ar)`);
      }
    }
    expect(missing).toEqual([]);
  });
});
