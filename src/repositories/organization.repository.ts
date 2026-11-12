import { supabaseAdmin } from "../config/supabase";
import { AppError } from "../errors/app-error";
import { subscriptionFailure } from "./subscription.repository";
import type { OrganizationMemberListQuery, OrganizationCourseListQuery } from "../schemas/organization.schemas";
import type { CreateOrganizationInput } from "../schemas/organization.schemas";
import type {
  OrganizationCourseSummary,
  OrganizationMember,
  OrganizationRole,
  OrganizationSummary,
  OrganizationType,
} from "../types/organization.types";

interface MembershipRow {
  fk_organizacion: string;
  fk_usuario: string;
  matricula: string | null;
  rol: string;
  activo: boolean;
  fecha_union: string;
}

interface OrganizationRow {
  id_organizacion: string;
  nombre: string;
  slug: string;
  descripcion: string | null;
  tipo: string;
  codigo_union: string;
  activa: boolean;
  fecha_creacion: string;
  creada_por: string | null;
  fk_usuario: string;
  matricula: string | null;
  rol: string;
  activo: boolean;
  fecha_union: string;
  member_count: number;
  paid_active: boolean;
  subscription_start: string | null;
  subscription_end: string | null;
}

interface MemberUserRow {
  id_usuario: string;
  nombres: string;
  apellido_paterno: string;
  apellido_materno: string | null;
  correo: string;
}

interface OrganizationCourseRow {
  id_curso: string;
  titulo: string;
  activo: boolean;
  fecha_actualizacion: string;
  fk_estado_curso: number;
}

interface CourseAssignmentRow {
  fk_curso: string;
  fk_usuario: string;
}

function roleFromDatabase(value: string): OrganizationRole {
  const normalized = value.trim().toLowerCase();
  if (normalized === "administrador") return "administrator";
  if (normalized === "instructor") return "instructor";
  return "student";
}

function roleToDatabase(value: OrganizationRole): string {
  if (value === "administrator") return "Administrador";
  if (value === "instructor") return "Instructor";
  return "Estudiante";
}

function typeFromDatabase(value: string): OrganizationType {
  const normalized = value.trim().toLowerCase();
  if (normalized === "universidad") return "university";
  if (normalized === "empresa") return "company";
  return "other";
}

function typeToDatabase(value: OrganizationType): string {
  if (value === "university") return "Universidad";
  if (value === "company") return "Empresa";
  return "Otra";
}

function workflowStatus(value: string | undefined): OrganizationCourseSummary["status"] {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "en revisión") return "review";
  if (normalized === "publicado") return "published";
  if (normalized === "archivado") return "archived";
  if (normalized === "dado de baja por moderación") return "moderated";
  return "draft";
}

function fullName(user: MemberUserRow): string {
  return [user.nombres, user.apellido_paterno, user.apellido_materno]
    .filter(Boolean)
    .join(" ")
    .trim();
}

function databaseError(error?: { code?: string; message?: string }): AppError {
  const custom: Record<string, [number, string, string]> = {
    ORGANIZATION_ADMIN_REQUIRED: [403, "ORGANIZATION_ADMIN_REQUIRED", "Se requiere administrar esta organización."],
    LAST_ORGANIZATION_ADMIN: [409, "LAST_ORGANIZATION_ADMIN", "La organización debe conservar al menos un administrador."],
    COURSE_NOT_FOUND: [404, "COURSE_NOT_FOUND", "El curso no pertenece a esta organización o no está disponible."],
    ORGANIZATION_INSTRUCTOR_REQUIRED: [403, "ORGANIZATION_INSTRUCTOR_REQUIRED", "Selecciona un instructor activo de esta institución."],
    MEMBER_NOT_FOUND: [404, "MEMBER_NOT_FOUND", "El miembro no existe en esta organización."],
    USER_NOT_FOUND: [404, "USER_NOT_FOUND", "El usuario solicitado no existe."],
    ORGANIZATION_NOT_FOUND: [404, "ORGANIZATION_NOT_FOUND", "La organización no existe."],
    ORGANIZATION_ALREADY_MEMBER: [409, "ORGANIZATION_ALREADY_MEMBER", "Ya perteneces a esta organización."],
    INVALID_STUDENT_NUMBER: [422, "INVALID_STUDENT_NUMBER", "Debes indicar una matrícula válida."],
    STUDENT_NUMBER_ALREADY_USED: [409, "STUDENT_NUMBER_ALREADY_USED", "Esa matrícula ya está vinculada a otro usuario de la organización."],
  };
  const mapped = error?.message ? custom[error.message] : undefined;
  if (mapped) return new AppError(mapped[0], mapped[1], mapped[2]);
  if (error?.code === "23505") {
    return new AppError(409, "DUPLICATE_RECORD", "Ya existe una organización con esos datos.");
  }
  return new AppError(502, "DATABASE_ERROR", "No fue posible consultar la organización.");
}

