-- Fase 5: autoría de módulos, lecciones, recursos y archivos privados.
-- React continúa sin acceso directo a tablas ni a Supabase Storage.

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
) values (
  'academix-course-content',
  'academix-course-content',
  false,
  26214400,
  array[
    'image/jpeg', 'image/png', 'image/webp', 'image/gif',
    'application/pdf',
    'video/mp4', 'video/webm',
    'audio/mpeg', 'audio/ogg', 'audio/wav',
    'text/plain', 'text/csv',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/zip'
  ]::text[]
)
on conflict (id) do update set
  name = excluded.name,
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

alter table public.modulos
  add column if not exists fecha_actualizacion timestamp with time zone not null default now(),
  add column if not exists creado_por uuid,
  add column if not exists actualizado_por uuid;

alter table public.lecciones
  add column if not exists fecha_actualizacion timestamp with time zone not null default now(),
  add column if not exists creado_por uuid,
  add column if not exists actualizado_por uuid;

alter table public.recursos
  add column if not exists fecha_actualizacion timestamp with time zone not null default now(),
  add column if not exists creado_por uuid,
  add column if not exists actualizado_por uuid;

alter table public.archivos
  add column if not exists fk_curso_contenido uuid,
  add column if not exists subido_por uuid,
  add column if not exists actualizado_por uuid,
  add column if not exists fecha_actualizacion timestamp with time zone not null default now();

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'fk_modulo_creado_por' and conrelid = 'public.modulos'::regclass) then
    alter table public.modulos add constraint fk_modulo_creado_por foreign key (creado_por) references public.usuarios(id_usuario);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'fk_modulo_actualizado_por' and conrelid = 'public.modulos'::regclass) then
    alter table public.modulos add constraint fk_modulo_actualizado_por foreign key (actualizado_por) references public.usuarios(id_usuario);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'fk_leccion_creado_por' and conrelid = 'public.lecciones'::regclass) then
    alter table public.lecciones add constraint fk_leccion_creado_por foreign key (creado_por) references public.usuarios(id_usuario);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'fk_leccion_actualizado_por' and conrelid = 'public.lecciones'::regclass) then
    alter table public.lecciones add constraint fk_leccion_actualizado_por foreign key (actualizado_por) references public.usuarios(id_usuario);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'fk_recurso_creado_por' and conrelid = 'public.recursos'::regclass) then
    alter table public.recursos add constraint fk_recurso_creado_por foreign key (creado_por) references public.usuarios(id_usuario);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'fk_recurso_actualizado_por' and conrelid = 'public.recursos'::regclass) then
    alter table public.recursos add constraint fk_recurso_actualizado_por foreign key (actualizado_por) references public.usuarios(id_usuario);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'fk_archivo_curso_contenido' and conrelid = 'public.archivos'::regclass) then
    alter table public.archivos add constraint fk_archivo_curso_contenido foreign key (fk_curso_contenido) references public.cursos(id_curso);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'fk_archivo_subido_por' and conrelid = 'public.archivos'::regclass) then
    alter table public.archivos add constraint fk_archivo_subido_por foreign key (subido_por) references public.usuarios(id_usuario);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'fk_archivo_actualizado_por' and conrelid = 'public.archivos'::regclass) then
    alter table public.archivos add constraint fk_archivo_actualizado_por foreign key (actualizado_por) references public.usuarios(id_usuario);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'ck_modulos_orden_positivo' and conrelid = 'public.modulos'::regclass) then
    alter table public.modulos add constraint ck_modulos_orden_positivo check (orden > 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'ck_lecciones_orden_positivo' and conrelid = 'public.lecciones'::regclass) then
    alter table public.lecciones add constraint ck_lecciones_orden_positivo check (orden > 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'ck_lecciones_duracion_no_negativa' and conrelid = 'public.lecciones'::regclass) then
    alter table public.lecciones add constraint ck_lecciones_duracion_no_negativa check (duracion_estimada_minutos is null or duracion_estimada_minutos >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'ck_recursos_orden_positivo' and conrelid = 'public.recursos'::regclass) then
    alter table public.recursos add constraint ck_recursos_orden_positivo check (orden > 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'ck_recursos_origen_unico' and conrelid = 'public.recursos'::regclass) then
    alter table public.recursos add constraint ck_recursos_origen_unico check ((url is not null)::integer + (fk_archivo is not null)::integer = 1);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'ck_archivos_tamanio_positivo' and conrelid = 'public.archivos'::regclass) then
    alter table public.archivos add constraint ck_archivos_tamanio_positivo check (tamano_bytes > 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'ck_archivos_hash_sha256' and conrelid = 'public.archivos'::regclass) then
    alter table public.archivos add constraint ck_archivos_hash_sha256 check (hash_archivo is null or hash_archivo ~ '^[0-9a-f]{64}$');
  end if;
