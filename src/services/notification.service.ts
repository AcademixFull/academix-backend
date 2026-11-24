import { AppError } from "../errors/app-error";
import {
  notificationRepository,
  type NotificationRepository,
} from "../repositories/notification.repository";

export function createNotificationService(repository: NotificationRepository) {
  return {
    list(userId: string, limit = 30) {
      return repository.list(userId, limit);
    },

    unreadCount(userId: string) {
      return repository.unreadCount(userId);
    },

    async markRead(userId: string, notificationId: string) {
      const notification = await repository.markRead(userId, notificationId);
      if (!notification) {
        throw new AppError(404, "NOTIFICATION_NOT_FOUND", "La notificación no existe.");
      }
      return notification;
    },

    async markAllRead(userId: string) {
      await repository.markAllRead(userId);
      return { updated: true };
    },

    async coursePublished(courseId: string, courseTitle: string) {
      const instructorIds = await repository.courseInstructorIds(courseId);
      await repository.createForUsers(
        instructorIds,
        "Tu curso fue aprobado",
        `Academix aprobó y publicó tu curso “${courseTitle}”. Ya puedes seguir editándolo o darlo de baja desde tu panel.`
      );
    },

    async courseModerated(courseId: string, courseTitle: string, reason: string) {
      const instructorIds = await repository.courseInstructorIds(courseId);
      await repository.createForUsers(
        instructorIds,
        "Curso dado de baja por moderación",
        `Academix dio de baja tu curso “${courseTitle}” por moderación. Motivo: ${reason}`
      );
    },

    async courseRestored(courseId: string, courseTitle: string) {
      const instructorIds = await repository.courseInstructorIds(courseId);
      await repository.createForUsers(
        instructorIds,
        "Tu curso fue restaurado",
        `El equipo de moderación de Academix restauró tu curso “${courseTitle}” después de comprobar que ya cumple con los lineamientos.`
      );
    },
  };
}

export const notificationService = createNotificationService(notificationRepository);
