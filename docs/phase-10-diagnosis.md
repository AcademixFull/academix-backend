# Diagnóstico previo — Fase 10

Fecha de revisión: 2026-08-12. La inspección se realizó después de validar la
Fase 9 y antes de implementar cambios de cierre.

## Resultado del proyecto Supabase

| Control | Resultado |
|---|---:|
| Tablas de `public` | 37 |
| Tablas con RLS | 37 |
| Tablas con DML para `anon`/`authenticated` | 0 |
| Funciones públicas | 10 |
| Funciones `SECURITY DEFINER` | 0 |
| Funciones ejecutables por roles del Data API | 0 |
| Claves foráneas sin índice inicial | 0 |
| Bucket `academix-course-content` privado | Sí |

El asesor de seguridad informó 37 avisos `rls_enabled_no_policy` de nivel
informativo. Son esperados: RLS sin políticas forma parte del modelo
backend-only y evita el acceso directo desde React. Crear políticas para
eliminarlos abriría una superficie que la arquitectura prohíbe.

El único aviso de seguridad no informativo es
`auth_leaked_password_protection`. Se corrige desde la configuración de Auth
del Dashboard cuando la opción esté disponible en el plan; no corresponde a
una migración SQL. El asesor de rendimiento solo reportó índices sin uso. No se
eliminan porque todavía no hay tráfico representativo para evaluarlos.

## Estado HTTP encontrado

Ya existían Helmet, CORS por lista explícita, parser JSON de 1 MB, errores
centralizados, JWT verificado con Supabase y cierre ordenado de proceso. Los
faltantes para producción eran límite de solicitudes, configuración explícita
de proxy, correlación de logs, no-cache uniforme para datos sensibles,
readiness real, integración opt-in y especificación OpenAPI.

## Decisión

La Fase 10 no requiere migración. Los cambios se limitan al servidor Express,
pruebas, CI/documentación y una lista de configuración manual del proyecto. No
se eliminan ni modifican filas, tablas, índices, RLS o Storage.
