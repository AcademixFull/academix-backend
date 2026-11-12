import type { InstructorApplicationListQuery } from "../schemas/instructor-application.schemas";
import { supabaseAdmin } from "../config/supabase";
import { AppError } from "../errors/app-error";
import type {
  InstructorApplication,
  InstructorApplicationStatus,
} from "../types/instructor-application.types";

interface ApplicationRow {
  id_solicitud_verificacion: string;
  fk_usuario: string;
  matricula: string;
  referencia_credencial: string;
  fk_estado_verificacion: number;
  observaciones: string | null;
  fecha_solicitud: string;
  fecha_revision: string | null;
}

const statusNames: Record<InstructorApplicationStatus, string> = {
  pending: "Pendiente",
  approved: "Aprobada",
  rejected: "Rechazada",
};

function databaseFailure(): AppError {
  return new AppError(502, "DATABASE_ERROR", "No fue posible consultar las solicitudes de instructor.");
}

export interface InstructorApplicationRepository {
  findLatestByUser(userId: string): Promise<InstructorApplication | null>;
  findById(applicationId: string): Promise<InstructorApplication | null>;
  list(input: InstructorApplicationListQuery): Promise<{ records: InstructorApplication[]; total: number }>;
  create(userId: string, enrollmentId: string, credentialReference: string): Promise<InstructorApplication>;
  resolve(
    applicationId: string,
    status: Exclude<InstructorApplicationStatus, "pending">,
    observations: string,
    reviewerId: string
  ): Promise<InstructorApplication>;
}

async function stateIds(): Promise<Map<number, InstructorApplicationStatus>> {
  const { data, error } = await supabaseAdmin.from("estados_verificacion").select("id_estado_verificacion,nombre");
  if (error) throw databaseFailure();
  const byName = new Map(Object.entries(statusNames).map(([key, value]) => [value.toLowerCase(), key as InstructorApplicationStatus]));
  return new Map((data ?? []).flatMap((row) => {
    const status = byName.get(String(row.nombre).toLowerCase());
    return status ? [[Number(row.id_estado_verificacion), status]] : [];
  }));
}

async function stateId(status: InstructorApplicationStatus): Promise<number> {
  const { data, error } = await supabaseAdmin
    .from("estados_verificacion")
    .select("id_estado_verificacion")
    .eq("nombre", statusNames[status])
    .maybeSingle();
  if (error || !data) throw databaseFailure();
  return Number(data.id_estado_verificacion);
}

function applicationFolio(row: ApplicationRow): string {
  const year = row.fecha_solicitud.slice(0, 4) || String(new Date().getFullYear());
  const token = row.id_solicitud_verificacion.replace(/-/g, "").slice(0, 12).toUpperCase();
  return `INS-${year}-${token}`;
}

async function hydrate(rows: ApplicationRow[]): Promise<InstructorApplication[]> {
  if (rows.length === 0) return [];
  const ids = [...new Set(rows.map((row) => row.fk_usuario))];
  const [{ data: users, error: usersError }, statuses] = await Promise.all([
    supabaseAdmin.from("usuarios").select("id_usuario,nombres,apellido_paterno,apellido_materno,correo").in("id_usuario", ids),
    stateIds(),
  ]);
  if (usersError) throw databaseFailure();
  const userMap = new Map((users ?? []).map((user) => [String(user.id_usuario), user]));
  return rows.map((row) => {
    const user = userMap.get(row.fk_usuario);
    const name = user
      ? [user.nombres, user.apellido_paterno, user.apellido_materno].filter(Boolean).join(" ")
      : "Usuario";
    return {
      id: row.id_solicitud_verificacion,
      folio: applicationFolio(row),
      userId: row.fk_usuario,
      applicantName: name,
      applicantEmail: user ? String(user.correo) : "",
      enrollmentId: row.matricula,
      credentialReference: row.referencia_credencial,
      status: statuses.get(row.fk_estado_verificacion) ?? "pending",
      observations: row.observaciones ?? "",
      requestedAt: row.fecha_solicitud,
      reviewedAt: row.fecha_revision,
    };
  });
}

const columns = "id_solicitud_verificacion,fk_usuario,matricula,referencia_credencial,fk_estado_verificacion,observaciones,fecha_solicitud,fecha_revision";

export const instructorApplicationRepository: InstructorApplicationRepository = {
  async findLatestByUser(userId) {
    const { data, error } = await supabaseAdmin.from("solicitudes_verificacion_utt").select(columns).eq("fk_usuario", userId).order("fecha_solicitud", { ascending: false }).limit(1);
    if (error) throw databaseFailure();
    return (await hydrate((data ?? []) as ApplicationRow[]))[0] ?? null;
  },

  async findById(applicationId) {
    const { data, error } = await supabaseAdmin.from("solicitudes_verificacion_utt").select(columns).eq("id_solicitud_verificacion", applicationId).limit(1);
    if (error) throw databaseFailure();
    return (await hydrate((data ?? []) as ApplicationRow[]))[0] ?? null;
  },

  async list(input) {
    let query = supabaseAdmin.from("solicitudes_verificacion_utt").select(columns, { count: "exact" }).order("fecha_solicitud", { ascending: false }).order("id_solicitud_verificacion");
    if (input.status) query = query.eq("fk_estado_verificacion", await stateId(input.status));
    const offset = (input.page - 1) * input.limit;
    const { data, count, error } = await query.range(offset, offset + input.limit - 1);
    if (error) throw databaseFailure();
    return { records: await hydrate((data ?? []) as ApplicationRow[]), total: count ?? 0 };
  },

  async create(userId, enrollmentId, credentialReference) {
    const { data, error } = await supabaseAdmin.from("solicitudes_verificacion_utt").insert({
      fk_usuario: userId,
      matricula: enrollmentId,
      referencia_credencial: credentialReference,
      fk_estado_verificacion: await stateId("pending"),
    }).select(columns).single();
    if (error || !data) throw databaseFailure();
    return (await hydrate([data as ApplicationRow]))[0]!;
  },

  async resolve(applicationId, status, observations, reviewerId) {
    const { data, error } = await supabaseAdmin.from("solicitudes_verificacion_utt").update({
      fk_estado_verificacion: await stateId(status),
      observaciones: observations,
      fecha_revision: new Date().toISOString(),
      revisado_por: reviewerId,
    }).eq("id_solicitud_verificacion", applicationId).select(columns).single();
    if (error || !data) throw databaseFailure();
    return (await hydrate([data as ApplicationRow]))[0]!;
  },
};
