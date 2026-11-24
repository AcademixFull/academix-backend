import { defineConfig } from "vitest/config";

/** Pruebas opt-in: usan el .env local y nunca se ejecutan dentro de check. */
export default defineConfig({
  test: {
    include: ["tests/integration/**/*.test.ts"],
    fileParallelism: false,
  },
});
