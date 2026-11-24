# academix-backend

API REST de **Academix**, la plataforma educativa. Proyecto **completamente
independiente** de `academix-frontend`: repositorio propio, `package.json`
propio, variables de entorno propias y despliegue propio.

## Propósito

Este backend es responsable de la lógica de negocio, la validación, la
autorización y el acceso seguro a Supabase PostgreSQL. `academix-frontend`
no se conecta directamente a Supabase para autenticación, datos ni reglas
de negocio: todo pasa por esta API.

La infraestructura HTTP, **Supabase Auth**, perfiles y el catálogo inicial ya
están conectados. El backend registra e inicia sesiones, valida JWT en cada
ruta protegida y mantiene las claves de Supabase fuera del frontend.

## Stack

- Node.js (>= 20, probado con Node 22/24)
- Express 4
- TypeScript (`strict: true`)
- Zod (validación de entorno y, en las siguientes fases, solicitudes)
- CORS + Helmet + rate limiting
- Vitest + Supertest (pruebas)

## Requisitos

- Node.js 20 o superior
- npm

## Instalación

```bash
npm install
```

## Variables de entorno

Copia `.env.example` a `.env` y completa los valores:

```bash
cp .env.example .env
```

| Variable | Obligatoria | Descripción |
|---|---|---|
| `PORT` | No (default `3000`) | Puerto donde escucha Express. |
| `NODE_ENV` | No (default `development`) | `development` \| `production` \| `test`. |
| `TRUST_PROXY_HOPS` | No (default `0`) | Cantidad exacta de proxies confiables delante de Express. |
| `RATE_LIMIT_WINDOW_MS` | No (default `900000`) | Ventana del límite por IP, entre 1 segundo y 1 hora. |
| `RATE_LIMIT_MAX` | No (default `300`) | Solicitudes generales permitidas por IP y ventana. |
| `AUTH_RATE_LIMIT_MAX` | No (default `10`) | Solicitudes adicionales permitidas para registro, login y recuperación. |
| `FRONTEND_URL` | **Sí** | Uno o más orígenes HTTP/HTTPS autorizados para CORS, separados por comas. No admite rutas. |
| `SUPABASE_URL` | **Sí** | URL del proyecto `academix` en Supabase. |
| `SUPABASE_PUBLISHABLE_KEY` | **Sí** | Clave publicable moderna para operaciones de Auth. |
| `SUPABASE_SECRET_KEY` | **Sí** | Clave secreta exclusiva del backend para perfiles y roles. |
| `PASSWORD_RESET_REDIRECT_URL` | **Sí** | URL completa del formulario del frontend al que vuelve el correo de recuperación. Debe estar permitida en Supabase Auth. |
| `EMAIL_CONFIRMATION_REDIRECT_URL` | No | Raíz pública del frontend para confirmar correo. Si se omite, usa la URL de recuperación. Debe estar permitida en Supabase Auth. |

Todas las variables se leen y validan en un único lugar: `src/config/env.ts`.
Ningún otro archivo accede a `process.env` directamente.

## Comandos disponibles

| Comando | Descripción |
|---|---|
| `npm run dev` | Levanta el servidor en modo desarrollo con recarga automática (`tsx watch`). |
| `npm run build` | Compila TypeScript a `dist/` (`tsc`). |
| `npm run start` | Ejecuta el build ya compilado (`node dist/server.js`). Requiere `npm run build` antes. |
| `npm run typecheck` | Verifica tipos sin generar archivos. |
| `npm run lint` | Corre ESLint sobre todo el proyecto. |
| `npm run test` | Corre las pruebas con Vitest. **No requiere `.env`**: `vitest.config.ts` inyecta variables de entorno seguras solo para la ejecución de pruebas (ver más abajo). |
| `npm run test:integration` | Ejecuta dos comprobaciones reales de solo lectura con el `.env` local. No forma parte de `check`. |
| `npm run test:watch` | Mantiene Vitest observando cambios durante el desarrollo. |
| `npm run admin:bootstrap -- --email correo` | Asigna una sola vez el primer Administrador a una cuenta ya registrada. |
| `npm run supabase:verify` | Comprueba de forma no destructiva las 37 tablas y el bucket privado usando el `.env` local. |
| `npm run verify:production` | Ejecuta check, audit, verificación de Supabase e integración real. |
| `npm run check` | Ejecuta lint, typecheck, pruebas y build en ese orden. |

