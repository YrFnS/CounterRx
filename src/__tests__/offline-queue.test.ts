import { describe, it, expect, beforeEach } from "vitest";
import {
  enqueueChanges,
  drainOutbox,
  readOutbox,
  writeOutbox,
  clearOutbox,
  type OutboxEntry,
} from "../lib/outbox";

// Minimal localStorage polyfill for the node test environment.
const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  (globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() {
      return store.size;
    },
  } as Storage;
});

const row = (
  id: string,
  updatedAt: number,
  extra: Record<string, unknown> = {},
): Record<string, unknown> => ({
  id,
  updatedAt,
  ...extra,
});

describe("W3.3 offline outbox", () => {
  it("enqueues changed rows while offline (diff prev -> next)", () => {
    const prev = [row("a", 1, { name: "A" }), row("b", 1, { name: "B" })];
    const next = [row("a", 2, { name: "A2" }), row("b", 1, { name: "B" })]; // a changed, b same
    const queued = enqueueChanges("products", "id", prev, next);
    expect(queued).toHaveLength(1);
    expect(queued[0].table).toBe("products");
    expect(queued[0].key).toBe("a");
    expect(queued[0].action).toBe("upsert");
    writeOutbox(queued);
    expect(readOutbox()).toHaveLength(1);
  });

  it("enqueues a deleted row", () => {
    const prev = [row("a", 1), row("b", 1)];
    const next = [row("a", 1)];
    const queued = enqueueChanges("products", "id", prev, next);
    expect(queued.find((e) => e.key === "b")?.action).toBe("delete");
  });

  it("replays queued mutations in FIFO order", async () => {
    const order: string[] = [];
    writeOutbox([
      {
        id: "products:p1:1:0",
        action: "upsert",
        payload: row("p1", 1),
        at: 1,
        updatedAt: 1,
        table: "products",
        key: "p1",
      },
      {
        id: "products:p2:2:0",
        action: "upsert",
        payload: row("p2", 2),
        at: 2,
        updatedAt: 2,
        table: "products",
        key: "p2",
      },
    ] as OutboxEntry[]);
    const res = await drainOutbox({
      fetchRow: async () => null,
      writeRow: async (table, payload) => {
        order.push(`${table}:${(payload as { id: string }).id}`);
      },
    });
    expect(order).toEqual(["products:p1", "products:p2"]);
    expect(res.drained).toBe(2);
    expect(readOutbox()).toHaveLength(0);
  });

  it("LWW: keeps the newer local row when remote is older", async () => {
    writeOutbox([
      {
        id: "products:p1:1:0",
        action: "upsert",
        payload: row("p1", 100),
        at: 1,
        updatedAt: 100,
        table: "products",
        key: "p1",
      },
    ] as OutboxEntry[]);
    const written: unknown[] = [];
    const res = await drainOutbox({
      fetchRow: async () => row("p1", 50), // remote older (50 < 100)
      writeRow: async (_t, p) => {
        written.push(p);
      },
    });
    expect(res.conflicts).toHaveLength(0);
    expect(written).toHaveLength(1);
    expect(readOutbox()).toHaveLength(0);
  });

  it("LWW: drops the local op when remote is newer (conflict)", async () => {
    writeOutbox([
      {
        id: "products:p1:1:0",
        action: "upsert",
        payload: row("p1", 100),
        at: 1,
        updatedAt: 100,
        table: "products",
        key: "p1",
      },
    ] as OutboxEntry[]);
    const res = await drainOutbox({
      fetchRow: async () => row("p1", 200), // remote newer (200 > 100)
      writeRow: async () => {
        throw new Error("should not write");
      },
    });
    expect(res.conflicts).toHaveLength(1);
    expect(res.conflicts[0].key).toBe("p1");
    expect(readOutbox()).toHaveLength(0); // conflict resolved (dropped), queue drains
  });

  it("keeps local on equal timestamps (strict LWW: ties are not 'newer')", async () => {
    writeOutbox([
      {
        id: "products:p1:1:0",
        action: "upsert",
        payload: row("p1", 100),
        at: 1,
        updatedAt: 100,
        table: "products",
        key: "p1",
      },
    ] as OutboxEntry[]);
    const written: unknown[] = [];
    const res = await drainOutbox({
      fetchRow: async () => row("p1", 100), // equal -> local kept (not strictly older)
      writeRow: async (_t, p) => {
        written.push(p);
      },
    });
    expect(res.conflicts).toHaveLength(0);
    expect(written).toHaveLength(1);
  });

  it("force flag pushes a local row even when remote is newer (keep-local)", async () => {
    writeOutbox([
      {
        id: "products:p1:1:0",
        action: "upsert",
        payload: row("p1", 100),
        at: 1,
        updatedAt: 100,
        table: "products",
        key: "p1",
      },
    ] as OutboxEntry[]);
    const written: unknown[] = [];
    const res = await drainOutbox({
      force: { table: "products", key: "p1" },
      fetchRow: async () => row("p1", 999), // remote much newer
      writeRow: async (_t, p) => {
        written.push(p);
      },
    });
    expect(res.conflicts).toHaveLength(0);
    expect(written).toHaveLength(1);
  });

  it("uses createdAt fallback when updatedAt is absent", async () => {
    // enqueueChanges derives the LWW clock from createdAt (updatedAt absent here).
    const queued = enqueueChanges(
      "customers",
      "id",
      [],
      [{ id: "c1", createdAt: 100 }],
    );
    writeOutbox(queued);
    const written: unknown[] = [];
    const res = await drainOutbox({
      fetchRow: async () => ({ id: "c1", createdAt: 50 }), // remote older via createdAt
      writeRow: async (_t, p) => {
        written.push(p);
      },
    });
    expect(res.conflicts).toHaveLength(0);
    expect(written).toHaveLength(1);
  });

  it("merges duplicate keys to the latest entry", () => {
    const a = enqueueChanges("products", "id", [], [row("p1", 1)]);
    writeOutbox(a);
    const b = enqueueChanges("products", "id", [row("p1", 1)], [row("p1", 5)]); // newer edit same key
    writeOutbox(b);
    const all = readOutbox();
    expect(all.filter((e) => e.key === "p1")).toHaveLength(1);
    expect(all.find((e) => e.key === "p1")?.updatedAt).toBe(5);
  });
});
