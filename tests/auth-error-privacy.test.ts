import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { errorHandler } from "../src/middleware/error-handler";

describe("authentication error privacy", () => {
  it.each(["/api/v1/auth/login", "/api/v1/users/me/deletion"])("does not persist credentials for %s", async (path) => {
    const secret = "test-only-credential-9384";
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const app = express();
      app.post(path, (_req, _res, next) => next(new Error(`Provider rejected password ${secret}`)));
      app.use(errorHandler);
      const response = await request(app).post(path);
      expect(response.status).toBe(500);
      expect(JSON.stringify(response.body)).not.toContain(secret);
      expect(JSON.stringify(log.mock.calls)).not.toContain(secret);
      expect(log).toHaveBeenCalled();
    } finally { log.mockRestore(); }
  });
});
