import { defineConfig } from "vitest/config";

/**
 * Las pruebas NO deben depender de un .env local (que además está
 * ignorado por Git y no existe tras clonar/descomprimir el proyecto).
 *
 * `test.env` inyecta estas variables en `process.env` únicamente para
 * la ejecución de Vitest, antes de que se importe cualquier módulo de
 * la app (incluyendo src/config/env.ts). Son valores seguros de prueba,
 * no secretos reales.
 */
export default defineConfig({
  test: {
    env: {
      NODE_ENV: "test",
      PORT: "3000",
      TRUST_PROXY_HOPS: "0",
      RATE_LIMIT_WINDOW_MS: "900000",
      RATE_LIMIT_MAX: "1000",
      AUTH_RATE_LIMIT_MAX: "1000",
      FRONTEND_URL: "http://localhost:5173,http://localhost:4173",
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
      SUPABASE_SECRET_KEY: "sb_secret_test",
      PASSWORD_RESET_REDIRECT_URL:
        "http://localhost:5173/CursosWeb/",
    },
    exclude: ["tests/integration/**", "node_modules/**", "dist/**"],
  },
});
