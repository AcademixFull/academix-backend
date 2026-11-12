import type { NextFunction, Request, Response } from "express";
import { listQuerySchema } from "../schemas/pagination.schemas";
import { AppError } from "../errors/app-error";
import {
  assignInstructorSchema,
  categoryIdentifierSchema,
  createCategorySchema,
  createCourseSchema,
  managedCourseIdentifierSchema,
  managedCourseListQuerySchema,
  setUserRolesSchema,
  setUserStatusSchema,
  updateCategorySchema,
  updateCourseSchema,
  upsertInstructorSchema,
  userIdentifierSchema,
  userListQuerySchema,
} from "../schemas/administration.schemas";
import { administrationService } from "../services/administration.service";
import {
  adminReviewListQuerySchema,
  moderateReviewSchema,
  reviewIdentifierSchema,
} from "../schemas/review.schemas";
import { reviewService } from "../services/review.service";
import { paginatedResponse, successResponse } from "../utils/api-response";

function actor(req: Request) {
  if (!req.auth) throw new AppError(401, "AUTH_REQUIRED", "Debes iniciar sesión.");
  return req.auth.user;
}

function handler(action: (req: Request, res: Response) => Promise<void>) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await action(req, res);
    } catch (error) {
      next(error);
    }
  };
}

export const listUsers = handler(async (req, res) => {
  const input = userListQuerySchema.parse(req.query);
  const result = await administrationService.listUsers(input);
  res.json(paginatedResponse(result.items, result.pagination));
});

export const setUserRoles = handler(async (req, res) => {
  const { userId } = userIdentifierSchema.parse(req.params);
  const input = setUserRolesSchema.parse(req.body);
  res.json(successResponse(await administrationService.setUserRoles(userId, input, actor(req).id)));
});

export const setUserStatus = handler(async (req, res) => {
  const { userId } = userIdentifierSchema.parse(req.params);
  const { active } = setUserStatusSchema.parse(req.body);
  res.json(successResponse(await administrationService.setUserActive(userId, active, actor(req).id)));
});

export const listInstructors = handler(async (req, res) => {
  const result = await administrationService.listInstructors(listQuerySchema.parse(req.query));
  res.json(paginatedResponse(result.items, result.pagination));
});

export const upsertInstructor = handler(async (req, res) => {
  const { userId } = userIdentifierSchema.parse(req.params);
  const input = upsertInstructorSchema.parse(req.body);
  res.json(successResponse(await administrationService.upsertInstructor(userId, input, actor(req).id)));
});

export const createCategory = handler(async (req, res) => {
  const input = createCategorySchema.parse(req.body);
  res.status(201).json(successResponse(await administrationService.createCategory(input, actor(req).id)));
});

export const listCategories = handler(async (req, res) => {
  const result = await administrationService.listCategories(listQuerySchema.parse(req.query));
  res.json(paginatedResponse(result.items, result.pagination));
});

export const updateCategory = handler(async (req, res) => {
  const { categoryId } = categoryIdentifierSchema.parse(req.params);
  const input = updateCategorySchema.parse(req.body);
  res.json(successResponse(await administrationService.updateCategory(categoryId, input, actor(req).id)));
});

export const courseOptions = handler(async (_req, res) => {
  res.json(successResponse(await administrationService.courseOptions()));
});

export const listCourses = handler(async (req, res) => {
  const input = managedCourseListQuerySchema.parse(req.query);
  const result = await administrationService.listCourses(input);
  res.json(paginatedResponse(result.items, result.pagination));
});

export const createCourse = handler(async (req, res) => {
  const input = createCourseSchema.parse(req.body);
  res.status(201).json(successResponse(await administrationService.createCourse(input, actor(req).id)));
});

export const updateCourse = handler(async (req, res) => {
  const { courseId } = managedCourseIdentifierSchema.parse(req.params);
  const input = updateCourseSchema.parse(req.body);
  const user = actor(req);
  res.json(successResponse(await administrationService.updateCourse(courseId, input, user.id, user.role)));
});

export const assignPrincipalInstructor = handler(async (req, res) => {
  const { courseId } = managedCourseIdentifierSchema.parse(req.params);
  const { instructorId } = assignInstructorSchema.parse(req.body);
  res.json(successResponse(await administrationService.assignPrincipalInstructor(courseId, instructorId, actor(req).id)));
});

export const publishCourse = handler(async (req, res) => {
  const { courseId } = managedCourseIdentifierSchema.parse(req.params);
  res.json(successResponse(await administrationService.publishCourse(courseId, actor(req).id)));
});

export const archiveCourse = handler(async (req, res) => {
  const { courseId } = managedCourseIdentifierSchema.parse(req.params);
  res.json(successResponse(await administrationService.archiveCourse(courseId, actor(req).id)));
});

export const restoreCourse = handler(async (req, res) => {
  const { courseId } = managedCourseIdentifierSchema.parse(req.params);
  res.json(successResponse(await administrationService.restoreCourse(courseId, actor(req).id)));
});

export const moderateReview = handler(async (req, res) => {
  const { reviewId } = reviewIdentifierSchema.parse(req.params);
  const input = moderateReviewSchema.parse(req.body);
  res.json(successResponse(await reviewService.moderateReview(reviewId, input, actor(req).id)));
});

export const listReviews = handler(async (req, res) => {
  const input = adminReviewListQuerySchema.parse(req.query);
  const result = await reviewService.listReviewsForModeration(input);
  res.json(paginatedResponse(result.items, result.pagination));
});