## Ejecución en desarrollo

```bash
npm run dev
```

Deberías ver:

```
Backend ejecutándose en:
http://localhost:3000
Entorno: development
```

## Build de producción

```bash
npm run build
npm run start
```

## Pruebas

```bash
npm test
```

Las pruebas de `tests/` (Vitest + Supertest) **no requieren un
`.env` local**. `vitest.config.ts` define `test.env` con valores seguros
de prueba (`NODE_ENV=test`, `PORT=3000`, URL del frontend y credenciales
ficticias de Supabase)
que se inyectan en `process.env` únicamente durante la ejecución de
Vitest, antes de que se cargue `src/config/env.ts`. Esto permite clonar
el repositorio y ejecutar `npm install && npm test` sin ningún paso
manual de configuración.

Las pruebas bajo `tests/integration/` sí usan el `.env` local y se ejecutan de
forma explícita con `npm run test:integration`. Solo consultan readiness y
catálogo; no crean usuarios, cursos ni filas.

## Estructura del proyecto

```
academix-backend/
├── src/
│   ├── config/
│   │   ├── cors.ts             # política CORS centralizada
│   │   └── env.ts              # lectura y validación (Zod) de variables de entorno
│   │   └── supabase.ts         # clientes Auth y Admin exclusivos del servidor
│   ├── controllers/
│   │   ├── auth.controller.ts
│   │   ├── catalog.controller.ts
│   │   ├── profile.controller.ts
│   │   └── health.controller.ts
│   ├── errors/
│   │   └── app-error.ts        # errores operativos seguros y tipados
│   ├── routes/
│   │   ├── catalog.routes.ts
│   │   ├── health.routes.ts
│   │   ├── profile.routes.ts
│   │   └── index.ts            # registra todos los routers de /api/v1
│   ├── repositories/            # acceso exclusivo del backend a Supabase
│   ├── middleware/
│   │   ├── error-handler.ts    # manejador central de errores (JSON, sin stack trace al cliente)
│   │   ├── require-auth.ts      # valida Authorization: Bearer con Supabase Auth
│   │   ├── rate-limit.ts        # cuotas generales y reforzadas para Auth
│   │   ├── request-context.ts   # X-Request-Id y logs estructurados
│   │   └── not-found.ts        # 404 en formato JSON consistente
│   ├── services/                # Auth y reglas de perfil/catálogo
│   ├── types/
│   │   └── api.types.ts        # éxito, error y paginación compartidos
│   ├── utils/
│   │   └── api-response.ts     # constructores del sobre común
│   ├── app.ts                  # crea y configura la app Express (sin arrancarla)
│   └── server.ts               # arranca el servidor HTTP
├── tests/                       # health, CORS, errores, entorno y respuestas
├── .github/workflows/ci.yml     # validación automática en GitHub
├── .env.example
├── package.json
├── tsconfig.json
└── eslint.config.js
```

La capa `services/` contiene reglas de aplicación y transformación al contrato
del frontend. `repositories/` concentra todas las consultas de datos mediante
el cliente secreto del servidor.

## Endpoint disponible

### `GET /api/v1/health`

Público, sin autenticación.

```bash
curl http://localhost:3000/api/v1/health
```

```json
{
  "success": true,
  "data": {
    "status": "ok",
    "environment": "development",
    "uptime": 12.345,
    "timestamp": "2026-07-30T12:00:00.000Z"
  }
}
```

`GET /api/v1/health/ready` comprueba además la conexión real de solo lectura a
Postgres y responde `503 SERVICE_UNAVAILABLE` sin filtrar detalles cuando la
dependencia no está disponible. Usa liveness y readiness por separado en el
proveedor de despliegue.

## Cierre de producción

La Fase 10 agrega límites por IP, configuración explícita de proxy,
`X-Request-Id`, logs JSON, `Cache-Control: no-store` en datos sensibles y
pruebas de integración opt-in. El limitador incluido usa memoria por proceso;
si el backend se escala horizontalmente debe configurarse un store compartido.

