import type { AuthUser } from "./auth.service";
import { AppError } from "../errors/app-error";
import {
  profileRepository,
  type ProfileRecord,
  type ProfileRepository,
} from "../repositories/profile.repository";
import type { UpdateProfileInput } from "../schemas/profile.schemas";
import type { UserProfile } from "../types/profile.types";

function serialize(record: ProfileRecord, role: AuthUser["role"]): UserProfile {
  return { ...record, role };
}

export function createProfileService(repository: ProfileRepository) {
  return {
    async get(user: AuthUser): Promise<UserProfile> {
      const profile = await repository.findById(user.id);
      if (!profile) {
        throw new AppError(404, "PROFILE_NOT_FOUND", "El perfil del usuario no existe.");
      }
      return serialize(profile, user.role);
    },

    async update(user: AuthUser, input: UpdateProfileInput): Promise<UserProfile> {
      const profile = await repository.update(user.id, input);
      if (!profile) {
        throw new AppError(404, "PROFILE_NOT_FOUND", "El perfil del usuario no existe.");
      }
      return serialize(profile, user.role);
    },
  };
}

export const profileService = createProfileService(profileRepository);
