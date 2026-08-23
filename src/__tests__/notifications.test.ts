import { describe, it, expect, vi, afterEach } from "vitest";
import { consoleNotifier, notifierFor, renderTemplate } from "../lib/notify";
import type { NotificationLogEntry } from "../lib/notify";
import { makeSettings } from "../data";
import { seed } from "../store";

/* Deterministic org settings; notifications block mirrors makeSettings() defaults. */
function settingsWith(overrides: Record<string, unknown> = {}) {
  const s = makeSettings();
  s.notifications = {
    channel: "console",
    enabled: { rxReady: true, refillDue: true, creditLow: true },
    templates: {
      rxReady: "Hello {{patient}}, your prescription {{rxId}} is ready at {{pharmacy}}.",
      refillDue: "Hi {{patient}}, time for a {{product}} refill.",
      creditLow: "Hi {{customer}}, credit down to {{balance}}.",
    },
    creditLowThreshold: 10,
    ...overrides,
  };
  return s;
}

/* Full reducer State over the seeded ledger — mirrors reducer.test.ts makeTestState. */
function makeState(overrides: Record<string, unknown> = {}) {
  const base = seed();
  return {
    ...base,
    user: null,
    backendAuthenticated: false,
    backendOffline: false,
    lockouts: {},
    restrictedLog: [],
    online: true,
    cart: [],
    held: [],
    saleCustomerId: null,
    redeemPoints: 0,
    currentShift: null,
    view: "register" as const,
    invPreset: "all" as const,
    payOpen: false,
    receipt: null,
    toasts: [],
    flashId: null,
    flashKey: 0,
    snapshotVersion: 0,
    outboxCount: 0,
    conflicts: [],
    notificationLog: [] as NotificationLogEntry[],
    ...overrides,
  };
}

afterEach(() => vi.restoreAllMocks());

describe("notifier registry (W3.1)", () => {
  it("picks the provider registered under settings.notifications.channel", () => {
    expect(notifierFor(settingsWith()).channel).toBe("console");
  });

  it("falls back to the console stub for unknown/unset channels", () => {
    expect(notifierFor(settingsWith({ channel: "twilio" })).channel).toBe("console");
    expect(notifierFor({ notifications: undefined as never }).channel).toBe("console");
  });

  it("console stub logs the rendered message and reports success", async () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    const result = await consoleNotifier.send({ to: "+1555000111", template: "rxReady", vars: { patient: "Ada" } });
    expect(result.ok).toBe(true);
    expect(spy).toHaveBeenCalledWith("[notify:rxReady] → +1555000111", { patient: "Ada" });
  });
});

describe("template rendering", () => {
  it("interpolates every var and drops unknown placeholders", () => {
    expect(renderTemplate("Hi {{patient}}, {{rxId}} at {{pharmacy}} — {{missing}}!",
      { patient: "Ada", rxId: "RX-1", pharmacy: "CounterRx" }))
      .toBe("Hi Ada, RX-1 at CounterRx — !");
  });
});

describe("notification triggers enqueue correct payloads", () => {
  it("RX_STATUS → dispensed enqueues an rxReady entry for the linked customer", async () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    const { reducer } = await import("../store");
    const state = makeState();
    // seed prescriptions carry patient names that match seeded customers
    const rx = state.prescriptions.find((r) => state.customers.some((c) => c.name === r.patient));
    expect(rx).toBeDefined();
    const next = reducer(state, { type: "RX_STATUS", id: rx!.id, status: "dispensed" });
    expect(next.notificationLog.length).toBe(1);
    const entry = next.notificationLog[0];
    expect(entry.template).toBe("rxReady");
    expect(entry.channel).toBe("console");
    expect(entry.status).toBe("sent");
    expect(entry.payload.rxId).toBe(rx!.id);
    expect(String(entry.recipient).length).toBeGreaterThan(0);
    expect(spy).toHaveBeenCalled();
  });

  it("skips the notification when the trigger toggle is off", async () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    const { reducer } = await import("../store");
    const base = makeState();
    base.settings.notifications.enabled.rxReady = false;
    const rx = base.prescriptions.find((r) => base.customers.some((c) => c.name === r.patient));
    const next = reducer(base, { type: "RX_STATUS", id: rx!.id, status: "dispensed" });
    expect(next.notificationLog.length).toBe(0);
    expect(spy).not.toHaveBeenCalled();
  });

  it("REMIND_RX enqueues a refillDue entry only on first reminder", async () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    const { reducer } = await import("../store");
    const base = makeState();
    const rx = base.prescriptions.find((r) => base.customers.some((c) => c.name === r.patient));
    const first = reducer(base, { type: "REMIND_RX", id: rx!.id });
    expect(first.notificationLog[0].template).toBe("refillDue");
    const second = reducer(first, { type: "REMIND_RX", id: rx!.id });
    expect(second.notificationLog.length).toBe(1); // no duplicate
  });
});

describe("log entry shape (auditable)", () => {
  it("entries persist the full audit shape with fresh ids and timestamps", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    const { reducer } = await import("../store");
    const base = makeState();
    const rx = base.prescriptions.find((r) => base.customers.some((c) => c.name === r.patient));
    let next = reducer(base, { type: "RX_STATUS", id: rx!.id, status: "dispensed" });
    next = reducer(next, { type: "NOTIFY_SEND", kind: "creditLow", to: "Ada · +1555", vars: { customer: "Ada", balance: "$3.20" } });
    expect(next.notificationLog.length).toBe(2);
    for (const e of next.notificationLog) {
      expect(e.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(typeof e.at).toBe("number");
      expect(e.at).toBeGreaterThan(0);
      // auditable shape: client-side contract keys must all be present
      expect(e).toEqual(expect.objectContaining({
        id: expect.any(String), recipient: expect.any(String), channel: expect.any(String),
        template: expect.any(String), payload: expect.any(Object), status: expect.any(String), at: expect.any(Number),
      }));
    }
    const kinds = next.notificationLog.map((e) => e.template).sort();
    expect(kinds).toEqual(["creditLow", "rxReady"]);
  });
});
