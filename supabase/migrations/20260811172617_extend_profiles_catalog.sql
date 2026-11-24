-- Extensión incremental de perfiles, instructores y catálogo.
-- No elimina ni recrea las tablas existentes.

alter table public.usuarios
  add column if not exists pais text;

create table if not exists public.perfiles_instructores (
  fk_usuario uuid primary key
    constraint fk_perfil_instructor_usuario
    references public.usuarios (id_usuario)
    on delete cascade,
  especialidad text not null,
  anios_experiencia smallint not null default 0,
  fecha_creacion timestamptz not null default now(),
  fecha_actualizacion timestamptz not null default now(),
  constraint chk_perfil_instructor_experiencia
    check (anios_experiencia between 0 and 80)
);

alter table public.perfiles_instructores enable row level security;
revoke all privileges on table public.perfiles_instructores from anon, authenticated;
grant select, insert, update, delete
  on table public.perfiles_instructores
  to service_role;

alter table public.categorias
  add column if not exists slug text;

update public.categorias
   set slug = trim(
     both '-'
     from regexp_replace(
       lower(translate(nombre, 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun')),
       '[^a-z0-9]+',
       '-',
       'g'
     )
   )
 where slug is null;

alter table public.categorias
  alter column slug set not null;

create unique index if not exists uq_categorias_slug
  on public.categorias (slug);

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'chk_categorias_slug_formato'
       and conrelid = 'public.categorias'::regclass
  ) then
    alter table public.categorias
      add constraint chk_categorias_slug_formato
      check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$');
  end if;
end;
$$;

alter table public.cursos
  add column if not exists slug text;

-- El esquema está vacío hoy, pero este backfill también preserva cualquier
-- curso que pudiera haberse creado antes de aplicar la migración.
update public.cursos
   set slug = concat(
     coalesce(
       nullif(
         trim(
           both '-'
           from regexp_replace(
             lower(translate(titulo, 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun')),
             '[^a-z0-9]+',
             '-',
             'g'
           )
         ),
         ''
       ),
       'curso'
     ),
     '-',
     left(replace(id_curso::text, '-', ''), 8)
   )
 where slug is null;

alter table public.cursos
  alter column slug set not null;

create unique index if not exists uq_cursos_slug
  on public.cursos (slug);

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'chk_cursos_slug_formato'
       and conrelid = 'public.cursos'::regclass
  ) then
    alter table public.cursos
      add constraint chk_cursos_slug_formato
      check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$');
  end if;
end;
$$;

-- Un curso puede tener varios colaboradores, pero solo un instructor principal.
create unique index if not exists uq_curso_instructor_principal
  on public.cursos_instructores (fk_curso)
  where instructor_principal = true;

-- Índices para relaciones y consultas iniciales del catálogo.
create index if not exists idx_usuarios_archivo_foto
  on public.usuarios (fk_archivo_foto)
  where fk_archivo_foto is not null;

create index if not exists idx_cursos_nivel
  on public.cursos (fk_nivel);

create index if not exists idx_cursos_modalidad
  on public.cursos (fk_modalidad);

create index if not exists idx_cursos_idioma
  on public.cursos (fk_idioma);

create index if not exists idx_cursos_archivo_portada
  on public.cursos (fk_archivo_portada)
  where fk_archivo_portada is not null;

create index if not exists idx_cursos_archivo_video
  on public.cursos (fk_archivo_video)
  where fk_archivo_video is not null;

create index if not exists idx_cursos_catalogo_publicado
  on public.cursos (
    fk_estado_curso,
    fk_categoria,
    fk_nivel,
    fecha_publicacion desc,
    id_curso
  )
  where activo = true;
