import { supabaseAdmin } from "../config/supabase";
import { AppError } from "../errors/app-error";
import type {
  CreateLessonInput,
  CreateModuleInput,
  CreateResourceInput,
  UpdateLessonInput,
  UpdateModuleInput,
  UpdateResourceInput,
} from "../schemas/authoring.schemas";
import type {
  AuthoringCourseContent,
  AuthoringLesson,
  AuthoringModule,
  AuthoringResource,
  CourseContentStatus,
  UploadedCourseFile,
} from "../types/authoring.types";

interface CourseAccessRow {
  id_curso: string;
  fk_organizacion: string | null;
  estados_curso: { nombre: string } | null;
}

interface ModuleRow {
  id_modulo: string;
  fk_curso: string;
  titulo: string;
  descripcion: string | null;
  orden: number;
  activo: boolean;
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
  activo: boolean;
}

interface ResourceRow {
  id_recurso: string;
  fk_leccion: string;
  fk_tipo_recurso: number;
  titulo: string;
  descripcion: string | null;
  url: string | null;
  fk_archivo: string | null;
  obligatorio: boolean;
  orden: number;
  activo: boolean;
  tipos_recurso: { nombre: string } | null;
}

export interface CourseAuthoringAccess {
  courseId: string;
  organizationId: string | null;
  status: CourseContentStatus;
  assigned: boolean;
}

export interface FileRecordInput {
  courseId: string;
  actorId: string;
  typeId: number;
  originalName: string;
  storedName: string;
  storagePath: string;
  mimeType: string;
  extension: string;
  sizeBytes: number;
  sha256: string;
}

export interface AuthoringRepository {
  courseAccess(courseId: string, actorId: string): Promise<CourseAuthoringAccess | null>;
  moduleCourseId(moduleId: string): Promise<string | null>;
  lessonCourseId(lessonId: string): Promise<string | null>;
  resourceCourseId(resourceId: string): Promise<string | null>;
  resourceOptions(): Promise<Array<{ id: number; name: string }>>;
  fileTypeId(mimeType: string): Promise<number | null>;
  listContent(courseId: string): Promise<AuthoringCourseContent>;
  createModule(courseId: string, input: CreateModuleInput, actorId: string): Promise<AuthoringModule>;
  updateModule(moduleId: string, input: UpdateModuleInput, actorId: string): Promise<AuthoringModule | null>;
  createLesson(moduleId: string, input: CreateLessonInput, actorId: string): Promise<AuthoringLesson>;
  updateLesson(lessonId: string, input: UpdateLessonInput, actorId: string): Promise<AuthoringLesson | null>;
  createResource(lessonId: string, input: CreateResourceInput, actorId: string): Promise<AuthoringResource>;
  updateResource(resourceId: string, input: UpdateResourceInput, actorId: string): Promise<AuthoringResource | null>;
  createFile(input: FileRecordInput): Promise<UploadedCourseFile>;
}

function status(name?: string): CourseContentStatus {
  const value = name?.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
  if (value === "en revision") return "review";
  if (value === "publicado") return "published";
  if (value === "archivado") return "archived";
  if (value === "dado de baja por moderacion") return "moderated";
  return "draft";
}

function databaseError(error: { code?: string; message?: string }): AppError {
  const mapped: Record<string, [number, string, string]> = {
    COURSE_CONTENT_IMMUTABLE: [409, "COURSE_CONTENT_IMMUTABLE", "El contenido publicado o archivado no se puede modificar."],
    FILE_NOT_IN_COURSE: [422, "FILE_NOT_IN_COURSE", "El archivo no pertenece a este curso."],
  };
  const custom = error.message ? mapped[error.message] : undefined;
  if (custom) return new AppError(custom[0], custom[1], custom[2]);
  if (error.code === "23505") return new AppError(409, "POSITION_ALREADY_USED", "La posición indicada ya está ocupada.");
  if (error.code === "23503") return new AppError(422, "INVALID_RELATION", "Una relación indicada no existe.");
  if (error.code === "23514") return new AppError(422, "INVALID_CONTENT", "El contenido no cumple las reglas del curso.");
  return new AppError(502, "DATABASE_ERROR", "No fue posible guardar el contenido del curso.");
}

