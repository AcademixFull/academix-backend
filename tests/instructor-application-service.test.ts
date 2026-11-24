import { describe, expect, it, vi } from "vitest";
import type { InstructorApplicationRepository } from "../src/repositories/instructor-application.repository";
import { createInstructorApplicationService } from "../src/services/instructor-application.service";
import type { InstructorApplication } from "../src/types/instructor-application.types";

const pending: InstructorApplication = {
  id: "11111111-1111-4111-8111-111111111111",
  folio: "INS-2026-111111111111",
  userId: "22222222-2222-4222-8222-222222222222",
  applicantName: "Ana Pérez",
  applicantEmail: "ana@example.com",
  enrollmentId: "UTT-123",
  credentialReference: "FOLIO-123",
  status: "pending",
  observations: "",
  requestedAt: "2026-08-12T00:00:00.000Z",
  reviewedAt: null,
};

function repository(overrides: Partial<InstructorApplicationRepository> = {}): InstructorApplicationRepository {
  return {
    findLatestByUser: vi.fn().mockResolvedValue(null),
    findById: vi.fn().mockResolvedValue(pending),
    list: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockResolvedValue(pending),
    resolve: vi.fn().mockResolvedValue({ ...pending, status: "approved" }),
    ...overrides,
  };
}

describe("solicitudes para instructor", () => {
  it("impide enviar otra solicitud mientras existe una pendiente", async () => {
    const service = createInstructorApplicationService(repository({ findLatestByUser: vi.fn().mockResolvedValue(pending) }));
    await expect(service.submit(pending.userId, "student", { enrollmentId: "UTT-123", credentialReference: "FOLIO-123" }))
      .rejects.toMatchObject({ code: "INSTRUCTOR_APPLICATION_PENDING" });
  });

  it("no aprueba como instructor a una cuenta que ahora es Moderador", async () => {
    const manager = {
      findUser: vi.fn().mockResolvedValue({
        id: pending.userId,
        fullName: pending.applicantName,
        email: pending.applicantEmail,
        active: true,
        roles: ["moderator" as const],
      }),
      upsertInstructor: vi.fn(),
    };
    const service = createInstructorApplicationService(repository(), manager);

    await expect(
      service.resolve(
        pending.id,
        {
          decision: "approved",
          specialty: "Desarrollo web",
          experienceYears: 3,
          observations: "",
        },
        "admin-id"
      )
    ).rejects.toMatchObject({ status: 422, code: "ROLE_CONFLICT" });
    expect(manager.upsertInstructor).not.toHaveBeenCalled();
  });

  it("otorga el perfil de instructor únicamente después de aprobación administrativa", async () => {
    const repo = repository();
    const manager = {
      findUser: vi.fn().mockResolvedValue({
        id: pending.userId,
        fullName: pending.applicantName,
        email: pending.applicantEmail,
        active: true,
        roles: ["student" as const],
      }),
      upsertInstructor: vi.fn().mockResolvedValue(undefined),
    };
    const service = createInstructorApplicationService(repo, manager);
    await service.resolve(pending.id, { decision: "approved", specialty: "Desarrollo web", experienceYears: 3, observations: "Aprobada" }, "admin-id");
    expect(manager.upsertInstructor).toHaveBeenCalledWith(pending.userId, "Desarrollo web", 3, "admin-id");
    expect(repo.resolve).toHaveBeenCalledWith(pending.id, "approved", "Aprobada", "admin-id");
  });
});
