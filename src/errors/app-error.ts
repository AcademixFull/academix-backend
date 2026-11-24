import type { ApiErrorFields } from "../types/api.types";

export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly fields?: ApiErrorFields
  ) {
    super(message);
    this.name = "AppError";
  }
}
