# Validación manual — Fases 8 y 9

Esta guía se ejecuta después de aplicar `reviews_certificates`, con backend en
`http://localhost:3000` y un JWT de alumno válido. No coloques tokens ni claves
en archivos versionados.

## 1. Verificar protección

```bash
curl -i -X POST http://localhost:3000/api/v1/courses/COURSE_UUID/reviews \
  -H "Content-Type: application/json" \
  -d '{"rating":5,"comment":"Contenido claro y muy completo."}'
```

Debe responder `401 AUTH_REQUIRED`.

## 2. Verificar la regla de finalización

Repite la petición con `Authorization: Bearer TOKEN_ALUMNO`. Si la inscripción
no está finalizada debe responder `403 COURSE_COMPLETION_REQUIRED`. Después de
completar todas las lecciones, la misma petición debe responder `201` y una
segunda debe responder `409 REVIEW_ALREADY_EXISTS`.

## 3. Consultar catálogo y certificado

```bash
curl http://localhost:3000/api/v1/courses/COURSE_UUID
curl http://localhost:3000/api/v1/users/me/certificates \
  -H "Authorization: Bearer TOKEN_ALUMNO"
```

El curso debe incluir la reseña, `rating` y `reviewCount`. La biblioteca de
certificados debe contener una sola credencial por usuario y curso.

## 4. Verificar credencial

```bash
curl http://localhost:3000/api/v1/certificates/verify/ACX-2026-XXXXXXXXXXXX
```

Debe responder `valid: true` sin exponer correo, ID del destinatario ni rutas
internas. Un código inexistente responde `404 CERTIFICATE_NOT_FOUND`.

## 5. Moderación

```bash
curl -X PATCH http://localhost:3000/api/v1/admin/reviews/REVIEW_UUID/moderation \
  -H "Authorization: Bearer TOKEN_ADMIN" \
  -H "Content-Type: application/json" \
  -d '{"visible":false,"reason":"Incumple las reglas de publicación"}'
```

La reseña debe conservarse en la base, dejar de aparecer en el catálogo y no
participar en el promedio. Un alumno debe recibir `403 ROLE_FORBIDDEN`.

## 6. Comprobación del proyecto

```bash
npm ci
npm run check
npm audit --omit=dev
git diff --check
git status --short
```
