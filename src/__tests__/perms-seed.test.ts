import { describe, it, expect } from "vitest";
import { PERMS, can, makeStaff, Role, Perm } from "../data";

describe("PERMS matrix integrity", () => {
  it("every permission has at least one allowed role", () => {
    for (const perm of Object.keys(PERMS) as Perm[]) {
      expect(PERMS[perm].length).toBeGreaterThan(0);
    }
  });

  it("no permission allows unknown roles", () => {
    const knownRoles: Role[] = ["pharmacy_admin", "pharmacist", "manager", "cashier", "super_admin"];
    for (const perm of Object.keys(PERMS) as Perm[]) {
      for (const role of PERMS[perm]) {
        expect(knownRoles).toContain(role);
      }
    }
  });

  it("pharmacy_admin has all permissions", () => {
    const allPerms: Perm[] = Object.keys(PERMS) as Perm[];
    for (const perm of allPerms) {
      expect(can("pharmacy_admin", perm)).toBe(true);
    }
  });

  it("super_admin is not explicitly in PERMS matrix (gap - Phase 2 will address)", () => {
    const allPerms: Perm[] = Object.keys(PERMS) as Perm[];
    for (const perm of allPerms) {
      expect(can("super_admin", perm)).toBe(false);
    }
  });

  it("cashier has minimal permissions", () => {
    expect(can("cashier", "refund")).toBe(false);
    expect(can("cashier", "edit_settings")).toBe(false);
    expect(can("cashier", "manage_staff")).toBe(false);
    expect(can("cashier", "verify_rx")).toBe(false);
    expect(can("cashier", "transfer_rx")).toBe(false);
    expect(can("cashier", "create_po")).toBe(false);
    expect(can("cashier", "pay_invoice")).toBe(false);
    expect(can("cashier", "add_expense")).toBe(false);
  });

  it("pharmacist has clinical permissions but not admin", () => {
    expect(can("pharmacist", "verify_rx")).toBe(true);
    expect(can("pharmacist", "transfer_rx")).toBe(true);
    expect(can("pharmacist", "receive_po")).toBe(true);
    expect(can("pharmacist", "adjust_stock")).toBe(true);
    expect(can("pharmacist", "edit_settings")).toBe(false);
    expect(can("pharmacist", "manage_staff")).toBe(false);
  });

  it("manager has financial permissions", () => {
    expect(can("manager", "refund")).toBe(true);
    expect(can("manager", "approve_transfer")).toBe(true);
    expect(can("manager", "apply_count")).toBe(true);
    expect(can("manager", "create_po")).toBe(true);
    expect(can("manager", "pay_invoice")).toBe(true);
    expect(can("manager", "add_expense")).toBe(true);
    expect(can("manager", "edit_settings")).toBe(false);
    expect(can("manager", "manage_staff")).toBe(false);
  });
});

describe("seed staff roster aligns with PERMS", () => {
  it("every seeded staff has a valid role from PERMS roles", () => {
    const staff = makeStaff(Date.now());
    const knownRoles: Role[] = ["pharmacy_admin", "pharmacist", "manager", "cashier", "super_admin"];
    
    for (const member of staff) {
      expect(knownRoles).toContain(member.role);
      expect(member.active).toBe(true);
      expect(member.pinHash).toBeTruthy();
      expect(member.id).toMatch(/^S-\d{3}$/);
    }
  });

  it("seeded roles cover all PERMS roles", () => {
    const staff = makeStaff(Date.now());
    const staffRoles = new Set(staff.map(s => s.role));
    const permsRoles = new Set<Role>([
      "pharmacy_admin", "pharmacist", "manager", "cashier", "super_admin"
    ]);
    
    for (const role of permsRoles) {
      expect(staffRoles).toContain(role);
    }
  });

  it("at least one pharmacy_admin exists in seed", () => {
    const staff = makeStaff(Date.now());
    const admins = staff.filter(s => s.role === "pharmacy_admin");
    expect(admins.length).toBeGreaterThan(0);
  });

  it("at least one pharmacist exists in seed", () => {
    const staff = makeStaff(Date.now());
    const pharmacists = staff.filter(s => s.role === "pharmacist");
    expect(pharmacists.length).toBeGreaterThan(0);
  });
});