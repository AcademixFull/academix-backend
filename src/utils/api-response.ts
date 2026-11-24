import type {
  ApiErrorFields,
  ApiErrorResponse,
  ApiPaginatedSuccess,
  ApiSuccess,
  Pagination,
} from "../types/api.types";

export function successResponse<T>(data: T): ApiSuccess<T> {
  return { success: true, data };
}

export function paginatedResponse<T>(
  data: T[],
  pagination: Pagination
): ApiPaginatedSuccess<T> {
  return { success: true, data, pagination };
}

export function errorResponse(
  code: string,
  message: string,
  fields?: ApiErrorFields
): ApiErrorResponse {
  return {
    success: false,
    error: { code, message, ...(fields ? { fields } : {}) },
  };
}
