import { AppError } from "../errors/app-error";
import { pageResult } from "../utils/pagination";
import {
  certificateRepository,
  type CertificateRepository,
} from "../repositories/certificate.repository";
import type {
  CertificateDetail,
  CertificateSummary,
  VerifiedCertificate,
} from "../types/certificate.types";

function summary(certificate: CertificateDetail): CertificateSummary {
  const {
    recipientName: _recipientName,
    durationHours: _durationHours,
    issuerName: _issuerName,
    systemSignature: _systemSignature,
    signatureAlgorithm: _signatureAlgorithm,
    verificationPath: _verificationPath,
    ...result
  } = certificate;
  return result;
}

async function assertIntegrity(
  repository: CertificateRepository,
  certificate: CertificateDetail
): Promise<void> {
  if (!(await repository.isSignatureValid(certificate.id))) {
    throw new AppError(
      409,
      "CERTIFICATE_INTEGRITY_ERROR",
      "No fue posible validar la integridad del certificado."
    );
  }
}

export function createCertificateService(repository: CertificateRepository) {
  return {
    async listMyCertificatesPage(userId: string, input: { page: number; limit: number }) {
      const result = await repository.listPageByUser(userId, input);
      return pageResult(result.records.map(summary), result.total, input.page, input.limit);
    },
    async listMyCertificates(userId: string): Promise<CertificateSummary[]> {
      return (await repository.listByUser(userId)).map(summary);
    },

    async getMyCertificate(userId: string, certificateId: string): Promise<CertificateDetail> {
      const certificate = await repository.findForUser(userId, certificateId);
      if (!certificate) {
        throw new AppError(404, "CERTIFICATE_NOT_FOUND", "El certificado solicitado no existe.");
      }
      await assertIntegrity(repository, certificate);
      return certificate;
    },

    async verifyCertificate(credentialCode: string): Promise<VerifiedCertificate> {
      const certificate = await repository.findByCredentialCode(credentialCode);
      if (!certificate) {
        throw new AppError(404, "CERTIFICATE_NOT_FOUND", "El certificado no existe o fue revocado.");
      }
      await assertIntegrity(repository, certificate);
      return { ...certificate, valid: true };
    },
  };
}

export const certificateService = createCertificateService(certificateRepository);
