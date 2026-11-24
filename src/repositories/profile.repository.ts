import { supabaseAdmin } from "../config/supabase";
import { AppError } from "../errors/app-error";
import type { UpdateProfileFields } from "../types/profile.types";

export interface ProfileRecord {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  country: string;
  bio: string;
}

export interface ProfileRepository {
  findById(userId: string): Promise<ProfileRecord | null>;
  update(userId: string, fields: UpdateProfileFields): Promise<ProfileRecord | null>;
}

interface ProfileRow {
  id_usuario: string;
  nombres: string;
  apellido_paterno: string;
  apellido_materno: string | null;
  correo: string;
  telefono: string | null;
  pais: string | null;
  biografia: string | null;
}

const PROFILE_COLUMNS =
  "id_usuario,nombres,apellido_paterno,apellido_materno,correo,telefono,pais,biografia";

function databaseFailure(): AppError {
  return new AppError(502, "DATABASE_ERROR", "No fue posible consultar el perfil.");
}

function serialize(row: ProfileRow): ProfileRecord {
  return {
    id: row.id_usuario,
    fullName: [row.nombres, row.apellido_paterno, row.apellido_materno]
      .filter(Boolean)
      .join(" ")
      .trim(),
    email: row.correo,
    phone: row.telefono ?? "",
    country: row.pais ?? "",
    bio: row.biografia ?? "",
  };
}

export const profileRepository: ProfileRepository = {
  async findById(userId) {
    const { data, error } = await supabaseAdmin
      .from("usuarios")
      .select(PROFILE_COLUMNS)
      .eq("id_usuario", userId)
      .eq("activo", true)
      .maybeSingle();

    if (error) throw databaseFailure();
    return data ? serialize(data as unknown as ProfileRow) : null;
  },

  async update(userId, fields) {
    const values: Record<string, string | null> = {
      fecha_actualizacion: new Date().toISOString(),
    };
    if (fields.fullName !== undefined) {
      values.nombres = fields.fullName;
      values.apellido_paterno = "";
      values.apellido_materno = null;
    }
    if (fields.phone !== undefined) values.telefono = fields.phone || null;
    if (fields.country !== undefined) values.pais = fields.country || null;
    if (fields.bio !== undefined) values.biografia = fields.bio || null;

    const { data, error } = await supabaseAdmin
      .from("usuarios")
      .update(values)
      .eq("id_usuario", userId)
      .eq("activo", true)
      .select(PROFILE_COLUMNS)
      .maybeSingle();

    if (error) throw databaseFailure();
    return data ? serialize(data as unknown as ProfileRow) : null;
  },
};