- Contrato procesable: [`docs/openapi.yaml`](docs/openapi.yaml)
- Validación final: [`docs/phase-10-validation.md`](docs/phase-10-validation.md)
- Checklist de despliegue: [`docs/production-checklist.md`](docs/production-checklist.md)

## Autenticación

| Método | Ruta | Protección |
|---|---|---|
| `POST` | `/api/v1/auth/register` | Pública |
| `POST` | `/api/v1/auth/login` | Pública |
| `POST` | `/api/v1/auth/password-reset` | Pública |
| `PATCH` | `/api/v1/auth/password` | Bearer token de recuperación |
| `GET` | `/api/v1/auth/me` | Bearer token |
| `POST` | `/api/v1/auth/logout` | Bearer token |

El registro recibe `{ fullName, email, password }`. Login devuelve el
`AuthSession` esperado por el frontend: `{ user, accessToken, expiresAt }`.
Si la confirmación de correo está activa en Supabase, el registro responde
`403 EMAIL_CONFIRMATION_REQUIRED` hasta que el usuario confirme su cuenta.

La recuperación envía al usuario a `PASSWORD_RESET_REDIRECT_URL`. La pantalla
del frontend obtiene el token de recuperación y envía
`PATCH /api/v1/auth/password` con `{ "password": "nueva-clave" }`. Después del
cambio, el backend revoca las sesiones mediante el cliente administrativo.

Para proteger cualquier router futuro, agrega `requireAuth` antes del
controlador. El middleware valida el token contra Supabase Auth y deja la
identidad verificada en `req.auth`; ningún controlador debe confiar en un ID
de usuario o rol enviado por el navegador.

## Perfiles y catálogo

| Método | Ruta | Protección |
|---|---|---|
| `GET` | `/api/v1/categories` | Pública vía Express |
| `GET` | `/api/v1/courses` | Pública vía Express |
| `GET` | `/api/v1/courses/:courseId` | Pública vía Express |
| `GET` | `/api/v1/courses/:courseId/related` | Pública vía Express |
| `GET` | `/api/v1/instructors/:instructorId` | Pública vía Express |
| `GET` | `/api/v1/instructors/:instructorId/courses` | Pública vía Express |
| `GET` | `/api/v1/users/me` | Bearer token |
| `PATCH` | `/api/v1/users/me` | Bearer token |

Las rutas públicas significan que el navegador puede llamar a Express sin
sesión; no significan acceso directo a las tablas de Supabase. Solo se muestran
cursos activos y publicados. Hasta que se carguen cursos e instructores reales,
las colecciones correspondientes responden vacías.

## Administración de roles y cursos

Todas las rutas siguientes requieren JWT y rol `admin` obtenido de la base de
datos; el backend nunca acepta el rol enviado por React.

| Método | Ruta |
|---|---|
| `GET` | `/api/v1/admin/users` |
| `PATCH` | `/api/v1/admin/users/:userId/roles` |
| `GET` | `/api/v1/admin/instructors` |
| `PUT` | `/api/v1/admin/instructors/:userId` |
| `POST`, `PATCH` | `/api/v1/admin/categories`, `/api/v1/admin/categories/:categoryId` |
| `GET` | `/api/v1/admin/course-options` |
| `GET`, `POST` | `/api/v1/admin/courses` |
| `PATCH` | `/api/v1/admin/courses/:courseId` |
| `PUT` | `/api/v1/admin/courses/:courseId/instructor` |
| `POST` | `/api/v1/admin/courses/:courseId/publish` |
| `POST` | `/api/v1/admin/courses/:courseId/archive` |
| `POST` | `/api/v1/admin/courses/:courseId/restore` |

El instructor dispone de `GET` y `POST /api/v1/instructor/courses`,
`PATCH /api/v1/instructor/courses/:courseId` y
`POST /api/v1/instructor/courses/:courseId/submit`. Solo puede modificar un
borrador que tenga asignado. Al crear uno, el backend lo asigna exclusivamente
al instructor creador. Publicar, archivar y restaurar son operaciones de
administrador y los cambios sensibles quedan auditados.

