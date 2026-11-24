import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/services/contact.service", () => ({
  contactService: { submit: vi.fn() },
}));

import { createApp } from "../src/app";
import { contactService } from "../src/services/contact.service";

const validMessage = {
  fullName: "Antony Pérez",
  email: "antony@example.com",
  subject: "Información de cursos",
  message: "Quiero conocer las próximas fechas disponibles.",
};

describe("formulario público de contacto", () => {
  const app = createApp();

  beforeEach(() => vi.clearAllMocks());

  it("guarda un mensaje válido mediante el backend", async () => {
    vi.mocked(contactService.submit).mockResolvedValue({
      id: "11111111-1111-4111-8111-111111111111",
      submittedAt: "2026-08-13T18:00:00.000Z",
    });

    const response = await request(app).post("/api/v1/contact/messages").send(validMessage);

    expect(response.status).toBe(201);
    expect(response.body.data.id).toBe("11111111-1111-4111-8111-111111111111");
    expect(contactService.submit).toHaveBeenCalledWith(validMessage);
  });

  it("rechaza campos inválidos sin guardar información", async () => {
    const response = await request(app)
      .post("/api/v1/contact/messages")
      .send({ ...validMessage, email: "correo-invalido", message: "corto" });

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
    expect(contactService.submit).not.toHaveBeenCalled();
  });
});
