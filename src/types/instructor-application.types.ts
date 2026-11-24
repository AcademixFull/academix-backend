export type InstructorApplicationStatus = "pending" | "approved" | "rejected";

export interface InstructorApplication {
  id: string;
  folio: string;
  userId: string;
  applicantName: string;
  applicantEmail: string;
  enrollmentId: string;
  credentialReference: string;
  status: InstructorApplicationStatus;
  observations: string;
  requestedAt: string;
  reviewedAt: string | null;
}
