import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "../src/errors/app-error";

vi.mock("../src/services/catalog.service", () => ({
  catalogService: {
    listCategories: vi.fn(),
    listCourses: vi.fn(),
    listFeaturedCourses: vi.fn(),
    getCourse: vi.fn(),
    listRelatedCourses: vi.fn(),
    getInstructor: vi.fn(),
    listInstructorCourses: vi.fn(),
    listInstructorCoursesPage: vi.fn(),
  },
}));

import { createApp } from "../src/app";
import { catalogService } from "../src/services/catalog.service";

const instructorId = "11111111-1111-4111-8111-111111111111";
const course = {
  id: "22222222-2222-4222-8222-222222222222",
  slug: "typescript-desde-cero",
  title: "TypeScript desde cero",
  shortDescription: "Aprende TypeScript.",
  category: { id: "1", name: "Programación", slug: "programacion" },
  instructor: { id: instructorId, name: "Ana Pérez", specialty: "Desarrollo web" },
  level: "beginner" as const,
  durationHours: 8,
  rating: 0,
  reviewCount: 0,
  price: 0,
  certificateEnabled: true,
};

describe("catálogo público", () => {
  const app = createApp();

  beforeEach(() => vi.clearAllMocks());

  it("lista las categorías activas", async () => {
    vi.mocked(catalogService.listCategories).mockResolvedValue([
      { id: "1", name: "Programación", slug: "programacion" },
    ]);

    const response = await request(app).get("/api/v1/categories");

    expect(response.status).toBe(200);
    expect(response.body.data[0].slug).toBe("programacion");
  });

  it("valida filtros y devuelve la paginación común", async () => {
    vi.mocked(catalogService.listCourses).mockResolvedValue({
      items: [course],
      pagination: { page: 2, limit: 6, total: 7, totalPages: 2 },
    });

    const response = await request(app).get(
      "/api/v1/courses?search=TypeScript&category=programacion&level=beginner&page=2&limit=6"
    );

    expect(response.status).toBe(200);
    expect(response.body.pagination).toEqual({ page: 2, limit: 6, total: 7, totalPages: 2 });
    expect(catalogService.listCourses).toHaveBeenCalledWith({
      search: "TypeScript",
      category: "programacion",
      level: "beginner",
      page: 2,
      limit: 6,
    });
  });

  it("rechaza límites de paginación fuera del contrato", async () => {
    const response = await request(app).get("/api/v1/courses?limit=100");

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
    expect(catalogService.listCourses).not.toHaveBeenCalled();
  });

  it("obtiene el detalle por slug", async () => {
    vi.mocked(catalogService.getCourse).mockResolvedValue({
      ...course,
      description: "Curso completo.",
      learningOutcomes: ["Tipar aplicaciones"],
      requirements: [],
      language: "Español",
      modules: [],
      reviews: [],
      relatedCourseIds: [],
    });

    const response = await request(app).get("/api/v1/courses/typescript-desde-cero");

    expect(response.status).toBe(200);
    expect(response.body.data.learningOutcomes).toEqual(["Tipar aplicaciones"]);
  });

  it("lista cursos relacionados", async () => {
    vi.mocked(catalogService.listRelatedCourses).mockResolvedValue([course]);

    const response = await request(app).get(
      "/api/v1/courses/typescript-desde-cero/related"
    );

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
  });

  it("conserva el 404 seguro cuando no existe el curso", async () => {
    vi.mocked(catalogService.getCourse).mockRejectedValue(
      new AppError(404, "COURSE_NOT_FOUND", "El curso solicitado no existe.")
    );

    const response = await request(app).get("/api/v1/courses/no-existe");

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("COURSE_NOT_FOUND");
  });

  it("obtiene el perfil público del instructor", async () => {
    vi.mocked(catalogService.getInstructor).mockResolvedValue({
      id: instructorId,
      name: "Ana Pérez",
      specialty: "Desarrollo web",
      biography: "Instructora.",
      experienceYears: 7,
      studentCount: 0,
      courseCount: 1,
    });

    const response = await request(app).get(`/api/v1/instructors/${instructorId}`);

    expect(response.status).toBe(200);
    expect(response.body.data.experienceYears).toBe(7);
  });

  it("valida que el identificador del instructor sea UUID", async () => {
    const response = await request(app).get("/api/v1/instructors/no-es-uuid");

    expect(response.status).toBe(422);
    expect(catalogService.getInstructor).not.toHaveBeenCalled();
  });

  it("lista los cursos publicados de un instructor", async () => {
    vi.mocked(catalogService.listInstructorCoursesPage).mockResolvedValue({ items: [course], pagination: { page: 1, limit: 10, total: 1, totalPages: 1 } });

    const response = await request(app).get(`/api/v1/instructors/${instructorId}/courses`);

    expect(response.status).toBe(200);
    expect(response.body.data[0].id).toBe(course.id);
  });
  it("expone los cinco cursos destacados sin autenticación", async () => {
    vi.mocked(catalogService.listFeaturedCourses).mockResolvedValue([course]);

    const response = await request(createApp()).get("/api/v1/courses/featured");

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([course]);
    expect(catalogService.listFeaturedCourses).toHaveBeenCalledOnce();
  });

});


it("paginates the public instructor courses in the database contract", async () => {
  vi.mocked(catalogService.listInstructorCoursesPage).mockResolvedValue({ items: [], pagination: { page: 2, limit: 10, total: 30, totalPages: 3 } });
  const result = await request(createApp()).get(`/api/v1/instructors/${instructorId}/courses?page=2&limit=10`);
  expect(result.status).toBe(200);
  expect(result.body.pagination.total).toBe(30);
  expect(catalogService.listInstructorCoursesPage).toHaveBeenCalledWith(instructorId, { page: 2, limit: 10 });
});
