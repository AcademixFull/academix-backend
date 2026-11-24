import type { AuthUser } from "../services/auth.service";

export interface UserProfile {
  id: string;
  fullName: string;
  email: string;
  role: AuthUser["role"];
  phone: string;
  country: string;
  bio: string;
}

export interface UpdateProfileFields {
  fullName?: string;
  phone?: string;
  country?: string;
  bio?: string;
}
