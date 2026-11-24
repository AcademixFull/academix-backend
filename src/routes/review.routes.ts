import { Router } from "express";
import { createCourseReview, listCourseReviews } from "../controllers/review.controller";
import { requireAuth } from "../middleware/require-auth";

const router = Router();

router.get("/courses/:courseId/reviews", listCourseReviews);
router.post("/courses/:courseId/reviews", requireAuth, createCourseReview);

export default router;
