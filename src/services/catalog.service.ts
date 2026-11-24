import { env } from "../config/env";
import { BoundedCache } from "../utils/bounded-cache";
import { AppError } from "../errors/app-error";
import {
  catalogRepository,
  type CatalogCourseRecord,
  type CatalogRepository,
} from "../repositories/catalog.repository";
import type { CourseListQuery } from "../schemas/catalog.schemas";
import type {
  CourseDetail,
  CourseLevel,
  CourseSummary,
  InstructorDetail,
} from "../types/catalog.types";
import type { CourseReviewStats } from "../types/review.types";
import { reviewService, type CourseReviewReader } from "./review.service";

function levelName(value: string): CourseLevel {
  const normalized = value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
  if (normalized === "avanzado") return "advanced";
  if (normalized === "intermedio") return "intermediate";
  return "beginner";
}

function textList(value: string | null): string[] {
  if (!value) return [];
  return value
    .split(/\r?\n|;/)
    .map((item) => item.trim().replace(/^[-•]\s*/, ""))
    .filter(Boolean);
}

export function serializeCourseSummary(
  record: CatalogCourseRecord,
  stats: CourseReviewStats = { rating: 0, reviewCount: 0 }
): CourseSummary | null {
  if (!record.instructor) return null;
  return {
    id: record.id,
    slug: record.slug,
    title: record.title,
    shortDescription: record.shortDescription,
    category: {
      id: String(record.category.id),
      name: record.category.name,
      slug: record.category.slug,
    },
    instructor: {
      id: record.instructor.id,
      name: record.instructor.fullName,
      specialty: record.instructor.specialty,
      ...(record.instructor.avatarUrl ? { avatarUrl: record.instructor.avatarUrl } : {}),
    },
    level: levelName(record.levelName),
    durationHours: record.durationHours,
    rating: stats.rating,
    reviewCount: stats.reviewCount,
    price: record.price,
    ...(record.imageUrl ? { imageUrl: record.imageUrl } : {}),
    certificateEnabled: record.certificateEnabled,
  };
}

export function createCatalogService(
  repository: CatalogRepository,
  reviews: CourseReviewReader
) {
  async function summaries(records: CatalogCourseRecord[]): Promise<CourseSummary[]> {
    const stats = await reviews.statsByCourseIds(records.map((record) => record.id));
    return records
      .map((record) => serializeCourseSummary(record, stats.get(record.id)))
      .filter((item): item is CourseSummary => item !== null);
  }

  return {
    async listCategories() {
      const categories = await repository.listCategories();
      return categories.map((category) => ({
        id: String(category.id),
        name: category.name,
        slug: category.slug,
      }));
    },

    async listCourses(input: CourseListQuery) {
      const result = await repository.listCourses(input);
      return {
        items: await summaries(result.records),
        pagination: {
          page: input.page,
          limit: input.limit,
          total: result.total,
          totalPages: Math.max(1, Math.ceil(result.total / input.limit)),
        },
      };
    },

    async listFeaturedCourses(): Promise<CourseSummary[]> {
      return summaries(await repository.listFeaturedCourses(5));
    },

    async getCourse(identifier: string): Promise<CourseDetail> {
      const record = await repository.findCourse(identifier);
      if (!record) {
        throw new AppError(404, "COURSE_NOT_FOUND", "El curso solicitado no existe.");
      }
      const [courseReviews, related, reviewStats] = await Promise.all([
        reviews.listCourseReviews(record.id),
        repository.listRelatedCourses(record.id, record.categoryId),
        reviews.statsByCourseIds([record.id]),
      ]);
      const courseStats = reviewStats.get(record.id) ?? { rating: 0, reviewCount: 0 };
      const courseSummary = serializeCourseSummary(record, courseStats);
      if (!courseSummary) {
        throw new AppError(
          500,
          "CATALOG_DATA_INCOMPLETE",
          "El curso no tiene un instructor principal válido."
        );
      }
      return {
        ...courseSummary,
        description: record.description,
        learningOutcomes: textList(record.objectives),
        requirements: textList(record.requirements),
        language: record.language,
        modules: record.modules,
        reviews: courseReviews,
        relatedCourseIds: related
          .map((relatedCourse) => serializeCourseSummary(relatedCourse))
          .filter((item): item is CourseSummary => item !== null)
          .map((item) => item.id),
      };
    },

    async listRelatedCourses(identifier: string): Promise<CourseSummary[]> {
      const course = await repository.findCourse(identifier);
      if (!course) {
        throw new AppError(404, "COURSE_NOT_FOUND", "El curso solicitado no existe.");
      }
      const records = await repository.listRelatedCourses(course.id, course.categoryId);
      return summaries(records);
    },

    async getInstructor(instructorId: string): Promise<InstructorDetail> {
      const instructor = await repository.findInstructor(instructorId);
      if (!instructor) {
        throw new AppError(404, "INSTRUCTOR_NOT_FOUND", "El instructor solicitado no existe.");
      }
      return {
        id: instructor.id,
        name: instructor.fullName,
        specialty: instructor.specialty,
        biography: instructor.biography,
        experienceYears: instructor.experienceYears,
        studentCount: instructor.studentCount,
        courseCount: instructor.courseCount,
        ...(instructor.avatarUrl ? { avatarUrl: instructor.avatarUrl } : {}),
      };
    },

    async listInstructorCourses(instructorId: string): Promise<CourseSummary[]> {
      const instructor = await repository.findInstructor(instructorId);
      if (!instructor) {
        throw new AppError(404, "INSTRUCTOR_NOT_FOUND", "El instructor solicitado no existe.");
      }
      const records = await repository.listInstructorCourses(instructorId);
      return summaries(records);
    },
    async listInstructorCoursesPage(instructorId: string, input: CourseListQuery) {
      const result = await repository.listInstructorCoursePage(instructorId, input);
      return { items: await summaries(result.records), pagination: { page: input.page, limit: input.limit, total: result.total, totalPages: Math.max(1, Math.ceil(result.total / input.limit)) } };
    },
  };
}

const uncachedCatalog = createCatalogService(catalogRepository, reviewService);
const publicCache = new BoundedCache(env.CATALOG_CACHE_MAX_ITEMS, env.CATALOG_CACHE_TTL_MS);
export const invalidatePublicCatalog = () => publicCache.clear();
export const catalogService = {
  ...uncachedCatalog,
  listCategories: () => publicCache.get("categories", () => uncachedCatalog.listCategories()),
  listFeaturedCourses: () => publicCache.get("featured", () => uncachedCatalog.listFeaturedCourses()),
  listCourses: (input: CourseListQuery) => publicCache.get(`courses:${JSON.stringify(input)}`, () => uncachedCatalog.listCourses(input)),
};
