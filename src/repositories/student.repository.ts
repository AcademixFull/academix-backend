import { Readable } from "node:stream";
import { supabaseAdmin } from "../config/supabase";
import { env } from "../config/env";
import { AppError } from "../errors/app-error";
import type { CheckoutInput, CheckoutReceipt } from "../types/checkout.types";
import type { LibraryListQuery } from "../schemas/student.schemas";

interface EnrollmentRow {
  id_inscripcion: string;
  fk_curso: string;
  fecha_inscripcion: string;
  fecha_inicio: string | null;
  fecha_finalizacion: string | null;
  estados_inscripcion: { nombre: string } | null;
}

interface ProgressRow {
  fk_inscripcion: string;
  fk_leccion: string;
  completada: boolean;
  ultima_visualizacion: string | null;
}

interface ModuleRow {
  id_modulo: string;
  fk_curso: string;
  titulo: string;
  orden: number;
}

interface LessonRow {
  id_leccion: string;
  fk_modulo: string;
  titulo: string;
  descripcion: string | null;
  contenido: string | null;
  duracion_estimada_minutos: number | null;
  orden: number;
  vista_previa: boolean;
}

interface ResourceRow {
  id_recurso: string;
  fk_leccion: string;
  titulo: string;
  descripcion: string | null;
  url: string | null;
  obligatorio: boolean;
  orden: number;
  fk_archivo: string | null;
  tipos_recurso: { nombre: string } | null;
}

export interface ProtectedResourceFile {
  courseId: string;
  storagePath: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
}

export interface ProtectedStorageObject {
  stream: Readable;
  status: 200 | 206;
  contentLength: string | null;
  contentRange: string | null;
}

export interface StudentEnrollmentRecord {
  id: string;
  courseId: string;
  databaseStatus: string;
  completedLessons: number;
  totalLessons: number;
  lastAccessedAt: string;
}

export interface StudentLearningModuleRecord {
  id: string;
  title: string;
  position: number;
  lessons: Array<{
    id: string;
    title: string;
    description: string;
    durationMinutes: number;
    isPreview: boolean;
    content: string;
    resources: Array<{
      id: string;
      type: string;
      title: string;
      description: string;
      required: boolean;
      position: number;
      url: string | null;
      contentPath: string | null;
    }>;
  }>;
}

export interface StudentRepository {
  checkout(userId: string, input: CheckoutInput): Promise<CheckoutReceipt>;
  enroll(userId: string, courseId: string): Promise<string>;
  courseOrganizationId(courseId: string): Promise<string | null>;
  isActiveOrganizationMember(userId: string, organizationId: string): Promise<boolean>;
  listEnrollments(userId: string): Promise<StudentEnrollmentRecord[]>;
  listEnrollmentPage(userId: string, input: LibraryListQuery): Promise<{ records: StudentEnrollmentRecord[]; total: number }>;
  courseOwnership(userId: string, courseIds: string[]): Promise<string[]>;
  learningSummary(userId: string): Promise<{ inProgress: number; completed: number; certificates: number; learningHours: number }>;
  findEnrollment(userId: string, courseId: string): Promise<StudentEnrollmentRecord | null>;
  listLearningModules(courseId: string): Promise<StudentLearningModuleRecord[]>;
  completedLessonIds(enrollmentId: string): Promise<string[]>;
  setLessonProgress(userId: string, lessonId: string, completed: boolean): Promise<void>;
  findProtectedResource(lessonId: string, resourceId: string): Promise<ProtectedResourceFile | null>;
  hasCourseAccess(userId: string, courseId: string): Promise<boolean>;
  isInstructorAssigned(userId: string, courseId: string): Promise<boolean>;
  openStorageObject(path: string, range: string | null): Promise<ProtectedStorageObject>;
}

