import { Router } from "express";
import {
  assignOrganizationInstructor,
  deleteOrganization,
  createOrganization,
  joinOrganization,
  listOrganizationCourses,
  listOrganizationMembers,
  listOrganizations,
  organizationDetail,
  updateOrganizationMember,
} from "../controllers/organization.controller";
import { requireAuth } from "../middleware/require-auth";

const router = Router();
router.use(requireAuth);
router.get("/", listOrganizations);
router.post("/", createOrganization);
router.post("/join", joinOrganization);
router.get("/:organizationId", organizationDetail);
router.delete("/:organizationId", deleteOrganization);
router.get("/:organizationId/members", listOrganizationMembers);
router.patch("/:organizationId/members/:userId", updateOrganizationMember);
router.get("/:organizationId/courses", listOrganizationCourses);
router.put("/:organizationId/courses/:courseId/instructor", assignOrganizationInstructor);

export default router;
