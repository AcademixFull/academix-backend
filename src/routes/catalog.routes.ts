import { Router } from "express";
import {
  getCourse,
  getInstructor,
  listCategories,
  listCourses,
  listFeaturedCourses,
  listInstructorCourses,
  listRelatedCourses,
} from "../controllers/catalog.controller";

const router = Router();

router.get("/categories", listCategories);
router.get("/courses", listCourses);
router.get("/courses/featured", listFeaturedCourses);
router.get("/courses/:courseId/related", listRelatedCourses);
router.get("/courses/:courseId", getCourse);
router.get("/instructors/:instructorId/courses", listInstructorCourses);
router.get("/instructors/:instructorId", getInstructor);

export default router;
