import { supabaseAdmin } from "../config/supabase";
import { AppError } from "../errors/app-error";
import type { CertificateDetail } from "../types/certificate.types";

interface CertificateRow {
  id_certificado: string;
  codigo_certificado: string;
  fecha_emision: string;
  fk_curso: string;
  nombre_destinatario: string;
  titulo_curso: string;
  duracion_horas: number | string;
  emisor: string;
  firma_sistema: string;
}

export interface CertificateRepository {
  listPageByUser(userId: string, input: { page: number; limit: number }): Promise<{ records: CertificateDetail[]; total: number }>;
  listByUser(userId: string): Promise<CertificateDetail[]>;
  findForUser(userId: string, certificateId: string): Promise<CertificateDetail | null>;
  findByCredentialCode(credentialCode: string): Promise<CertificateDetail | null>;
  isSignatureValid(certificateId: string): Promise<boolean>;
}

function databaseFailure(): AppError {
  return new AppError(502, "DATABASE_ERROR", "No fue posible consultar los certificados.");
}

function serialize(row: CertificateRow): CertificateDetail {
  return {
    id: row.id_certificado,
    courseId: row.fk_curso,
    courseTitle: row.titulo_curso,
    issuedAt: row.fecha_emision,
    credentialCode: row.codigo_certificado,
    recipientName: row.nombre_destinatario,
    durationHours: Number(row.duracion_horas),
    issuerName: row.emisor,
    systemSignature: row.firma_sistema,
    signatureAlgorithm: "SHA-256",
    verificationPath: `/api/v1/certificates/verify/${row.codigo_certificado}`,
  };
}

const CERTIFICATE_COLUMNS = [
  "id_certificado",
  "codigo_certificado",
  "fecha_emision",
  "fk_curso",
  "nombre_destinatario",
  "titulo_curso",
  "duracion_horas",
  "emisor",
  "firma_sistema",
].join(",");

export const certificateRepository: CertificateRepository = {
  async listPageByUser(userId, input) {
    const offset = (input.page - 1) * input.limit;
    const { data, error, count } = await supabaseAdmin.from("certificados")
      .select(CERTIFICATE_COLUMNS, { count: "exact" }).eq("fk_usuario", userId).eq("activo", true)
      .order("fecha_emision", { ascending: false }).order("id_certificado")
      .range(offset, offset + input.limit - 1);
    if (error) throw databaseFailure();
    return { records: ((data ?? []) as unknown as CertificateRow[]).map(serialize), total: count ?? 0 };
  },
  async listByUser(userId) {
    const { data, error } = await supabaseAdmin
      .from("certificados")
      .select(CERTIFICATE_COLUMNS)
      .eq("fk_usuario", userId)
      .eq("activo", true)
      .order("fecha_emision", { ascending: false });
    if (error) throw databaseFailure();
    return ((data ?? []) as unknown as CertificateRow[]).map(serialize);
  },

  async findForUser(userId, certificateId) {
    const { data, error } = await supabaseAdmin
      .from("certificados")
      .select(CERTIFICATE_COLUMNS)
      .eq("id_certificado", certificateId)
      .eq("fk_usuario", userId)
      .eq("activo", true)
      .maybeSingle();
    if (error) throw databaseFailure();
    return data ? serialize(data as unknown as CertificateRow) : null;
  },

  async findByCredentialCode(credentialCode) {
    const { data, error } = await supabaseAdmin
      .from("certificados")
      .select(CERTIFICATE_COLUMNS)
      .eq("codigo_certificado", credentialCode)
      .eq("activo", true)
      .maybeSingle();
    if (error) throw databaseFailure();
    return data ? serialize(data as unknown as CertificateRow) : null;
  },

  async isSignatureValid(certificateId) {
    const { data, error } = await supabaseAdmin.rpc(
      "academix_certificate_signature_is_valid",
      { p_certificate_id: certificateId }
    );
    if (error) throw databaseFailure();
    return data === true;
  },
};
