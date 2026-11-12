import type { AuthUser } from "../services/auth.service";

export type AppRole = AuthUser["role"];
export type CourseWorkflowStatus = "draft" | "review" | "published" | "archived" | "moderated";
export type CourseModality = "self_paced" | "live" | "blended";

export interface ManagedUser {
  id: string;
  fullName: string;
  email: string;
  active: boolean;
  roles: AppRole[];
  institutionalOrganizations?: Array<{ id: string; name: string }>;
}

export interface ManagedInstructor {
  id: string;
  fullName: string;
  email: string;
  specialty: string;
  experienceYears: number;
  active: boolean;
}

export interface ManagedCourse {
  id: string;
  slug: string;
  title: string;
  shortDescription: string;
  description: string;
  learningOutcomes: string[];
  requirements: string[];
  targetAudience: string;
  categoryId: number;
  level: "beginner" | "intermediate" | "advanced";
  modality: CourseModality;
  language: string;
  durationHours: number | null;
  price: number;
  certificateEnabled: boolean;
  requiresApproval: boolean;
  featuredVisible?: boolean;
  organization: { id: string; name: string } | null;
  status: CourseWorkflowStatus;
  active: boolean;
  instructor: { id: string; name: string } | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CourseOptions {
  categories: Array<{ id: number; name: string; slug: string }>;
  levels: Array<{ value: "beginner" | "intermediate" | "advanced"; label: string }>;
  modalities: Array<{ value: CourseModality; label: string }>;
  languages: Array<{ code: string; name: string }>;
  statuses: Array<{ value: CourseWorkflowStatus; label: string }>;
}
