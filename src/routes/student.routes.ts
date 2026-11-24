import { Router } from "express";
import {
  downloadLessonResource,
  enrollInCourse,
  simulatedCheckout,
  getLearningCourse,
  listMyCourses,
  getCourseOwnership,
  getLearningSummary,
  updateLessonProgress,
} from "../controllers/student.controller";
import { requireAuth } from "../middleware/require-auth";

const router = Router();

router.post("/checkout/simulated", requireAuth, simulatedCheckout);

router.post("/courses/:courseId/enrollments", requireAuth, enrollInCourse);
router.get("/users/me/courses", requireAuth, listMyCourses);
router.get("/users/me/course-ownership", requireAuth, getCourseOwnership);
router.get("/users/me/learning-summary", requireAuth, getLearningSummary);
router.get("/users/me/courses/:courseId/learning", requireAuth, getLearningCourse);
router.patch("/lessons/:lessonId/progress", requireAuth, updateLessonProgress);
router.get(
  "/lessons/:lessonId/resources/:resourceId/content",
  requireAuth,
  downloadLessonResource
);

export default router;