export interface OrganizationRepository {
  remove(organizationId: string, userId: string): Promise<void>;
  assertPaid(organizationId: string): Promise<void>;
  listForUser(userId: string): Promise<OrganizationSummary[]>;
  create(input: CreateOrganizationInput & { slug: string }, userId: string): Promise<string>;
  join(userId: string, joinCode: string, studentNumber: string): Promise<string>;
  findMembership(organizationId: string, userId: string): Promise<MembershipRow | null>;
  listMembers(organizationId: string, input: OrganizationMemberListQuery & { userId?: string }): Promise<{ records: OrganizationMember[]; total: number }>;
  setMemberRole(organizationId: string, userId: string, role: OrganizationRole, actorId: string): Promise<void>;
  countAdministrators(organizationId: string): Promise<number>;
  assignInstructor(organizationId: string, courseId: string, instructorId: string, actorId: string): Promise<void>;
  listCourses(organizationId: string, input: OrganizationCourseListQuery): Promise<{ records: OrganizationCourseSummary[]; total: number }>;
}

export const organizationRepository: OrganizationRepository = {
  async remove(organizationId, userId) {
    const { error } = await supabaseAdmin.rpc("academix_delete_organization", { p_organization_id: organizationId, p_actor_user: userId });
    if (error) throw subscriptionFailure(error);
  },
  async assertPaid(organizationId) {
    const { data, error } = await supabaseAdmin.rpc("academix_organization_has_subscription", { p_organization_id: organizationId });
    if (error) throw subscriptionFailure(error);
    if (!data) throw subscriptionFailure({ message: "ORGANIZATION_SUBSCRIPTION_REQUIRED" });
  },
  async listForUser(userId) {
    const { data, error } = await supabaseAdmin
      .from("academix_organization_access")
      .select("*")
      .eq("fk_usuario", userId)
      .order("fecha_union", { ascending: true });
    if (error) throw databaseError(error);
    return ((data ?? []) as OrganizationRow[]).map((organization) => {
      const role = roleFromDatabase(organization.rol);
      const isOwner = organization.creada_por === userId;
      return {
        id: organization.id_organizacion,
        name: organization.nombre,
        slug: organization.slug,
        description: organization.descripcion ?? "",
        type: typeFromDatabase(organization.tipo),
        role,
        memberCount: organization.member_count,
        joinCode: role === "administrator" ? organization.codigo_union : null,
        createdAt: organization.fecha_creacion,
        ownerId: organization.creada_por ?? undefined,
        isOwner,
        active: organization.activa,
        subscription: { active: organization.paid_active, startsAt: organization.subscription_start, endsAt: organization.subscription_end },
        capabilities: { canDelete: isOwner && role === "administrator", canManageMembers: role === "administrator" && organization.activa, canManageCourses: organization.paid_active && role !== "student", canLearn: organization.paid_active },
      };
    });
  },

  async create(input, userId) {
    const { data, error } = await supabaseAdmin.rpc("academix_create_organization", {
      p_user_id: userId,
      p_name: input.name,
      p_slug: input.slug,
      p_description: input.description,
      p_type: typeToDatabase(input.type),
    });
    if (error) throw databaseError(error);
    if (typeof data !== "string") throw databaseError();
    return data;
  },

  async join(userId, joinCode, studentNumber) {
    const { data, error } = await supabaseAdmin.rpc("academix_join_organization", {
      p_user_id: userId,
      p_join_code: joinCode,
      p_student_number: studentNumber,
    });
    if (error) throw databaseError(error);
    if (typeof data !== "string") throw databaseError();
    return data;
  },

  async findMembership(organizationId, userId) {
    const { data, error } = await supabaseAdmin
      .from("miembros_organizacion")
      .select("fk_organizacion,fk_usuario,matricula,rol,activo,fecha_union")
      .eq("fk_organizacion", organizationId)
      .eq("fk_usuario", userId)
      .eq("activo", true)
      .maybeSingle();
    if (error) throw databaseError(error);
    return (data as MembershipRow | null) ?? null;
  },

  async listMembers(organizationId, input) {
    const sortColumn = { name: "nombres", email: "correo", joinedAt: "fecha_union" }[input.sort ?? "joinedAt"];
    let query = supabaseAdmin.from("academix_organization_members").select("*", { count: "exact" }).eq("fk_organizacion", organizationId).order(sortColumn, { ascending: input.direction !== "desc" }).order("fk_usuario");
    if (input.role) query = query.eq("rol", roleToDatabase(input.role));
    if (input.active !== undefined) query = query.eq("activo", input.active);
    if (input.userId) query = query.eq("fk_usuario", input.userId);
    if (input.search) {
      const pattern = `%${input.search.replace(/[%_,()."\\]/g, " ")}%`;
      query = query.or(`nombres.ilike."${pattern}",apellido_paterno.ilike."${pattern}",correo.ilike."${pattern}",matricula.ilike."${pattern}"`);
    }
    const offset = (input.page - 1) * input.limit;
    const { data, error, count } = await query.range(offset, offset + input.limit - 1);
    if (error) throw databaseError(error);
    return { records: (data ?? []).map((row) => ({ userId: String(row.fk_usuario), fullName: fullName(row as unknown as MemberUserRow), email: String(row.correo), studentNumber: row.matricula ? String(row.matricula) : null, role: roleFromDatabase(String(row.rol)), active: Boolean(row.activo), joinedAt: String(row.fecha_union) })), total: count ?? 0 };
  },

  async setMemberRole(organizationId, userId, role, actorId) {
    const { error } = await supabaseAdmin.rpc("academix_set_organization_member_role", { p_organization_id: organizationId, p_target_user: userId, p_role: roleToDatabase(role), p_actor_user: actorId });
    if (error) throw databaseError(error);
  },

  async assignInstructor(organizationId, courseId, instructorId, actorId) {
    const { error } = await supabaseAdmin.rpc("academix_assign_organization_instructor", { p_organization_id: organizationId, p_course_id: courseId, p_instructor_user: instructorId, p_actor_user: actorId });
    if (error) throw databaseError(error);
  },

  async countAdministrators(organizationId) {
    const { count, error } = await supabaseAdmin
      .from("miembros_organizacion")
      .select("id_miembro", { count: "exact", head: true })
      .eq("fk_organizacion", organizationId)
      .eq("rol", "Administrador")
      .eq("activo", true);
    if (error) throw databaseError(error);
    return count ?? 0;
  },

  async listCourses(organizationId, input) {
    let query = supabaseAdmin
      .from("cursos")
      .select("id_curso,titulo,activo,fecha_actualizacion,fk_estado_curso", { count: "exact" })
      .eq("fk_organizacion", organizationId)
      .order("fecha_actualizacion", { ascending: false }).order("id_curso");
    if (input.search) query = query.ilike("titulo", `%${input.search.replace(/[%_]/g, " ")}%`);
    if (input.status) {
      const names = { draft: "Borrador", review: "En revisión", published: "Publicado", archived: "Archivado", moderated: "Dado de baja por moderación" };
      const { data: state, error: stateError } = await supabaseAdmin.from("estados_curso").select("id_estado_curso").eq("nombre", names[input.status]).maybeSingle();
      if (stateError) throw databaseError(stateError);
      if (!state) return { records: [], total: 0 };
      query = query.eq("fk_estado_curso", state.id_estado_curso);
    }
    const offset = (input.page - 1) * input.limit;
    const { data, error, count } = await query.range(offset, offset + input.limit - 1);
    if (error) throw databaseError(error);
    const courses = (data ?? []) as OrganizationCourseRow[];
    if (courses.length === 0) return { records: [], total: count ?? 0 };

    const courseIds = courses.map((course) => course.id_curso);
    const stateIds = [...new Set(courses.map((course) => course.fk_estado_curso))];
    const [statesResult, assignmentsResult] = await Promise.all([
      supabaseAdmin.from("estados_curso").select("id_estado_curso,nombre").in("id_estado_curso", stateIds),
      supabaseAdmin
        .from("cursos_instructores")
        .select("fk_curso,fk_usuario")
        .in("fk_curso", courseIds)
        .eq("activo", true)
        .eq("instructor_principal", true),
    ]);
    if (statesResult.error) throw databaseError(statesResult.error);
    if (assignmentsResult.error) throw databaseError(assignmentsResult.error);
    const states = new Map(
      ((statesResult.data ?? []) as Array<{ id_estado_curso: number; nombre: string }>).map((state) => [state.id_estado_curso, state.nombre])
    );
    const assignments = (assignmentsResult.data ?? []) as CourseAssignmentRow[];
    const userIds = [...new Set(assignments.map((assignment) => assignment.fk_usuario))];
    const usersResult = userIds.length
      ? await supabaseAdmin
          .from("usuarios")
          .select("id_usuario,nombres,apellido_paterno,apellido_materno,correo")
          .in("id_usuario", userIds)
      : { data: [], error: null };
    if (usersResult.error) throw databaseError(usersResult.error);
    const users = new Map(
      ((usersResult.data ?? []) as MemberUserRow[]).map((user) => [user.id_usuario, user])
    );
    const assignmentByCourse = new Map(assignments.map((assignment) => [assignment.fk_curso, assignment.fk_usuario]));

    return { records: courses.map((course) => {
      const instructorId = assignmentByCourse.get(course.id_curso);
      const instructor = instructorId ? users.get(instructorId) : undefined;
      return {
        id: course.id_curso,
        title: course.titulo,
        status: workflowStatus(states.get(course.fk_estado_curso)),
        active: course.activo,
        instructor: instructor ? { id: instructor.id_usuario, name: fullName(instructor) } : null,
        updatedAt: course.fecha_actualizacion,
      };
    }), total: count ?? 0 };
  },

};

export const organizationRoleNames = { roleFromDatabase, roleToDatabase };