function moduleValue(row: ModuleRow): AuthoringModule {
  return { id: row.id_modulo, title: row.titulo, description: row.descripcion ?? "", position: row.orden, active: row.activo, lessons: [] };
}

function lessonValue(row: LessonRow): AuthoringLesson {
  return { id: row.id_leccion, title: row.titulo, description: row.descripcion ?? "", content: row.contenido ?? "", durationMinutes: row.duracion_estimada_minutos ?? 0, position: row.orden, isPreview: row.vista_previa, active: row.activo, resources: [] };
}

function resourceValue(row: ResourceRow): AuthoringResource {
  return { id: row.id_recurso, typeId: row.fk_tipo_recurso, type: row.tipos_recurso?.nombre ?? "", title: row.titulo, description: row.descripcion ?? "", url: row.url, fileId: row.fk_archivo, required: row.obligatorio, position: row.orden, active: row.activo };
}

function moduleFields(input: CreateModuleInput | UpdateModuleInput, actorId: string) {
  const values: Record<string, string | number | boolean | null> = { actualizado_por: actorId };
  if (input.title !== undefined) values.titulo = input.title;
  if (input.description !== undefined) values.descripcion = input.description || null;
  if (input.position !== undefined) values.orden = input.position;
  if ("active" in input && input.active !== undefined) values.activo = input.active;
  return values;
}

function lessonFields(input: CreateLessonInput | UpdateLessonInput, actorId: string) {
  const values: Record<string, string | number | boolean | null> = { actualizado_por: actorId };
  if (input.title !== undefined) values.titulo = input.title;
  if (input.description !== undefined) values.descripcion = input.description || null;
  if (input.content !== undefined) values.contenido = input.content || null;
  if (input.durationMinutes !== undefined) values.duracion_estimada_minutos = input.durationMinutes || null;
  if (input.position !== undefined) values.orden = input.position;
  if (input.isPreview !== undefined) values.vista_previa = input.isPreview;
  if ("active" in input && input.active !== undefined) values.activo = input.active;
  return values;
}

function resourceFields(input: CreateResourceInput | UpdateResourceInput, actorId: string) {
  const values: Record<string, string | number | boolean | null> = { actualizado_por: actorId };
  if (input.typeId !== undefined) values.fk_tipo_recurso = input.typeId;
  if (input.title !== undefined) values.titulo = input.title;
  if (input.description !== undefined) values.descripcion = input.description || null;
  if (input.url !== undefined) values.url = input.url;
  if (input.fileId !== undefined) values.fk_archivo = input.fileId;
  if (input.required !== undefined) values.obligatorio = input.required;
  if (input.position !== undefined) values.orden = input.position;
  if ("active" in input && input.active !== undefined) values.activo = input.active;
  return values;
}

const MODULE_COLUMNS = "id_modulo,fk_curso,titulo,descripcion,orden,activo";
const LESSON_COLUMNS = "id_leccion,fk_modulo,titulo,descripcion,contenido,duracion_estimada_minutos,orden,vista_previa,activo";
const RESOURCE_COLUMNS = "id_recurso,fk_leccion,fk_tipo_recurso,titulo,descripcion,url,fk_archivo,obligatorio,orden,activo,tipos_recurso!fk_recurso_tipo(nombre)";

