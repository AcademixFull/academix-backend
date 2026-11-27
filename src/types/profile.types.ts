import type { ProfileAvatar } from "../config/profile-avatars";
import type { AuthUser } from "../services/auth.service";

export interface UserProfile {
  id: string;
  fullName: string;
  email: string;
  role: AuthUser["role"];
  avatarId?: ProfileAvatar | null;
  phone: string;
  country: string;
  bio: string;
}

export interface UpdateProfileFields {
  fullName?: string;
  avatarId?: ProfileAvatar | null;
  phone?: string;
  country?: string;
  bio?: string;
}
