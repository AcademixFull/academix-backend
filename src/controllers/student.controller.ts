import type { NextFunction, Request, Response } from "express";
import { pipeline } from "node:stream/promises";
import { AppError } from "../errors/app-error";
import {
  enrollmentCourseIdentifierSchema,
  lessonIdentifierSchema,
  updateLessonProgressSchema,
  simulatedCheckoutSchema,
  libraryListQuerySchema,
} from "../schemas/student.schemas";
import { lessonResourceIdentifierSchema } from "../schemas/authoring.schemas";
import { studentService } from "../services/student.service";
import { successResponse, paginatedResponse } from "../utils/api-response";

function userId(req: Request): string {
  if (!req.auth) throw new AppError(401, "AUTH_REQUIRED", "Debes iniciar sesión.");
  return req.auth.user.id;
}

export async function simulatedCheckout(req: Request, res: Response, next: NextFunction) {
  try {
    const input = simulatedCheckoutSchema.parse(req.body);
    res.json(successResponse(await studentService.checkout(userId(req), input)));
  } catch (error) {
    next(error);
  }
}

export async function getLearningSummary(req: Request, res: Response, next: NextFunction) {
  try { res.json(successResponse(await studentService.learningSummary(userId(req)))); }
  catch (error) { next(error); }
}

export async function enrollInCourse(req: Request, res: Response, next: NextFunction) {
  try {
    const { courseId } = enrollmentCourseIdentifierSchema.parse(req.params);
    const enrollment = await studentService.enroll(userId(req), courseId);
    res.status(201).json(successResponse(enrollment));
  } catch (error) {
    next(error);
  }
}

export async function listMyCourses(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await studentService.listMyCoursesPage(userId(req), libraryListQuerySchema.parse(req.query));
    res.json(paginatedResponse(result.items, result.pagination));
  } catch (error) {
    next(error);
  }
}

export async function getLearningCourse(req: Request, res: Response, next: NextFunction) {
  try {
    const { courseId } = enrollmentCourseIdentifierSchema.parse(req.params);
    res.json(successResponse(await studentService.getLearningCourse(userId(req), courseId)));
  } catch (error) {
    next(error);
  }
}

export async function getCourseOwnership(req: Request, res: Response, next: NextFunction) {
  try {
    const { courseIds } = libraryListQuerySchema.required({ courseIds: true }).parse(req.query);
    res.json(successResponse(await studentService.courseOwnership(userId(req), courseIds)));
  } catch (error) { next(error); }
}

export async function updateLessonProgress(req: Request, res: Response, next: NextFunction) {
  try {
    const { lessonId } = lessonIdentifierSchema.parse(req.params);
    const { completed } = updateLessonProgressSchema.parse(req.body);
    await studentService.setLessonProgress(userId(req), lessonId, completed);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
}

export async function downloadLessonResource(req: Request, res: Response, next: NextFunction) {
  try {
    const { lessonId, resourceId } = lessonResourceIdentifierSchema.parse(req.params);
    if (!req.auth) throw new AppError(401, "AUTH_REQUIRED", "Debes iniciar sesión.");
    const file = await studentService.getResourceContent(
      req.auth.user.id,
      req.auth.user.role,
      lessonId,
      resourceId,
      req.header("range")
    );
    const fallbackName = file.originalName.replace(/[\r\n"]/g, "_");
    res.setHeader("Content-Type", file.mimeType);
    res.setHeader("Accept-Ranges", "bytes");
    if (file.contentLength) {
      res.setHeader("Content-Length", file.contentLength);
    } else if (file.status === 200) {
      res.setHeader("Content-Length", String(file.sizeBytes));
    }
    if (file.contentRange) res.setHeader("Content-Range", file.contentRange);
    const disposition = /^(audio|image|text|video)\//.test(file.mimeType) || file.mimeType === "application/pdf"
      ? "inline"
      : "attachment";
    res.setHeader(
      "Content-Disposition",
      `${disposition}; filename="${fallbackName}"; filename*=UTF-8''${encodeURIComponent(file.originalName)}`
    );
    res.setHeader("Cache-Control", "private, no-store");
    res.status(file.status);
    await pipeline(file.stream, res);
  } catch (error) {
    if (res.headersSent) {
      res.destroy();
      return;
    }
    next(error);
  }
}
