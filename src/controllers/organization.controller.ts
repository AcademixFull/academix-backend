import type { NextFunction, Request, Response } from "express";
import { AppError } from "../errors/app-error";
import {
  organizationMemberListQuerySchema,
  organizationCourseListQuerySchema,
  createOrganizationSchema,
  joinOrganizationSchema,
  organizationIdentifierSchema,
  organizationMemberIdentifierSchema,
  updateOrganizationMemberSchema,
} from "../schemas/organization.schemas";
import { assignInstructorSchema, managedCourseIdentifierSchema } from "../schemas/administration.schemas";
import { organizationService } from "../services/organization.service";
import { paginatedResponse, successResponse } from "../utils/api-response";

function userId(req: Request): string {
  if (!req.auth) throw new AppError(401, "AUTH_REQUIRED", "Debes iniciar sesión.");
  return req.auth.user.id;
}

function handler(action: (req: Request, res: Response) => Promise<void>) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await action(req, res);
    } catch (error) {
      next(error);
    }
  };
}

export const listOrganizations = handler(async (req, res) => {
  res.json(successResponse(await organizationService.listForUser(userId(req))));
});
export const deleteOrganization = handler(async (req, res) => {
  const { organizationId } = organizationIdentifierSchema.parse(req.params);
  res.json(successResponse(await organizationService.remove(organizationId, userId(req))));
});

export const createOrganization = handler(async (req, res) => {
  const input = createOrganizationSchema.parse(req.body);
  res.status(201).json(successResponse(await organizationService.create(input, userId(req))));
});

export const joinOrganization = handler(async (req, res) => {
  const { joinCode, studentNumber } = joinOrganizationSchema.parse(req.body);
  res.status(201).json(successResponse(await organizationService.join(userId(req), joinCode, studentNumber)));
});

export const organizationDetail = handler(async (req, res) => {
  const { organizationId } = organizationIdentifierSchema.parse(req.params);
  res.json(successResponse(await organizationService.detail(organizationId, userId(req))));
});

export const listOrganizationMembers = handler(async (req, res) => {
  const { organizationId } = organizationIdentifierSchema.parse(req.params);
  const result = await organizationService.listMembers(organizationId, userId(req), organizationMemberListQuerySchema.parse(req.query));
  res.json(paginatedResponse(result.items, result.pagination));
});

export const updateOrganizationMember = handler(async (req, res) => {
  const { organizationId, userId: targetUserId } = organizationMemberIdentifierSchema.parse(req.params);
  const input = updateOrganizationMemberSchema.parse(req.body);
  res.json(successResponse(await organizationService.setMemberRole(organizationId, targetUserId, input, userId(req))));
});

export const listOrganizationCourses = handler(async (req, res) => {
  const { organizationId } = organizationIdentifierSchema.parse(req.params);
  const result = await organizationService.listCourses(organizationId, userId(req), organizationCourseListQuerySchema.parse(req.query));
  res.json(paginatedResponse(result.items, result.pagination));
});

export const assignOrganizationInstructor = handler(async (req, res) => {
  const { organizationId } = organizationIdentifierSchema.parse(req.params);
  const { courseId } = managedCourseIdentifierSchema.parse(req.params);
  const { instructorId } = assignInstructorSchema.parse(req.body);
  await organizationService.assignInstructor(organizationId, courseId, instructorId, userId(req));
  res.json(successResponse({ assigned: true }));
});
