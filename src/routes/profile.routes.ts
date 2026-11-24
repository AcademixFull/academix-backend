import { Router } from "express";
import { getMyProfile, updateMyProfile } from "../controllers/profile.controller";
import {
  getMyInstructorApplication,
  submitInstructorApplication,
} from "../controllers/instructor-application.controller";
import { requireAuth } from "../middleware/require-auth";
import { cancelAccountDeletion, getAccountDeletion, requestAccountDeletion } from "../controllers/account-deletion.controller";
import { authRateLimiter } from "../middleware/rate-limit";

const router = Router();

router.use(requireAuth);
router.get("/me", getMyProfile);
router.patch("/me", updateMyProfile);
router.get("/me/deletion", getAccountDeletion);
router.post("/me/deletion", authRateLimiter, requestAccountDeletion);
router.delete("/me/deletion", cancelAccountDeletion);
router.get("/me/instructor-application", getMyInstructorApplication);
router.post("/me/instructor-application", submitInstructorApplication);

export default router;
