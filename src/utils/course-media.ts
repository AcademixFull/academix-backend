import { supabaseAdmin } from "../config/supabase";
import { AppError } from "../errors/app-error";

export const COURSE_CONTENT_BUCKET = "academix-course-content";
const imageTypes = ["image/jpeg", "image/png", "image/webp"];
export const courseMediaKinds = ["cover", "intro"] as const;
export type CourseMediaKind = (typeof courseMediaKinds)[number];

export interface CourseMedia {
  coverUrl?: string;
  introVideoUrl?: string;
}

export interface CourseMediaFile {
  id_archivo: string;
  ruta_storage: string;
  mime_type: string;
  fk_curso_contenido: string | null;
  uso_presentacion: CourseMediaKind | null;
}

export function isCourseMediaType(kind: CourseMediaKind, mime: string) {
  return kind === "cover" ? imageTypes.includes(mime) : mime === "video/mp4";
}

export function matchesCourseMediaBytes(body: Buffer, mime: string) {
  if (mime === "video/mp4") return body.length >= 12 && body.toString("ascii", 4, 8) === "ftyp";
  if (mime === "image/webp") return body.length >= 12 && body.toString("ascii", 0, 4) === "RIFF" && body.toString("ascii", 8, 12) === "WEBP";
  if (mime === "image/png") return body.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  return body.length >= 3 && body[0] === 0xff && body[1] === 0xd8 && body[2] === 0xff;
}

export function courseMediaPath(file: CourseMediaFile | undefined, courseId: string, kind: CourseMediaKind) {
  if (file?.fk_curso_contenido !== courseId || file.uso_presentacion !== kind || !isCourseMediaType(kind, file.mime_type)) return undefined;
  const name = file.ruta_storage.slice(`courses/${courseId}/`.length);
  return file.ruta_storage.startsWith(`courses/${courseId}/`) && /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(name) ? file.ruta_storage : undefined;
}

export async function signedCourseMedia(paths: Array<string | undefined>) {
  const unique = [...new Set(paths.filter((path): path is string => Boolean(path)))];
  if (!unique.length) return new Map<string, string>();
  const { data, error } = await supabaseAdmin.storage.from(COURSE_CONTENT_BUCKET).createSignedUrls(unique, 6 * 60 * 60);
  if (error) throw new AppError(502, "COURSE_MEDIA_UNAVAILABLE", "No fue posible cargar la portada o el video introductorio.");
  return new Map((data ?? []).flatMap(({ path, signedUrl }) => path && signedUrl ? [[path, signedUrl]] : []));
}
