import { describe, it, expect } from "vitest";
import { reducer, seed } from "../store";
import { can, makeOrganizations, type Organization } from "../data";

type State = Parameters<typeof reducer>[0];
type Action = Parameters<typeof reducer>[1];

function makeTestState(overrides: Partial<State> = {}): State {
  const baseSeed = seed();
  return {
    ...baseSeed,
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
    view: "register",
    invPreset: "all",
    payOpen: false,
    receipt: null,
    toasts: [],
    flashId: null,
    flashKey: 0,
    snapshotVersion: 0,
    outboxCount: 0,
    conflicts: [],
    promotions: [],
    vaccinations: [],
    shifts: [],
    storeCredits: [],
    notificationLog: [],
    ...overrides,
  };
}

describe("W4.4 platform admin — permissions", () => {
  it("grants platform_admin only to super_admin", () => {
    expect(can("super_admin", "platform_admin")).toBe(true);
    expect(can("pharmacy_admin", "platform_admin")).toBe(false);
    expect(can("pharmacist", "platform_admin")).toBe(false);
    expect(can("manager", "platform_admin")).toBe(false);
    expect(can("cashier", "platform_admin")).toBe(false);
    expect(can(undefined, "platform_admin")).toBe(false);
  });

  it("seed contains the default org plus demo tenants", () => {
    const orgs = makeOrganizations(Date.now());
    expect(orgs.length).toBeGreaterThanOrEqual(4);
    expect(orgs.some((o) => o.id === "00000000-0000-0000-0000-000000000001")).toBe(true);
    expect(orgs.some((o) => o.status === "suspended")).toBe(true);
  });
});

describe("W4.4 platform admin — ORG_SET_STATUS", () => {
  it("suspends and activates an org", () => {
    const initial = makeTestState();
    const org = initial.organizations.find((o) => o.status === "active")!;
    const suspended = reducer(initial, { type: "ORG_SET_STATUS", id: org.id, status: "suspended" });
    expect(suspended.organizations.find((o) => o.id === org.id)?.status).toBe("suspended");
    const active = reducer(suspended, { type: "ORG_SET_STATUS", id: org.id, status: "active" });
    expect(active.organizations.find((o) => o.id === org.id)?.status).toBe("active");
  });

  it("is a no-op when status is unchanged", () => {
    const initial = makeTestState();
    const org = initial.organizations[0];
    const next = reducer(initial, { type: "ORG_SET_STATUS", id: org.id, status: org.status });
    expect(next).toBe(initial);
  });

  it("is a no-op for an unknown org id", () => {
    const initial = makeTestState();
    const next = reducer(initial, { type: "ORG_SET_STATUS", id: "nope", status: "suspended" });
    expect(next).toBe(initial);
  });
});

describe("W4.4 platform admin — ORG_SET_FLAGS", () => {
  it("toggles feature flags per org", () => {
    const initial = makeTestState();
    const org = initial.organizations[0];
    const next = reducer(initial, {
      type: "ORG_SET_FLAGS",
      id: org.id,
      patch: { aiEnabled: true, claimsMode: "live" },
    });
    const updated = next.organizations.find((o) => o.id === org.id)!;
    expect(updated.aiEnabled).toBe(true);
    expect(updated.claimsMode).toBe("live");
  });
});

describe("W4.4 platform admin — ORG_PROVISION", () => {
  it("adds a new tenant org", () => {
    const initial = makeTestState();
    const newOrg: Organization = {
      id: "99999999-9999-9999-9999-999999999999",
      name: "New Pharmacy",
      ownerEmail: "owner@new.rx",
      status: "active",
      createdAt: Date.now(),
      claimsMode: "sandbox",
      ndcLiveLookup: true,
      deliveryEnabled: false,
      aiEnabled: false,
    };
    const next = reducer(initial, { type: "ORG_PROVISION", org: newOrg, products: [] });
    expect(next.organizations.some((o) => o.id === newOrg.id)).toBe(true);
    // audit entry written
    expect(next.audit.some((a) => a.detail.includes("Provisioned tenant"))).toBe(true);
  });

  it("replaces an existing org on re-provision", () => {
    const initial = makeTestState();
    const existing = initial.organizations[0];
    const renamed: Organization = { ...existing, name: "Renamed Pharmacy" };
    const next = reducer(initial, { type: "ORG_PROVISION", org: renamed, products: [] });
    expect(next.organizations.filter((o) => o.id === existing.id).length).toBe(1);
    expect(next.organizations.find((o) => o.id === existing.id)?.name).toBe("Renamed Pharmacy");
  });
});
