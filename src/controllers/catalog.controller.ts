import type { NextFunction, Request, Response } from "express";
import {
  courseIdentifierSchema,
  courseListQuerySchema,
  instructorIdentifierSchema,
} from "../schemas/catalog.schemas";
import { catalogService } from "../services/catalog.service";
import { paginatedResponse, successResponse } from "../utils/api-response";

export async function listCategories(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    res.json(successResponse(await catalogService.listCategories()));
  } catch (error) {
    next(error);
  }
}

export async function listCourses(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const input = courseListQuerySchema.parse(req.query);
    const result = await catalogService.listCourses(input);
    res.json(paginatedResponse(result.items, result.pagination));
  } catch (error) {
    next(error);
  }
}

export async function listFeaturedCourses(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    res.json(successResponse(await catalogService.listFeaturedCourses()));
  } catch (error) {
    next(error);
  }
}

export async function getCourse(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { courseId } = courseIdentifierSchema.parse(req.params);
    res.json(successResponse(await catalogService.getCourse(courseId)));
  } catch (error) {
    next(error);
  }
}

export async function listRelatedCourses(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { courseId } = courseIdentifierSchema.parse(req.params);
    res.json(successResponse(await catalogService.listRelatedCourses(courseId)));
  } catch (error) {
    next(error);
  }
}

export async function getInstructor(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { instructorId } = instructorIdentifierSchema.parse(req.params);
    res.json(successResponse(await catalogService.getInstructor(instructorId)));
  } catch (error) {
    next(error);
  }
}

export async function listInstructorCourses(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { instructorId } = instructorIdentifierSchema.parse(req.params);
    const input = courseListQuerySchema.parse(req.query);
    const result = await catalogService.listInstructorCoursesPage(instructorId, input);
    res.json(paginatedResponse(result.items, result.pagination));
  } catch (error) {
    next(error);
  }
}
