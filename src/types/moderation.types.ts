import type { AuthoringCourseContent } from "./authoring.types";
import type { CourseWorkflowStatus, ManagedCourse } from "./administration.types";

export interface ModerationActor {
  id: string;
  name: string;
}

export interface CourseModerationRecord {
  id: string;
  courseId: string;
  moderator: ModerationActor;
  reason: string;
  previousStatus: CourseWorkflowStatus;
  active: boolean;
  moderatedAt: string;
  restoredBy: ModerationActor | null;
  restoredAt: string | null;
}

export interface ModerationCourseDetail {
  course: ManagedCourse;
  content: AuthoringCourseContent;
  moderationHistory: CourseModerationRecord[];
}
