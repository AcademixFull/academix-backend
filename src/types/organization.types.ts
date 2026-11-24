export type OrganizationRole = "administrator" | "instructor" | "student";
export type OrganizationType = "university" | "company" | "other";

export interface OrganizationSummary {
  id: string;
  name: string;
  slug: string;
  description: string;
  type: OrganizationType;
  role: OrganizationRole;
  memberCount: number;
  joinCode: string | null;
  createdAt: string;
  ownerId?: string;
  isOwner?: boolean;
  active?: boolean;
  subscription?: { active: boolean; startsAt: string | null; endsAt: string | null };
  capabilities?: { canDelete: boolean; canManageMembers: boolean; canManageCourses: boolean; canLearn: boolean };
}

export interface OrganizationMember {
  userId: string;
  fullName: string;
  email: string;
  studentNumber: string | null;
  role: OrganizationRole;
  active: boolean;
  joinedAt: string;
}

export interface OrganizationCourseSummary {
  id: string;
  title: string;
  status: "draft" | "review" | "published" | "archived" | "moderated";
  active: boolean;
  instructor: { id: string; name: string } | null;
  updatedAt: string;
}
