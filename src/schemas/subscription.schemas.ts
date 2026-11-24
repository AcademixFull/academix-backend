import { z } from "zod";
import { paginationFields } from "./pagination.schemas";
export const subscriptionListSchema = z.object({ ...paginationFields });
export const simulatedPlanPurchaseSchema = z.object({
  planId: z.string().regex(/^[a-z][a-z0-9-]{2,59}$/),
  organizationId: z.uuid().optional(),
  idempotencyKey: z.uuid(),
}).strict();
export type SimulatedPlanPurchase = z.infer<typeof simulatedPlanPurchaseSchema>;