export const authoringRepository: AuthoringRepository = {
  async courseAccess(courseId, actorId) {
    const { data, error } = await supabaseAdmin
      .from("cursos")
      .select("id_curso,fk_organizacion,estados_curso!fk_curso_estado(nombre)")
      .eq("id_curso", courseId)
      .maybeSingle();
    if (error) throw databaseError(error);
    if (!data) return null;
    const { count, error: assignmentError } = await supabaseAdmin.from("cursos_instructores").select("id_curso_instructor", { count: "exact", head: true }).eq("fk_curso", courseId).eq("fk_usuario", actorId).eq("activo", true);
    if (assignmentError) throw databaseError(assignmentError);
    const row = data as unknown as CourseAccessRow;
    return { courseId: row.id_curso, organizationId: row.fk_organizacion, status: status(row.estados_curso?.nombre), assigned: (count ?? 0) > 0 };
  },

  async moduleCourseId(moduleId) {
    const { data, error } = await supabaseAdmin.from("modulos").select("fk_curso").eq("id_modulo", moduleId).maybeSingle();
    if (error) throw databaseError(error);
    return (data as { fk_curso: string } | null)?.fk_curso ?? null;
  },

  async lessonCourseId(lessonId) {
    const { data, error } = await supabaseAdmin.from("lecciones").select("modulos!fk_leccion_modulo(fk_curso)").eq("id_leccion", lessonId).maybeSingle();
    if (error) throw databaseError(error);
    return ((data as unknown as { modulos: { fk_curso: string } | null } | null)?.modulos?.fk_curso) ?? null;
  },

  async resourceCourseId(resourceId) {
    const { data, error } = await supabaseAdmin.from("recursos").select("lecciones!fk_recurso_leccion(modulos!fk_leccion_modulo(fk_curso))").eq("id_recurso", resourceId).maybeSingle();
    if (error) throw databaseError(error);
    return ((data as unknown as { lecciones: { modulos: { fk_curso: string } | null } | null } | null)?.lecciones?.modulos?.fk_curso) ?? null;
  },

  async resourceOptions() {
    const { data, error } = await supabaseAdmin.from("tipos_recurso").select("id_tipo_recurso,nombre").eq("activo", true).order("id_tipo_recurso");
    if (error) throw databaseError(error);
    return ((data ?? []) as Array<{ id_tipo_recurso: number; nombre: string }>).map((row) => ({ id: row.id_tipo_recurso, name: row.nombre }));
  },

  async fileTypeId(mimeType) {
    const names = mimeType.startsWith("image/") ? ["Imagen"] : mimeType.startsWith("video/") ? ["Video"] : mimeType.startsWith("audio/") ? ["Audio"] : mimeType === "application/pdf" ? ["PDF"] : mimeType.includes("presentation") || mimeType.includes("powerpoint") ? ["Presentación"] : mimeType.includes("zip") ? ["Archivo comprimido"] : ["Documento"];
    const { data, error } = await supabaseAdmin.from("tipos_archivo").select("id_tipo_archivo").in("nombre", names).eq("activo", true).limit(1).maybeSingle();
    if (error) throw databaseError(error);
    return (data as { id_tipo_archivo: number } | null)?.id_tipo_archivo ?? null;
  },

  async listContent(courseId) {
    const { data: courseData, error: courseError } = await supabaseAdmin
      .from("cursos")
      .select("id_curso,estados_curso!fk_curso_estado(nombre)")
      .eq("id_curso", courseId)
      .maybeSingle();
    if (courseError) throw databaseError(courseError);
    if (!courseData) throw new AppError(404, "COURSE_NOT_FOUND", "El curso solicitado no existe.");
    const courseRow = courseData as unknown as { id_curso: string; estados_curso: { nombre: string } | null };
    const contentStatus = status(courseRow.estados_curso?.nombre);
    const { data: modulesData, error: modulesError } = await supabaseAdmin.from("modulos").select(MODULE_COLUMNS).eq("fk_curso", courseId).order("orden");
    if (modulesError) throw databaseError(modulesError);
    const moduleRows = (modulesData ?? []) as ModuleRow[];
    const moduleIds = moduleRows.map((row) => row.id_modulo);
    const lessonResult = moduleIds.length ? await supabaseAdmin.from("lecciones").select(LESSON_COLUMNS).in("fk_modulo", moduleIds).order("orden") : { data: [], error: null };
    if (lessonResult.error) throw databaseError(lessonResult.error);
    const lessonRows = (lessonResult.data ?? []) as LessonRow[];
    const lessonIds = lessonRows.map((row) => row.id_leccion);
    const resourceResult = lessonIds.length ? await supabaseAdmin.from("recursos").select(RESOURCE_COLUMNS).in("fk_leccion", lessonIds).order("orden") : { data: [], error: null };
    if (resourceResult.error) throw databaseError(resourceResult.error);
    const resourceRows = (resourceResult.data ?? []) as unknown as ResourceRow[];
    const modules = moduleRows.map(moduleValue);
    const lessons = lessonRows.map(lessonValue);
    for (const lesson of lessons) lesson.resources = resourceRows.filter((row) => row.fk_leccion === lesson.id).map(resourceValue);
    for (const module of modules) module.lessons = lessons.filter((lesson) => lessonRows.find((row) => row.id_leccion === lesson.id)?.fk_modulo === module.id);
    return { courseId, status: contentStatus, modules };
  },

  async createModule(courseId, input, actorId) {
    const { data, error } = await supabaseAdmin.from("modulos").insert({ fk_curso: courseId, ...moduleFields(input, actorId), creado_por: actorId, activo: true }).select(MODULE_COLUMNS).single();
    if (error) throw databaseError(error);
    return moduleValue(data as ModuleRow);
  },

  async updateModule(moduleId, input, actorId) {
    const { data, error } = await supabaseAdmin.from("modulos").update(moduleFields(input, actorId)).eq("id_modulo", moduleId).select(MODULE_COLUMNS).maybeSingle();
    if (error) throw databaseError(error);
    return data ? moduleValue(data as ModuleRow) : null;
  },

  async createLesson(moduleId, input, actorId) {
    const { data, error } = await supabaseAdmin.from("lecciones").insert({ fk_modulo: moduleId, ...lessonFields(input, actorId), creado_por: actorId, activo: true }).select(LESSON_COLUMNS).single();
    if (error) throw databaseError(error);
    return lessonValue(data as LessonRow);
  },

  async updateLesson(lessonId, input, actorId) {
    const { data, error } = await supabaseAdmin.from("lecciones").update(lessonFields(input, actorId)).eq("id_leccion", lessonId).select(LESSON_COLUMNS).maybeSingle();
    if (error) throw databaseError(error);
    return data ? lessonValue(data as LessonRow) : null;
  },

  async createResource(lessonId, input, actorId) {
    const { data, error } = await supabaseAdmin.from("recursos").insert({ fk_leccion: lessonId, ...resourceFields(input, actorId), creado_por: actorId, activo: true }).select(RESOURCE_COLUMNS).single();
    if (error) throw databaseError(error);
    return resourceValue(data as unknown as ResourceRow);
  },

  async updateResource(resourceId, input, actorId) {
    const { data, error } = await supabaseAdmin.from("recursos").update(resourceFields(input, actorId)).eq("id_recurso", resourceId).select(RESOURCE_COLUMNS).maybeSingle();
    if (error) throw databaseError(error);
    return data ? resourceValue(data as unknown as ResourceRow) : null;
  },

  async createFile(input) {
    const { data, error } = await supabaseAdmin.from("archivos").insert({ fk_tipo_archivo: input.typeId, nombre_original: input.originalName, nombre_almacenado: input.storedName, ruta_storage: input.storagePath, mime_type: input.mimeType, extension: input.extension, tamano_bytes: input.sizeBytes, hash_archivo: input.sha256, publico: false, activo: true, fk_curso_contenido: input.courseId, subido_por: input.actorId, actualizado_por: input.actorId }).select("id_archivo,nombre_original,mime_type,tamano_bytes,hash_archivo,fecha_subida").single();
    if (error) throw databaseError(error);
    const row = data as { id_archivo: string; nombre_original: string; mime_type: string; tamano_bytes: number | string; hash_archivo: string; fecha_subida: string };
    return { id: row.id_archivo, originalName: row.nombre_original, mimeType: row.mime_type, sizeBytes: Number(row.tamano_bytes), sha256: row.hash_archivo, createdAt: row.fecha_subida };
  },
};
