import { Router } from "express";
import authRoutes from "./auth.routes";
import authoringRoutes from "./authoring.routes";
import administrationRoutes from "./administration.routes";
import catalogRoutes from "./catalog.routes";
import healthRoutes from "./health.routes";
import instructorRoutes from "./instructor.routes";
import profileRoutes from "./profile.routes";
import studentRoutes from "./student.routes";
import certificateRoutes from "./certificate.routes";
import reviewRoutes from "./review.routes";
import contactRoutes from "./contact.routes";
import organizationRoutes from "./organization.routes";
import notificationRoutes from "./notification.routes";
import moderationRoutes from "./moderation.routes";
import subscriptionRoutes from "./subscription.routes";

/**
 * Punto único donde se registran todos los routers de /api/v1.
 * Cuando agreguemos contact, courses, etc. (fases siguientes), cada
 * uno tendrá su propio archivo de rutas y se registrará aquí, sin
 * tocar app.ts.
 */
const router = Router();

router.use(healthRoutes);
router.use(subscriptionRoutes);
router.use("/auth", authRoutes);
router.use("/contact", contactRoutes);
router.use("/organizations", organizationRoutes);
router.use("/notifications", notificationRoutes);
router.use("/moderation", moderationRoutes);
router.use("/authoring", authoringRoutes);
router.use("/admin", administrationRoutes);
router.use("/instructor", instructorRoutes);
router.use(studentRoutes);
router.use(certificateRoutes);
router.use(reviewRoutes);
router.use(catalogRoutes);
router.use("/users", profileRoutes);

export default router;
