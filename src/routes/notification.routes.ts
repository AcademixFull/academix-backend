import { Router } from "express";
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  unreadNotificationCount,
} from "../controllers/notification.controller";
import { requireAuth } from "../middleware/require-auth";

const router = Router();
router.use(requireAuth);
router.get("/", listNotifications);
router.get("/unread-count", unreadNotificationCount);
router.patch("/read-all", markAllNotificationsRead);
router.patch("/:notificationId/read", markNotificationRead);
export default router;
