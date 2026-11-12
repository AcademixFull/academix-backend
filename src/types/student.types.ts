import type { CourseSummary } from "./catalog.types";

export type EnrollmentStatus = "in_progress" | "completed";

export interface EnrollmentSummary {
  accessActive?: boolean;
  id: string;
  course: CourseSummary;
  status: EnrollmentStatus;
  progressPercentage: number;
  completedLessons: number;
  totalLessons: number;
  lastAccessedAt: string;
}

export interface LearningLesson {
  id: string;
  title: string;
  durationMinutes: number;
  description: string;
  content: string;
  isPreview: boolean;
  isCompleted: boolean;
  resources: Array<{
    id: string;
    type: string;
    title: string;
    description: string;
    required: boolean;
    position: number;
    url: string | null;
    contentPath: string | null;
  }>;
}

export interface LearningModule {
  id: string;
  title: string;
  position: number;
  lessons: LearningLesson[];
}

export interface LearningCourse {
  accessExpiresAt?: string | null;
  id: string;
  title: string;
  instructorName: string;
  progressPercentage: number;
  completedLessons: number;
  totalLessons: number;
  modules: LearningModule[];
}
