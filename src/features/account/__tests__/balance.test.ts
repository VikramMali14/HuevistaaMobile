import type { AiCreditSummary, CustomerEntitlement, ProjectPurchaseOptions } from "@/api/types";

import { balanceFrom } from "../balance";

const ent = (remaining: number, allowance = 3): CustomerEntitlement => ({
  customerId: "u1",
  customerName: "Priya",
  projectAllowance: allowance,
  projectsCreated: allowance - remaining,
  projectsRemaining: remaining,
});
const opts = (available: number): ProjectPurchaseOptions => ({
  subscribed: false,
  projectPricePoints: 0,
  projectPricePaise: 19900,
  pointsBalance: 0,
  validDays: 30,
  availableCredits: available,
});
const wallet = (balance: number, eligible = true) => ({ balance, eligible }) as AiCreditSummary;
const ok = <T,>(value: T) => ({ ok: true as const, value });
const failed = { ok: false as const };

describe("balanceFrom", () => {
  it("adds a shop's rooms left to the rooms bought", () => {
    const b = balanceFrom(ok(ent(2)), ok(opts(1)), ok(wallet(12)));
    expect(b.rooms).toBe(3);
    expect(b.credits).toBe(12);
    expect(b.nextStep).toBe("ready");
  });

  it("is ready on bought rooms alone, with no shop", () => {
    expect(balanceFrom(ok(null), ok(opts(1)), null).nextStep).toBe("ready");
  });

  it("is exhausted when a shop is behind the account and its rooms are used", () => {
    expect(balanceFrom(ok(ent(0)), ok(opts(0)), null).nextStep).toBe("exhausted");
  });

  it("is missing with no shop and nothing bought", () => {
    expect(balanceFrom(ok(null), ok(opts(0)), null).nextStep).toBe("missing");
  });

  it("never counts below zero", () => {
    expect(balanceFrom(ok(ent(-2)), ok(opts(-1)), null).rooms).toBe(0);
  });

  it("hides AI credits the account cannot hold", () => {
    expect(balanceFrom(null, null, ok(wallet(5, false))).credits).toBeNull();
  });

  it("says nothing about the next step until the shop question is answered", () => {
    expect(balanceFrom(null, ok(opts(2)), null).nextStep).toBeNull();
    expect(balanceFrom(failed, ok(opts(2)), null).nextStep).toBeNull();
  });

  it("is not loaded when all three failed — show nothing, never 0 rooms", () => {
    const b = balanceFrom(failed, failed, failed);
    expect(b.loaded).toBe(false);
    expect(b.nextStep).toBeNull();
  });
});
