# Validación manual — Fase 8

Ejecuta esta guía con el backend en `http://localhost:3000`. Sustituye los
marcadores por UUID y JWT locales; no guardes tokens ni claves en Git.

## 1. Listado público

```bash
curl "http://localhost:3000/api/v1/courses/COURSE_UUID/reviews?page=1&limit=10"
```

Debe responder `200`, incluir `pagination` y mostrar únicamente reseñas
visibles. Los elementos no deben incluir `visible` ni `moderationReason`.

## 2. Publicación protegida

```bash
curl -i -X POST http://localhost:3000/api/v1/courses/COURSE_UUID/reviews \
  -H "Authorization: Bearer TOKEN_ALUMNO" \
  -H "Content-Type: application/json" \
  -d '{"rating":5,"comment":"Contenido claro y muy completo."}'
```

Un curso finalizado responde `201`. Sin JWT responde `401`; sin finalización,
`403 COURSE_COMPLETION_REQUIRED`; una segunda reseña para la misma inscripción,
`409 REVIEW_ALREADY_EXISTS`.

## 3. Bandeja administrativa

```bash
curl "http://localhost:3000/api/v1/admin/reviews?visibility=all&page=1&limit=20" \
  -H "Authorization: Bearer TOKEN_ADMIN"
```

Debe responder `200` con curso, visibilidad y motivo. Un alumno recibe
`403 ROLE_FORBIDDEN`. También prueba `visibility=visible`, `hidden` y el filtro
opcional `courseId=COURSE_UUID`.

## 4. Ocultar y restaurar

```bash
curl -X PATCH http://localhost:3000/api/v1/admin/reviews/REVIEW_UUID/moderation \
  -H "Authorization: Bearer TOKEN_ADMIN" \
  -H "Content-Type: application/json" \
  -d '{"visible":false,"reason":"Incumple las reglas de publicación"}'

curl -X PATCH http://localhost:3000/api/v1/admin/reviews/REVIEW_UUID/moderation \
  -H "Authorization: Bearer TOKEN_ADMIN" \
  -H "Content-Type: application/json" \
  -d '{"visible":true}'
```

Al ocultarla debe desaparecer del listado público y del promedio, pero seguir
en la bandeja. Al restaurarla vuelve a participar sin crear otra fila.

## 5. Comprobación del proyecto

```bash
npm ci
npm run check
npm audit --omit=dev
npm run supabase:verify
git diff --check
git status --short
```

`supabase:verify` debe informar 37 tablas públicas y el bucket privado.
