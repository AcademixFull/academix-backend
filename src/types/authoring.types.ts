export type CourseContentStatus = "draft" | "review" | "published" | "archived" | "moderated";

export interface AuthoringResource {
  id: string;
  typeId: number;
  type: string;
  title: string;
  description: string;
  url: string | null;
  fileId: string | null;
  required: boolean;
  position: number;
  active: boolean;
}
export interface AuthoringLesson {
  id: string;
  title: string;
  description: string;
  content: string;
  durationMinutes: number;
  position: number;
  isPreview: boolean;
  active: boolean;
  resources: AuthoringResource[];
}

export interface AuthoringModule {
  id: string;
  title: string;
  description: string;
  position: number;
  active: boolean;
  lessons: AuthoringLesson[];
}

export interface AuthoringCourseContent {
  courseId: string;
  status: CourseContentStatus;
  modules: AuthoringModule[];
}

export interface UploadedCourseFile {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  createdAt: string;
}
