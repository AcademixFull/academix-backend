import { supabaseAdmin } from "../config/supabase";
import { AppError } from "../errors/app-error";
import type { CourseListQuery } from "../schemas/catalog.schemas";

interface CourseRow {
  id_curso: string;
  slug: string;
  fk_categoria: number;
  fk_nivel: number;
  fk_idioma: number;
  titulo: string;
  descripcion_corta: string | null;
  descripcion: string | null;
  objetivos: string | null;
  requisitos: string | null;
  duracion_estimada_horas: number | string | null;
  cuota_recuperacion: number | string;
  permite_certificado: boolean;
  fecha_publicacion: string | null;
  fk_archivo_portada: string | null;
}

interface CategoryRow {
  id_categoria: number;
  nombre: string;
  slug: string;
  descripcion: string | null;
}

interface NamedLookupRow {
  nombre: string;
}

interface AssignmentRow {
  fk_curso: string;
  fk_usuario: string;
}

interface UserRow {
  id_usuario: string;
  nombres: string;
  apellido_paterno: string;
  apellido_materno: string | null;
  biografia: string | null;
  fk_archivo_foto: string | null;
}

interface InstructorProfileRow {
  fk_usuario: string;
  especialidad: string;
  anios_experiencia: number;
}

interface FileRow {
  id_archivo: string;
  ruta_storage: string;
}

interface ModuleRow {
  id_modulo: string;
  titulo: string;
  orden: number;
}

interface LessonRow {
  id_leccion: string;
  fk_modulo: string;
  titulo: string;
  orden: number;
  duracion_estimada_minutos: number | null;
  vista_previa: boolean;
}

export interface CatalogCategoryRecord {
  id: number;
  name: string;
  slug: string;
  description: string | null;
}

export interface CatalogInstructorRecord {
  id: string;
  fullName: string;
  specialty: string;
  biography: string;
  experienceYears: number;
  avatarUrl?: string;
  studentCount: number;
  courseCount: number;
}

export interface CatalogCourseRecord {
  id: string;
  slug: string;
  title: string;
  shortDescription: string;
  description: string;
  objectives: string | null;
  requirements: string | null;
  durationHours: number;
  price: number;
  certificateEnabled: boolean;
  imageUrl?: string;
  category: CatalogCategoryRecord;
  categoryId: number;
  levelName: string;
  language: string;
  instructor: Omit<CatalogInstructorRecord, "biography" | "experienceYears" | "studentCount" | "courseCount"> | null;
  modules: Array<{
    id: string;
    title: string;
    position: number;
    lessons: Array<{
      id: string;
      title: string;
      position: number;
      durationMinutes: number;
      isPreview: boolean;
    }>;
  }>;
}

export interface CatalogRepository {
  listCategories(): Promise<CatalogCategoryRecord[]>;
  listCourses(input: CourseListQuery): Promise<{ records: CatalogCourseRecord[]; total: number }>;
  listFeaturedCourses(limit: number): Promise<CatalogCourseRecord[]>;
  listCoursesByIds(courseIds: string[]): Promise<CatalogCourseRecord[]>;
  findCourse(identifier: string): Promise<CatalogCourseRecord | null>;
  listRelatedCourses(courseId: string, categoryId: number): Promise<CatalogCourseRecord[]>;
  findInstructor(instructorId: string): Promise<CatalogInstructorRecord | null>;
  listInstructorCourses(instructorId: string): Promise<CatalogCourseRecord[]>;
  listInstructorCoursePage(instructorId: string, input: CourseListQuery): Promise<{ records: CatalogCourseRecord[]; total: number }>;
}

const COURSE_COLUMNS = [
  "id_curso",
  "slug",
  "fk_categoria",
  "fk_nivel",
  "fk_idioma",
  "titulo",
  "descripcion_corta",
  "descripcion",
  "objetivos",
  "requisitos",
  "duracion_estimada_horas",
  "cuota_recuperacion",
  "permite_certificado",
  "fecha_publicacion",
  "fk_archivo_portada",
].join(",");

