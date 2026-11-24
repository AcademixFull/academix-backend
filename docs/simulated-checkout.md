# Compra simulada

Aplicar `supabase/migrations/20261106020000_simulated_checkout.sql` antes de desplegar la API y el frontend. No se ha ejecutado contra ninguna base de datos real. La migración necesita el esquema base existente de Academix y todas las migraciones anteriores, en particular `20260906050000_organizations_foundation.sql`. No crea el esquema base completo.

El frontend usa `VITE_DATA_SOURCE=api` y `VITE_API_URL` con el prefijo `/api/v1`; la API conserva su configuración Supabase habitual y su clave secreta solo en servidor. La confirmación requiere conexión.

`POST /api/v1/checkout/simulated`, con JWT Bearer:

```json
{
  "courseIds": ["22222222-2222-4222-8222-222222222222"],
  "idempotencyKey": "66666666-6666-4666-8666-666666666666"
}
```

Acepta de 1 a 50 UUID únicos. Rechaza campos adicionales, incluidos precio, usuario, importe y datos financieros. El usuario proviene exclusivamente de la sesión verificada. Devuelve el sobre `{success:true,data:...}` habitual; `data` contiene `id`, `mode:"simulated"`, `currency:"MXN"`, `total`, `items` y `enrollments`. Cada item incluye `courseId`, `enrollmentId`, `amount` y `alreadyOwned`; las inscripciones conservan el contrato de la biblioteca del estudiante.

El servidor calcula los importes actuales. La confirmación se guarda de forma durable en `compras_simuladas`; no mueve dinero y `inscripciones.monto_pagado` permanece en cero. Repetir la misma clave y cursos devuelve el mismo recibo. Usar esa clave con otro carrito produce `IDEMPOTENCY_CONFLICT`. Otra clave para un curso activo/completado devuelve importe cero y no modifica progreso, fechas ni certificados. El bloqueo por usuario y la restricción existente `uq_usuario_curso` impiden inscripciones duplicadas.

La operación es atómica: si un curso no está publicado, requiere aprobación o pertenece a una organización sin membresía activa, se rechaza el carrito completo. Los miembros activos conservan la inscripción institucional con importe cero. Las inscripciones pendientes/inactivas no se convierten en acceso mediante la simulación. El RPC es `security invoker`; solo `service_role` tiene permiso de ejecución y acceso a la nueva tabla.

Después de confirmar, el frontend actualiza la biblioteca de la cuenta que inició la compra, vacía su carrito y emite `academix:enrolled`. La PWA existente escucha ese evento y descarga el material con las comprobaciones de sesión existentes. Un cambio de cuenta durante la petición conserva el carrito de la cuenta nueva. Los errores conservan el carrito y la clave para reintentar.

## Verificación SQL aislada

El harness `tests/sql/simulated-checkout.integration.mjs` crea en memoria las tablas y roles mínimos que toca el RPC, aplica la migración y ejecuta la función real con PGlite. No utiliza credenciales ni se conecta a Supabase. Instalar `@electric-sql/pglite` en un directorio temporal externo al proyecto y señalar su módulo:

```powershell
$env:PGLITE_MODULE="C:\ruta\temporal\node_modules\@electric-sql\pglite\dist\index.js"
node tests/sql/simulated-checkout.integration.mjs
```

Comprueba precio de servidor, repetición, claves en conflicto, propiedad/completado, rollback, organización, aprobación, inscripciones pendientes, publicación, usuario activo y denegación a roles del navegador. La fixture cubre las tablas usadas por la función, no todos los triggers o datos de una instalación real. Los bloqueos entre conexiones independientes deben validarse adicionalmente en una copia PostgreSQL de pruebas con el esquema completo antes de producción.
