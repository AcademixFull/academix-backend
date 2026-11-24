import type { ListQuery } from "../schemas/pagination.schemas";
import { supabaseAdmin } from "../config/supabase";
import { AppError } from "../errors/app-error";
import type {
  CreateCategoryInput,
  CreateCourseInput,
  ManagedCourseListQuery,
  UpdateCategoryInput,
  UpdateCourseInput,
  UserListQuery,
} from "../schemas/administration.schemas";
import type {
  AppRole,
  CourseOptions,
  CourseWorkflowStatus,
  ManagedCourse,
  ManagedInstructor,
  ManagedUser,
} from "../types/administration.types";

interface UserRow {
  id_usuario: string;
  nombres: string;
  apellido_paterno: string;
  apellido_materno: string | null;
  correo: string;
  activo: boolean;
  institutional_organizations?: Array<{ id: string; name: string }>;
}

interface RoleAssignmentRow {
  fk_usuario: string;
  roles: { nombre: string } | null;
}

interface CourseRow {
  id_curso: string;
  slug: string;
  titulo: string;
  descripcion_corta: string | null;
  descripcion: string | null;
  objetivos: string | null;
  requisitos: string | null;
  publico_objetivo: string | null;
  fk_categoria: number;
  fk_nivel: number;
  fk_modalidad: number;
  fk_idioma: number;
  fk_estado_curso: number;
  duracion_estimada_horas: number | string | null;
  cuota_recuperacion: number | string;
  permite_certificado: boolean;
  requiere_aprobacion: boolean;
  visible_destacados: boolean;
  activo: boolean;
  fecha_publicacion: string | null;
  fecha_creacion: string;
  fecha_actualizacion: string;
  fk_organizacion: string | null;
}

interface CourseAssignmentRow {
  fk_curso: string;
  fk_usuario: string;
}

export interface ManagedCategory {
  id: number;
  name: string;
  slug: string;
  description: string;
  active: boolean;
}

export interface AdministrationRepository {
  listUsers(input: UserListQuery): Promise<{ records: ManagedUser[]; total: number }>;
  setUserRoles(targetUserId: string, roleNames: string[], actorUserId: string): Promise<void>;
  setUserActive(targetUserId: string, active: boolean, actorUserId: string): Promise<ManagedUser | null>;
  hasAnotherActiveAdmin(targetUserId: string): Promise<boolean>;
  findUser(userId: string): Promise<ManagedUser | null>;
  listInstructors(input: ListQuery): Promise<{ records: ManagedInstructor[]; total: number }>;
  upsertInstructor(
    targetUserId: string,
    specialty: string,
    experienceYears: number,
    actorUserId: string
  ): Promise<void>;
  findInstructor(userId: string): Promise<ManagedInstructor | null>;
  listCategories(input: ListQuery): Promise<{ records: ManagedCategory[]; total: number }>;
  createCategory(input: CreateCategoryInput & { slug: string }, actorUserId: string): Promise<ManagedCategory>;
  updateCategory(
    categoryId: number,
    input: UpdateCategoryInput,
    actorUserId: string
  ): Promise<ManagedCategory | null>;
  courseOptions(): Promise<CourseOptions>;
  listCourses(
    input: ManagedCourseListQuery,
    instructorId?: string
  ): Promise<{ records: ManagedCourse[]; total: number }>;
  findCourse(courseId: string): Promise<ManagedCourse | null>;
  createCourse(
    input: CreateCourseInput & { slug: string },
    actorUserId: string
  ): Promise<ManagedCourse>;
  updateCourse(
    courseId: string,
    input: UpdateCourseInput,
    actorUserId: string
  ): Promise<ManagedCourse | null>;
  assignPrincipalInstructor(
    courseId: string,
    instructorId: string,
    actorUserId: string
  ): Promise<void>;
  assignCourseCreator(courseId: string, instructorId: string): Promise<void>;
  isInstructorAssigned(courseId: string, instructorId: string): Promise<boolean>;
  courseContentStats(courseId: string): Promise<{ modules: number; lessons: number }>;
  transitionCourse(
    courseId: string,
    currentStatus: CourseWorkflowStatus,
    nextStatus: CourseWorkflowStatus,
    actorUserId: string
  ): Promise<ManagedCourse | null>;
}

