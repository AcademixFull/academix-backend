import type { RequestHandler } from "express";
import { invalidatePublicCatalog } from "../services/catalog.service";

/** Invalidate only after committed, successful mutations; never cache permissions. */
export const invalidateCatalogOnMutation: RequestHandler = (req, res, next) => {
  if (!["GET", "HEAD", "OPTIONS"].includes(req.method) &&
      /\/(?:courses|categories|reviews|enrollments|checkout|organizations|users|subscriptions)(?:\/|$)/.test(req.path)) {
    res.once("finish", () => {
      if (res.statusCode >= 200 && res.statusCode < 300) invalidatePublicCatalog();
    });
  }
  next();
};