function databaseFailure(): AppError {
  return new AppError(502, "DATABASE_ERROR", "No fue posible consultar el catálogo.");
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function fullName(user: UserRow): string {
  return [user.nombres, user.apellido_paterno, user.apellido_materno]
    .filter(Boolean)
    .join(" ")
    .trim();
}

function publicFileUrl(path: string | undefined): string | undefined {
  if (!path) return undefined;
  try {
    const url = new URL(path);
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function postgrestSearchPattern(value: string): string {
  return `%${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}%`;
}

async function publishedStateId(): Promise<number> {
  const { data, error } = await supabaseAdmin
    .from("estados_curso")
    .select("id_estado_curso")
    .eq("nombre", "Publicado")
    .eq("activo", true)
    .single();

  if (error || !data) throw databaseFailure();
  return Number((data as { id_estado_curso: number }).id_estado_curso);
}

async function categoryId(slug: string): Promise<number | null> {
  const { data, error } = await supabaseAdmin
    .from("categorias")
    .select("id_categoria")
    .eq("slug", slug)
    .eq("activo", true)
    .maybeSingle();

  if (error) throw databaseFailure();
  return data ? Number((data as { id_categoria: number }).id_categoria) : null;
}

const levelNames = {
  beginner: "Básico",
  intermediate: "Intermedio",
  advanced: "Avanzado",
} as const;

async function levelId(level: keyof typeof levelNames): Promise<number | null> {
  const { data, error } = await supabaseAdmin
    .from("niveles")
    .select("id_nivel")
    .eq("nombre", levelNames[level])
    .eq("activo", true)
    .maybeSingle();

  if (error) throw databaseFailure();
  return data ? Number((data as { id_nivel: number }).id_nivel) : null;
}

async function hydrateCourses(rows: CourseRow[]): Promise<CatalogCourseRecord[]> {
  if (rows.length === 0) return [];

  const courseIds = unique(rows.map((row) => row.id_curso));
  const categoryIds = unique(rows.map((row) => row.fk_categoria));
  const levelIds = unique(rows.map((row) => row.fk_nivel));
  const languageIds = unique(rows.map((row) => row.fk_idioma));

  const [categoriesResult, levelsResult, languagesResult, assignmentsResult] = await Promise.all([
    supabaseAdmin
      .from("categorias")
      .select("id_categoria,nombre,slug,descripcion")
      .in("id_categoria", categoryIds),
    supabaseAdmin.from("niveles").select("id_nivel,nombre").in("id_nivel", levelIds),
    supabaseAdmin.from("idiomas").select("id_idioma,nombre").in("id_idioma", languageIds),
    supabaseAdmin
      .from("cursos_instructores")
      .select("fk_curso,fk_usuario")
      .in("fk_curso", courseIds)
      .eq("activo", true)
      .eq("instructor_principal", true),
  ]);

  if (
    categoriesResult.error ||
    levelsResult.error ||
    languagesResult.error ||
    assignmentsResult.error
  ) {
    throw databaseFailure();
  }

  const assignments = (assignmentsResult.data ?? []) as AssignmentRow[];
  const userIds = unique(assignments.map((row) => row.fk_usuario));
  const usersPromise = userIds.length
    ? supabaseAdmin
        .from("usuarios")
        .select("id_usuario,nombres,apellido_paterno,apellido_materno,biografia,fk_archivo_foto")
        .in("id_usuario", userIds)
        .eq("activo", true)
    : Promise.resolve({ data: [], error: null });
  const profilesPromise = userIds.length
    ? supabaseAdmin
        .from("perfiles_instructores")
        .select("fk_usuario,especialidad,anios_experiencia")
        .in("fk_usuario", userIds)
        .eq("activo", true)
    : Promise.resolve({ data: [], error: null });

  const [usersResult, profilesResult] = await Promise.all([usersPromise, profilesPromise]);
  if (usersResult.error || profilesResult.error) throw databaseFailure();

  const users = (usersResult.data ?? []) as UserRow[];
  const profileRows = (profilesResult.data ?? []) as InstructorProfileRow[];
  const fileIds = unique([
    ...rows.map((row) => row.fk_archivo_portada).filter((id): id is string => Boolean(id)),
    ...users.map((row) => row.fk_archivo_foto).filter((id): id is string => Boolean(id)),
  ]);
  const filesResult = fileIds.length
    ? await supabaseAdmin.from("archivos").select("id_archivo,ruta_storage").in("id_archivo", fileIds)
    : { data: [], error: null };
  if (filesResult.error) throw databaseFailure();

  const categories = new Map(
    ((categoriesResult.data ?? []) as CategoryRow[]).map((row) => [row.id_categoria, row])
  );
  const levels = new Map(
    ((levelsResult.data ?? []) as Array<NamedLookupRow & { id_nivel: number }>).map((row) => [
      row.id_nivel,
      row.nombre,
    ])
  );
  const languages = new Map(
    ((languagesResult.data ?? []) as Array<NamedLookupRow & { id_idioma: number }>).map((row) => [
      row.id_idioma,
      row.nombre,
    ])
  );
  const assignmentByCourse = new Map(assignments.map((row) => [row.fk_curso, row]));
  const userById = new Map(users.map((row) => [row.id_usuario, row]));
  const profileByUser = new Map(profileRows.map((row) => [row.fk_usuario, row]));
  const fileById = new Map(
    ((filesResult.data ?? []) as FileRow[]).map((row) => [row.id_archivo, row.ruta_storage])
  );

  return rows.map((row) => {
    const category = categories.get(row.fk_categoria);
    const assignment = assignmentByCourse.get(row.id_curso);
    const user = assignment ? userById.get(assignment.fk_usuario) : undefined;
    const profile = user ? profileByUser.get(user.id_usuario) : undefined;
    const avatarUrl = user?.fk_archivo_foto
      ? publicFileUrl(fileById.get(user.fk_archivo_foto))
      : undefined;
    const imageUrl = row.fk_archivo_portada
      ? publicFileUrl(fileById.get(row.fk_archivo_portada))
      : undefined;

    return {
      id: row.id_curso,
      slug: row.slug,
      title: row.titulo,
      shortDescription: row.descripcion_corta ?? "",
      description: row.descripcion ?? "",
      objectives: row.objetivos,
      requirements: row.requisitos,
      durationHours: Number(row.duracion_estimada_horas ?? 0),
      price: Number(row.cuota_recuperacion),
      certificateEnabled: row.permite_certificado,
      ...(imageUrl ? { imageUrl } : {}),
      category: {
        id: category?.id_categoria ?? row.fk_categoria,
        name: category?.nombre ?? "Sin categoría",
        slug: category?.slug ?? "sin-categoria",
        description: category?.descripcion ?? null,
      },
      categoryId: row.fk_categoria,
      levelName: levels.get(row.fk_nivel) ?? "Básico",
      language: languages.get(row.fk_idioma) ?? "Español",
      instructor: user
        ? {
            id: user.id_usuario,
            fullName: fullName(user),
            specialty: profile?.especialidad ?? "",
            biography: user.biografia ?? "",
            ...(avatarUrl ? { avatarUrl } : {}),
          }
        : null,
      modules: [],
    };
  });
}

async function publishedRows(options: {
  instructorId?: string;
  input?: CourseListQuery;
  courseIds?: string[];
  categoryId?: number;
  excludeCourseId?: string;
  independentOnly?: boolean;
  limit?: number;
}): Promise<{ rows: CourseRow[]; total: number }> {
  const stateId = await publishedStateId();
  let resolvedCategoryId = options.categoryId;
  let resolvedLevelId: number | undefined;

  if (options.input?.category) {
    const found = await categoryId(options.input.category);
    if (found === null) return { rows: [], total: 0 };
    resolvedCategoryId = found;
  }
  if (options.input?.level) {
    const found = await levelId(options.input.level);
    if (found === null) return { rows: [], total: 0 };
    resolvedLevelId = found;
  }

  let query = supabaseAdmin
    .from("cursos")
    .select(COURSE_COLUMNS + (options.instructorId ? ",cursos_instructores!inner(fk_usuario,activo)" : ""), { count: "exact" })
    .eq("activo", true)
    .eq("fk_estado_curso", stateId)
    .order("fecha_publicacion", { ascending: false, nullsFirst: false })
    .order("id_curso", { ascending: true });

  if (options.independentOnly) query = query.is("fk_organizacion", null);
  if (options.instructorId) query = query.eq("cursos_instructores.fk_usuario", options.instructorId).eq("cursos_instructores.activo", true);
  if (resolvedCategoryId !== undefined) query = query.eq("fk_categoria", resolvedCategoryId);
  if (resolvedLevelId !== undefined) query = query.eq("fk_nivel", resolvedLevelId);
  if (options.courseIds) query = query.in("id_curso", options.courseIds);
  if (options.excludeCourseId) query = query.neq("id_curso", options.excludeCourseId);
  if (options.input?.search) {
    const pattern = postgrestSearchPattern(options.input.search);
    query = query.or(`titulo.ilike."${pattern}",descripcion_corta.ilike."${pattern}"`);
  }

  if (options.input) {
    const offset = (options.input.page - 1) * options.input.limit;
    query = query.range(offset, offset + options.input.limit - 1);
  } else if (options.limit) {
    query = query.limit(options.limit);
  }

  const { data, error, count } = await query;
  if (error) throw databaseFailure();
  return { rows: (data ?? []) as unknown as CourseRow[], total: count ?? 0 };
}

export const catalogRepository: CatalogRepository = {
  async listCategories() {
    const { data, error } = await supabaseAdmin
      .from("categorias")
      .select("id_categoria,nombre,slug,descripcion")
      .eq("activo", true)
      .order("nombre");

    if (error) throw databaseFailure();
    return ((data ?? []) as CategoryRow[]).map((row) => ({
      id: row.id_categoria,
      name: row.nombre,
      slug: row.slug,
      description: row.descripcion,
    }));
  },

  async listCourses(input) {
    const { rows, total } = await publishedRows({ input });
    return { records: await hydrateCourses(rows), total };
  },

  async listFeaturedCourses(limit) {
    const { data, error } = await supabaseAdmin.rpc("academix_featured_course_ids", { p_limit: Math.max(1, Math.min(limit, 5)) });
    if (error) throw databaseFailure();
    const ids = ((data ?? []) as Array<{ id_curso: string }>).map((row) => row.id_curso);
    if (!ids.length) return [];
    const { rows } = await publishedRows({ courseIds: ids, limit: 5 });
    const hydrated = await hydrateCourses(rows);
    const rank = new Map(ids.map((id, index) => [id, index]));
    return hydrated.sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0));
  },

  async listCoursesByIds(courseIds) {
    if (courseIds.length === 0) return [];
    const { rows } = await publishedRows({ courseIds: unique(courseIds) });
    return hydrateCourses(rows);
  },

  async findCourse(identifier) {
    const stateId = await publishedStateId();
    let query = supabaseAdmin
      .from("cursos")
      .select(COURSE_COLUMNS)
      .eq("activo", true)
      .eq("fk_estado_curso", stateId);

    query = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      identifier
    )
      ? query.eq("id_curso", identifier)
      : query.eq("slug", identifier);

    const { data, error } = await query.maybeSingle();
    if (error) throw databaseFailure();
    if (!data) return null;

    const [record] = await hydrateCourses([data as unknown as CourseRow]);
    if (!record) return null;

    const modulesResult = await supabaseAdmin
      .from("modulos")
      .select("id_modulo,titulo,orden")
      .eq("fk_curso", record.id)
      .eq("activo", true)
      .order("orden");
    if (modulesResult.error) throw databaseFailure();

    const modules = (modulesResult.data ?? []) as ModuleRow[];
    const moduleIds = modules.map((module) => module.id_modulo);
    const lessonsResult = moduleIds.length
      ? await supabaseAdmin
          .from("lecciones")
          .select("id_leccion,fk_modulo,titulo,orden,duracion_estimada_minutos,vista_previa")
          .in("fk_modulo", moduleIds)
          .eq("activo", true)
          .order("orden")
      : { data: [], error: null };
    if (lessonsResult.error) throw databaseFailure();

    const lessons = (lessonsResult.data ?? []) as LessonRow[];
    record.modules = modules.map((module) => ({
      id: module.id_modulo,
      title: module.titulo,
      position: module.orden,
      lessons: lessons
        .filter((lesson) => lesson.fk_modulo === module.id_modulo)
        .map((lesson) => ({
          id: lesson.id_leccion,
          title: lesson.titulo,
          position: lesson.orden,
          durationMinutes: lesson.duracion_estimada_minutos ?? 0,
          isPreview: lesson.vista_previa,
        })),
    }));

    return record;
  },

  async listRelatedCourses(courseId, courseCategoryId) {
    const { rows } = await publishedRows({
      categoryId: courseCategoryId,
      excludeCourseId: courseId,
      limit: 4,
    });
    return hydrateCourses(rows);
  },

  async findInstructor(instructorId) {
    const [userResult, profileResult] = await Promise.all([
      supabaseAdmin
        .from("usuarios")
        .select("id_usuario,nombres,apellido_paterno,apellido_materno,biografia,fk_archivo_foto")
        .eq("id_usuario", instructorId)
        .eq("activo", true)
        .maybeSingle(),
      supabaseAdmin
        .from("perfiles_instructores")
        .select("fk_usuario,especialidad,anios_experiencia")
        .eq("fk_usuario", instructorId)
        .eq("activo", true)
        .maybeSingle(),
    ]);
    if (userResult.error || profileResult.error) throw databaseFailure();
    if (!userResult.data || !profileResult.data) return null;

    const user = userResult.data as unknown as UserRow;
    const profile = profileResult.data as InstructorProfileRow;
    const courseTotals = await publishedRows({ instructorId, independentOnly: true, limit: 1 });
    let avatarUrl: string | undefined;
    if (user.fk_archivo_foto) {
      const fileResult = await supabaseAdmin
        .from("archivos")
        .select("ruta_storage")
        .eq("id_archivo", user.fk_archivo_foto)
        .maybeSingle();
      if (fileResult.error) throw databaseFailure();
      avatarUrl = publicFileUrl(
        (fileResult.data as { ruta_storage?: string } | null)?.ruta_storage
      );
    }

    return {
      id: user.id_usuario,
      fullName: fullName(user),
      specialty: profile.especialidad,
      biography: user.biografia ?? "",
      experienceYears: profile.anios_experiencia,
      ...(avatarUrl ? { avatarUrl } : {}),
      studentCount: 0,
      courseCount: courseTotals.total,
    };
  },

  async listInstructorCourses(instructorId) {
    const assignmentsResult = await supabaseAdmin
      .from("cursos_instructores")
      .select("fk_curso")
      .eq("fk_usuario", instructorId)
      .eq("activo", true);
    if (assignmentsResult.error) throw databaseFailure();

    const courseIds = unique(
      ((assignmentsResult.data ?? []) as Array<{ fk_curso: string }>).map((row) => row.fk_curso)
    );
    if (courseIds.length === 0) return [];
    const { rows } = await publishedRows({ courseIds });
    return hydrateCourses(rows);
  },
  async listInstructorCoursePage(instructorId, input) {
    const result = await publishedRows({ instructorId, independentOnly: true, input });
    return { records: await hydrateCourses(result.rows), total: result.total };
  },
};