function databaseFailure(error?: { message?: string; code?: string }): AppError {
  const custom: Record<string, [number, string, string]> = {
    SUBSCRIPTION_REQUIRED: [403, "SUBSCRIPTION_REQUIRED", "Necesitas una suscripción vigente para continuar este curso."],
    ORGANIZATION_SUBSCRIPTION_REQUIRED: [403, "ORGANIZATION_SUBSCRIPTION_REQUIRED", "La organización necesita una suscripción vigente para continuar."],
    USER_NOT_FOUND: [404, "USER_NOT_FOUND", "El usuario solicitado no existe."],
    COURSE_NOT_AVAILABLE: [404, "COURSE_NOT_AVAILABLE", "El curso no está disponible para inscripción."],
    PAYMENT_NOT_AVAILABLE: [422, "CHECKOUT_REQUIRED", "Confirma la compra desde tu carrito."],
    ORGANIZATION_MEMBERSHIP_REQUIRED: [403, "ORGANIZATION_MEMBERSHIP_REQUIRED", "Este curso está reservado para miembros activos de su organización."],
    IDEMPOTENCY_CONFLICT: [409, "IDEMPOTENCY_CONFLICT", "La confirmación corresponde a otro carrito. Revisa tus cursos e intenta nuevamente."],
    INVALID_CHECKOUT_INPUT: [422, "INVALID_CHECKOUT_INPUT", "Revisa los cursos de tu carrito."],
    COURSE_REQUIRES_APPROVAL: [422, "COURSE_REQUIRES_APPROVAL", "Este curso requiere aprobación administrativa."],
    ENROLLMENT_ALREADY_EXISTS: [409, "ENROLLMENT_ALREADY_EXISTS", "Ya estás inscrito en este curso."],
    ENROLLMENT_REQUIRED: [403, "ENROLLMENT_REQUIRED", "Necesitas una inscripción activa para acceder."],
    ENROLLMENT_NOT_ACTIVE: [403, "ENROLLMENT_NOT_ACTIVE", "La inscripción todavía no permite acceder al curso."],
    COURSE_HAS_NO_LESSONS: [422, "COURSE_HAS_NO_LESSONS", "El curso todavía no tiene lecciones activas."],
    ENROLLMENT_STATE_NOT_CONFIGURED: [500, "ENROLLMENT_STATE_NOT_CONFIGURED", "Los estados de inscripción no están configurados."],
  };
  const mapped = error?.message ? custom[error.message] : undefined;
  if (mapped) return new AppError(mapped[0], mapped[1], mapped[2]);
  if (error?.code === "23505") {
    return new AppError(409, "ENROLLMENT_ALREADY_EXISTS", "Ya estás inscrito en este curso.");
  }
  return new AppError(502, "DATABASE_ERROR", "No fue posible consultar el progreso del estudiante.");
}

function latestDate(values: Array<string | null | undefined>, fallback: string): string {
  return values.filter((value): value is string => Boolean(value)).sort().at(-1) ?? fallback;
}

async function hydrateEnrollments(rows: EnrollmentRow[]): Promise<StudentEnrollmentRecord[]> {
  if (rows.length === 0) return [];
  const enrollmentIds = rows.map((row) => row.id_inscripcion);
  const courseIds = [...new Set(rows.map((row) => row.fk_curso))];

  const [modulesResult, progressResult] = await Promise.all([
    supabaseAdmin
      .from("modulos")
      .select("id_modulo,fk_curso,titulo,orden")
      .in("fk_curso", courseIds)
      .eq("activo", true),
    supabaseAdmin
      .from("progreso_lecciones")
      .select("fk_inscripcion,fk_leccion,completada,ultima_visualizacion")
      .in("fk_inscripcion", enrollmentIds),
  ]);
  if (modulesResult.error) throw databaseFailure(modulesResult.error);
  if (progressResult.error) throw databaseFailure(progressResult.error);

  const modules = (modulesResult.data ?? []) as ModuleRow[];
  const moduleIds = modules.map((module) => module.id_modulo);
  const lessonsResult = moduleIds.length
    ? await supabaseAdmin
        .from("lecciones")
        .select("id_leccion,fk_modulo")
        .in("fk_modulo", moduleIds)
        .eq("activo", true)
    : { data: [], error: null };
  if (lessonsResult.error) throw databaseFailure(lessonsResult.error);

  const lessons = (lessonsResult.data ?? []) as LessonRow[];
  const progress = (progressResult.data ?? []) as ProgressRow[];
  const moduleCourse = new Map(modules.map((module) => [module.id_modulo, module.fk_curso]));
  const lessonCourse = new Map(
    lessons.map((lesson) => [lesson.id_leccion, moduleCourse.get(lesson.fk_modulo)])
  );

  return rows.map((row) => {
    const courseLessonIds = new Set(
      lessons
        .filter((lesson) => moduleCourse.get(lesson.fk_modulo) === row.fk_curso)
        .map((lesson) => lesson.id_leccion)
    );
    const enrollmentProgress = progress.filter(
      (item) =>
        item.fk_inscripcion === row.id_inscripcion &&
        lessonCourse.get(item.fk_leccion) === row.fk_curso
    );
    return {
      id: row.id_inscripcion,
      courseId: row.fk_curso,
      databaseStatus: row.estados_inscripcion?.nombre ?? "",
      completedLessons: enrollmentProgress.filter(
        (item) => item.completada && courseLessonIds.has(item.fk_leccion)
      ).length,
      totalLessons: courseLessonIds.size,
      lastAccessedAt: latestDate(
        enrollmentProgress.map((item) => item.ultima_visualizacion),
        row.fecha_inicio ?? row.fecha_inscripcion
      ),
    };
  });
}

