import { describe, expect, it, vi } from "vitest";
import type { AdministrationRepository } from "../src/repositories/administration.repository";
import type { AuthoringRepository } from "../src/repositories/authoring.repository";
import type { ModerationRepository } from "../src/repositories/moderation.repository";
import { createModerationService } from "../src/services/moderation.service";
import type { ManagedCourse } from "../src/types/administration.types";

const courseId = "22222222-2222-4222-8222-222222222222";
const moderatorId = "33333333-3333-4333-8333-333333333333";
const adminId = "44444444-4444-4444-8444-444444444444";

const publishedCourse: ManagedCourse = {
  id: courseId,
  slug: "curso-publicado",
  title: "Curso publicado",
  shortDescription: "Descripción corta",
  description: "Descripción completa",
  learningOutcomes: ["Aprender"],
  requirements: [],
  targetAudience: "Estudiantes",
  categoryId: 1,
  level: "beginner",
  modality: "self_paced",
  language: "es",
  durationHours: 2,
  price: 49,
  certificateEnabled: true,
  requiresApproval: false,
  organization: null,
  status: "published",
  active: true,
  instructor: { id: "11111111-1111-4111-8111-111111111111", name: "Instructor" },
  publishedAt: "2026-09-06T00:00:00Z",
  createdAt: "2026-09-05T00:00:00Z",
  updatedAt: "2026-09-06T00:00:00Z",
};

const moderationRecord = {
  id: "55555555-5555-4555-8555-555555555555",
  courseId,
  moderator: { id: moderatorId, name: "Moderador" },
  reason: "Contenido inapropiado para la plataforma.",
  previousStatus: "published" as const,
  active: true,
  moderatedAt: "2026-09-06T01:00:00Z",
  restoredBy: null,
  restoredAt: null,
};

function moderationRepo(overrides: Partial<ModerationRepository> = {}): ModerationRepository {
  return {
    moderate: vi.fn().mockResolvedValue(moderationRecord),
    restore: vi.fn().mockResolvedValue({
      ...moderationRecord,
      active: false,
      restoredBy: { id: adminId, name: "Admin" },
      restoredAt: "2026-09-06T02:00:00Z",
    }),
    listHistory: vi.fn().mockResolvedValue([moderationRecord]),
    ...overrides,
  };
}

function administrationRepo(
  overrides: Partial<AdministrationRepository> = {}
): AdministrationRepository {
  return {
    listCourses: vi.fn().mockResolvedValue({ records: [publishedCourse], total: 1 }),
    findCourse: vi.fn().mockResolvedValue(publishedCourse),
    ...overrides,
  } as unknown as AdministrationRepository;
}

function authoringRepo(overrides: Partial<AuthoringRepository> = {}): AuthoringRepository {
  return {
    listContent: vi.fn().mockResolvedValue({ courseId, status: "published", modules: [] }),
    ...overrides,
  } as unknown as AuthoringRepository;
}

function notifier() {
  return {
    courseModerated: vi.fn().mockResolvedValue(undefined),
    courseRestored: vi.fn().mockResolvedValue(undefined),
  };
}

describe("servicio de moderación", () => {
  it("muestra contenido completo y el historial para revisión", async () => {
    const service = createModerationService(
      moderationRepo(),
      administrationRepo(),
      authoringRepo(),
      notifier()
    );
    const result = await service.getCourse(courseId);
    expect(result.course.id).toBe(courseId);
    expect(result.content.courseId).toBe(courseId);
    expect(result.moderationHistory).toHaveLength(1);
  });

  it("da de baja un curso publicado con motivo y notifica al instructor", async () => {
    const moderation = moderationRepo();
    const administration = administrationRepo({
      findCourse: vi
        .fn()
        .mockResolvedValueOnce(publishedCourse)
        .mockResolvedValueOnce({ ...publishedCourse, status: "moderated", active: false }),
    });
    const notifications = notifier();
    const service = createModerationService(
      moderation,
      administration,
      authoringRepo(),
      notifications
    );

    const result = await service.takeDown(
      courseId,
      "Contenido inapropiado para la plataforma.",
      moderatorId
    );

    expect(moderation.moderate).toHaveBeenCalledWith(
      courseId,
      moderatorId,
      "Contenido inapropiado para la plataforma."
    );
    expect(result.course.status).toBe("moderated");
    expect(notifications.courseModerated).toHaveBeenCalledWith(
      courseId,
      publishedCourse.title,
      "Contenido inapropiado para la plataforma."
    );
  });

  it("no permite moderar un borrador que aún no fue enviado a Academix", async () => {
    const moderation = moderationRepo();
    const service = createModerationService(
      moderation,
      administrationRepo({ findCourse: vi.fn().mockResolvedValue({ ...publishedCourse, status: "draft" }) }),
      authoringRepo(),
      notifier()
    );

    await expect(
      service.takeDown(courseId, "Motivo suficientemente detallado.", moderatorId)
    ).rejects.toMatchObject({ status: 409, code: "INVALID_MODERATION_STATE" });
    expect(moderation.moderate).not.toHaveBeenCalled();
  });

  it("permite que el flujo de moderación restaure una baja cuando el curso ya cumple", async () => {
    const moderated = { ...publishedCourse, status: "moderated" as const, active: false };
    const administration = administrationRepo({
      findCourse: vi
        .fn()
        .mockResolvedValueOnce(moderated)
        .mockResolvedValueOnce(publishedCourse),
    });
    const notifications = notifier();
    const service = createModerationService(
      moderationRepo(),
      administration,
      authoringRepo(),
      notifications
    );

    const result = await service.restore(courseId, moderatorId);
    expect(result.course.status).toBe("published");
    expect(notifications.courseRestored).toHaveBeenCalledWith(courseId, publishedCourse.title);
  });
});
