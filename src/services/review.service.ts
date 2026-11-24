import { AppError } from "../errors/app-error";
import {
  reviewRepository,
  reviewStats,
  type ReviewRepository,
} from "../repositories/review.repository";
import type {
  AdminReviewListQuery,
  CreateReviewInput,
  ModerateReviewInput,
  ReviewListQuery,
} from "../schemas/review.schemas";
import type { CourseReview, CourseReviewStats, ReviewModerationResult } from "../types/review.types";

export interface CourseReviewReader {
  listCourseReviews(courseId: string): Promise<CourseReview[]>;
  statsByCourseIds(courseIds: string[]): Promise<Map<string, CourseReviewStats>>;
}

function publicReview(review: ReviewModerationResult): CourseReview {
  return {
    id: review.id,
    authorId: review.authorId,
    authorName: review.authorName,
    rating: review.rating,
    comment: review.comment,
    createdAt: review.createdAt,
  };
}

export function createReviewService(repository: ReviewRepository) {
  return {
    async createReview(
      userId: string,
      courseId: string,
      input: CreateReviewInput
    ): Promise<CourseReview> {
      const reviewId = await repository.create(userId, courseId, input.rating, input.comment);
      const review = await repository.findById(reviewId);
      if (!review) {
        throw new AppError(502, "REVIEW_NOT_AVAILABLE", "No fue posible consultar la reseña creada.");
      }
      return publicReview(review);
    },

    async listCourseReviews(courseId: string): Promise<CourseReview[]> {
      return (await repository.listPublic(courseId, 1, 5)).records.map(publicReview);
    },

    async listPublicReviews(courseId: string, input: ReviewListQuery) {
      const result = await repository.listPublic(courseId, input.page, input.limit);
      return {
        items: result.records.map(publicReview),
        pagination: {
          page: input.page,
          limit: input.limit,
          total: result.total,
          totalPages: Math.max(1, Math.ceil(result.total / input.limit)),
        },
      };
    },

    async listReviewsForModeration(input: AdminReviewListQuery) {
      const result = await repository.listForModeration(input);
      return {
        items: result.records,
        pagination: {
          page: input.page,
          limit: input.limit,
          total: result.total,
          totalPages: Math.max(1, Math.ceil(result.total / input.limit)),
        },
      };
    },

    async statsByCourseIds(courseIds: string[]): Promise<Map<string, CourseReviewStats>> {
      const stats = await repository.statsByCourseIds([...new Set(courseIds)]);
      return new Map(
        courseIds.map((courseId) => [courseId, stats.get(courseId) ?? reviewStats([])])
      );
    },

    async moderateReview(
      reviewId: string,
      input: ModerateReviewInput,
      actorId: string
    ): Promise<ReviewModerationResult> {
      await repository.moderate(reviewId, input.visible, input.reason, actorId);
      const review = await repository.findById(reviewId);
      if (!review) {
        throw new AppError(404, "REVIEW_NOT_FOUND", "La reseña solicitada no existe.");
      }
      return review;
    },
  };
}

export const reviewService = createReviewService(reviewRepository);
