import type { AuthUser } from "../services/auth.service";

declare global {
  namespace Express {
    interface Request {
      requestId: string;
      auth?: {
        accessToken: string;
        user: AuthUser;
      };
    }
  }
}

export {};
