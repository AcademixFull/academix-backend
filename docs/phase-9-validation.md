# Validación manual — Fase 9

Ejecuta esta guía con el backend en `http://localhost:3000`. Sustituye los
marcadores por valores locales y no guardes JWT ni claves en Git.

## 1. Confirmar protección

```bash
curl -i http://localhost:3000/api/v1/users/me/certificates
```

Debe responder `401 AUTH_REQUIRED`.

## 2. Emitir una credencial

Usa un curso publicado con `certificateEnabled: true`, una inscripción activa
y por lo menos una lección. Completa todas sus lecciones mediante:

```bash
curl -i -X PATCH http://localhost:3000/api/v1/lessons/LESSON_UUID/progress \
  -H "Authorization: Bearer TOKEN_ALUMNO" \
  -H "Content-Type: application/json" \
  -d '{"completed":true}'
```

Al completar la última lección, la inscripción debe finalizar y se debe emitir
exactamente un certificado.

## 3. Biblioteca y detalle propio

```bash
curl http://localhost:3000/api/v1/users/me/certificates \
  -H "Authorization: Bearer TOKEN_ALUMNO"

curl http://localhost:3000/api/v1/users/me/certificates/CERTIFICATE_UUID \
  -H "Authorization: Bearer TOKEN_ALUMNO"
```

El detalle debe incluir `issuerName: "Academix"`, `systemSignature` con 64
caracteres, `signatureAlgorithm: "SHA-256"` y `verificationPath`. Otro alumno
debe recibir `404 CERTIFICATE_NOT_FOUND` para el mismo UUID.

## 4. Verificación pública

```bash
curl http://localhost:3000/api/v1/certificates/verify/ACX-2026-XXXXXXXXXXXX
```

Debe devolver `valid: true` sin correo ni UUID del destinatario. Un código
inexistente o revocado responde `404 CERTIFICATE_NOT_FOUND`.

## 5. Inmutabilidad y revocación

Cambiar posteriormente el nombre del perfil o el título del curso no debe
alterar los snapshots del certificado. Desmarcar una lección revoca la
credencial; volver a completar el curso reactiva la misma fila, código, fecha y
firma, sin crear un duplicado.

Desactivar `certificateEnabled` también revoca las credenciales activas del
curso. Reactivarlo emite o restaura las correspondientes a inscripciones ya
finalizadas.

## 6. Comprobación del proyecto

```bash
npm ci
npm run check
npm audit --omit=dev
npm run supabase:verify
git diff --check
git status --short
```

`supabase:verify` debe informar 37 tablas, bucket privado y verificación de
firma disponible.
