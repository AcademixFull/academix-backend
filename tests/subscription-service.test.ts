import { describe, expect, it, vi } from "vitest";
import { createSubscriptionService } from "../src/services/subscription.service";
import { simulatedPlanPurchaseSchema } from "../src/schemas/subscription.schemas";

describe("subscriptions", () => {
  it("accepts only server-owned commercial fields", () => {
    expect(simulatedPlanPurchaseSchema.safeParse({ planId: "plus-monthly", idempotencyKey: "11111111-1111-4111-8111-111111111111", amount: 1 }).success).toBe(false);
  });
  it("passes the verified actor and idempotency key to one atomic operation", async () => {
    const repo = { plans: vi.fn(), list: vi.fn(), purchase: vi.fn().mockResolvedValue({ id: "receipt", mode: "simulated" }), assertOrganizationPaid: vi.fn(), transactions: vi.fn() };
    const service = createSubscriptionService(repo);
    const input = { planId: "plus-monthly", idempotencyKey: "11111111-1111-4111-8111-111111111111" };
    await expect(service.purchase("actor", input)).resolves.toMatchObject({ mode: "simulated" });
    expect(repo.purchase).toHaveBeenCalledWith("actor", input);
  });
});
