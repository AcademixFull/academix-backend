import type { AuthError, Session, User } from "@supabase/supabase-js";
import { supabaseAdmin, supabaseAuth } from "../config/supabase";
import { emailConfirmationRedirectUrl, env } from "../config/env";
import { AppError } from "../errors/app-error";
import type {
  SignInInput,
  SignUpInput,
  UpdatePasswordInput,
} from "../schemas/auth.schemas";

export interface AuthUser {
  id: string;
  fullName: string;
  email: string;
  role: "student" | "instructor" | "moderator" | "admin";
}

interface AuthSession {
  user: AuthUser;
  accessToken: string;
  expiresAt: string;
}

function roleName(value: string | undefined): AuthUser["role"] {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "administrador") return "admin";
  if (normalized === "moderador") return "moderator";
  if (normalized === "instructor") return "instructor";
  return "student";
}

function highestRole(
  roles: Array<{ activo: boolean; roles: { nombre: string } | null }> | undefined
): AuthUser["role"] {
  const activeRoles = (roles ?? [])
    .filter((item) => item.activo)
    .map((item) => roleName(item.roles?.nombre));

  if (activeRoles.includes("admin")) return "admin";
  if (activeRoles.includes("moderator")) return "moderator";
  if (activeRoles.includes("instructor")) return "instructor";
  return "student";
}

async function serializeUser(user: User): Promise<AuthUser> {
  if (!user.email) {
    throw new AppError(401, "INVALID_USER", "La cuenta no tiene un correo válido.");
  }

  const { data, error } = await supabaseAdmin
    .from("usuarios")
    .select(
      "nombres, apellido_paterno, apellido_materno, activo, usuarios_roles!fk_usuario_rol_usuario(activo, roles!fk_usuario_rol_rol(nombre))"
    )
    .eq("id_usuario", user.id)
    .maybeSingle();

  const profile = data as
    | {
        nombres: string;
        apellido_paterno: string;
        apellido_materno: string | null;
        activo: boolean;
        usuarios_roles: Array<{ activo: boolean; roles: { nombre: string } | null }>;
      }
    | null;
  if (error) throw new AppError(502, "PROFILE_LOOKUP_FAILED", "No fue posible verificar el estado de la cuenta.");
  if (!profile) {
    throw new AppError(403, "ACCOUNT_UNAVAILABLE", "La cuenta ya no está disponible.");
  }
  if (profile && !profile.activo) {
    throw new AppError(403, "ACCOUNT_INACTIVE", "Tu cuenta está desactivada. Contacta a un administrador de Academix.");
  }

  const storedName = profile
    ? [profile.nombres, profile.apellido_paterno, profile.apellido_materno]
        .filter(Boolean)
        .join(" ")
        .trim()
    : "";

  return {
    id: user.id,
    fullName: storedName || String(user.user_metadata.full_name ?? user.email.split("@")[0]),
    email: user.email,
    role: highestRole(profile?.usuarios_roles),
  };
}

async function serializeSession(session: Session): Promise<AuthSession> {
  if (!session.expires_at) {
    throw new AppError(502, "AUTH_PROVIDER_ERROR", "Supabase no devolvió la expiración de la sesión.");
  }

  return {
    user: await serializeUser(session.user),
    accessToken: session.access_token,
    expiresAt: new Date(session.expires_at * 1000).toISOString(),
  };
}

function authFailure(error: AuthError): AppError {
  if (error.status === 429) {
    return new AppError(429, "AUTH_RATE_LIMITED", "Demasiados intentos. Intenta de nuevo más tarde.");
  }

  if (error.status === 400 || error.status === 401) {
    return new AppError(401, "INVALID_CREDENTIALS", "Correo o contraseña incorrectos.");
  }

  return new AppError(502, "AUTH_PROVIDER_ERROR", "No fue posible completar la autenticación.");
}

export const authService = {
  async signUp(input: SignUpInput) {
    const { data, error } = await supabaseAuth.auth.signUp({
      email: input.email,
      password: input.password,
      options: {
        emailRedirectTo: emailConfirmationRedirectUrl,
        data: {
          full_name: input.fullName,
        },
      },
    });

    if (error) throw authFailure(error);
    if (!data.user) throw new AppError(502, "AUTH_PROVIDER_ERROR", "No fue posible crear la cuenta.");

    if (!data.session) {
      throw new AppError(
        403,
        "EMAIL_CONFIRMATION_REQUIRED",
        "Revisa tu correo y confirma tu cuenta antes de iniciar sesión."
      );
    }

    return serializeSession(data.session);
  },

  async signIn(input: SignInInput) {
    const { data, error } = await supabaseAuth.auth.signInWithPassword(input);

    if (error) throw authFailure(error);

    return serializeSession(data.session);
  },

  async verifyAccessToken(accessToken: string): Promise<AuthUser> {
    const { data, error } = await supabaseAuth.auth.getUser(accessToken);

    if (error || !data.user) {
      throw new AppError(401, "INVALID_ACCESS_TOKEN", "La sesión no es válida o expiró.");
    }

    return serializeUser(data.user);
  },

  async signOut(accessToken: string): Promise<void> {
    const { error } = await supabaseAdmin.auth.admin.signOut(accessToken, "local");

    if (error && error.status !== 401 && error.status !== 403 && error.status !== 404) {
      throw authFailure(error);
    }
  },

  async requestPasswordReset(email: string): Promise<void> {
    const { error } = await supabaseAuth.auth.resetPasswordForEmail(email, {
      redirectTo: env.PASSWORD_RESET_REDIRECT_URL,
    });
    if (error?.status === 429) throw authFailure(error);
    if (error) {
      throw new AppError(502, "AUTH_PROVIDER_ERROR", "No fue posible solicitar la recuperación.");
    }

    // La respuesta es deliberadamente neutra para no revelar si la cuenta existe.
  },

  async updatePassword(
    userId: string,
    accessToken: string,
    input: UpdatePasswordInput
  ): Promise<void> {
    const { error: signOutError } = await supabaseAdmin.auth.admin.signOut(
      accessToken,
      "global"
    );
    if (signOutError && ![401, 403, 404].includes(signOutError.status ?? 0)) {
      throw new AppError(
        502,
        "SESSION_REVOCATION_FAILED",
        "No fue posible cerrar las sesiones. La contraseña no se modificó."
      );
    }

    const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      password: input.password,
    });
    if (error?.status === 422) {
      throw new AppError(
        422,
        "PASSWORD_REJECTED",
        "La contraseña no cumple los requisitos de seguridad."
      );
    }
    if (error) {
      throw new AppError(
        502,
        "AUTH_PROVIDER_ERROR",
        "No fue posible actualizar la contraseña."
      );
    }

  },
};
