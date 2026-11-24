# Diagnóstico y diseño — Fase 7

Fecha de revisión: 12 de agosto de 2026.

## Estado encontrado

La revisión se realizó sobre `feat/backend-architecture` en el commit
`42671a8` y contra el proyecto real de Supabase. No se modificaron datos ni se
aplicaron migraciones durante el diagnóstico.

- Las 37 tablas de `public` tienen RLS habilitado y no existen políticas para
  `anon` ni `authenticated`; React continúa limitado a la API de Express.
- `modulos`, `lecciones`, `recursos`, `archivos`, `inscripciones` y
  `progreso_lecciones` existen con claves foráneas, restricciones e índices.
- El bucket `academix-course-content` es privado y tiene límite de 25 MB.
- Las seis tablas revisadas están vacías, por lo que no hay datos que migrar.
- La autoría ya permite crear módulos, lecciones, enlaces y archivos; el aula
  ya exige una inscripción activa o finalizada y el progreso es atómico.
- Los asesores no reportan claves foráneas sin índice. Los avisos de índices
  sin uso son informativos porque el dominio aún no tiene datos de operación.

## Brecha identificada

La descarga protegida cargaba el objeto completo en memoria antes de enviarlo.
Ese comportamiento es válido para archivos pequeños, pero impide una
reproducción eficiente de video o audio, ignora la cabecera HTTP `Range` y
eleva el consumo de memoria del backend hasta el tamaño del archivo.

## Diseño aplicado

La ruta existente se conserva:

```text
GET /api/v1/lessons/:lessonId/resources/:resourceId/content
```

El flujo final es:

1. Express valida el JWT y obtiene el usuario y rol desde el servidor.
2. El servicio comprueba que el recurso pertenece a la lección y al curso.
3. Se permite acceso únicamente a un alumno inscrito, un instructor asignado
   o un administrador.
4. Si existe `Range`, se acepta un solo rango de bytes y se normaliza contra el
   tamaño registrado; rangos inválidos responden `416 INVALID_RANGE`.
5. El backend solicita a Storage el objeto completo (`200`) o parcial (`206`)
   y transmite el flujo directamente a la respuesta sin almacenarlo completo
   en memoria.
6. React recibe `Accept-Ranges`, `Content-Range`, tipo MIME y disposición
   `inline` cuando el navegador puede reproducir o mostrar el contenido.

La clave secreta, la ruta de Storage y las credenciales usadas entre Express y
Supabase nunca se incluyen en la respuesta. Tampoco se crean URLs firmadas que
puedan seguir utilizándose fuera de la autorización del backend.

## Decisión de base de datos

La Fase 7 no necesita una migración incremental: el esquema, los índices, las
restricciones, el bucket y las funciones de progreso necesarios ya fueron
creados por las migraciones anteriores. Repetirlos produciría historial
duplicado sin aportar una capacidad nueva.
