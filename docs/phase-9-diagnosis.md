# Diagnóstico y diseño — Fase 9

Diagnóstico realizado sobre el proyecto Supabase `academix` antes de aplicar
la migración incremental de certificados.

## Estado encontrado

- `certificados` ya tenía RLS, código único, una fila por usuario/curso y
  revocación lógica.
- Un trigger emitía el certificado cuando la inscripción quedaba finalizada.
- La API ya ofrecía biblioteca, detalle propio y verificación pública.
- El nombre, título y duración se consultaban en vivo; un cambio posterior
  alteraba la representación histórica del certificado.
- No existían emisor explícito, firma del sistema ni verificación de integridad.
- `fecha_emision` no conservaba zona horaria y `service_role` tenía permisos
  destructivos innecesarios.
- El proyecto tenía cero certificados, cero cursos habilitados y cero
  inscripciones finalizadas, por lo que no había datos que migrar ni flujo real
  que ejecutar durante el diagnóstico.

## Diseño autorizado

1. Conservar tabla, códigos, relaciones y filas.
2. Guardar snapshots inmutables del contenido visible al emitir.
3. Firmar con SHA-256 y verificar la firma desde Express.
4. Mantener emisión, revocación y reactivación automáticas.
5. Sincronizar también los cambios de `permite_certificado` del curso.
6. Corregir la zona horaria y aplicar privilegios mínimos.
7. Ampliar el contrato sin exponer correo ni UUID del destinatario.

## Resultado verificado

- Migración registrada: `20260812170757_phase_9_certificate_integrity`.
- Siete columnas nuevas obligatorias y dos restricciones validadas.
- Tres triggers de emisión/protección/sincronización activos.
- Funciones `SECURITY INVOKER`; ejecución pública revocada.
- RLS activo; `anon_select=false` y `authenticated_select=false`.
- `service_role` puede seleccionar, insertar y actualizar, pero no eliminar ni
  truncar certificados.
- La prueba negativa de firma devuelve `false` para una credencial inexistente.
