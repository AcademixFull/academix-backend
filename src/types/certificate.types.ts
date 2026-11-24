export interface CertificateSummary {
  id: string;
  courseId: string;
  courseTitle: string;
  issuedAt: string;
  credentialCode: string;
}

export interface CertificateDetail extends CertificateSummary {
  recipientName: string;
  durationHours: number;
  issuerName: string;
  systemSignature: string;
  signatureAlgorithm: "SHA-256";
  verificationPath: string;
}

export interface VerifiedCertificate extends CertificateDetail {
  valid: true;
}
