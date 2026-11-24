import { describe, expect, it, vi } from "vitest";
import type {
  CatalogCourseRecord,
  CatalogRepository,
} from "../src/repositories/catalog.repository";
import { createCatalogService } from "../src/services/catalog.service";
import type { CourseReviewReader } from "../src/services/review.service";

const record: CatalogCourseRecord = {
  id: "22222222-2222-4222-8222-222222222222",
  slug: "curso-prueba",
  title: "Curso de prueba",
  shortDescription: "Descripción corta",
  description: "Descripción completa",
  objectives: "- Primer objetivo\n- Segundo objetivo",
  requirements: "Navegador;Conexión a internet",
  durationHours: 10,
  price: 125.5,
  certificateEnabled: true,
  category: { id: 1, name: "Programación", slug: "programacion", description: null },
  categoryId: 1,
  levelName: "Intermedio",
  language: "Español",
  instructor: {
    id: "11111111-1111-4111-8111-111111111111",
    fullName: "Ana Pérez",
    specialty: "Desarrollo web",
  },
  modules: [],
};

function repository(overrides: Partial<CatalogRepository> = {}): CatalogRepository {
  return {
    listCategories: vi.fn().mockResolvedValue([]),
    listCourses: vi.fn().mockResolvedValue({ records: [], total: 0 }),
    listFeaturedCourses: vi.fn().mockResolvedValue([]),
    listCoursesByIds: vi.fn().mockResolvedValue([]),
    findCourse: vi.fn().mockResolvedValue(null),
    listRelatedCourses: vi.fn().mockResolvedValue([]),
    findInstructor: vi.fn().mockResolvedValue(null),
    listInstructorCourses: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}

function reviewReader(overrides: Partial<CourseReviewReader> = {}): CourseReviewReader {
  return {
    listCourseReviews: vi.fn().mockResolvedValue([]),
    statsByCourseIds: vi.fn().mockResolvedValue(new Map()),
    ...overrides,
  };
}

describe("servicio de catálogo", () => {
  it("mapea el modelo SQL al contrato del frontend", async () => {
    const service = createCatalogService(
      repository({
        listCourses: vi.fn().mockResolvedValue({ records: [record], total: 1 }),
      }),
      reviewReader({
        statsByCourseIds: vi.fn().mockResolvedValue(
          new Map([[record.id, { rating: 4.6, reviewCount: 12 }]])
        ),
      })
    );

    const result = await service.listCourses({ page: 1, limit: 12 });

    expect(result.items[0]).toMatchObject({
      id: record.id,
      level: "intermediate",
      price: 125.5,
      rating: 4.6,
      reviewCount: 12,
    });
    expect(result.pagination).toEqual({ page: 1, limit: 12, total: 1, totalPages: 1 });
  });

  it("devuelve como destacados los cursos independientes mejor posicionados por el repositorio", async () => {
    const featuredRepository = repository({
      listFeaturedCourses: vi.fn().mockResolvedValue([record]),
    });
    const service = createCatalogService(featuredRepository, reviewReader());

    const result = await service.listFeaturedCourses();

    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe(record.id);
    expect(featuredRepository.listFeaturedCourses).toHaveBeenCalledWith(5);
  });

  it("convierte objetivos y requisitos de texto en arreglos", async () => {
    const service = createCatalogService(
      repository({
        findCourse: vi.fn().mockResolvedValue(record),
        listRelatedCourses: vi.fn().mockResolvedValue([]),
      }),
      reviewReader({
        statsByCourseIds: vi.fn().mockResolvedValue(new Map([[record.id, { rating: 5, reviewCount: 1 }]])),
        listCourseReviews: vi.fn().mockResolvedValue([
          {
            id: "33333333-3333-4333-8333-333333333333",
            authorId: "44444444-4444-4444-8444-444444444444",
            authorName: "Luis López",
            rating: 5,
            comment: "Excelente contenido práctico.",
            createdAt: "2026-08-12T00:00:00.000Z",
          },
        ]),
      })
    );

    const detail = await service.getCourse(record.slug);

    expect(detail.learningOutcomes).toEqual(["Primer objetivo", "Segundo objetivo"]);
    expect(detail.requirements).toEqual(["Navegador", "Conexión a internet"]);
    expect(detail.rating).toBe(5);
    expect(detail.reviewCount).toBe(1);
    expect(detail.reviews[0]?.authorName).toBe("Luis López");
  });

  it("no publica registros sin instructor principal", async () => {
    const service = createCatalogService(
      repository({
        listCourses: vi.fn().mockResolvedValue({
          records: [{ ...record, instructor: null }],
          total: 1,
        }),
      }),
      reviewReader()
    );

    const result = await service.listCourses({ page: 1, limit: 12 });

    expect(result.items).toEqual([]);
  });

  it("devuelve COURSE_NOT_FOUND para un detalle inexistente", async () => {
    const service = createCatalogService(repository(), reviewReader());

    await expect(service.getCourse("no-existe")).rejects.toMatchObject({
      status: 404,
      code: "COURSE_NOT_FOUND",
    });
  });
});


it("uses the database aggregate rather than the bounded review preview for rating", async () => {
  const service = createCatalogService(repository({ findCourse: vi.fn().mockResolvedValue(record), listRelatedCourses: vi.fn().mockResolvedValue([]) }),
    reviewReader({ listCourseReviews: vi.fn().mockResolvedValue([]), statsByCourseIds: vi.fn().mockResolvedValue(new Map([[record.id, { rating: 3.2, reviewCount: 500 }]])) }));
  expect(await service.getCourse(record.slug)).toMatchObject({ rating: 3.2, reviewCount: 500, reviews: [] });
});
