import { Router } from "express";
import {
  createInstructorCourse,
  archiveInstructorCourse,
  listInstructorManagedCourses,
  submitInstructorCourse,
  updateInstructorCourse,
} from "../controllers/instructor.controller";
import { requireAuth } from "../middleware/require-auth";

const router = Router();
router.use(requireAuth);
router.get("/courses", listInstructorManagedCourses);
router.post("/courses", createInstructorCourse);
router.patch("/courses/:courseId", updateInstructorCourse);
router.post("/courses/:courseId/submit", submitInstructorCourse);
router.post("/courses/:courseId/archive", archiveInstructorCourse);

export default router;
