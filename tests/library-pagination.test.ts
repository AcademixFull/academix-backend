import { describe, expect, it, vi } from "vitest";
import { libraryListQuerySchema } from "../src/schemas/student.schemas";
import { createStudentService } from "../src/services/student.service";
import type { StudentRepository } from "../src/repositories/student.repository";
import type { CatalogRepository } from "../src/repositories/catalog.repository";
import { createCertificateService } from "../src/services/certificate.service";
import type { CertificateRepository } from "../src/repositories/certificate.repository";

describe("bounded personal library", () => {
  it("defaults to ten and rejects oversized pages and invalid ownership lookups", () => {
    expect(libraryListQuerySchema.parse({})).toMatchObject({ page: 1, limit: 10 });
    expect(libraryListQuerySchema.safeParse({ limit: 51 }).success).toBe(false);
    expect(libraryListQuerySchema.safeParse({ courseIds: "invalid" }).success).toBe(false);
    expect(libraryListQuerySchema.safeParse({ status: "anything" }).success).toBe(false);
  });

  it("paginates certificate summaries before reading large details", async () => {
    const listPageByUser = vi.fn().mockResolvedValue({ records: [], total: 41 });
    const repository = { listPageByUser } as unknown as CertificateRepository;
    expect(await createCertificateService(repository).listMyCertificatesPage("account-a", { page: 2, limit: 10 }))
      .toEqual({ items: [], pagination: { page: 2, limit: 10, total: 41, totalPages: 5 } });
    expect(listPageByUser).toHaveBeenCalledWith("account-a", { page: 2, limit: 10 });
  });

  it("passes filters and range to repository and never loads full library", async () => {
    const listEnrollmentPage = vi.fn().mockResolvedValue({ records: [], total: 315 });
    const listEnrollments = vi.fn();
    const repository = { listEnrollmentPage, listEnrollments } as unknown as StudentRepository;
    const courses = { listCoursesByIds: vi.fn() } as unknown as CatalogRepository;
    const input = libraryListQuerySchema.parse({ page: 3, limit: 10, status: "completed" });
    const result = await createStudentService(repository, courses).listMyCoursesPage("account-a", input);
    expect(listEnrollmentPage).toHaveBeenCalledWith("account-a", input);
    expect(listEnrollments).not.toHaveBeenCalled();
    expect(courses.listCoursesByIds).not.toHaveBeenCalled();
    expect(result).toEqual({ items: [], pagination: { page: 3, limit: 10, total: 315, totalPages: 32 } });
  });
});
