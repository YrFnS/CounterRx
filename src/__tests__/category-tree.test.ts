import { describe, it, expect } from "vitest";
import { catChildren, catSubtree, catPathLabel, catLabel, CATEGORIES_FALLBACK, type Category } from "../data";

const cats: Category[] = [
  { id: "pain", label: "Pain relief", color: "#e0a63c", groupId: "acute", sort: 2, archived: false },
  { id: "analgesics", label: "Analgesics", color: "#e0a63c", groupId: "acute", sort: 13, archived: false, parentId: "pain" },
  { id: "migraine", label: "Migraine", color: "#e0a63c", groupId: "acute", sort: 14, archived: false, parentId: "analgesics" },
  { id: "cardio", label: "Cardio", color: "#a05a79", groupId: "chronic", sort: 6, archived: false },
];

describe("category tree roll-ups (W2.1)", () => {
  it("catChildren lists direct children only", () => {
    expect(catChildren("pain", cats)).toEqual(["analgesics"]);
    expect(catChildren("analgesics", cats)).toEqual(["migraine"]);
    expect(catChildren("cardio", cats)).toEqual([]);
    expect(catChildren("nope", cats)).toEqual([]);
  });

  it("catSubtree expands to self + all descendants (defensive beyond depth 2)", () => {
    expect(catSubtree("cardio", cats)).toEqual(["cardio"]);
    expect(catSubtree("pain", cats)).toEqual(["pain", "analgesics", "migraine"]);
    expect(catSubtree("analgesics", cats)).toEqual(["analgesics", "migraine"]);
  });

  it("roll-up math folds child product totals into the parent chip count", () => {
    // products: 3 in pain, 2 in analgesics, 5 in migraine, 4 in cardio
    const counts = new Map([["pain", 3], ["analgesics", 2], ["migraine", 5], ["cardio", 4]]);
    const rollUp = (id: string) =>
      catSubtree(id, cats).reduce((s, k) => s + (counts.get(k) ?? 0), 0);
    expect(rollUp("pain")).toBe(10);      // 3 + 2 + 5
    expect(rollUp("analgesics")).toBe(7); // 2 + 5
    expect(rollUp("cardio")).toBe(4);     // leaf unchanged
  });

  it("catPathLabel renders 'Parent / Child' and plain labels otherwise", () => {
    expect(catPathLabel("analgesics", cats)).toBe("Pain relief / Analgesics");
    expect(catPathLabel("pain", cats)).toBe("Pain relief");
    expect(catPathLabel("unknown", cats)).toBe("unknown");
  });

  it("seed fallback carries the analgesics → pain parenting", () => {
    const a = CATEGORIES_FALLBACK.find((c) => c.id === "analgesics")!;
    expect(a.parentId).toBe("pain");
    expect(CATEGORIES_FALLBACK.filter((c) => c.parentId === "pain").map((c) => c.id)).toContain("analgesics");
  });

  it("depth guard: parent picker candidates exclude parents-with-children, self and descendants", () => {
    // mirrors CategoriesTab parentOptions logic — depth ≤ 2 means only leaf top-level cats can be parents
    const parentCandidates = (all: Category[], editingId: string | null) => {
      const hasKids = new Set(all.map((c) => c.parentId).filter(Boolean));
      return all.filter((c) => !c.parentId && c.id !== editingId && !hasKids.has(c.id));
    };
    // editing analgesics: pain has kids → excluded; cardio is a valid parent; self excluded
    const opts = parentCandidates(cats, "analgesics");
    expect(opts.map((o) => o.id)).toEqual(["cardio"]);
    // editing migraine would make it depth 3 under any candidate with kids — none offered except true leaves
    expect(parentCandidates(cats, "migraine").map((o) => o.id)).toEqual(["cardio"]);
  });

  it("labels still resolve through catLabel fallbacks", () => {
    expect(catLabel("pain", cats)).toBe("Pain relief");
    expect(catLabel("antibiotics")).toBe("Antibiotics"); // seed lookup
    expect(catLabel("zzz")).toBe("zzz");
  });
});
