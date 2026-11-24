import type { EnrollmentSummary } from "./student.types";

export interface CheckoutInput {
  courseIds: string[];
  idempotencyKey: string;
}

export interface CheckoutReceipt {
  id: string;
  mode: "simulated";
  currency: "MXN";
  total: number;
  items: Array<{ courseId: string; enrollmentId: string; amount: number; alreadyOwned: boolean }>;
}

export interface CheckoutResult extends CheckoutReceipt {
  enrollments: EnrollmentSummary[];
}
