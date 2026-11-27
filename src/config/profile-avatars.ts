export const profileAvatars = ["nova", "pixel", "orbita", "chispa", "bosque", "marea"] as const;
export type ProfileAvatar = (typeof profileAvatars)[number];
