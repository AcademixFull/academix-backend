# Inventario de Supabase — regularización 6.5

Proyecto inspeccionado: `academix` (`kosvorqvtwbajfkyvsne`). El esquema
`public` contiene 37 tablas después de esta fase. La migración es incremental:
no se eliminó ni se recreó ninguna tabla existente.

## Tablas por dominio

| Dominio | Tablas |
|---|---|
| Identidad y perfiles | `roles`, `usuarios`, `usuarios_roles`, `perfiles_instructores`, `estados_verificacion`, `solicitudes_verificacion_utt` |
| Catálogo y contenido | `niveles`, `idiomas`, `modalidades`, `categorias`, `estados_curso`, `cursos`, `cursos_instructores`, `modulos`, `lecciones`, `tipos_recurso`, `recursos`, `tipos_archivo`, `archivos` |
| Inscripciones y evaluación | `metodos_pago`, `estados_pago`, `estados_inscripcion`, `inscripciones`, `progreso_lecciones`, `evaluaciones`, `preguntas_evaluacion`, `resultados_evaluacion`, `resenas_cursos` |
| Certificados | `tipos_certificado`, `certificados` |
| Operación | `configuraciones_sistema`, `tipos_accion_auditoria`, `auditoria_sistema`, `sesiones_usuario`, `reportes`, `ejecuciones_reporte`, `notificaciones` |

## Seguridad

- Las 37 tablas tienen RLS habilitado.
- `anon` y `authenticated` no tienen privilegios directos sobre tablas o
  secuencias de `public`.
- No existen políticas para esas claves porque el acceso directo desde React
  está prohibido por la arquitectura del proyecto.
- El cliente secreto de Express conserva acceso como `service_role`.
- Los privilegios predeterminados están revocados. Toda tabla futura debe
  conceder explícitamente al backend solo las operaciones necesarias.

Los avisos `rls_enabled_no_policy` del asesor de Supabase son informativos y
esperados en este modelo backend-only. No deben solucionarse creando políticas
públicas.

Las cuatro funciones administrativas son `SECURITY INVOKER`. `anon`,
`authenticated` y `PUBLIC` tienen cero permisos de ejecución; solo
`service_role` puede invocarlas desde Express. La comprobación posterior a la
migración confirmó las cuatro concesiones y ninguna exposición pública.

## Extensiones del modelo

| Objeto | Cambio |
|---|---|
| `usuarios` | Se agregó `pais` para el contrato de perfil. |
| `perfiles_instructores` | Perfil uno-a-uno con especialidad y años de experiencia. |
| `categorias` | Se agregó `slug` obligatorio y único; se conservaron las 8 categorías existentes. |
| `cursos` | Se agregó `slug` obligatorio y único. |
| `cursos_instructores` | Solo puede existir un instructor principal por curso. |

## Modelo, perfiles y catálogo — Fases 3 a 5

- `perfiles_instructores` y `cursos_instructores` permiten desactivación lógica.
- Categorías y cursos registran creación, actualización y usuario responsable.
- Precio, duración y fechas de curso tienen restricciones de integridad.
- Los índices nuevos cubren actores, auditoría, asignaciones y flujo de cursos.
- Triggers actualizan timestamps y auditan categorías/cursos.
- RPC atómicas administran roles, perfiles de instructor, instructor principal
  y el bootstrap de un solo primer administrador.
- El último administrador no puede perder su rol y los cursos no se eliminan:
  pasan al estado `Archivado`.

## Inscripciones y progreso — Fase 6

- `inscripciones` y `progreso_lecciones` conservan su modelo y reciben fecha
  de actualización automática.
- Restricciones validan montos no negativos, fechas y porcentajes entre 0 y
  100 con consistencia entre `completada` y `fecha_completado`.
- Índices compuestos cubren biblioteca del usuario, progreso de la inscripción
  y búsquedas por lección.
- `academix_enroll_user` crea o reactiva una inscripción de forma atómica.
- `academix_set_lesson_progress` usa UPSERT, valida pertenencia y finaliza o
  reactiva automáticamente la inscripción.
- Ambas funciones son `SECURITY INVOKER`, sin ejecución para `anon`,
  `authenticated` ni `PUBLIC`; únicamente `service_role` puede llamarlas.

## Aula y contenido — Fase 7

- Se creó el bucket privado `academix-course-content`, con límite de 25 MB y
  lista explícita de MIME permitidos.
- `modulos`, `lecciones` y `recursos` registran creación, actualización y
  actores responsables; `archivos` registra curso, uploader y SHA-256.
- Posiciones, duración, tamaño, hash y origen único URL/archivo tienen
  restricciones de integridad.
- Índices parciales cubren árboles activos, actores y claves foráneas de
  recursos/archivos.
- Triggers actualizan timestamps, auditan cambios y bloquean escrituras de
  contenido cuando el curso está publicado o archivado.
