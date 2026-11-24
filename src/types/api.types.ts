/**
 * Contrato de respuesta común para toda la API de Academix.
 * Ningún controlador debe devolver un formato distinto a este.
 */

export interface ApiSuccess<T> {
  success: true;
  data: T;
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ApiPaginatedSuccess<T> extends ApiSuccess<T[]> {
  pagination: Pagination;
}

export type ApiErrorFields = Record<string, string | string[]>;

export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    fields?: ApiErrorFields;
  };
}

export type ApiResponse<T> = ApiSuccess<T> | ApiErrorResponse;
export type ApiCollectionResponse<T> = ApiPaginatedSuccess<T> | ApiErrorResponse;