const COURSE_COLUMNS = [
  "id_curso",
  "slug",
  "titulo",
  "descripcion_corta",
  "descripcion",
  "objetivos",
  "requisitos",
  "publico_objetivo",
  "fk_categoria",
  "fk_nivel",
  "fk_modalidad",
  "fk_idioma",
  "fk_estado_curso",
  "duracion_estimada_horas",
  "cuota_recuperacion",
  "permite_certificado",
  "requiere_aprobacion",
  "visible_destacados",
  "activo",
  "fecha_publicacion",
  "fecha_creacion",
  "fecha_actualizacion",
  "fk_organizacion",
].join(",");

const roleToDatabase: Record<AppRole, string> = {
  student: "Alumno",
  instructor: "Instructor",
  moderator: "Moderador",
  admin: "Administrador",
};

const statusToDatabase: Record<CourseWorkflowStatus, string> = {
  draft: "Borrador",
  review: "En revisión",
  published: "Publicado",
  archived: "Archivado",
  moderated: "Dado de baja por moderación",
};

const levelToDatabase = {
  beginner: "Básico",
  intermediate: "Intermedio",
  advanced: "Avanzado",
} as const;

const modalityToDatabase = {
  self_paced: "Autogestivo",
  live: "En vivo",
  blended: "Mixto",
} as const;

function databaseRole(name: string | undefined): AppRole {
  const normalized = name?.trim().toLowerCase();
  if (normalized === "administrador") return "admin";
  if (normalized === "moderador") return "moderator";
  if (normalized === "instructor") return "instructor";
  return "student";
}

function workflowStatus(name: string | undefined): CourseWorkflowStatus {
  const normalized = name?.trim().toLowerCase();
  if (normalized === "en revisión") return "review";
  if (normalized === "publicado") return "published";
  if (normalized === "archivado") return "archived";
  if (normalized === "dado de baja por moderación") return "moderated";
  return "draft";
}

function courseLevel(name: string | undefined): ManagedCourse["level"] {
  const normalized = name?.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
  if (normalized === "avanzado") return "advanced";
  if (normalized === "intermedio") return "intermediate";
  return "beginner";
}

function courseModality(name: string | undefined): ManagedCourse["modality"] {
  const normalized = name?.trim().toLowerCase();
  if (normalized === "en vivo") return "live";
  if (normalized === "mixto") return "blended";
  return "self_paced";
}

function textList(value: string | null): string[] {
  if (!value) return [];
  return value
    .split(/\r?\n|;/)
    .map((item) => item.trim().replace(/^[-â€¢]\s*/, ""))
    .filter(Boolean);
}

