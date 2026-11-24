import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../../src/app";

const app = createApp();

describe("integración backend → Supabase (solo lectura)", () => {
  it("confirma que el backend y Postgres están disponibles", async () => {
    const response = await request(app).get("/api/v1/health/ready");

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe("ready");
  });

  it("consulta categorías mediante Express, nunca desde el frontend", async () => {
    const response = await request(app).get("/api/v1/categories");

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(Array.isArray(response.body.data)).toBe(true);
  });
});
