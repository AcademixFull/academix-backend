# Diagnóstico y diseño — Fase 8

Diagnóstico realizado sobre el proyecto Supabase `academix` antes de aplicar
la migración incremental de esta fase.

## Estado encontrado

- `resenas_cursos` ya almacenaba una reseña única por inscripción finalizada,
  calificación de 1 a 5, comentario y moderación lógica.
- `academix_create_course_review` y `academix_moderate_course_review` ya eran
  funciones `SECURITY INVOKER` exclusivas de `service_role`.
- RLS estaba habilitado y `anon`/`authenticated` no tenían acceso directo.
- La API permitía crear y moderar, pero no tenía listado público paginado ni
  bandeja administrativa.
- El catálogo obtenía los promedios cargando las reseñas completas en Node.js,
  lo que no escala con el volumen de cursos y comentarios.

## Diseño autorizado

1. Conservar tablas, filas, funciones y restricciones existentes.
2. Agregar una función agregada para promedio y cantidad por varios cursos.
3. Restringir esa función a `service_role`, con `SECURITY INVOKER` y
   `search_path` vacío.
4. Agregar un índice parcial por fecha para la bandeja de reseñas activas.
5. Exponer listados paginados mediante Express: uno público y otro exclusivo
   de administradores.
6. Mantener la moderación lógica, permitiendo ocultar y restaurar sin borrar.

## Resultado verificado

- Migración registrada: `20260812160334_phase_8_review_management`.
- La función agregada responde correctamente incluso con una lista vacía.
- `anon_execute=false`, `authenticated_execute=false` y
  `service_role_execute=true` para la nueva función.
- RLS continúa habilitado en `resenas_cursos`; los roles públicos no pueden
  seleccionar la tabla.