function fullName(user: UserRow): string {
  return [user.nombres, user.apellido_paterno, user.apellido_materno]
    .filter(Boolean)
    .join(" ")
    .trim();
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function searchPattern(value: string): string {
  return `%${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}%`;
}

function mappedDatabaseError(error: { code?: string; message?: string }): AppError {
  if (error.code === "23505") {
    return new AppError(409, "DUPLICATE_RECORD", "Ya existe un registro con esos datos.");
  }
  if (error.code === "23503") {
    return new AppError(422, "INVALID_RELATION", "Una de las relaciones indicadas no existe.");
  }

  const customErrors: Record<string, [number, string, string]> = {
    ADMIN_REQUIRED: [403, "ROLE_FORBIDDEN", "Se requiere el rol Administrador."],
    USER_NOT_FOUND: [404, "USER_NOT_FOUND", "El usuario solicitado no existe."],
    COURSE_NOT_FOUND: [404, "COURSE_NOT_FOUND", "El curso solicitado no existe."],
    INSTRUCTOR_NOT_FOUND: [404, "INSTRUCTOR_NOT_FOUND", "El instructor solicitado no existe."],
    LAST_ADMIN_REQUIRED: [409, "LAST_ADMIN_REQUIRED", "No puedes retirar al último administrador."],
    INSTRUCTOR_PROFILE_REQUIRED: [
      422,
      "INSTRUCTOR_PROFILE_REQUIRED",
      "Debes crear primero el perfil de instructor.",
    ],
    AT_LEAST_ONE_ROLE_REQUIRED: [422, "ROLE_REQUIRED", "El usuario debe conservar al menos un rol."],
    INVALID_ROLE: [422, "INVALID_ROLE", "Uno de los roles no es válido."],
    CANNOT_DEACTIVATE_SELF: [409, "CANNOT_DEACTIVATE_SELF", "No puedes desactivar tu propia cuenta administrativa."],
    ACCOUNT_DELETION_IN_PROGRESS: [409, "ACCOUNT_DELETION_IN_PROGRESS", "La cuenta está en proceso de eliminación y no se puede reactivar."],
  };
  const mapped = error.message ? customErrors[error.message] : undefined;
  if (mapped) return new AppError(mapped[0], mapped[1], mapped[2]);

  return new AppError(502, "DATABASE_ERROR", "No fue posible completar la operación administrativa.");
}

async function activeLookupId(
  table: string,
  idColumn: string,
  nameColumn: string,
  value: string
): Promise<number> {
  const { data, error } = await supabaseAdmin
    .from(table)
    .select(idColumn)
    .eq(nameColumn, value)
    .eq("activo", true)
    .maybeSingle();

  if (error) throw mappedDatabaseError(error);
  if (!data) {
    throw new AppError(422, "INVALID_COURSE_OPTION", "Una opciÃƒÂ³n del curso no estÃƒ¡ disponible.");
  }
  return Number((data as unknown as Record<string, number>)[idColumn]);
}

async function courseForeignKeys(input: {
  categoryId?: number;
  level?: keyof typeof levelToDatabase;
  modality?: keyof typeof modalityToDatabase;
  language?: string;
  status?: CourseWorkflowStatus;
}) {
  const result: Record<string, number> = {};

  if (input.categoryId !== undefined) {
    const { data, error } = await supabaseAdmin
      .from("categorias")
      .select("id_categoria")
      .eq("id_categoria", input.categoryId)
      .eq("activo", true)
      .maybeSingle();
    if (error) throw mappedDatabaseError(error);
    if (!data) throw new AppError(422, "INVALID_CATEGORY", "La categorÃƒÂ­a no estÃƒ¡ disponible.");
    result.fk_categoria = input.categoryId;
  }

  const lookups: Array<Promise<void>> = [];
  if (input.level !== undefined) {
    lookups.push(
      activeLookupId("niveles", "id_nivel", "nombre", levelToDatabase[input.level]).then((id) => {
        result.fk_nivel = id;
      })
    );
  }
  if (input.modality !== undefined) {
    lookups.push(
      activeLookupId(
        "modalidades",
        "id_modalidad",
        "nombre",
        modalityToDatabase[input.modality]
      ).then((id) => {
        result.fk_modalidad = id;
      })
    );
  }
  if (input.language !== undefined) {
    lookups.push(
      activeLookupId("idiomas", "id_idioma", "codigo_iso", input.language).then((id) => {
        result.fk_idioma = id;
      })
    );
  }
  if (input.status !== undefined) {
    lookups.push(
      activeLookupId(
        "estados_curso",
        "id_estado_curso",
        "nombre",
        statusToDatabase[input.status]
      ).then((id) => {
        result.fk_estado_curso = id;
      })
    );
  }

  await Promise.all(lookups);
  return result;
}

async function rolesByUsers(userIds: string[]): Promise<Map<string, AppRole[]>> {
  if (userIds.length === 0) return new Map();
  const { data, error } = await supabaseAdmin
    .from("usuarios_roles")
    .select("fk_usuario,roles!fk_usuario_rol_rol(nombre)")
    .in("fk_usuario", userIds)
    .eq("activo", true);
  if (error) throw mappedDatabaseError(error);

  const map = new Map<string, AppRole[]>();
  for (const assignment of (data ?? []) as unknown as RoleAssignmentRow[]) {
    const roles = map.get(assignment.fk_usuario) ?? [];
    const role = databaseRole(assignment.roles?.nombre);
    if (!roles.includes(role)) roles.push(role);
    map.set(assignment.fk_usuario, roles);
  }
  return map;
}

async function hydrateCourses(rows: CourseRow[]): Promise<ManagedCourse[]> {
  if (rows.length === 0) return [];

  const levelIds = unique(rows.map((row) => row.fk_nivel));
  const modalityIds = unique(rows.map((row) => row.fk_modalidad));
  const languageIds = unique(rows.map((row) => row.fk_idioma));
  const statusIds = unique(rows.map((row) => row.fk_estado_curso));
  const courseIds = rows.map((row) => row.id_curso);
  const organizationIds = unique(
    rows.map((row) => row.fk_organizacion).filter((id): id is string => Boolean(id))
  );

  const [levelsResult, modalitiesResult, languagesResult, statusesResult, assignmentsResult, organizationsResult] =
    await Promise.all([
      supabaseAdmin.from("niveles").select("id_nivel,nombre").in("id_nivel", levelIds),
      supabaseAdmin
        .from("modalidades")
        .select("id_modalidad,nombre")
        .in("id_modalidad", modalityIds),
      supabaseAdmin.from("idiomas").select("id_idioma,nombre,codigo_iso").in("id_idioma", languageIds),
      supabaseAdmin
        .from("estados_curso")
        .select("id_estado_curso,nombre")
        .in("id_estado_curso", statusIds),
      supabaseAdmin
        .from("cursos_instructores")
        .select("fk_curso,fk_usuario")
        .in("fk_curso", courseIds)
        .eq("activo", true)
        .eq("instructor_principal", true),
      organizationIds.length
        ? supabaseAdmin.from("organizaciones").select("id_organizacion,nombre").in("id_organizacion", organizationIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

  const results = [levelsResult, modalitiesResult, languagesResult, statusesResult, assignmentsResult, organizationsResult];
  const failed = results.find((result) => result.error)?.error;
  if (failed) throw mappedDatabaseError(failed);

  const assignments = (assignmentsResult.data ?? []) as CourseAssignmentRow[];
  const instructorIds = unique(assignments.map((row) => row.fk_usuario));
  const usersResult = instructorIds.length
    ? await supabaseAdmin
        .from("usuarios")
        .select("id_usuario,nombres,apellido_paterno,apellido_materno,correo,activo")
        .in("id_usuario", instructorIds)
    : { data: [], error: null };
  if (usersResult.error) throw mappedDatabaseError(usersResult.error);

  const levels = new Map(
    ((levelsResult.data ?? []) as Array<{ id_nivel: number; nombre: string }>).map((row) => [
      row.id_nivel,
      row.nombre,
    ])
  );
  const modalities = new Map(
    ((modalitiesResult.data ?? []) as Array<{ id_modalidad: number; nombre: string }>).map((row) => [
      row.id_modalidad,
      row.nombre,
    ])
  );
  const languages = new Map(
    ((languagesResult.data ?? []) as Array<{ id_idioma: number; codigo_iso: string | null }>).map(
      (row) => [row.id_idioma, row.codigo_iso ?? "es"]
    )
  );
  const statuses = new Map(
    ((statusesResult.data ?? []) as Array<{ id_estado_curso: number; nombre: string }>).map((row) => [
      row.id_estado_curso,
      row.nombre,
    ])
  );
  const assignmentByCourse = new Map(assignments.map((row) => [row.fk_curso, row.fk_usuario]));
  const organizations = new Map(
    ((organizationsResult.data ?? []) as Array<{ id_organizacion: string; nombre: string }>).map(
      (row) => [row.id_organizacion, row.nombre]
    )
  );
  const users = new Map(
    ((usersResult.data ?? []) as unknown as UserRow[]).map((row) => [row.id_usuario, row])
  );

  return rows.map((row) => {
    const instructorId = assignmentByCourse.get(row.id_curso);
    const instructor = instructorId ? users.get(instructorId) : undefined;
    return {
      id: row.id_curso,
      slug: row.slug,
      title: row.titulo,
      shortDescription: row.descripcion_corta ?? "",
      description: row.descripcion ?? "",
      learningOutcomes: textList(row.objetivos),
      requirements: textList(row.requisitos),
      targetAudience: row.publico_objetivo ?? "",
      categoryId: row.fk_categoria,
      level: courseLevel(levels.get(row.fk_nivel)),
      modality: courseModality(modalities.get(row.fk_modalidad)),
      language: languages.get(row.fk_idioma) ?? "es",
      durationHours:
        row.duracion_estimada_horas === null ? null : Number(row.duracion_estimada_horas),
      price: Number(row.cuota_recuperacion),
      certificateEnabled: row.permite_certificado,
      requiresApproval: row.requiere_aprobacion,
      featuredVisible: row.visible_destacados ?? true,
      organization: row.fk_organizacion
        ? { id: row.fk_organizacion, name: organizations.get(row.fk_organizacion) ?? "Organización" }
        : null,
      status: workflowStatus(statuses.get(row.fk_estado_curso)),
      active: row.activo,
      instructor: instructor ? { id: instructor.id_usuario, name: fullName(instructor) } : null,
      publishedAt: row.fecha_publicacion,
      createdAt: row.fecha_creacion,
      updatedAt: row.fecha_actualizacion,
    };
  });
}

function courseValues(input: CreateCourseInput | UpdateCourseInput) {
  const values: Record<string, string | number | boolean | null> = {};
  if (input.title !== undefined) values.titulo = input.title;
  if (input.slug !== undefined) values.slug = input.slug;
  if (input.shortDescription !== undefined) values.descripcion_corta = input.shortDescription || null;
  if (input.description !== undefined) values.descripcion = input.description || null;
  if (input.learningOutcomes !== undefined) values.objetivos = input.learningOutcomes.join("\n") || null;
  if (input.requirements !== undefined) values.requisitos = input.requirements.join("\n") || null;
  if (input.targetAudience !== undefined) values.publico_objetivo = input.targetAudience || null;
  if (input.durationHours !== undefined) values.duracion_estimada_horas = input.durationHours;
  if (input.price !== undefined) values.cuota_recuperacion = input.price;
  if (input.certificateEnabled !== undefined) values.permite_certificado = input.certificateEnabled;
  if (input.requiresApproval !== undefined) values.requiere_aprobacion = input.requiresApproval;
  if (input.featuredVisible !== undefined) values.visible_destacados = input.featuredVisible;
  return values;
}

export const administrationRepository: AdministrationRepository = {
  async listUsers(input) {
    const sortColumn = { name: "nombres", email: "correo", createdAt: "fecha_creacion" }[input.sort ?? "createdAt"];
    let query = supabaseAdmin
      .from("academix_admin_users")
      .select("id_usuario,nombres,apellido_paterno,apellido_materno,correo,activo,institutional_organizations", { count: "exact" })
      .order(sortColumn, { ascending: input.direction === "asc" }).order("id_usuario");
    if (input.role === "institutional_administrator") query = query.eq("institutional_administrator", true);
    else if (input.role) query = query.contains("role_names", [roleToDatabase[input.role]]);
    if (input.active !== undefined) query = query.eq("activo", input.active);
    if (input.search) {
      const pattern = searchPattern(input.search);
      query = query.or(`nombres.ilike."${pattern}",correo.ilike."${pattern}"`);
    }
    const offset = (input.page - 1) * input.limit;
    const { data, error, count } = await query.range(offset, offset + input.limit - 1);
    if (error) throw mappedDatabaseError(error);

    const users = (data ?? []) as unknown as UserRow[];
    const roles = await rolesByUsers(users.map((user) => user.id_usuario));
    return {
      records: users.map((user) => ({
        id: user.id_usuario,
        fullName: fullName(user),
        email: user.correo,
        active: user.activo,
        roles: roles.get(user.id_usuario) ?? [],
        institutionalOrganizations: user.institutional_organizations ?? [],
      })),
      total: count ?? 0,
    };
  },

  async setUserRoles(targetUserId, roleNames, actorUserId) {
    const { error } = await supabaseAdmin.rpc("academix_set_user_roles", {
      p_target_user: targetUserId,
      p_role_names: roleNames,
      p_actor_user: actorUserId,
    });
    if (error) throw mappedDatabaseError(error);
  },


  async setUserActive(targetUserId, active, actorUserId) {
    const { error: mutationError } = await supabaseAdmin.rpc("academix_set_user_active", { p_target_user: targetUserId, p_active: active, p_actor_user: actorUserId });
    if (mutationError) throw mappedDatabaseError(mutationError);
    const { data, error } = await supabaseAdmin
      .from("usuarios")
      .select("id_usuario,nombres,apellido_paterno,apellido_materno,correo,activo")
      .eq("id_usuario", targetUserId)
      .maybeSingle();
    if (error) throw mappedDatabaseError(error);
    if (!data) return null;
    const user = data as unknown as UserRow;
    const roles = await rolesByUsers([targetUserId]);
    return { id: user.id_usuario, fullName: fullName(user), email: user.correo, active: user.activo, roles: roles.get(targetUserId) ?? [] };
  },

  async hasAnotherActiveAdmin(targetUserId) {
    const { data: role, error: roleError } = await supabaseAdmin
      .from("roles")
      .select("id_rol")
      .eq("nombre", "Administrador")
      .eq("activo", true)
      .maybeSingle();
    if (roleError) throw mappedDatabaseError(roleError);
    if (!role) return false;
    const { data: assignments, error: assignmentError } = await supabaseAdmin
      .from("usuarios_roles")
      .select("fk_usuario")
      .eq("fk_rol", (role as { id_rol: string }).id_rol)
      .eq("activo", true)
      .neq("fk_usuario", targetUserId);
    if (assignmentError) throw mappedDatabaseError(assignmentError);
    const ids = ((assignments ?? []) as Array<{ fk_usuario: string }>).map((row) => row.fk_usuario);
    if (ids.length === 0) return false;
    const { count, error } = await supabaseAdmin
      .from("usuarios")
      .select("id_usuario", { count: "exact", head: true })
      .in("id_usuario", ids)
      .eq("activo", true);
    if (error) throw mappedDatabaseError(error);
    return (count ?? 0) > 0;
  },

  async findUser(userId) {
    const { data, error } = await supabaseAdmin
      .from("usuarios")
      .select("id_usuario,nombres,apellido_paterno,apellido_materno,correo,activo")
      .eq("id_usuario", userId)
      .maybeSingle();
    if (error) throw mappedDatabaseError(error);
    if (!data) return null;
    const user = data as unknown as UserRow;
    const roles = await rolesByUsers([userId]);
    return {
      id: user.id_usuario,
      fullName: fullName(user),
      email: user.correo,
      active: user.activo,
      roles: roles.get(userId) ?? [],
    };
  },

  async listInstructors(input) {
    let query = supabaseAdmin.from("academix_admin_instructors").select("*", { count: "exact" }).order("nombres").order("fk_usuario");
    if (input.active !== undefined) query = query.eq("activo", input.active);
    if (input.search) {
      const pattern = searchPattern(input.search);
      query = query.or(`nombres.ilike."${pattern}",correo.ilike."${pattern}",especialidad.ilike."${pattern}"`);
    }
    const offset = (input.page - 1) * input.limit;
    const { data, count, error } = await query.range(offset, offset + input.limit - 1);
    if (error) throw mappedDatabaseError(error);
    return { records: (data ?? []).map((row) => ({ id: String(row.fk_usuario), fullName: fullName(row as unknown as UserRow), email: String(row.correo), specialty: String(row.especialidad), experienceYears: Number(row.anios_experiencia), active: Boolean(row.activo) })), total: count ?? 0 };
  },

  async upsertInstructor(targetUserId, specialty, experienceYears, actorUserId) {
    const { error } = await supabaseAdmin.rpc("academix_upsert_instructor", {
      p_target_user: targetUserId,
      p_specialty: specialty,
      p_experience_years: experienceYears,
      p_actor_user: actorUserId,
    });
    if (error) throw mappedDatabaseError(error);
  },

  async findInstructor(userId) {
    const { data, error } = await supabaseAdmin.from("academix_admin_instructors").select("*").eq("fk_usuario", userId).maybeSingle();
    if (error) throw mappedDatabaseError(error);
    if (!data) return null;
    return { id: String(data.fk_usuario), fullName: fullName(data as unknown as UserRow), email: String(data.correo), specialty: String(data.especialidad), experienceYears: Number(data.anios_experiencia), active: Boolean(data.activo) };
  },

  async listCategories(input) {
    let query = supabaseAdmin.from("categorias").select("id_categoria,nombre,slug,descripcion,activo", { count: "exact" }).order("nombre").order("id_categoria");
    if (input.active !== undefined) query = query.eq("activo", input.active);
    if (input.search) query = query.ilike("nombre", searchPattern(input.search));
    const offset = (input.page - 1) * input.limit;
    const { data, count, error } = await query.range(offset, offset + input.limit - 1);
    if (error) throw mappedDatabaseError(error);
    return { records: (data ?? []).map((row) => ({ id: Number(row.id_categoria), name: String(row.nombre), slug: String(row.slug), description: String(row.descripcion ?? ""), active: Boolean(row.activo) })), total: count ?? 0 };
  },

  async createCategory(input, actorUserId) {
    const { data, error } = await supabaseAdmin
      .from("categorias")
      .insert({
        nombre: input.name,
        slug: input.slug,
        descripcion: input.description || null,
        activo: true,
        creado_por: actorUserId,
        actualizado_por: actorUserId,
      })
      .select("id_categoria,nombre,slug,descripcion,activo")
      .single();
    if (error) throw mappedDatabaseError(error);
    const row = data as {
      id_categoria: number;
      nombre: string;
      slug: string;
      descripcion: string | null;
      activo: boolean;
    };
    return {
      id: row.id_categoria,
      name: row.nombre,
      slug: row.slug,
      description: row.descripcion ?? "",
      active: row.activo,
    };
  },

  async updateCategory(categoryId, input, actorUserId) {
    const values: Record<string, string | boolean | null> = { actualizado_por: actorUserId };
    if (input.name !== undefined) values.nombre = input.name;
    if (input.slug !== undefined) values.slug = input.slug;
    if (input.description !== undefined) values.descripcion = input.description || null;
    if (input.active !== undefined) values.activo = input.active;

    const { data, error } = await supabaseAdmin
      .from("categorias")
      .update(values)
      .eq("id_categoria", categoryId)
      .select("id_categoria,nombre,slug,descripcion,activo")
      .maybeSingle();
    if (error) throw mappedDatabaseError(error);
    if (!data) return null;
    const row = data as {
      id_categoria: number;
      nombre: string;
      slug: string;
      descripcion: string | null;
      activo: boolean;
    };
    return {
      id: row.id_categoria,
      name: row.nombre,
      slug: row.slug,
      description: row.descripcion ?? "",
      active: row.activo,
    };
  },

  async courseOptions() {
    const [categories, levels, modalities, languages, statuses] = await Promise.all([
      supabaseAdmin.from("categorias").select("id_categoria,nombre,slug").eq("activo", true).order("nombre"),
      supabaseAdmin.from("niveles").select("nombre").eq("activo", true).order("id_nivel"),
      supabaseAdmin.from("modalidades").select("nombre").eq("activo", true).order("id_modalidad"),
      supabaseAdmin.from("idiomas").select("nombre,codigo_iso").eq("activo", true).order("id_idioma"),
      supabaseAdmin
        .from("estados_curso")
        .select("nombre")
        .eq("activo", true)
        .order("id_estado_curso"),
    ]);
    const failed = [categories, levels, modalities, languages, statuses].find(
      (result) => result.error
    )?.error;
    if (failed) throw mappedDatabaseError(failed);

    return {
      categories: ((categories.data ?? []) as Array<{ id_categoria: number; nombre: string; slug: string }>).map(
        (row) => ({ id: row.id_categoria, name: row.nombre, slug: row.slug })
      ),
      levels: ((levels.data ?? []) as Array<{ nombre: string }>).map((row) => ({
        value: courseLevel(row.nombre),
        label: row.nombre,
      })),
      modalities: ((modalities.data ?? []) as Array<{ nombre: string }>).map((row) => ({
        value: courseModality(row.nombre),
        label: row.nombre,
      })),
      languages: ((languages.data ?? []) as Array<{ nombre: string; codigo_iso: string | null }>).map(
        (row) => ({ code: row.codigo_iso ?? "es", name: row.nombre })
      ),
      statuses: ((statuses.data ?? []) as Array<{ nombre: string }>).map((row) => ({
        value: workflowStatus(row.nombre),
        label: row.nombre,
      })),
    };
  },

  async listCourses(input, instructorId) {
    let query = supabaseAdmin
      .from("academix_managed_courses")
      .select(COURSE_COLUMNS, { count: "exact" })
      .order("fecha_actualizacion", { ascending: false }).order("id_curso");
    if (instructorId) query = query.contains("manageable_user_ids", [instructorId]);
    if (input.scope === "external") query = query.is("fk_organizacion", null);
    if (input.scope === "institutional") query = query.not("fk_organizacion", "is", null);
    if (input.organizationId) query = query.eq("fk_organizacion", input.organizationId);
    if (input.status) {
      const stateId = await activeLookupId(
        "estados_curso",
        "id_estado_curso",
        "nombre",
        statusToDatabase[input.status]
      );
      query = query.eq("fk_estado_curso", stateId);
    }
    if (input.search) {
      const pattern = searchPattern(input.search);
      query = query.or(`titulo.ilike."${pattern}",slug.ilike."${pattern}"`);
    }
    const offset = (input.page - 1) * input.limit;
    const { data, error, count } = await query.range(offset, offset + input.limit - 1);
    if (error) throw mappedDatabaseError(error);
    const records = await hydrateCourses((data ?? []) as unknown as CourseRow[]);
    return { records, total: count ?? 0 };
  },

  async findCourse(courseId) {
    const { data, error } = await supabaseAdmin
      .from("cursos")
      .select(COURSE_COLUMNS)
      .eq("id_curso", courseId)
      .maybeSingle();
    if (error) throw mappedDatabaseError(error);
    if (!data) return null;
    return (await hydrateCourses([data as unknown as CourseRow]))[0] ?? null;
  },

  async createCourse(input, actorUserId) {
    const foreignKeys = await courseForeignKeys({
      categoryId: input.categoryId,
      level: input.level,
      modality: input.modality,
      language: input.language,
      status: "draft",
    });
    const { data, error } = await supabaseAdmin
      .from("cursos")
      .insert({
        ...courseValues(input),
        ...foreignKeys,
        fk_organizacion: input.organizationId ?? null,
        slug: input.slug,
        activo: true,
        creado_por: actorUserId,
        actualizado_por: actorUserId,
      })
      .select(COURSE_COLUMNS)
      .single();
    if (error) throw mappedDatabaseError(error);
    return (await hydrateCourses([data as unknown as CourseRow]))[0] as ManagedCourse;
  },

  async updateCourse(courseId, input, actorUserId) {
    const foreignKeys = await courseForeignKeys({
      categoryId: input.categoryId,
      level: input.level,
      modality: input.modality,
      language: input.language,
    });
    const { data, error } = await supabaseAdmin
      .from("cursos")
      .update({ ...courseValues(input), ...foreignKeys, actualizado_por: actorUserId })
      .eq("id_curso", courseId)
      .select(COURSE_COLUMNS)
      .maybeSingle();
    if (error) throw mappedDatabaseError(error);
    if (!data) return null;
    return (await hydrateCourses([data as unknown as CourseRow]))[0] ?? null;
  },

  async assignPrincipalInstructor(courseId, instructorId, actorUserId) {
    const { error } = await supabaseAdmin.rpc("academix_assign_principal_instructor", {
      p_course_id: courseId,
      p_instructor_user: instructorId,
      p_actor_user: actorUserId,
    });
    if (error) throw mappedDatabaseError(error);
  },

  async assignCourseCreator(courseId, instructorId) {
    const { error } = await supabaseAdmin.from("cursos_instructores").insert({
      fk_curso: courseId,
      fk_usuario: instructorId,
      instructor_principal: true,
      activo: true,
      fecha_asignacion: new Date().toISOString(),
      asignado_por: instructorId,
    });
    if (error) throw mappedDatabaseError(error);
  },

  async isInstructorAssigned(courseId, instructorId) {
    const { data, error } = await supabaseAdmin
      .from("cursos_instructores")
      .select("id_curso_instructor")
      .eq("fk_curso", courseId)
      .eq("fk_usuario", instructorId)
      .eq("activo", true)
      .maybeSingle();
    if (error) throw mappedDatabaseError(error);
    return Boolean(data);
  },

  async courseContentStats(courseId) {
    const { data: modulesData, error: modulesError, count: moduleCount } = await supabaseAdmin
      .from("modulos")
      .select("id_modulo", { count: "exact" })
      .eq("fk_curso", courseId)
      .eq("activo", true);
    if (modulesError) throw mappedDatabaseError(modulesError);
    const moduleIds = ((modulesData ?? []) as Array<{ id_modulo: string }>).map(
      (row) => row.id_modulo
    );
    if (moduleIds.length === 0) return { modules: 0, lessons: 0 };
    const { count: lessonCount, error: lessonsError } = await supabaseAdmin
      .from("lecciones")
      .select("id_leccion", { count: "exact", head: true })
      .in("fk_modulo", moduleIds)
      .eq("activo", true);
    if (lessonsError) throw mappedDatabaseError(lessonsError);
    return { modules: moduleCount ?? moduleIds.length, lessons: lessonCount ?? 0 };
  },

  async transitionCourse(courseId, currentStatus, nextStatus, actorUserId) {
    const [currentKeys, nextKeys] = await Promise.all([
      courseForeignKeys({ status: currentStatus }),
      courseForeignKeys({ status: nextStatus }),
    ]);
    const values: Record<string, string | number | boolean | null> = {
      fk_estado_curso: nextKeys.fk_estado_curso as number,
      actualizado_por: actorUserId,
    };
    if (nextStatus === "published") {
      values.fecha_publicacion = new Date().toISOString();
    }
    values.activo = nextStatus !== "archived" && nextStatus !== "moderated";
    if (currentStatus === "archived" && nextStatus === "draft") {
      values.fecha_publicacion = null;
    }

    const { data, error } = await supabaseAdmin
      .from("cursos")
      .update(values)
      .eq("id_curso", courseId)
      .eq("fk_estado_curso", currentKeys.fk_estado_curso as number)
      .select(COURSE_COLUMNS)
      .maybeSingle();
    if (error) throw mappedDatabaseError(error);
    if (!data) return null;
    return (await hydrateCourses([data as unknown as CourseRow]))[0] ?? null;
  },
};

export const databaseRoleNames = roleToDatabase;
