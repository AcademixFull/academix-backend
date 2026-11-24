import { Router } from "express";
import {
  getModerationCourse,
  listModerationCourses,
  restoreModeratedCourse,
  takeDownCourse,
} from "../controllers/moderation.controller";
import { requireAuth } from "../middleware/require-auth";
import { requireRole } from "../middleware/require-role";

const router = Router();
router.use(requireAuth);
router.get("/courses", requireRole("moderator", "admin"), listModerationCourses);
router.get("/courses/:courseId", requireRole("moderator", "admin"), getModerationCourse);
router.post("/courses/:courseId/takedown", requireRole("moderator", "admin"), takeDownCourse);
router.post("/courses/:courseId/restore", requireRole("moderator", "admin"), restoreModeratedCourse);

export default router;
