-- Portadas e introducciones son archivos privados de presentación.
alter table public.archivos add column if not exists uso_presentacion text
  constraint ck_archivos_uso_presentacion check (
    uso_presentacion is null or
    (fk_curso_contenido is not null and publico is false and (
      (uso_presentacion = 'cover' and mime_type in ('image/jpeg', 'image/png', 'image/webp')) or
      (uso_presentacion = 'intro' and mime_type = 'video/mp4')
    ))
  );

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
       where a.id_archivo = new.fk_archivo and a.activo = true and a.uso_presentacion is null;
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
  if tg_table_name = 'archivos' and tg_op = 'INSERT' then
    if course_state in ('publicado', 'dado de baja por moderación') and new.uso_presentacion is not null then
      return new;
    end if;
  end if;
  if course_state not in ('borrador', 'en revisión') then
    raise exception using errcode = 'P0001', message = 'COURSE_CONTENT_IMMUTABLE';
  end if;
  return new;
end;
$$;

revoke all on function private.academix_guard_course_content_write()
  from public, anon, authenticated, service_role;

create or replace function private.academix_require_course_media()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if new.fk_estado_curso = old.fk_estado_curso then return new; end if;
  end if;
  if not exists (
    select 1 from public.estados_curso
    where id_estado_curso = new.fk_estado_curso and nombre = 'Publicado'
  ) then return new; end if;
  if not exists (
    select 1 from public.archivos
    where id_archivo = new.fk_archivo_portada and fk_curso_contenido = new.id_curso
      and activo and uso_presentacion = 'cover'
  ) or not exists (
    select 1 from public.archivos
    where id_archivo = new.fk_archivo_video and fk_curso_contenido = new.id_curso
      and activo and uso_presentacion = 'intro'
  ) then
    raise exception using errcode = 'P0001', message = 'COURSE_MEDIA_REQUIRED';
  end if;
  return new;
end;
$$;

revoke all on function private.academix_require_course_media() from public, anon, authenticated, service_role;
drop trigger if exists trg_require_course_media on public.cursos;
create trigger trg_require_course_media before insert or update of fk_estado_curso on public.cursos
for each row execute function private.academix_require_course_media();