end;
$$;

create index if not exists idx_modulos_curso_activos_orden
  on public.modulos (fk_curso, orden) where activo = true;
create index if not exists idx_lecciones_modulo_activas_orden
  on public.lecciones (fk_modulo, orden) where activo = true;
create index if not exists idx_recursos_leccion_activos_orden
  on public.recursos (fk_leccion, orden) where activo = true;
create index if not exists idx_recursos_tipo on public.recursos (fk_tipo_recurso);
create index if not exists idx_recursos_archivo on public.recursos (fk_archivo) where fk_archivo is not null;
create index if not exists idx_archivos_curso_contenido on public.archivos (fk_curso_contenido) where fk_curso_contenido is not null;
create index if not exists idx_modulos_creado_por on public.modulos (creado_por) where creado_por is not null;
create index if not exists idx_modulos_actualizado_por on public.modulos (actualizado_por) where actualizado_por is not null;
create index if not exists idx_lecciones_creado_por on public.lecciones (creado_por) where creado_por is not null;
create index if not exists idx_lecciones_actualizado_por on public.lecciones (actualizado_por) where actualizado_por is not null;
create index if not exists idx_recursos_creado_por on public.recursos (creado_por) where creado_por is not null;
create index if not exists idx_recursos_actualizado_por on public.recursos (actualizado_por) where actualizado_por is not null;
create index if not exists idx_archivos_subido_por on public.archivos (subido_por) where subido_por is not null;
create index if not exists idx_archivos_actualizado_por on public.archivos (actualizado_por) where actualizado_por is not null;

drop trigger if exists trg_touch_modulos on public.modulos;
create trigger trg_touch_modulos before update on public.modulos
for each row execute function private.academix_touch_updated_at();
drop trigger if exists trg_touch_lecciones on public.lecciones;
create trigger trg_touch_lecciones before update on public.lecciones
for each row execute function private.academix_touch_updated_at();
drop trigger if exists trg_touch_recursos on public.recursos;
create trigger trg_touch_recursos before update on public.recursos
for each row execute function private.academix_touch_updated_at();
drop trigger if exists trg_touch_archivos on public.archivos;
create trigger trg_touch_archivos before update on public.archivos
for each row execute function private.academix_touch_updated_at();

create or replace function private.academix_guard_course_content_write()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  course_id uuid;
  course_state text;
  file_course_id uuid;
begin
  if tg_table_name = 'modulos' then
    course_id := new.fk_curso;
  elsif tg_table_name = 'lecciones' then
    select m.fk_curso into course_id from public.modulos m where m.id_modulo = new.fk_modulo;
  elsif tg_table_name = 'recursos' then
    select m.fk_curso into course_id
      from public.lecciones l join public.modulos m on m.id_modulo = l.fk_modulo
     where l.id_leccion = new.fk_leccion;
    if new.fk_archivo is not null then
      select a.fk_curso_contenido into file_course_id
        from public.archivos a
       where a.id_archivo = new.fk_archivo and a.activo = true;
      if file_course_id is distinct from course_id then
        raise exception using errcode = 'P0001', message = 'FILE_NOT_IN_COURSE';
      end if;
    end if;
  elsif tg_table_name = 'archivos' then
    course_id := new.fk_curso_contenido;
  end if;

  if course_id is null then
    return new;
  end if;

  select lower(ec.nombre) into course_state
    from public.cursos c
    join public.estados_curso ec on ec.id_estado_curso = c.fk_estado_curso
   where c.id_curso = course_id and c.activo = true;

  if course_state is null then
    raise exception using errcode = 'P0001', message = 'COURSE_NOT_FOUND';
  end if;
  if course_state not in ('borrador', 'en revisión') then
    raise exception using errcode = 'P0001', message = 'COURSE_CONTENT_IMMUTABLE';
  end if;
  return new;
