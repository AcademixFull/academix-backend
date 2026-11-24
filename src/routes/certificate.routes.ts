import { Router } from "express";
import {
  getMyCertificate,
  listMyCertificates,
  verifyCertificate,
} from "../controllers/certificate.controller";
import { requireAuth } from "../middleware/require-auth";

const router = Router();

router.get("/users/me/certificates", requireAuth, listMyCertificates);
router.get("/users/me/certificates/:certificateId", requireAuth, getMyCertificate);
router.get("/certificates/verify/:credentialCode", verifyCertificate);

export default router;
