import { Router } from "express";
import {
  me,
  requestPasswordReset,
  signIn,
  signOut,
  signUp,
  updatePassword,
} from "../controllers/auth.controller";
import { requireAuth } from "../middleware/require-auth";
import { noStore } from "../middleware/no-store";
import { authRateLimiter } from "../middleware/rate-limit";

const router = Router();

router.use(noStore);

router.post("/register", authRateLimiter, signUp);
router.post("/login", authRateLimiter, signIn);
router.post("/password-reset", authRateLimiter, requestPasswordReset);
router.patch("/password", requireAuth, updatePassword);
router.get("/me", requireAuth, me);
router.post("/logout", requireAuth, signOut);

export default router;
