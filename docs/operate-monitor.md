# Operación y monitoreo de Academix

| Fase | Herramientas | Responsabilidad |
| --- | --- | --- |
| Release | Release Please + GitHub Actions | Versiones, changelog y publicación de releases. |
| Deploy | Vercel (frontend), Render (backend) | Compilar y publicar los cambios aprobados de main. |
| Operate | Vercel + Render + Supabase | Servir el frontend, ejecutar la API y mantener los servicios de datos y autenticación. |
| Monitor | Sentry + controles de salud y registros de las plataformas | Detectar errores, revisar disponibilidad y diagnosticar incidentes. |

Una herramienta puede cubrir varias fases. No se requiere añadir Docker o Kubernetes para llamar Operate al funcionamiento de esta infraestructura administrada.

## Captura de errores

- Organización Sentry: https://marco-antonio.sentry.io/issues/
- Proyectos separados: `academix-frontend` (React) y `academix-backend` (Node).
- Frontend: `VITE_SENTRY_DSN` en Vercel, Production. Vite incorpora esta variable al compilar; requiere un nuevo despliegue. Desarrollo local y pruebas no envían eventos automáticamente. Para capturar Preview, agregar su DSN y `VITE_SENTRY_ENVIRONMENT=preview` a ese entorno.
- Backend: `SENTRY_DSN` y `SENTRY_ENVIRONMENT=production` en Render. La inicialización se carga antes de la aplicación, registra errores inesperados y AppError con estado >=500; los 4xx esperados no se reportan. También captura excepciones globales y promesas rechazadas.
- Se incluye la versión de package.json; en Render se incorpora también `RENDER_GIT_COMMIT` si existe. Release Please actualiza la versión en cada release. Esto identifica errores por versión, pero no configura carga de source maps ni la integración de repositorios de Sentry.
- La captura usa una lista de campos permitidos: identificador, entorno, versión y traza técnica. Omite cuerpo de solicitudes, cabeceras, cookies, usuarios, breadcrumbs, variables locales y mensajes originales de excepciones. Estos últimos pueden contener credenciales devueltas por un proveedor. Se conserva archivo, función, línea y columna.
- No se activan Session Replay, trazas de rendimiento ni grabación de logs. Las trazas del frontend compilado pueden apuntar a archivos minificados; cargar source maps privados requiere configuración adicional y un token de compilación, que nunca debe usar prefijo VITE_.

## Verificación manual

Desde el directorio correspondiente, definir temporalmente `SENTRY_DSN` en el proceso y ejecutar:

```sh
node scripts/verify-monitoring.mjs
```

Usa el DSN del proyecto que corresponde a ese repositorio, no un token de autenticación. Envía un único error sintético en el entorno `verification`. Confirmar su recepción en Issues; no confundir esta prueba del SDK con una prueba del despliegue productivo. No se agrega un botón público ni una ruta que provoque errores en producción.

Las pruebas de privacidad comprueban que datos de solicitudes y credenciales no sobreviven al filtro. El backend también verifica que errores 4xx se excluyen y errores 5xx se reportan.

## Operación diaria y respuesta a incidentes

1. Comprobar que el despliegue productivo de Vercel y el servicio Render estén activos. Consultar sus registros ante fallos.
2. Revisar `GET https://academix-api-eioa.onrender.com/api/v1/health` para liveness y `/api/v1/health/ready` para comprobar la conexión de lectura con Supabase. Un 503 de readiness indica que la dependencia no está lista, aunque el proceso esté vivo.
3. Revisar Issues en Sentry filtrando por proyecto, entorno y versión. La ausencia de errores en Sentry no garantiza disponibilidad: una API caída no puede enviar eventos.
4. Si el incidente comenzó con un despliegue, comparar el commit con el último despliegue sano y usar la recuperación de la plataforma o un revert revisado en GitHub. No revertir cambios de datos automáticamente.
5. Corregir el problema mediante PR, ejecutar CI, desplegar y verificar el comportamiento antes de resolver el issue.

## Alcance y pendientes operativos

Verificado en Render: `academix-api` usa `/api/v1/health/ready` como health check HTTP y despliega `main` después de aprobar CI (`checksPass`). El endpoint devolvió HTTP 200 con `database=ok`. Este control incluye Supabase: una caída de la base de datos también puede marcar la API como no lista y provocar reinicios. El servicio está en el plan Free; no se declara disponibilidad permanente garantizada.

Las variables de Sentry fueron guardadas en Vercel Production y en Render. La captura automática requiere publicar el código de esta integración y comprobar el nuevo despliegue; los eventos sintéticos del entorno `verification` solo confirman recepción desde los SDK.

Sentry para errores no reemplaza un monitor externo de disponibilidad. Los canales de alertas, destinatarios y frecuencia deben verificarse en Sentry y en cada plataforma; no se presume que Slack u otro canal esté conectado. La disponibilidad continua depende del plan y los límites contratados de Vercel, Render y Supabase.

Referencias: [Render Health Checks](https://render.com/docs/health-checks), [Sentry React](https://docs.sentry.io/platforms/javascript/guides/react/), [Sentry Express](https://docs.sentry.io/platforms/javascript/guides/express/).