const ENROLLMENT_COLUMNS = [
  "id_inscripcion",
  "fk_curso",
  "fecha_inscripcion",
  "fecha_inicio",
  "fecha_finalizacion",
  "estados_inscripcion!fk_inscripcion_estado(nombre)",
].join(",");

export const studentRepository: StudentRepository = {
  async learningSummary(userId) {
    const { data, error } = await supabaseAdmin.rpc("academix_learning_summary", { p_user_id: userId });
    if (error) throw databaseFailure(error);
    return data;
  },
  async courseOwnership(userId, courseIds) {
    const { data, error } = await supabaseAdmin.rpc("academix_current_course_ownership", { p_user_id: userId, p_course_ids: courseIds });
    if (error) throw databaseFailure(error);
    return (data ?? []) as string[];
  },
  async listEnrollmentPage(userId, input) {
    let query = supabaseAdmin.from("inscripciones")
      .select(ENROLLMENT_COLUMNS.replace("!fk_inscripcion_estado(", "!fk_inscripcion_estado!inner("), { count: "exact" })
      .eq("fk_usuario", userId).eq("activo", true)
      .in("estados_inscripcion.nombre", input.status === "completed" ? ["Finalizada"] : input.status === "in_progress" ? ["Activa"] : ["Activa", "Finalizada"])
      .order("fecha_inscripcion", { ascending: false }).order("id_inscripcion");
    if (input.courseIds) query = query.in("fk_curso", input.courseIds);
    const offset = (input.page - 1) * input.limit;
    const { data, error, count } = await query.range(offset, offset + input.limit - 1);
    if (error) throw databaseFailure(error);
    return { records: await hydrateEnrollments((data ?? []) as unknown as EnrollmentRow[]), total: count ?? 0 };
  },
  async checkout(userId, input) {
    const { data, error } = await supabaseAdmin.rpc("academix_simulated_checkout", {
      p_user_id: userId,
      p_course_ids: input.courseIds,
      p_idempotency_key: input.idempotencyKey,
    });
    if (error) throw databaseFailure(error);
    const receipt = data as CheckoutReceipt | null;
    if (!receipt?.id || receipt.mode !== "simulated" || !Array.isArray(receipt.items)) throw databaseFailure();
    return receipt;
  },
  async enroll(userId, courseId) {
    const { data, error } = await supabaseAdmin.rpc("academix_enroll_user", {
      p_user_id: userId,
      p_course_id: courseId,
    });
    if (error) throw databaseFailure(error);
    const result = data as { enrollmentId?: string } | null;
    if (!result?.enrollmentId) throw databaseFailure();
    return result.enrollmentId;
  },

  async courseOrganizationId(courseId) {
    const { data, error } = await supabaseAdmin
      .from("cursos")
      .select("fk_organizacion")
      .eq("id_curso", courseId)
      .eq("activo", true)
      .maybeSingle();
    if (error) throw databaseFailure(error);
    return (data as { fk_organizacion: string | null } | null)?.fk_organizacion ?? null;
  },

  async isActiveOrganizationMember(userId, organizationId) {
    const { data, error } = await supabaseAdmin
      .from("miembros_organizacion")
      .select("id_miembro")
      .eq("fk_usuario", userId)
      .eq("fk_organizacion", organizationId)
      .eq("activo", true)
      .maybeSingle();
    if (error) throw databaseFailure(error);
    return Boolean(data);
  },

  async listEnrollments(userId) {
    const { data, error } = await supabaseAdmin
      .from("inscripciones")
      .select(ENROLLMENT_COLUMNS)
      .eq("fk_usuario", userId)
      .eq("activo", true)
      .order("fecha_inscripcion", { ascending: false });
    if (error) throw databaseFailure(error);
    return hydrateEnrollments((data ?? []) as unknown as EnrollmentRow[]);
  },

  async findEnrollment(userId, courseId) {
    const { data, error } = await supabaseAdmin
      .from("inscripciones")
      .select(ENROLLMENT_COLUMNS)
      .eq("fk_usuario", userId)
      .eq("fk_curso", courseId)
      .eq("activo", true)
      .maybeSingle();
    if (error) throw databaseFailure(error);
    if (!data) return null;
    return (await hydrateEnrollments([data as unknown as EnrollmentRow]))[0] ?? null;
  },

  async listLearningModules(courseId) {
    const { data: modulesData, error: modulesError } = await supabaseAdmin
      .from("modulos")
      .select("id_modulo,fk_curso,titulo,orden")
      .eq("fk_curso", courseId)
      .eq("activo", true)
      .order("orden");
    if (modulesError) throw databaseFailure(modulesError);
    const modules = (modulesData ?? []) as ModuleRow[];
    if (modules.length === 0) return [];

    const { data: lessonsData, error: lessonsError } = await supabaseAdmin
      .from("lecciones")
      .select("id_leccion,fk_modulo,titulo,descripcion,contenido,duracion_estimada_minutos,orden,vista_previa")
      .in("fk_modulo", modules.map((module) => module.id_modulo))
      .eq("activo", true)
      .order("orden");
    if (lessonsError) throw databaseFailure(lessonsError);
    const lessons = (lessonsData ?? []) as LessonRow[];

    const { data: resourcesData, error: resourcesError } = lessons.length
      ? await supabaseAdmin
          .from("recursos")
          .select("id_recurso,fk_leccion,titulo,descripcion,url,obligatorio,orden,fk_archivo,tipos_recurso!fk_recurso_tipo(nombre)")
          .in("fk_leccion", lessons.map((lesson) => lesson.id_leccion))
          .eq("activo", true)
          .order("orden")
      : { data: [], error: null };
    if (resourcesError) throw databaseFailure(resourcesError);
    const resources = (resourcesData ?? []) as unknown as ResourceRow[];

    return modules.map((module) => ({
      id: module.id_modulo,
      title: module.titulo,
      position: module.orden,
      lessons: lessons
        .filter((lesson) => lesson.fk_modulo === module.id_modulo)
        .map((lesson) => ({
          id: lesson.id_leccion,
          title: lesson.titulo,
          description: lesson.descripcion ?? "",
          content: lesson.contenido ?? "",
          durationMinutes: lesson.duracion_estimada_minutos ?? 0,
          isPreview: lesson.vista_previa,
          resources: resources
            .filter((resource) => resource.fk_leccion === lesson.id_leccion)
            .map((resource) => ({
              id: resource.id_recurso,
              type: resource.tipos_recurso?.nombre ?? "",
              title: resource.titulo,
              description: resource.descripcion ?? "",
              required: resource.obligatorio,
              position: resource.orden,
              url: resource.url,
              contentPath: resource.fk_archivo
                ? `/api/v1/lessons/${lesson.id_leccion}/resources/${resource.id_recurso}/content`
                : null,
            })),
        })),
    }));
  },

  async completedLessonIds(enrollmentId) {
    const { data, error } = await supabaseAdmin
      .from("progreso_lecciones")
      .select("fk_leccion")
      .eq("fk_inscripcion", enrollmentId)
      .eq("completada", true);
    if (error) throw databaseFailure(error);
    return ((data ?? []) as Array<{ fk_leccion: string }>).map((row) => row.fk_leccion);
  },

  async setLessonProgress(userId, lessonId, completed) {
    const { error } = await supabaseAdmin.rpc("academix_set_lesson_progress", {
      p_user_id: userId,
      p_lesson_id: lessonId,
      p_completed: completed,
    });
    if (error) throw databaseFailure(error);
  },

  async findProtectedResource(lessonId, resourceId) {
    const { data: resourceData, error: resourceError } = await supabaseAdmin
      .from("recursos")
      .select("fk_archivo")
      .eq("id_recurso", resourceId)
      .eq("fk_leccion", lessonId)
      .eq("activo", true)
      .maybeSingle();
    if (resourceError) throw databaseFailure(resourceError);
    const fileId = (resourceData as { fk_archivo: string | null } | null)?.fk_archivo;
    if (!fileId) return null;

    const { data: lessonData, error: lessonError } = await supabaseAdmin
      .from("lecciones")
      .select("modulos!fk_leccion_modulo(fk_curso)")
      .eq("id_leccion", lessonId)
      .eq("activo", true)
      .maybeSingle();
    if (lessonError) throw databaseFailure(lessonError);
    const courseId = (lessonData as unknown as { modulos: { fk_curso: string } | null } | null)?.modulos?.fk_curso;
    if (!courseId) return null;

    const { data: fileData, error: fileError } = await supabaseAdmin
      .from("archivos")
      .select("ruta_storage,nombre_original,mime_type,tamano_bytes,fk_curso_contenido")
      .eq("id_archivo", fileId)
      .eq("activo", true)
      .eq("publico", false)
      .maybeSingle();
    if (fileError) throw databaseFailure(fileError);
    const file = fileData as {
      ruta_storage: string;
      nombre_original: string;
      mime_type: string;
      tamano_bytes: number | string;
      fk_curso_contenido: string | null;
    } | null;
    if (!file || file.fk_curso_contenido !== courseId) return null;
    return {
      courseId,
      storagePath: file.ruta_storage,
      originalName: file.nombre_original,
      mimeType: file.mime_type,
      sizeBytes: Number(file.tamano_bytes),
    };
  },

  async hasCourseAccess(userId, courseId) {
    const { data, error } = await supabaseAdmin
      .from("inscripciones")
      .select("estados_inscripcion!fk_inscripcion_estado(nombre)")
      .eq("fk_usuario", userId)
      .eq("fk_curso", courseId)
      .eq("activo", true)
      .maybeSingle();
    if (error) throw databaseFailure(error);
    const state = (data as unknown as { estados_inscripcion: { nombre: string } | null } | null)?.estados_inscripcion?.nombre;
    return state ? ["activa", "finalizada"].includes(state.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase()) : false;
  },

  async isInstructorAssigned(userId, courseId) {
    const { count, error } = await supabaseAdmin
      .from("cursos_instructores")
      .select("id_curso_instructor", { count: "exact", head: true })
      .eq("fk_usuario", userId)
      .eq("fk_curso", courseId)
      .eq("activo", true);
    if (error) throw databaseFailure(error);
    return (count ?? 0) > 0;
  },

  async openStorageObject(path, range) {
    const encodedPath = path.split("/").map(encodeURIComponent).join("/");
    const headers: Record<string, string> = {
      apikey: env.SUPABASE_SECRET_KEY,
      Authorization: `Bearer ${env.SUPABASE_SECRET_KEY}`,
    };
    if (range) headers.Range = range;

    const response = await fetch(
      `${env.SUPABASE_URL}/storage/v1/object/authenticated/academix-course-content/${encodedPath}`,
      { headers }
    );
    if (
      ![200, 206].includes(response.status) ||
      !response.body ||
      (range !== null && response.status !== 206)
    ) {
      throw new AppError(502, "STORAGE_DOWNLOAD_FAILED", "No fue posible descargar el archivo.");
    }
    return {
      stream: Readable.fromWeb(response.body),
      status: response.status as 200 | 206,
      contentLength: response.headers.get("content-length"),
      contentRange: response.headers.get("content-range"),
    };
  },
};
