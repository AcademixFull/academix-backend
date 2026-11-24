import type { NextFunction, Request, Response } from "express";
import { AppError } from "../errors/app-error";
import {
  certificateIdentifierSchema,
  credentialCodeSchema,
} from "../schemas/certificate.schemas";
import { certificateService } from "../services/certificate.service";
import { successResponse, paginatedResponse } from "../utils/api-response";
import { libraryListQuerySchema } from "../schemas/student.schemas";

function userId(req: Request): string {
  if (!req.auth) throw new AppError(401, "AUTH_REQUIRED", "Debes iniciar sesión.");
  return req.auth.user.id;
}

export async function listMyCertificates(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await certificateService.listMyCertificatesPage(userId(req), libraryListQuerySchema.pick({ page: true, limit: true }).parse(req.query));
    res.json(paginatedResponse(result.items, result.pagination));
  } catch (error) {
    next(error);
  }
}

export async function getMyCertificate(req: Request, res: Response, next: NextFunction) {
  try {
    const { certificateId } = certificateIdentifierSchema.parse(req.params);
    res.json(
      successResponse(await certificateService.getMyCertificate(userId(req), certificateId))
    );
  } catch (error) {
    next(error);
  }
}

export async function verifyCertificate(req: Request, res: Response, next: NextFunction) {
  try {
    const { credentialCode } = credentialCodeSchema.parse(req.params);
    res.json(successResponse(await certificateService.verifyCertificate(credentialCode)));
  } catch (error) {
    next(error);
  }
}
