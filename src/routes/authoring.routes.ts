import express, { Router } from "express";
import {
  createLesson,
  createModule,
  createResource,
  getCourseContent,
  resourceOptions,
  updateLesson,
  updateModule,
  updateResource,
  uploadCourseFile,
} from "../controllers/authoring.controller";
import { requireAuth } from "../middleware/require-auth";

const router = Router();
router.use(requireAuth);
router.get("/resource-options", resourceOptions);
router.get("/courses/:courseId/content", getCourseContent);
router.post("/courses/:courseId/modules", createModule);
router.patch("/modules/:moduleId", updateModule);
router.post("/modules/:moduleId/lessons", createLesson);
router.patch("/lessons/:lessonId", updateLesson);
router.post("/lessons/:lessonId/resources", createResource);
router.patch("/resources/:resourceId", updateResource);
router.post(
  "/courses/:courseId/files",
  express.raw({ type: () => true, limit: "25mb" }),
  uploadCourseFile
);

export default router;
