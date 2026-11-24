import type { NextFunction, Request, Response } from "express";
import { AppError } from "../errors/app-error";
import {
  createCourseSchema,
  managedCourseIdentifierSchema,
  managedCourseListQuerySchema,
  updateCourseSchema,
} from "../schemas/administration.schemas";
import { administrationService } from "../services/administration.service";
import { paginatedResponse, successResponse } from "../utils/api-response";

function actor(req: Request) {
  if (!req.auth) throw new AppError(401, "AUTH_REQUIRED", "Debes iniciar sesión.");
  return req.auth.user;
}

export async function listInstructorManagedCourses(req: Request, res: Response, next: NextFunction) {
  try {
    const input = managedCourseListQuerySchema.parse(req.query);
    const result = await administrationService.listCourses(input, actor(req).id);
    res.json(paginatedResponse(result.items, result.pagination));
  } catch (error) {
    next(error);
  }
}

export async function createInstructorCourse(req: Request, res: Response, next: NextFunction) {
  try {
    const input = createCourseSchema.parse(req.body);
    const user = actor(req);
    res.status(201).json(successResponse(await administrationService.createCourseForInstructor(input, user.id, user.role)));
  } catch (error) {
    next(error);
  }
}

export async function updateInstructorCourse(req: Request, res: Response, next: NextFunction) {
  try {
    const { courseId } = managedCourseIdentifierSchema.parse(req.params);
    const input = updateCourseSchema.parse(req.body);
    const user = actor(req);
    res.json(successResponse(await administrationService.updateCourse(courseId, input, user.id, user.role)));
  } catch (error) {
    next(error);
  }
}

export async function submitInstructorCourse(req: Request, res: Response, next: NextFunction) {
  try {
    const { courseId } = managedCourseIdentifierSchema.parse(req.params);
    const user = actor(req);
    res.json(successResponse(await administrationService.submitCourse(courseId, user.id, user.role)));
  } catch (error) {
    next(error);
  }
}

export async function archiveInstructorCourse(req: Request, res: Response, next: NextFunction) {
  try {
    const { courseId } = managedCourseIdentifierSchema.parse(req.params);
    const user = actor(req);
    res.json(successResponse(await administrationService.archiveOwnCourse(courseId, user.id, user.role)));
  } catch (error) {
    next(error);
  }
}
