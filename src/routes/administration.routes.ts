import { Router } from "express";
import {
  archiveCourse,
  assignPrincipalInstructor,
  courseOptions,
  createCategory,
  createCourse,
  listCourses,
  listCategories,
  listInstructors,
  listReviews,
  listUsers,
  moderateReview,
  publishCourse,
  restoreCourse,
  setUserRoles,
  setUserStatus,
  updateCategory,
  updateCourse,
  upsertInstructor,
} from "../controllers/administration.controller";
import { requireAuth } from "../middleware/require-auth";
import { requireRole } from "../middleware/require-role";
import {
  listInstructorApplications,
  resolveInstructorApplication,
} from "../controllers/instructor-application.controller";

const router = Router();
router.use(requireAuth, requireRole("admin"));
router.get("/users", listUsers);
router.patch("/users/:userId/roles", setUserRoles);
router.patch("/users/:userId/status", setUserStatus);
router.get("/instructors", listInstructors);
router.put("/instructors/:userId", upsertInstructor);
router.get("/instructor-applications", listInstructorApplications);
router.patch("/instructor-applications/:applicationId", resolveInstructorApplication);
router.get("/categories", listCategories);
router.post("/categories", createCategory);
router.patch("/categories/:categoryId", updateCategory);
router.get("/course-options", courseOptions);
router.get("/courses", listCourses);
router.post("/courses", createCourse);
router.patch("/courses/:courseId", updateCourse);
router.put("/courses/:courseId/instructor", assignPrincipalInstructor);
router.post("/courses/:courseId/publish", publishCourse);
router.post("/courses/:courseId/archive", archiveCourse);
router.post("/courses/:courseId/restore", restoreCourse);
router.get("/reviews", listReviews);
router.patch("/reviews/:reviewId/moderation", moderateReview);

export default router;
