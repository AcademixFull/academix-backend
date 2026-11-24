import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";
import { checkSupabaseReadiness } from "../src/services/health.service";

vi.mock("../src/services/health.service", () => ({
  checkSupabaseReadiness: vi.fn(),
}));

const app = createApp();

beforeEach(() => {
  vi.mocked(checkSupabaseReadiness).mockReset();
  vi.mocked(checkSupabaseReadiness).mockResolvedValue();
});

describe("GET /api/v1/health", () => {
  it("responde 200 con success:true y data.status = 'ok'", async () => {
    const response = await request(app).get("/api/v1/health");

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.status).toBe("ok");
    expect(response.body.data.version).toMatch(/^\d+\.\d+\.\d+/);
    expect(response.body.data).toHaveProperty("environment");
    expect(response.body.data).toHaveProperty("uptime");
    expect(response.body.data).toHaveProperty("timestamp");
  });

  it("no expone variables de entorno ni secretos", async () => {
    const response = await request(app).get("/api/v1/health");
    const body = JSON.stringify(response.body);

    expect(body).not.toMatch(/SUPABASE/i);
    expect(body).not.toMatch(/SECRET/i);
    expect(body).not.toMatch(/KEY/i);
  });
});

describe("GET /api/v1/health/ready", () => {
  it("responde ready cuando la dependencia está disponible", async () => {
    const response = await request(app).get("/api/v1/health/ready");

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe("ready");
    expect(response.body.data.checks).toEqual({ database: "ok" });
  });

  it("responde 503 sin filtrar detalles internos cuando falla", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.mocked(checkSupabaseReadiness).mockRejectedValue(new Error("secret connection detail"));

    const response = await request(app).get("/api/v1/health/ready");

    expect(response.status).toBe(503);
    expect(response.body.error).toEqual({
      code: "SERVICE_UNAVAILABLE",
      message: "El servicio no está disponible temporalmente.",
    });
    expect(JSON.stringify(response.body)).not.toContain("secret connection detail");
    log.mockRestore();
  });
});

describe("Rutas inexistentes", () => {
  it("GET /api/v1/ruta-inexistente responde 404 con el formato de error común", async () => {
    const response = await request(app).get("/api/v1/ruta-inexistente");

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      success: false,
      error: {
        code: "NOT_FOUND",
        message: "El recurso solicitado no existe.",
      },
    });
  });

  it("responde JSON, no el HTML por defecto de Express", async () => {
    const response = await request(app).get("/no-existe-ni-siquiera-api");

    expect(response.headers["content-type"]).toMatch(/json/);
  });
});
