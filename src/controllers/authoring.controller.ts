import type { NextFunction, Request, Response } from "express";
import { AppError } from "../errors/app-error";
import {
  authoringLessonIdentifierSchema,
  courseContentIdentifierSchema,
  createLessonSchema,
  createModuleSchema,
  createResourceSchema,
  moduleIdentifierSchema,
  resourceIdentifierSchema,
  updateLessonSchema,
  updateModuleSchema,
  updateResourceSchema,
} from "../schemas/authoring.schemas";
import { authoringService } from "../services/authoring.service";
import { successResponse } from "../utils/api-response";

function actor(req: Request) {
  if (!req.auth) throw new AppError(401, "AUTH_REQUIRED", "Debes iniciar sesión.");
  return req.auth.user;
}

function handler(action: (req: Request, res: Response) => Promise<void>) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try { await action(req, res); } catch (error) { next(error); }
  };
}

export const resourceOptions = handler(async (_req, res) => {
  res.json(successResponse(await authoringService.resourceOptions()));
});
export const getCourseContent = handler(async (req, res) => {
  const { courseId } = courseContentIdentifierSchema.parse(req.params);
  const user = actor(req);
  res.json(successResponse(await authoringService.getContent(courseId, user.id, user.role)));
});

export const createModule = handler(async (req, res) => {
  const { courseId } = courseContentIdentifierSchema.parse(req.params);
  const user = actor(req);
  res.status(201).json(successResponse(await authoringService.createModule(courseId, createModuleSchema.parse(req.body), user.id, user.role)));
});

export const updateModule = handler(async (req, res) => {
  const { moduleId } = moduleIdentifierSchema.parse(req.params);
  const user = actor(req);
  res.json(successResponse(await authoringService.updateModule(moduleId, updateModuleSchema.parse(req.body), user.id, user.role)));
});

export const createLesson = handler(async (req, res) => {
  const { moduleId } = moduleIdentifierSchema.parse(req.params);
  const user = actor(req);
  res.status(201).json(successResponse(await authoringService.createLesson(moduleId, createLessonSchema.parse(req.body), user.id, user.role)));
});

export const updateLesson = handler(async (req, res) => {
  const { lessonId } = authoringLessonIdentifierSchema.parse(req.params);
  const user = actor(req);
  res.json(successResponse(await authoringService.updateLesson(lessonId, updateLessonSchema.parse(req.body), user.id, user.role)));
});

export const createResource = handler(async (req, res) => {
  const { lessonId } = authoringLessonIdentifierSchema.parse(req.params);
  const user = actor(req);
  res.status(201).json(successResponse(await authoringService.createResource(lessonId, createResourceSchema.parse(req.body), user.id, user.role)));
});

export const updateResource = handler(async (req, res) => {
  const { resourceId } = resourceIdentifierSchema.parse(req.params);
  const user = actor(req);
  res.json(successResponse(await authoringService.updateResource(resourceId, updateResourceSchema.parse(req.body), user.id, user.role)));
});

export const uploadCourseFile = handler(async (req, res) => {
  const { courseId } = courseContentIdentifierSchema.parse(req.params);
  const originalName = req.header("x-file-name");
  if (!originalName) throw new AppError(422, "FILE_NAME_REQUIRED", "Debes enviar la cabecera x-file-name.");
  const user = actor(req);
  res.status(201).json(successResponse(await authoringService.uploadFile(courseId, req.body as Buffer, originalName, req.header("content-type") ?? "", user.id, user.role)));
});
