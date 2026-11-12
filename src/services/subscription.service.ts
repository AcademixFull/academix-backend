import { subscriptionRepository, type SubscriptionRepository } from "../repositories/subscription.repository";
import type { SimulatedPlanPurchase } from "../schemas/subscription.schemas";
import { pageResult } from "../utils/pagination";
export function createSubscriptionService(repository: SubscriptionRepository) {
  return {
    plans: () => repository.plans(),
    async list(userId: string, page: number, limit: number) {
      const result = await repository.list(userId, page, limit);
      return pageResult(result.records, result.total, page, limit);
    },
    purchase: (userId: string, input: SimulatedPlanPurchase) => repository.purchase(userId, input),
    async transactions(userId: string, page: number, limit: number) {
      const result = await repository.transactions(userId, page, limit);
      return pageResult(result.records, result.total, page, limit);
    },
  };
}
export const subscriptionService = createSubscriptionService(subscriptionRepository);