- `anon`, `authenticated` y `PUBLIC` siguen sin acceso directo. Express usa
  `service_role` y descarga desde Storage solo después de autorizar al usuario.
- La reproducción protegida transmite desde Storage mediante Express y admite
  rangos de bytes `200/206`; no almacena el objeto completo en memoria ni
  expone rutas internas o URLs firmadas.
- El cierre de la fase no requiere otra migración porque no agrega ni modifica
  objetos de PostgreSQL o Storage.

## Reseñas y certificados — Fases 8 y 9

- `resenas_cursos` vincula una reseña con una inscripción finalizada y exige
  calificación 1–5, comentario de 10–2000 caracteres y unicidad por inscripción.
- La visibilidad y el motivo permiten moderación lógica auditada sin borrar
  reseñas. Solo las activas y visibles participan en el catálogo.
- `certificados` conserva su tabla y datos; se agregan actualización, revocación
  y unicidad por usuario + curso.
- Un trigger sobre `inscripciones` emite o reactiva el certificado de
  finalización de forma idempotente y lo revoca si la inscripción deja de
  cumplir las condiciones.
- Las RPC de creación y moderación son `SECURITY INVOKER`. `PUBLIC`, `anon` y
  `authenticated` no pueden ejecutarlas; solo `service_role` accede desde
  Express.

## Gestión de reseñas — Fase 8

- `academix_course_review_stats(uuid[])` calcula promedio y cantidad por curso
  dentro de PostgreSQL; evita transferir todas las reseñas al proceso Node.js.
- La función es `SECURITY INVOKER`, usa un `search_path` vacío y solo concede
  ejecución a `service_role`.
- `idx_resenas_activas_fecha` acelera la bandeja administrativa por fecha sin
  indexar filas desactivadas.
- `resenas_cursos` conserva RLS y no concede lectura a `anon` ni
  `authenticated`; los listados público y administrativo pasan por Express.
- La revisión posterior no encontró nuevos avisos de seguridad ni índices de
  claves foráneas faltantes. Los índices sin uso siguen siendo informativos
  mientras no exista tráfico representativo.

## Integridad de certificados — Fase 9

- `certificados` conserva sus filas y añade snapshots inmutables de nombre del
  destinatario, título del curso, duración, emisor y versión de plantilla.
- `fecha_emision` usa `timestamp with time zone` y se normaliza a milisegundos.
- Cada credencial almacena una firma SHA-256 calculada sobre IDs, código, fecha
  y contenido visible; un trigger impide modificar su identidad después de la
  emisión.
- La emisión sigue siendo automática e idempotente. Cambiar
  `permite_certificado` también reactiva/emite o revoca credenciales elegibles.
- `academix_certificate_signature_is_valid(uuid)` es `SECURITY INVOKER` y solo
  `service_role` puede ejecutarla desde Express.
- `anon` y `authenticated` siguen sin acceso directo. `service_role` conserva
  únicamente `SELECT`, `INSERT` y `UPDATE` sobre `certificados`, sin `DELETE` ni
  `TRUNCATE`; en `tipos_certificado` solo puede leer.

## Regularización 6.5

- Se agregan los siete índices de claves foráneas pendientes informados por el
  asesor de rendimiento de Supabase.
- Los índices cubren evaluaciones, reportes, ejecuciones, resultados y
  verificaciones sin modificar ni eliminar filas.
- `npm run supabase:verify` comprueba las 37 tablas públicas y que
  `academix-course-content` continúe siendo privado.

Los índices nuevos cubren los filtros iniciales del catálogo y las claves
foráneas que usa esta fase. Los avisos de índices sin uso se conservaron porque
las tablas de negocio aún están vacías y no existe tráfico representativo.

## Migraciones aplicadas

| Versión | Nombre |
|---|---|
| `20260811153229` | `setup_auth_profile` |
| `20260811172558` | `secure_backend_only_data_api` |
| `20260811172617` | `extend_profiles_catalog` |
| `20260811180231` | `admin_roles_course_workflow` |
| `20260811194429` | `student_enrollments_progress` |
| `20260811194549` | `index_enrollment_foreign_keys` |
| `20260811201127` | `course_content_authoring_storage` |
| `20260812031205` | `reviews_certificates` |
| `20260812035330` | `phase_6_5_foreign_key_indexes` |
| `20260812160334` | `phase_8_review_management` |
| `20260812170757` | `phase_9_certificate_integrity` |

## Auditoría final — Fase 10

- Las 37 tablas continúan con RLS y sin DML para `anon` o `authenticated`.
- Las 10 funciones de `public` son `SECURITY INVOKER`; ninguna es ejecutable
  por los roles del Data API.
- No existen claves foráneas sin índice inicial.
- El bucket de contenido continúa privado.
- No se creó migración: el cierre HTTP y operativo no requiere DDL.
- Los 37 avisos de RLS sin política son el bloqueo backend-only esperado; los
  índices sin uso se conservan hasta tener estadísticas representativas.
