import { Router } from "express";
import { submitContactMessage } from "../controllers/contact.controller";
import { createRateLimiter } from "../middleware/rate-limit";

const router = Router();
const contactRateLimiter = createRateLimiter(5, "academix-contact");

router.post("/messages", contactRateLimiter, submitContactMessage);

export default router;
