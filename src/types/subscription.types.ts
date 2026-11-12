export interface SubscriptionPlan {
  id: string;
  name: string;
  audience: "person" | "organization";
  priceMxn: number | null;
  months: number | null;
  features: string[];
  purchasable: boolean;
}
export interface SubscriptionSummary {
  id: string;
  planId: string;
  planName: string;
  organizationId: string | null;
  startsAt: string;
  endsAt: string;
  status: "active" | "expired" | "cancelled";
}
export interface PlanReceipt {
  id: string;
  mode: "simulated";
  currency: "MXN";
  amount: number;
  subscription: SubscriptionSummary;
}
