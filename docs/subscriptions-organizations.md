# Planes y organizaciones

La migración `20261109020000_subscriptions_organizations.sql` es incremental y debe aplicarse después de las migraciones existentes, usando el procedimiento de migraciones del proyecto. No se aplica automáticamente desde las pruebas ni desde Express.

Los precios se conservan en `planes`: Plus mensual 19.99 MXN, Plus anual 199.99 MXN; Organizaciones mensual 1000 MXN según la decisión del usuario. Campus conserva contacto comercial y no permite compra. La respuesta pública `GET /api/v1/plans` es la fuente de precios, vigencias y beneficios de la interfaz.

`POST /api/v1/subscriptions/simulated-purchase` acepta únicamente `planId`, `idempotencyKey` UUID y `organizationId` cuando corresponde. La identidad siempre proviene del JWT. Una RPC bloquea la cuenta y, en compras institucionales, la organización; valida rol, registra suscripción y recibo en una misma transacción. La repetición de una clave devuelve el mismo recibo; reutilizarla para otra selección produce conflicto. La renovación amplía el vencimiento vigente. Los importes son simulados y no se reciben datos bancarios.

`GET /api/v1/subscriptions` y `/api/v1/subscriptions/transactions` aceptan `page` y `limit` (máximo 50). El historial de transacciones pertenece exclusivamente al comprador autenticado. Los miembros pueden consultar la suscripción de sus organizaciones; administrar miembros no requiere una suscripción vigente.

Las inscripciones registran `origen_acceso`: individual, Plus o institucional. Los cursos independientes existentes conservan su acceso individual; las inscripciones institucionales previas sin pago se identifican por su organización. Plus incluye los cursos independientes marcados `incluido_plus`, cuyo valor inicial es verdadero; no concede acceso a organizaciones ajenas. La consulta protegida y los cambios de progreso validan la vigencia actual. Las escrituras institucionales de cursos, contenido y asignaciones también tienen protección en PostgreSQL. Las compras individuales sobreviven al vencimiento de una suscripción. `academix_course_access_expiry` devuelve el vencimiento preciso de la suscripción o null para adquisición individual, después de verificar el acceso.

Las organizaciones se consultan sin filtrar por estado de pago. La migración recupera únicamente membresías ausentes del creador; nunca reactiva una membresía revocada. La respuesta distingue propietario, rol, actividad, vigencia y capacidades. La vista agrega los miembros dentro de PostgreSQL y evita una solicitud por organización.

`DELETE /api/v1/organizations/:organizationId` solo autoriza al propietario que conserva administración activa. La operación bloquea la organización, archiva sus cursos, desactiva membresías, cancela su suscripción y marca la eliminación. Conserva cuentas, materiales, progresos, certificados y cursos ajenos. La repetición autorizada es idempotente. No se convierte contenido institucional en catálogo público ni se elimina físicamente información compartida.

## Verificación aislada

`npm test -- --run tests/subscription-routes.test.ts tests/subscription-service.test.ts tests/organization-service.test.ts`

Para PostgreSQL aislado, definir `PGLITE_MODULE` con la ubicación local de `@electric-sql/pglite/dist/index.js` y ejecutar `node tests/sql/subscriptions-organizations.integration.mjs`. El script crea un motor desechable en memoria y no lee credenciales ni abre una conexión a Supabase. Verifica precios, autorización, recuperación de propietarios, membresías revocadas, replay/conflicto, duplicados concurrentes, rollback, vigencia, progresos, escrituras institucionales, preservación al eliminar y permisos de `anon`/`authenticated`.
