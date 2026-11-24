import { supabaseAdmin } from "../config/supabase";

const publicTables = [
  "archivos",
  "auditoria_sistema",
  "categorias",
  "certificados",
  "configuraciones_sistema",
  "cursos",
  "cursos_instructores",
  "ejecuciones_reporte",
  "estados_curso",
  "estados_inscripcion",
  "estados_pago",
  "estados_verificacion",
  "evaluaciones",
  "idiomas",
  "inscripciones",
  "lecciones",
  "metodos_pago",
  "modalidades",
  "modulos",
  "niveles",
  "notificaciones",
  "perfiles_instructores",
  "preguntas_evaluacion",
  "progreso_lecciones",
  "recursos",
  "reportes",
  "resenas_cursos",
  "resultados_evaluacion",
  "roles",
  "sesiones_usuario",
  "solicitudes_verificacion_utt",
  "tipos_accion_auditoria",
  "tipos_archivo",
  "tipos_certificado",
  "tipos_recurso",
  "usuarios",
  "usuarios_roles",
] as const;

async function main(): Promise<void> {
  const checks = await Promise.all(
    publicTables.map(async (table) => {
      const { error } = await supabaseAdmin
        .from(table)
        .select("*", { count: "exact", head: true });
      return { table, error: error?.message };
    })
  );
  const failures = checks.filter((check) => check.error);

  const { data: buckets, error: storageError } =
    await supabaseAdmin.storage.listBuckets();
  const contentBucket = buckets?.find(
    (bucket) => bucket.id === "academix-course-content"
  );
  const { data: signatureProbe, error: signatureError } = await supabaseAdmin.rpc(
    "academix_certificate_signature_is_valid",
    { p_certificate_id: "00000000-0000-4000-8000-000000000000" }
  );

  if (
    failures.length > 0 ||
    storageError ||
    !contentBucket ||
    contentBucket.public ||
    signatureError ||
    signatureProbe !== false
  ) {
    for (const failure of failures) {
      console.error(`Tabla no disponible: ${failure.table} (${failure.error})`);
    }
    if (storageError) console.error(`Storage no disponible: ${storageError.message}`);
    if (!contentBucket) console.error("No existe el bucket academix-course-content.");
    if (contentBucket?.public) console.error("El bucket de contenido no es privado.");
    if (signatureError) {
      console.error(`Verificación de firma no disponible: ${signatureError.message}`);
    }
    if (!signatureError && signatureProbe !== false) {
      console.error("La prueba negativa de firma no produjo el resultado esperado.");
    }
    process.exitCode = 1;
    return;
  }

  console.log(`Supabase verificado: ${checks.length} tablas públicas disponibles.`);
  console.log("Bucket academix-course-content: privado.");
  console.log("Firma de certificados: verificación disponible.");
}

void main();