end;
$$;

revoke all on function private.academix_guard_course_content_write()
  from public, anon, authenticated, service_role;

drop trigger if exists trg_guard_modulos_write on public.modulos;
create trigger trg_guard_modulos_write before insert or update on public.modulos
for each row execute function private.academix_guard_course_content_write();
drop trigger if exists trg_guard_lecciones_write on public.lecciones;
create trigger trg_guard_lecciones_write before insert or update on public.lecciones
for each row execute function private.academix_guard_course_content_write();
drop trigger if exists trg_guard_recursos_write on public.recursos;
create trigger trg_guard_recursos_write before insert or update on public.recursos
for each row execute function private.academix_guard_course_content_write();
drop trigger if exists trg_guard_archivos_write on public.archivos;
create trigger trg_guard_archivos_write before insert or update on public.archivos
for each row execute function private.academix_guard_course_content_write();

create or replace function private.academix_audit_content_change()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  action_id smallint;
  actor_id uuid;
  record_key text;
  summary jsonb;
begin
  select ta.id_tipo_accion into action_id
    from public.tipos_accion_auditoria ta
   where ta.nombre = case when tg_op = 'INSERT' then 'Creación' else 'Actualización' end
     and ta.activo = true
   limit 1;
  if action_id is null then
    raise exception using errcode = 'P0001', message = 'AUDIT_ACTION_NOT_CONFIGURED';
  end if;

  if tg_table_name = 'modulos' then
    actor_id := coalesce(new.actualizado_por, new.creado_por);
    record_key := new.id_modulo::text;
    summary := jsonb_build_object('courseId', new.fk_curso, 'title', new.titulo, 'position', new.orden, 'active', new.activo);
  elsif tg_table_name = 'lecciones' then
    actor_id := coalesce(new.actualizado_por, new.creado_por);
    record_key := new.id_leccion::text;
    summary := jsonb_build_object('moduleId', new.fk_modulo, 'title', new.titulo, 'position', new.orden, 'active', new.activo);
  elsif tg_table_name = 'recursos' then
    actor_id := coalesce(new.actualizado_por, new.creado_por);
    record_key := new.id_recurso::text;
    summary := jsonb_build_object('lessonId', new.fk_leccion, 'title', new.titulo, 'position', new.orden, 'active', new.activo);
  elsif tg_table_name = 'archivos' then
    actor_id := coalesce(new.actualizado_por, new.subido_por);
    record_key := new.id_archivo::text;
    summary := jsonb_build_object('courseId', new.fk_curso_contenido, 'mimeType', new.mime_type, 'sizeBytes', new.tamano_bytes, 'active', new.activo);
  end if;

  insert into public.auditoria_sistema (
    fk_usuario,
    fk_tipo_accion,
    tabla_afectada,
    clave_registro_afectado,
    descripcion,
    datos_nuevos
  ) values (
    actor_id,
    action_id,
    tg_table_name,
    record_key,
    case when tg_op = 'INSERT'
      then 'Contenido creado desde la API de autoría'
      else 'Contenido actualizado desde la API de autoría'
    end,
    summary
  );
  return new;
end;
$$;

revoke all on function private.academix_audit_content_change()
  from public, anon, authenticated, service_role;

drop trigger if exists trg_audit_modulos on public.modulos;
create trigger trg_audit_modulos after insert or update on public.modulos
for each row execute function private.academix_audit_content_change();
drop trigger if exists trg_audit_lecciones on public.lecciones;
create trigger trg_audit_lecciones after insert or update on public.lecciones
for each row execute function private.academix_audit_content_change();
drop trigger if exists trg_audit_recursos on public.recursos;
create trigger trg_audit_recursos after insert or update on public.recursos
for each row execute function private.academix_audit_content_change();
drop trigger if exists trg_audit_archivos on public.archivos;
create trigger trg_audit_archivos after insert or update on public.archivos
for each row execute function private.academix_audit_content_change();

alter table public.modulos enable row level security;
alter table public.lecciones enable row level security;
alter table public.recursos enable row level security;
alter table public.archivos enable row level security;

revoke all on public.modulos, public.lecciones, public.recursos, public.archivos
  from public, anon, authenticated;
grant select, insert, update on public.modulos, public.lecciones, public.recursos, public.archivos
  to service_role;
