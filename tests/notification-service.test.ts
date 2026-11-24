import { describe, expect, it, vi } from "vitest";
import type { NotificationRepository } from "../src/repositories/notification.repository";
import { createNotificationService } from "../src/services/notification.service";

function repository(): NotificationRepository {
  return {
    list: vi.fn().mockResolvedValue([]),
    unreadCount: vi.fn().mockResolvedValue(2),
    markRead: vi.fn().mockResolvedValue({ id: "11111111-1111-4111-8111-111111111111", title: "Aprobado", message: "Listo", read: true, createdAt: "2026-09-06T00:00:00Z", readAt: "2026-09-06T00:01:00Z" }),
    markAllRead: vi.fn().mockResolvedValue(undefined),
    courseInstructorIds: vi.fn().mockResolvedValue(["22222222-2222-4222-8222-222222222222"]),
    createForUsers: vi.fn().mockResolvedValue(undefined),
  };
}

describe("servicio de notificaciones", () => {
  it("notifica a los instructores cuando Academix publica un curso", async () => {
    const repo = repository();
    await createNotificationService(repo).coursePublished("course-id", "TypeScript práctico");
    expect(repo.createForUsers).toHaveBeenCalledWith(
      ["22222222-2222-4222-8222-222222222222"],
      "Tu curso fue aprobado",
      expect.stringContaining("TypeScript práctico")
    );
  });

  it("devuelve el contador de no leídas", async () => {
    await expect(createNotificationService(repository()).unreadCount("user-id")).resolves.toBe(2);
  });
  it("notifica al instructor cuando moderación da de baja su curso", async () => {
    const repo = repository();
    await createNotificationService(repo).courseModerated(
      "course-id",
      "Curso sensible",
      "Contenido inapropiado detectado durante la revisión."
    );
    expect(repo.createForUsers).toHaveBeenCalledWith(
      ["22222222-2222-4222-8222-222222222222"],
      "Curso dado de baja por moderación",
      expect.stringContaining("Contenido inapropiado")
    );
  });

  it("notifica al instructor cuando moderación restaura su curso", async () => {
    const repo = repository();
    await createNotificationService(repo).courseRestored("course-id", "Curso corregido");
    expect(repo.createForUsers).toHaveBeenCalledWith(
      ["22222222-2222-4222-8222-222222222222"],
      "Tu curso fue restaurado",
      expect.stringContaining("ya cumple con los lineamientos")
    );
  });

});
