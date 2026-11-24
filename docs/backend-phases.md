# Fases oficiales del backend de Academix

Este documento es la referencia única de numeración. Algunos commits anteriores
agruparon varias fases para mantener operaciones relacionadas en una sola
migración; eso no cambia el alcance oficial.

| Fase | Alcance | Estado del código |
|---|---|---|
| 1 | Fundamentos y arquitectura base | Completa |
| 2 | Autenticación y seguridad con Supabase | Completa después de la regularización 6.5 |
| 3 | Modelo de datos y migraciones | Completa después de los índices 6.5 |
| 4 | Usuarios, roles y perfiles | Completa |
| 5 | Catálogo de cursos | Completa; requiere datos reales para validación integral |
| 6 | Inscripciones y progreso | Completa; requiere datos reales para validación integral |
| 7 | Aula virtual y contenido educativo | Completa: autoría, acceso, streaming y progreso |
| 8 | Reseñas y calificaciones | Completa: publicación, listado público, agregados y moderación |
| 9 | Certificados | Completa: emisión, snapshots, firma, revocación y verificación |
| 10 | Integración final, seguridad y producción | Implementada; pendiente de validación local final |

## Correspondencia de migraciones

| Migración | Fases oficiales |
|---|---|
| `setup_auth_profile` | 2 y base de 4 |
| `secure_backend_only_data_api` | 2 y 3 |
| `extend_profiles_catalog` | 3, 4 y 5 |
| `admin_roles_course_workflow` | 4 y 5 |
| `student_enrollments_progress` | 6 |
| `index_enrollment_foreign_keys` | 6 |
| `course_content_authoring_storage` | 7 |
| `reviews_certificates` | 8 y 9 |
| `phase_6_5_foreign_key_indexes` | Regularización previa a 7 |
| `phase_8_review_management` | 8 |
| `phase_9_certificate_integrity` | 9 |

## Criterio para cerrar la Fase 7

- Módulos y lecciones ordenados y accesibles desde el aula.
- Recursos externos y archivos privados autorizados por inscripción.
- Reproducción de audio/video con respuestas parciales HTTP (`Range`).
- Tracking de progreso coherente con lecciones activas.
- Prueba real del flujo curso → inscripción → aula → progreso.
- Contrato y guía de validación actualizados.

## Criterio para cerrar la Fase 8

- Una sola reseña por inscripción finalizada y calificación entre 1 y 5.
- Listado público paginado sin campos internos de moderación.
- Promedio y cantidad calculados en PostgreSQL con reseñas visibles.
- Bandeja administrativa paginada, filtrable y protegida por rol.
- Ocultar y restaurar sin eliminar filas.
- RLS y permisos backend-only conservados.

## Criterio para cerrar la Fase 9

- Emisión automática e idempotente al completar un curso elegible.
- Datos históricos inmutables aunque cambie el perfil o el curso.
- Emisor Academix, fecha con zona horaria y firma SHA-256 verificable.
- Revocación y reactivación coherentes con inscripción y configuración.
- Consulta propia protegida y verificación pública sin datos personales
  internos.
- RLS, funciones `SECURITY INVOKER` y permisos mínimos para `service_role`.

## Criterio para cerrar la Fase 10

- Rate limiting general y reforzado para Auth con respuesta JSON uniforme.
- Proxy confiable explícito, request ID, logs estructurados y no-cache para
  respuestas sensibles.
- Liveness separado de readiness real contra Postgres.
- Pruebas offline reproducibles e integración real de solo lectura opt-in.
- Auditoría de dependencias, Supabase y contrato OpenAPI 3.1.
- Checklist documentado de despliegue, monitoreo, secretos y recuperación.
- Sin abrir el Data API ni agregar una migración innecesaria.