Para crear el primer administrador, registra previamente la cuenta y ejecuta:

```bash
npm run admin:bootstrap -- --email admin@ejemplo.com
```

El comando no crea usuarios ni contraseñas y deja de funcionar en cuanto ya
existe un administrador activo. Las asignaciones posteriores se realizan por
la API; tampoco es posible retirar al último administrador.

## Inscripciones, aula y progreso

Estas rutas requieren un JWT válido y siempre obtienen el usuario desde el
token, nunca desde el cuerpo enviado por React:

| Método | Ruta | Resultado |
|---|---|---|
| `POST` | `/api/v1/courses/:courseId/enrollments` | Inscribe al usuario actual. |
| `GET` | `/api/v1/users/me/courses` | Devuelve su biblioteca y progreso. |
| `GET` | `/api/v1/users/me/courses/:courseId/learning` | Devuelve módulos, lecciones y avance. |
| `PATCH` | `/api/v1/lessons/:lessonId/progress` | Marca o desmarca `{ completed }`. |

Solo se permite la inscripción automática a cursos gratuitos, publicados,
activos y sin aprobación manual. Los pagos y las aprobaciones se rechazan con
un error explícito hasta que sus flujos sean implementados. La inscripción y
el progreso usan funciones atómicas de PostgreSQL; al completar todas las
lecciones activas, la inscripción cambia automáticamente a `completed`.

La guía de validación manual de esta fase está en
[`docs/phase-6-validation.md`](docs/phase-6-validation.md).

## Autoría de contenido y archivos privados

La Fase 7 agrega módulos, lecciones, contenido textual, recursos externos y
archivos de curso. Administradores e instructores autorizados usan únicamente
`/api/v1/authoring/*`; las cargas binarias pasan por Express y se almacenan en
el bucket privado `academix-course-content` con un límite de 25 MB y tipos MIME
permitidos.

Los alumnos reciben contenido dentro del aula y descargan archivos mediante
`GET /api/v1/lessons/:lessonId/resources/:resourceId/content`. El backend
comprueba la inscripción y actúa como proxy con streaming y rangos HTTP para
video/audio: React nunca recibe la clave secreta, la ruta interna ni una URL
directa de Supabase Storage.

La guía de prueba manual está en
[`docs/phase-7-validation.md`](docs/phase-7-validation.md).

## Reseñas y certificados

La Fase 8 permite que un alumno publique una sola reseña después de finalizar
el curso. El catálogo calcula `rating` y `reviewCount` mediante una agregación
en PostgreSQL que considera exclusivamente reseñas activas y visibles. El
público puede consultar esas reseñas con paginación y un administrador dispone
de una bandeja filtrable para ocultarlas o restaurarlas sin eliminar contenido.

| Método | Ruta | Protección |
|---|---|---|
| `GET` | `/api/v1/courses/:courseId/reviews` | Pública vía Express |
| `POST` | `/api/v1/courses/:courseId/reviews` | Bearer token + curso finalizado |
| `GET` | `/api/v1/admin/reviews` | Bearer token + `admin` |
| `PATCH` | `/api/v1/admin/reviews/:reviewId/moderation` | Bearer token + `admin` |
| `GET` | `/api/v1/users/me/certificates` | Bearer token |
| `GET` | `/api/v1/users/me/certificates/:certificateId` | Bearer token + propietario |
| `GET` | `/api/v1/certificates/verify/:credentialCode` | Pública vía Express |

Cuando el progreso completa todas las lecciones activas, PostgreSQL finaliza la
inscripción y emite de forma idempotente un certificado Academix si el curso lo
permite. El código `ACX-AAAA-XXXXXXXXXXXX` es único y verificable; si la
inscripción deja de estar finalizada, el certificado se revoca lógicamente.
El nombre del alumno, título, duración, fecha y emisor se guardan como una
fotografía inmutable del momento de emisión. Cada credencial tiene una firma
SHA-256 de Academix que el backend valida antes de entregar su detalle o
confirmar públicamente su autenticidad. React nunca consulta `certificados` ni
`resenas_cursos` directamente.

