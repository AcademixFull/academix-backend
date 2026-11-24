# Validación manual — Fase 6

## 1. Validación técnica

Después de aplicar el parche:

```bash
npm ci
npm run check
npm audit --omit=dev
git diff --check
git status --short
```

## 2. Iniciar Academix

En una terminal:

```bash
cd ~/CursosWeb/academix-backend
npm run dev
```

En otra terminal:

```bash
cd ~/CursosWeb/CursosWeb
npm run dev
```

Abre `http://localhost:5173/CursosWeb/` e inicia sesión.

## 3. Biblioteca vacía

Entra en **Mis cursos**. Mientras no existan cursos publicados, debe mostrarse
el estado vacío y no un error. Esto valida `GET /api/v1/users/me/courses`.

## 4. Flujo con un curso publicado

Cuando exista un curso gratuito, publicado, sin aprobación y con lecciones:

1. Abre el detalle del curso.
2. Selecciona **Inscribirme**.
3. Confirma que aparece en **Mis cursos** con `0 %` de avance.
4. Entra al aula y abre una lección.
5. Márcala como completada y confirma que aumenta el porcentaje.
6. Completa todas las lecciones y confirma el estado `completed` y `100 %`.
7. Desmarca una lección y confirma que vuelve a `in_progress`.
8. Intenta inscribirte de nuevo y confirma el error de inscripción duplicada.

La creación de módulos y lecciones desde la API administrativa se incorpora en
la fase de aula y contenido. Hasta entonces, la biblioteca vacía es el flujo
manual disponible sin insertar datos directamente en Supabase.
