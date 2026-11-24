import { supabaseAdmin } from "../config/supabase";
import { AppError } from "../errors/app-error";
import type {
  CourseModerationRecord,
  ModerationActor,
} from "../types/moderation.types";
import type { CourseWorkflowStatus } from "../types/administration.types";

interface ModerationRow {
  id_moderacion: string;
  fk_curso: string;
  fk_moderador: string;
  fk_estado_anterior: number;
  motivo: string;
  activa: boolean;
  fecha_moderacion: string;
  restaurada_por: string | null;
  fecha_restauracion: string | null;
}

interface UserRow {
  id_usuario: string;
  nombres: string;
  apellido_paterno: string;
  apellido_materno: string | null;
}

interface StateRow {
  id_estado_curso: number;
  nombre: string;
}

function fullName(user: UserRow): string {
  return [user.nombres, user.apellido_paterno, user.apellido_materno]
    .filter(Boolean)
    .join(" ")
    .trim();
}

function workflowStatus(name: string | undefined): CourseWorkflowStatus {
  const normalized = name?.trim().toLowerCase();
  if (normalized === "en revisión") return "review";
  if (normalized === "publicado") return "published";
  if (normalized === "archivado") return "archived";
  if (normalized === "dado de baja por moderación") return "moderated";
  return "draft";
}

function databaseError(error?: { code?: string; message?: string }): AppError {
  const mapped: Record<string, [number, string, string]> = {
    MODERATOR_REQUIRED: [403, "MODERATOR_REQUIRED", "Se requiere el rol Moderador o Administrador."],
    ADMIN_REQUIRED: [403, "ADMIN_REQUIRED", "Se requiere el rol Administrador."],
    COURSE_NOT_FOUND: [404, "COURSE_NOT_FOUND", "El curso solicitado no existe."],
    INVALID_MODERATION_STATE: [409, "INVALID_MODERATION_STATE", "Solo se puede moderar un curso en revisión o publicado."],
    COURSE_ALREADY_MODERATED: [409, "COURSE_ALREADY_MODERATED", "El curso ya está dado de baja por moderación."],
    MODERATION_NOT_FOUND: [404, "MODERATION_NOT_FOUND", "El curso no tiene una baja de moderación activa."],
    MODERATION_STATE_NOT_CONFIGURED: [500, "MODERATION_STATE_NOT_CONFIGURED", "El estado de moderación no está configurado."],
    INVALID_MODERATION_REASON: [422, "INVALID_MODERATION_REASON", "El motivo de moderación no es válido."],
    COURSE_STATE_CHANGED: [409, "COURSE_STATE_CHANGED", "El curso cambió de estado durante la moderación."],
  };
  const custom = error?.message ? mapped[error.message] : undefined;
  if (custom) return new AppError(custom[0], custom[1], custom[2]);
  if (error?.code === "23505") {
    return new AppError(409, "COURSE_ALREADY_MODERATED", "El curso ya está dado de baja por moderación.");
  }
  return new AppError(502, "DATABASE_ERROR", "No fue posible completar la moderación del curso.");
}

async function hydrate(rows: ModerationRow[]): Promise<CourseModerationRecord[]> {
  if (rows.length === 0) return [];

  const userIds = [
    ...new Set(
      rows.flatMap((row) => [row.fk_moderador, row.restaurada_por].filter((id): id is string => Boolean(id)))
    ),
  ];
  const stateIds = [...new Set(rows.map((row) => row.fk_estado_anterior))];

  const [usersResult, statesResult] = await Promise.all([
    supabaseAdmin
      .from("usuarios")
      .select("id_usuario,nombres,apellido_paterno,apellido_materno")
      .in("id_usuario", userIds),
    supabaseAdmin
      .from("estados_curso")
      .select("id_estado_curso,nombre")
      .in("id_estado_curso", stateIds),
  ]);
  if (usersResult.error || statesResult.error) {
    throw databaseError(usersResult.error ?? statesResult.error ?? undefined);
  }

  const users = new Map(
    ((usersResult.data ?? []) as UserRow[]).map((user) => [user.id_usuario, user])
  );
  const states = new Map(
    ((statesResult.data ?? []) as StateRow[]).map((state) => [state.id_estado_curso, state.nombre])
  );

  return rows.map((row) => {
    const moderator = users.get(row.fk_moderador);
    if (!moderator) throw databaseError();
    const restoredBy = row.restaurada_por ? users.get(row.restaurada_por) : undefined;
    const moderatorActor: ModerationActor = { id: moderator.id_usuario, name: fullName(moderator) };
    return {
      id: row.id_moderacion,
      courseId: row.fk_curso,
      moderator: moderatorActor,
      reason: row.motivo,
      previousStatus: workflowStatus(states.get(row.fk_estado_anterior)),
      active: row.activa,
      moderatedAt: row.fecha_moderacion,
      restoredBy: restoredBy ? { id: restoredBy.id_usuario, name: fullName(restoredBy) } : null,
      restoredAt: row.fecha_restauracion,
    };
  });
}

export interface ModerationRepository {
  moderate(courseId: string, moderatorId: string, reason: string): Promise<CourseModerationRecord>;
  restore(courseId: string, actorId: string): Promise<CourseModerationRecord>;
  listHistory(courseId: string): Promise<CourseModerationRecord[]>;
}

const MODERATION_COLUMNS =
  "id_moderacion,fk_curso,fk_moderador,fk_estado_anterior,motivo,activa,fecha_moderacion,restaurada_por,fecha_restauracion";

async function findById(moderationId: string): Promise<CourseModerationRecord> {
  const { data, error } = await supabaseAdmin
    .from("moderaciones_curso")
    .select(MODERATION_COLUMNS)
    .eq("id_moderacion", moderationId)
    .single();
  if (error) throw databaseError(error);
  const records = await hydrate([data as ModerationRow]);
  const record = records[0];
  if (!record) throw databaseError();
  return record;
}

export const moderationRepository: ModerationRepository = {
  async moderate(courseId, moderatorId, reason) {
    const { data, error } = await supabaseAdmin.rpc("academix_moderate_course", {
      p_course_id: courseId,
      p_actor_user: moderatorId,
      p_reason: reason,
    });
    if (error) throw databaseError(error);
    if (typeof data !== "string") throw databaseError();
    return findById(data);
  },

  async restore(courseId, actorId) {
    const { data, error } = await supabaseAdmin.rpc("academix_restore_moderated_course", {
      p_course_id: courseId,
      p_actor_user: actorId,
    });
    if (error) throw databaseError(error);
    if (typeof data !== "string") throw databaseError();
    return findById(data);
  },

  async listHistory(courseId) {
    const { data, error } = await supabaseAdmin
      .from("moderaciones_curso")
      .select(MODERATION_COLUMNS)
      .eq("fk_curso", courseId)
      .order("fecha_moderacion", { ascending: false });
    if (error) throw databaseError(error);
    return hydrate((data ?? []) as ModerationRow[]);
  },
};
