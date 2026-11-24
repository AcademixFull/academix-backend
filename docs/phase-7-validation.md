# Validación manual — Fase 7

Esta fase se prueba contra el backend. El frontend se conectará en la fase de
integración final. No compartas contraseñas ni tokens en el chat.

## 1. Aplicar el parche y validar

```bash
cd ~/CursosWeb/academix-backend
git checkout feat/backend-architecture
git apply --check ~/Downloads/academix_phase_7_virtual_classroom.patch
git apply ~/Downloads/academix_phase_7_virtual_classroom.patch
npm ci
npm run check
npm audit --omit=dev
git diff --check
git status --short
```

Resultado esperado: 18 archivos de pruebas, 98 pruebas aprobadas, lint,
typecheck y build correctos; auditoría de producción sin vulnerabilidades.

Esta fase no contiene una migración nueva. El esquema y el bucket requeridos
ya existen, por lo que no se debe volver a ejecutar
`course_content_authoring_storage`.

## 2. Iniciar el backend

```bash
npm run dev
```

Mantén esta terminal abierta. En otra terminal define el token obtenido con
`POST /api/v1/auth/login`; no lo pegues en el chat ni lo escribas directamente
en el historial:

```bash
read -s -p "Access token: " ACADEMIX_TOKEN
echo
API_URL=http://localhost:3000/api/v1
```

## 3. Crear un curso borrador

Usa `POST /api/v1/admin/courses` con los IDs/opciones devueltos por
`GET /api/v1/admin/course-options`. Guarda el `id` recibido:

```bash
read -p "Course ID: " COURSE_ID
```

Asigna un instructor y completa descripción corta, descripción y objetivos
antes de publicar.

## 4. Crear módulo y lección

```bash
curl -s -X POST "$API_URL/authoring/courses/$COURSE_ID/modules" \
  -H "Authorization: Bearer $ACADEMIX_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"Fundamentos","description":"Inicio del curso","position":1}'
```

Copia el `id` del módulo sin compartirlo y ejecuta:

```bash
read -p "Module ID: " MODULE_ID
curl -s -X POST "$API_URL/authoring/modules/$MODULE_ID/lessons" \
  -H "Authorization: Bearer $ACADEMIX_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"Primera lección","description":"Introducción","content":"Contenido educativo","durationMinutes":10,"position":1,"isPreview":false}'
```

## 5. Agregar un enlace externo

Copia el ID de la lección:

```bash
read -p "Lesson ID: " LESSON_ID
curl -s "$API_URL/authoring/resource-options" \
  -H "Authorization: Bearer $ACADEMIX_TOKEN"
```

Usa el ID de `Enlace externo`:

```bash
read -p "External-link type ID: " LINK_TYPE_ID
curl -s -X POST "$API_URL/authoring/lessons/$LESSON_ID/resources" \
  -H "Authorization: Bearer $ACADEMIX_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"typeId\":$LINK_TYPE_ID,\"title\":\"Documentación\",\"url\":\"https://www.typescriptlang.org/docs/\",\"fileId\":null,\"required\":false,\"position\":1}"
```

## 6. Subir y enlazar un PDF

```bash
curl -s -X POST "$API_URL/authoring/courses/$COURSE_ID/files" \
  -H "Authorization: Bearer $ACADEMIX_TOKEN" \
  -H "Content-Type: application/pdf" \
  -H "x-file-name: guia.pdf" \
  --data-binary @guia.pdf
```

Guarda el ID del archivo y el ID de tipo `PDF`, y crea el recurso en posición
2 enviando `url: null` y `fileId`.

## 7. Verificar el árbol y publicar

```bash
curl -s "$API_URL/authoring/courses/$COURSE_ID/content" \
  -H "Authorization: Bearer $ACADEMIX_TOKEN"
```

Envía el curso a revisión como instructor o actualiza su estado mediante el
flujo ya validado; luego publícalo como administrador. Publicar sin módulos o
lecciones debe responder `422 COURSE_CONTENT_REQUIRED`.

## 8. Probar como alumno

Con un token de alumno diferente, inscríbete, consulta el aula y usa el
`contentPath` del PDF:

```bash
read -s -p "Student access token: " STUDENT_TOKEN
echo
read -p "File resource ID: " RESOURCE_ID
curl -s -X POST "$API_URL/courses/$COURSE_ID/enrollments" \
  -H "Authorization: Bearer $STUDENT_TOKEN"
curl -s "$API_URL/users/me/courses/$COURSE_ID/learning" \
  -H "Authorization: Bearer $STUDENT_TOKEN"
curl -f "$API_URL/lessons/$LESSON_ID/resources/$RESOURCE_ID/content" \
  -H "Authorization: Bearer $STUDENT_TOKEN" \
  -o descarga-guia.pdf
```

Comprueba que el aula contiene `content`, `resources` y un `contentPath` bajo
la API, nunca una URL de Supabase Storage. Finalmente marca la lección:

```bash
curl -i -X PATCH "$API_URL/lessons/$LESSON_ID/progress" \
  -H "Authorization: Bearer $STUDENT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"completed":true}'
```

El resultado esperado es `204` y 100 % de progreso cuando sea la única
lección activa.

## 9. Verificar reproducción parcial

Para un recurso MP4, solicita un fragmento. La respuesta debe ser `206`, no
debe descargar el video completo y nunca debe redirigir a Supabase:

```bash
curl -i "$API_URL/lessons/$LESSON_ID/resources/$RESOURCE_ID/content" \
  -H "Authorization: Bearer $STUDENT_TOKEN" \
  -H "Range: bytes=0-1023" \
  -o fragmento.bin
```

Las cabeceras esperadas son:

```text
HTTP/1.1 206 Partial Content
Accept-Ranges: bytes
Content-Range: bytes 0-1023/TOTAL
Cache-Control: private, no-store
Content-Disposition: inline; ...
```

Un rango múltiple o fuera del tamaño registrado debe responder `416` con el
código seguro `INVALID_RANGE`.
