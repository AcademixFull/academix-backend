export const profileAvatars = [
  "nova", "pixel", "orbita", "chispa", "bosque", "marea",
  "zorro", "ajolote", "buho", "carpincho",
  "rover", "prisma", "buzo", "antena",
  "cartografa", "ritmo", "cobalto", "alquimista",
] as const;

export type ProfileAvatar = (typeof profileAvatars)[number];
