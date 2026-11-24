import { AppError } from "../errors/app-error";
import {
  administrationRepository,
  type AdministrationRepository,
} from "../repositories/administration.repository";
import {
  authoringRepository,
  type AuthoringRepository,
} from "../repositories/authoring.repository";
import {
  moderationRepository,
  type ModerationRepository,
} from "../repositories/moderation.repository";
import type { ModerationCourseListQuery } from "../schemas/moderation.schemas";
import type { ModerationCourseDetail } from "../types/moderation.types";
import { notificationService } from "./notification.service";

function pagination<T>(records: T[], total: number, page: number, limit: number) {
  return {
    items: records,
    pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
  };
}

type ModerationNotifier = Pick<
  typeof notificationService,
  "courseModerated" | "courseRestored"
>;

export function createModerationService(
  moderation: ModerationRepository,
  administration: AdministrationRepository,
  authoring: AuthoringRepository,
  notifier: ModerationNotifier = notificationService
) {
  return {
    async listCourses(input: ModerationCourseListQuery) {
      const result = await administration.listCourses(input);
      return pagination(result.records, result.total, input.page, input.limit);
    },

    async getCourse(courseId: string): Promise<ModerationCourseDetail> {
      const course = await administration.findCourse(courseId);
      if (!course) {
        throw new AppError(404, "COURSE_NOT_FOUND", "El curso solicitado no existe.");
      }
      const [content, moderationHistory] = await Promise.all([
        authoring.listContent(courseId),
        moderation.listHistory(courseId),
      ]);
      return { course, content, moderationHistory };
    },

    async takeDown(courseId: string, reason: string, moderatorId: string) {
      const course = await administration.findCourse(courseId);
      if (!course) {
        throw new AppError(404, "COURSE_NOT_FOUND", "El curso solicitado no existe.");
      }
      if (course.status !== "review" && course.status !== "published") {
        throw new AppError(
          409,
          "INVALID_MODERATION_STATE",
          "Solo se puede dar de baja por moderación un curso en revisión o publicado."
        );
      }

      const action = await moderation.moderate(courseId, moderatorId, reason);
      await notifier.courseModerated(courseId, course.title, reason).catch(() => undefined);
      const updated = await administration.findCourse(courseId);
      if (!updated) throw new AppError(404, "COURSE_NOT_FOUND", "El curso solicitado no existe.");
      return { course: updated, moderation: action };
    },

    async restore(courseId: string, actorId: string) {
      const course = await administration.findCourse(courseId);
      if (!course) {
        throw new AppError(404, "COURSE_NOT_FOUND", "El curso solicitado no existe.");
      }
      if (course.status !== "moderated") {
        throw new AppError(
          409,
          "COURSE_NOT_MODERATED",
          "Solo se puede restaurar un curso dado de baja por moderación."
        );
      }

      const action = await moderation.restore(courseId, actorId);
      const updated = await administration.findCourse(courseId);
      if (!updated) throw new AppError(404, "COURSE_NOT_FOUND", "El curso solicitado no existe.");
      await notifier.courseRestored(courseId, updated.title).catch(() => undefined);
      return { course: updated, moderation: action };
    },
  };
}

export const moderationService = createModerationService(
  moderationRepository,
  administrationRepository,
  authoringRepository
);
