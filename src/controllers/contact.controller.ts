import type { NextFunction, Request, Response } from "express";
import { submitContactMessageSchema } from "../schemas/contact.schemas";
import { contactService } from "../services/contact.service";
import { successResponse } from "../utils/api-response";

export async function submitContactMessage(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const input = submitContactMessageSchema.parse(req.body);
    res.status(201).json(successResponse(await contactService.submit(input)));
  } catch (error) {
    next(error);
  }
}
