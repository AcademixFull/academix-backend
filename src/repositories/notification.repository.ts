import { supabaseAdmin } from "../config/supabase";
import { AppError } from "../errors/app-error";
import type { UserNotification } from "../types/notification.types";

interface NotificationRow {
  id_notificacion: string;
  titulo: string;
  mensaje: string;
  leida: boolean;
  fecha_creacion: string;
  fecha_lectura: string | null;
}

function databaseError(): AppError {
  return new AppError(502, "DATABASE_ERROR", "No fue posible consultar las notificaciones.");
}

function mapNotification(row: NotificationRow): UserNotification {
  return {
    id: row.id_notificacion,
    title: row.titulo,
    message: row.mensaje,
    read: row.leida,
    createdAt: row.fecha_creacion,
    readAt: row.fecha_lectura,
  };
}

export interface NotificationRepository {
  list(userId: string, limit: number): Promise<UserNotification[]>;
  unreadCount(userId: string): Promise<number>;
  markRead(userId: string, notificationId: string): Promise<UserNotification | null>;
  markAllRead(userId: string): Promise<void>;
  courseInstructorIds(courseId: string): Promise<string[]>;
  createForUsers(userIds: string[], title: string, message: string): Promise<void>;
}

export const notificationRepository: NotificationRepository = {
  async list(userId, limit) {
    const { data, error } = await supabaseAdmin
      .from("notificaciones")
      .select("id_notificacion,titulo,mensaje,leida,fecha_creacion,fecha_lectura")
      .eq("fk_usuario", userId)
      .order("fecha_creacion", { ascending: false })
      .limit(limit);
    if (error) throw databaseError();
    return ((data ?? []) as NotificationRow[]).map(mapNotification);
  },

  async unreadCount(userId) {
    const { count, error } = await supabaseAdmin
      .from("notificaciones")
      .select("id_notificacion", { count: "exact", head: true })
      .eq("fk_usuario", userId)
      .eq("leida", false);
    if (error) throw databaseError();
    return count ?? 0;
  },

  async markRead(userId, notificationId) {
    const now = new Date().toISOString();
    const { data, error } = await supabaseAdmin
      .from("notificaciones")
      .update({ leida: true, fecha_lectura: now })
      .eq("id_notificacion", notificationId)
      .eq("fk_usuario", userId)
      .select("id_notificacion,titulo,mensaje,leida,fecha_creacion,fecha_lectura")
      .maybeSingle();
    if (error) throw databaseError();
    return data ? mapNotification(data as NotificationRow) : null;
  },

  async markAllRead(userId) {
    const { error } = await supabaseAdmin
      .from("notificaciones")
      .update({ leida: true, fecha_lectura: new Date().toISOString() })
      .eq("fk_usuario", userId)
      .eq("leida", false);
    if (error) throw databaseError();
  },

  async courseInstructorIds(courseId) {
    const { data, error } = await supabaseAdmin
      .from("cursos_instructores")
      .select("fk_usuario")
      .eq("fk_curso", courseId)
      .eq("activo", true);
    if (error) throw databaseError();
    return [...new Set(((data ?? []) as Array<{ fk_usuario: string }>).map((row) => row.fk_usuario))];
  },

  async createForUsers(userIds, title, message) {
    if (userIds.length === 0) return;
    const { error } = await supabaseAdmin.from("notificaciones").insert(
      [...new Set(userIds)].map((userId) => ({
        fk_usuario: userId,
        titulo: title,
        mensaje: message,
        leida: false,
      }))
    );
    if (error) throw databaseError();
  },
};
