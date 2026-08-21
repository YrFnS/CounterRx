import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

function flattenKeys(obj: Record<string, unknown>, prefix = ""): string[] {
  return Object.entries(obj).flatMap(([key, value]) => {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return flattenKeys(value as Record<string, unknown>, fullKey);
    }
    return fullKey;
  });
}

describe("i18n key-set parity", () => {
  it("en.json and ar.json have identical key sets", () => {
    const enPath = path.resolve(__dirname, "../locales/en.json");
    const arPath = path.resolve(__dirname, "../locales/ar.json");

    const enContent = fs.readFileSync(enPath, "utf-8");
    const arContent = fs.readFileSync(arPath, "utf-8");

    const en = JSON.parse(enContent);
    const ar = JSON.parse(arContent);

    const enKeys = flattenKeys(en).sort();
    const arKeys = flattenKeys(ar).sort();

    // Check for keys in en but not in ar
    const missingInAr = enKeys.filter((k) => !arKeys.includes(k));
    // Check for keys in ar but not in en
    const missingInEn = arKeys.filter((k) => !enKeys.includes(k));

    expect(missingInAr).toEqual([]);
    expect(missingInEn).toEqual([]);

    // Also verify both have the same count
    expect(enKeys.length).toBe(arKeys.length);
    expect(enKeys.length).toBeGreaterThan(0);
  });

  it("both locale files have exactly 364 keys (the current expected count)", () => {
    const enPath = path.resolve(__dirname, "../locales/en.json");
    const arPath = path.resolve(__dirname, "../locales/ar.json");

    const enContent = fs.readFileSync(enPath, "utf-8");
    const arContent = fs.readFileSync(arPath, "utf-8");

    const en = JSON.parse(enContent);
    const ar = JSON.parse(arContent);

    const enKeys = flattenKeys(en);
    const arKeys = flattenKeys(ar);

    expect(enKeys.length).toBe(364);
    expect(arKeys.length).toBe(364);
  });
});