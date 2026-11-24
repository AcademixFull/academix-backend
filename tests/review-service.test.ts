import { describe, expect, it, vi } from "vitest";
import type { ReviewRecord, ReviewRepository } from "../src/repositories/review.repository";
import { createReviewService } from "../src/services/review.service";

const review: ReviewRecord = {
  id: "33333333-3333-4333-8333-333333333333",
  courseId: "22222222-2222-4222-8222-222222222222",
  courseTitle: "TypeScript práctico",
  authorId: "11111111-1111-4111-8111-111111111111",
  authorName: "Ana Pérez",
  rating: 5,
  comment: "Contenido claro y muy completo.",
  createdAt: "2026-08-12T01:00:00.000Z",
  visible: true,
  moderationReason: null,
};

function repository(overrides: Partial<ReviewRepository> = {}): ReviewRepository {
  return {
    create: vi.fn().mockResolvedValue(review.id),
    findById: vi.fn().mockResolvedValue(review),
    listByCourseIds: vi.fn().mockResolvedValue([]),
    listPublic: vi.fn().mockResolvedValue({ records: [], total: 0 }),
    listForModeration: vi.fn().mockResolvedValue({ records: [], total: 0 }),
    statsByCourseIds: vi.fn().mockResolvedValue(new Map()),
    moderate: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe("servicio de reseñas", () => {
  it("crea y devuelve una reseña sin campos internos de moderación", async () => {
    const repo = repository();
    const service = createReviewService(repo);

    const result = await service.createReview(review.authorId, review.courseId, {
      rating: 5,
      comment: review.comment,
    });

    expect(repo.create).toHaveBeenCalledWith(
      review.authorId,
      review.courseId,
      5,
      review.comment
    );
    expect(result).not.toHaveProperty("visible");
    expect(result.authorName).toBe("Ana Pérez");
  });

  it("calcula promedio y cantidad por curso", async () => {
    const service = createReviewService(
      repository({
        statsByCourseIds: vi.fn().mockResolvedValue(
          new Map([[review.courseId, { rating: 4.5, reviewCount: 2 }]])
        ),
      })
    );

    const result = await service.statsByCourseIds([review.courseId]);

    expect(result.get(review.courseId)).toEqual({ rating: 4.5, reviewCount: 2 });
  });

  it("devuelve ceros para cursos sin reseñas", async () => {
    const result = await createReviewService(repository()).statsByCourseIds([review.courseId]);
    expect(result.get(review.courseId)).toEqual({ rating: 0, reviewCount: 0 });
  });

  it("modera y conserva el resultado administrativo", async () => {
    const hidden = { ...review, visible: false, moderationReason: "Contenido ofensivo" };
    const repo = repository({ findById: vi.fn().mockResolvedValue(hidden) });
    const result = await createReviewService(repo).moderateReview(
      review.id,
      { visible: false, reason: "Contenido ofensivo" },
      review.authorId
    );
    expect(repo.moderate).toHaveBeenCalled();
    expect(result.visible).toBe(false);
  });

  it("pagina las reseñas públicas sin exponer la moderación", async () => {
    const service = createReviewService(
      repository({ listPublic: vi.fn().mockResolvedValue({ records: [review], total: 1 }) })
    );

    const result = await service.listPublicReviews(review.courseId, { page: 1, limit: 10 });

    expect(result.pagination).toEqual({ page: 1, limit: 10, total: 1, totalPages: 1 });
    expect(result.items[0]).not.toHaveProperty("moderationReason");
  });

  it("pagina la bandeja administrativa con campos de moderación", async () => {
    const service = createReviewService(
      repository({
        listForModeration: vi.fn().mockResolvedValue({ records: [review], total: 1 }),
      })
    );
    const input = { page: 1, limit: 20, visibility: "all" as const };

    const result = await service.listReviewsForModeration(input);

    expect(result.items[0]).toMatchObject({ courseTitle: review.courseTitle, visible: true });
    expect(result.pagination.total).toBe(1);
  });
});