Las guías de prueba manual están en
[`docs/phase-8-validation.md`](docs/phase-8-validation.md) y
[`docs/phase-9-validation.md`](docs/phase-9-validation.md).

### Cualquier ruta no existente

```bash
curl http://localhost:3000/api/v1/ruta-que-no-existe
```

```json
{
  "success": false,
  "error": {
    "code": "NOT_FOUND",
    "message": "El recurso solicitado no existe."
  }
}
```

## Formato de respuestas

Toda la API responde con estos formatos:

**Éxito:**
```json
{ "success": true, "data": {} }
```

**Colección paginada:**
```json
{
  "success": true,
  "data": [],
  "pagination": { "page": 1, "limit": 12, "total": 0, "totalPages": 1 }
}
```

**Error:**
```json
{
  "success": false,
  "error": { "code": "ERROR_CODE", "message": "Mensaje seguro.", "fields": {} }
}
```

## Relación con academix-frontend

`academix-frontend` consume esta API mediante `VITE_API_URL` (definida
en su propio `.env`), por ejemplo:

```
VITE_API_URL=http://localhost:3000/api/v1
```

El frontend terminado ya contiene el cliente HTTP y el contrato de
integración. El backend debe conservar `/api/v1`, JSON en `camelCase` y el
sobre común documentado arriba. La especificación completa está en
[`docs/api-contract.md`](docs/api-contract.md).

## Relación con Supabase

Este backend es el único componente autorizado para usar `SUPABASE_SECRET_KEY`.
La migración `setup_auth_profile` crea automáticamente `public.usuarios`,
asigna el rol `Alumno`, habilita RLS y revoca el acceso directo de los roles
`anon` y `authenticated` a las tablas de identidad.

Las migraciones `secure_backend_only_data_api` y `extend_profiles_catalog`
extienden esa protección a las 37 tablas públicas, agregan perfiles de
instructores, slugs e índices del catálogo. El inventario verificado está en
[`docs/database-inventory.md`](docs/database-inventory.md).

`admin_roles_course_workflow` agrega autorización administrativa, auditoría,
restricciones de integridad y el ciclo `draft → review → published/archived`
sin recrear tablas ni eliminar datos.

`student_enrollments_progress` agrega integridad, índices y operaciones
atómicas para la biblioteca y el progreso, manteniendo las tablas inaccesibles
para el frontend.

`course_content_authoring_storage` agrega auditoría y reglas de integridad al
contenido, crea el bucket privado y bloquea cambios en cursos publicados o
archivados sin eliminar datos existentes.

`reviews_certificates` agrega reseñas verificadas y moderación lógica, además
de emisión automática, revocación y verificación de certificados de
finalización. Sus funciones son `SECURITY INVOKER` y solo `service_role` puede
ejecutarlas.

`phase_9_certificate_integrity` completa credenciales inmutables con emisor
Academix, firma SHA-256, validación de integridad y permisos mínimos sin
recrear la tabla ni reemplazar certificados existentes.

`contact_messages` agrega la bandeja persistente del formulario público. La
tabla conserva RLS y permisos cerrados para clientes; solo Express puede crear
mensajes mediante `POST /api/v1/contact/messages`.

## Fases oficiales

1. ~~Fundamentos y arquitectura base.~~
2. ~~Autenticación y seguridad con Supabase.~~
3. ~~Modelo de datos y migraciones.~~
4. ~~Usuarios, roles y perfiles.~~
5. ~~Catálogo de cursos.~~
6. ~~Inscripciones y progreso del estudiante.~~
7. ~~Aula virtual y contenido educativo.~~
8. ~~Reseñas y calificaciones.~~
9. ~~Certificados.~~
10. **Integración final, seguridad, pruebas y producción.**

La regularización 6.5 alinea documentación, recuperación de contraseña,
verificación operativa e índices antes de cerrar formalmente la Fase 7. El
detalle de correspondencia está en
[`docs/backend-phases.md`](docs/backend-phases.md).
Su guía de configuración y prueba está en
[`docs/phase-6-5-validation.md`](docs/phase-6-5-validation.md).
