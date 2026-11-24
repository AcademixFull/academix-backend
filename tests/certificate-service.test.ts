import { describe, expect, it, vi } from "vitest";
import type { CertificateRepository } from "../src/repositories/certificate.repository";
import { createCertificateService } from "../src/services/certificate.service";

const certificate = {
  id: "33333333-3333-4333-8333-333333333333",
  courseId: "22222222-2222-4222-8222-222222222222",
  courseTitle: "TypeScript desde cero",
  issuedAt: "2026-08-12T01:00:00.000Z",
  credentialCode: "ACX-2026-ABCDEF123456",
  recipientName: "Ana Pérez",
  durationHours: 12,
  issuerName: "Academix",
  systemSignature: "A".repeat(64),
  signatureAlgorithm: "SHA-256" as const,
  verificationPath: "/api/v1/certificates/verify/ACX-2026-ABCDEF123456",
};

function repository(overrides: Partial<CertificateRepository> = {}): CertificateRepository {
  return {
    listByUser: vi.fn().mockResolvedValue([]),
    listPageByUser: vi.fn().mockResolvedValue({ records: [], total: 0 }),
    findForUser: vi.fn().mockResolvedValue(null),
    findByCredentialCode: vi.fn().mockResolvedValue(null),
    isSignatureValid: vi.fn().mockResolvedValue(true),
    ...overrides,
  };
}

describe("servicio de certificados", () => {
  it("lista resúmenes compatibles con el frontend", async () => {
    const service = createCertificateService(
      repository({ listByUser: vi.fn().mockResolvedValue([certificate]) })
    );
    const [result] = await service.listMyCertificates("user-id");
    expect(result).toEqual({
      id: certificate.id,
      courseId: certificate.courseId,
      courseTitle: certificate.courseTitle,
      issuedAt: certificate.issuedAt,
      credentialCode: certificate.credentialCode,
    });
  });

  it("impide consultar certificados ajenos mediante un 404 seguro", async () => {
    const service = createCertificateService(repository());
    await expect(service.getMyCertificate("user-id", certificate.id)).rejects.toMatchObject({
      status: 404,
      code: "CERTIFICATE_NOT_FOUND",
    });
  });

  it("devuelve el certificado propio únicamente si su firma es válida", async () => {
    const repo = repository({ findForUser: vi.fn().mockResolvedValue(certificate) });

    await expect(
      createCertificateService(repo).getMyCertificate("user-id", certificate.id)
    ).resolves.toMatchObject({ issuerName: "Academix", signatureAlgorithm: "SHA-256" });
    expect(repo.isSignatureValid).toHaveBeenCalledWith(certificate.id);
  });

  it("verifica solamente credenciales activas encontradas", async () => {
    const service = createCertificateService(
      repository({ findByCredentialCode: vi.fn().mockResolvedValue(certificate) })
    );
    await expect(service.verifyCertificate(certificate.credentialCode)).resolves.toMatchObject({
      valid: true,
      credentialCode: certificate.credentialCode,
    });
  });

  it("rechaza un certificado cuya firma no coincide", async () => {
    const service = createCertificateService(
      repository({
        findByCredentialCode: vi.fn().mockResolvedValue(certificate),
        isSignatureValid: vi.fn().mockResolvedValue(false),
      })
    );

    await expect(service.verifyCertificate(certificate.credentialCode)).rejects.toMatchObject({
      status: 409,
      code: "CERTIFICATE_INTEGRITY_ERROR",
    });
  });
});
