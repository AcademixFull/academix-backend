import { describe, expect, it, vi } from "vitest";
import type { OrganizationRepository } from "../src/repositories/organization.repository";
import { createOrganizationService } from "../src/services/organization.service";

const organizationId = "11111111-1111-4111-8111-111111111111";
const adminId = "22222222-2222-4222-8222-222222222222";
const memberId = "33333333-3333-4333-8333-333333333333";

function repository(overrides: Partial<OrganizationRepository> = {}): OrganizationRepository {
  return {
    assertPaid: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined),
    listForUser: vi.fn().mockResolvedValue([{ id: organizationId, name: "UTT", slug: "utt", description: "", type: "university", role: "administrator", memberCount: 2, joinCode: "ABC123", createdAt: "2026-09-06T00:00:00Z" }]),
    create: vi.fn().mockResolvedValue(organizationId),
    join: vi.fn().mockResolvedValue(organizationId),
    findMembership: vi.fn().mockImplementation(async (_organizationId: string, userId: string) => ({ fk_organizacion: organizationId, fk_usuario: userId, matricula: userId === adminId ? null : "UTT-2026-001", rol: userId === adminId ? "Administrador" : "Estudiante", activo: true, fecha_union: "2026-09-06T00:00:00Z" })),
    listMembers: vi.fn().mockResolvedValue({ records: [], total: 0 }),
    setMemberRole: vi.fn().mockResolvedValue(undefined),
    assignInstructor: vi.fn().mockResolvedValue(undefined),
    countAdministrators: vi.fn().mockResolvedValue(1),
    listCourses: vi.fn().mockResolvedValue({ records: [], total: 0 }),
    ...overrides,
  };
}

describe("servicio de organizaciones", () => {
  it("conserva consulta y rol al vencer el plan pero bloquea crear cursos", async () => {
    const repo = repository({ assertPaid: vi.fn().mockRejectedValue({ status: 403, code: "ORGANIZATION_SUBSCRIPTION_REQUIRED" }) });
    const service = createOrganizationService(repo);
    await expect(service.listForUser(adminId)).resolves.toHaveLength(1);
    await expect(service.listMembers(organizationId, adminId)).resolves.toMatchObject({ items: [] });
    expect(repo.assertPaid).not.toHaveBeenCalled();
    await expect(service.canInstructorCreateCourse(organizationId, adminId)).rejects.toMatchObject({ code: "ORGANIZATION_SUBSCRIPTION_REQUIRED" });
    await expect(service.assignInstructor(organizationId, "course", adminId, adminId)).rejects.toMatchObject({ code: "ORGANIZATION_SUBSCRIPTION_REQUIRED" });
    expect(repo.assignInstructor).not.toHaveBeenCalled();
  });
  it("delega la eliminación a la operación atómica autorizada", async () => {
    const repo = repository();
    await expect(createOrganizationService(repo).remove(organizationId, adminId)).resolves.toEqual({ deleted: true });
    expect(repo.remove).toHaveBeenCalledWith(organizationId, adminId);
  });
  it("crea una organización y genera slug cuando no se envía", async () => {
    const repo = repository();
    const service = createOrganizationService(repo);
    await service.create({ name: "Universidad Tecnológica", description: "Campus", type: "university" }, adminId);
    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ slug: "universidad-tecnologica" }), adminId);
  });

  it("impide consultar miembros a quien no es administrador", async () => {
    const repo = repository();
    const service = createOrganizationService(repo);
    await expect(service.listMembers(organizationId, memberId)).rejects.toMatchObject({ status: 403, code: "ORGANIZATION_ADMIN_REQUIRED" });
    expect(repo.listMembers).not.toHaveBeenCalled();
  });

  it("protege al último administrador contra una degradación", async () => {
    const repo = repository();
    const service = createOrganizationService(repo);
    await expect(service.setMemberRole(organizationId, adminId, { role: "student" }, adminId)).rejects.toMatchObject({ status: 409, code: "LAST_ORGANIZATION_ADMIN" });
  });

  it("permite nombrar instructor institucional sin aprobación global de Academix", async () => {
    const repo = repository();
    const service = createOrganizationService(repo);
    await service.setMemberRole(organizationId, memberId, { role: "instructor" }, adminId);
    expect(repo.setMemberRole).toHaveBeenCalledWith(organizationId, memberId, "instructor", adminId);
  });

  it("registra la matrícula al unirse a una organización", async () => {
    const repo = repository();
    const service = createOrganizationService(repo);
    await service.join(memberId, "ABC123", "UTT-2026-001");
    expect(repo.join).toHaveBeenCalledWith(memberId, "ABC123", "UTT-2026-001");
  });
  it("permite que un mismo usuario pertenezca a varias organizaciones", async () => {
    const secondOrganizationId = "44444444-4444-4444-8444-444444444444";
    const repo = repository({
      join: vi
        .fn()
        .mockResolvedValueOnce(organizationId)
        .mockResolvedValueOnce(secondOrganizationId),
      listForUser: vi.fn().mockResolvedValue([
        { id: organizationId, name: "UTT", slug: "utt", description: "", type: "university", role: "student", memberCount: 2, joinCode: null, createdAt: "2026-09-06T00:00:00Z" },
        { id: secondOrganizationId, name: "Empresa B", slug: "empresa-b", description: "", type: "company", role: "student", memberCount: 1, joinCode: null, createdAt: "2026-09-06T00:00:00Z" },
      ]),
    });
    const service = createOrganizationService(repo);
    await service.join(memberId, "ABC123", "UTT-2026-001");
    await service.join(memberId, "XYZ987", "EMP-553");
    const organizations = await service.listForUser(memberId);
    expect(organizations).toHaveLength(2);
    expect(repo.join).toHaveBeenNthCalledWith(1, memberId, "ABC123", "UTT-2026-001");
    expect(repo.join).toHaveBeenNthCalledWith(2, memberId, "XYZ987", "EMP-553");
  });

});
