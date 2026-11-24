import type { NextFunction, Request, Response } from "express";
import { AppError } from "../errors/app-error";
import {
  moderateCourseSchema,
  moderationCourseIdentifierSchema,
  moderationCourseListQuerySchema,
} from "../schemas/moderation.schemas";
import { moderationService } from "../services/moderation.service";
import { paginatedResponse, successResponse } from "../utils/api-response";

function actorId(req: Request): string {
  if (!req.auth) throw new AppError(401, "AUTH_REQUIRED", "Debes iniciar sesión.");
  return req.auth.user.id;
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

export const listModerationCourses = handler(async (req, res) => {
  const input = moderationCourseListQuerySchema.parse(req.query);
  const result = await moderationService.listCourses(input);
  res.json(paginatedResponse(result.items, result.pagination));
});

export const getModerationCourse = handler(async (req, res) => {
  const { courseId } = moderationCourseIdentifierSchema.parse(req.params);
  res.json(successResponse(await moderationService.getCourse(courseId)));
});

export const takeDownCourse = handler(async (req, res) => {
  const { courseId } = moderationCourseIdentifierSchema.parse(req.params);
  const { reason } = moderateCourseSchema.parse(req.body);
  res.json(successResponse(await moderationService.takeDown(courseId, reason, actorId(req))));
});

export const restoreModeratedCourse = handler(async (req, res) => {
  const { courseId } = moderationCourseIdentifierSchema.parse(req.params);
  res.json(successResponse(await moderationService.restore(courseId, actorId(req))));
});
