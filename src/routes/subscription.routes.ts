import { Router, type Request, type Response, type NextFunction } from "express";
import { requireAuth } from "../middleware/require-auth";
import { noStore } from "../middleware/no-store";
import { simulatedPlanPurchaseSchema, subscriptionListSchema } from "../schemas/subscription.schemas";
import { subscriptionService } from "../services/subscription.service";
import { successResponse, paginatedResponse } from "../utils/api-response";
const router = Router();
const wrap = (action: (req: Request, res: Response) => Promise<void>) => (req: Request, res: Response, next: NextFunction) => { void action(req, res).catch(next); };
router.get("/plans", noStore, wrap(async (_req, res) => { res.json(successResponse(await subscriptionService.plans())); }));
router.get("/subscriptions", requireAuth, wrap(async (req, res) => {
  const input = subscriptionListSchema.parse(req.query);
  const result = await subscriptionService.list(req.auth!.user.id, input.page, input.limit);
  res.json(paginatedResponse(result.items, result.pagination));
}));
router.get("/subscriptions/transactions", requireAuth, wrap(async (req, res) => {
  const input = subscriptionListSchema.parse(req.query);
  const result = await subscriptionService.transactions(req.auth!.user.id, input.page, input.limit);
  res.json(paginatedResponse(result.items, result.pagination));
}));
router.post("/subscriptions/simulated-purchase", requireAuth, wrap(async (req, res) => {
  res.status(201).json(successResponse(await subscriptionService.purchase(req.auth!.user.id, simulatedPlanPurchaseSchema.parse(req.body))));
}));
export default router;
