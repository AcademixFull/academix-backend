-- Fase 6: reseñas verificadas, moderación y certificados de finalización.
-- React continúa sin acceso directo: Express usa exclusivamente service_role.

insert into public.tipos_certificado (nombre, descripcion, activo)
values ('Finalización', 'Constancia por completar todas las lecciones activas de un curso.', true)
on conflict (nombre) do update
set descripcion = excluded.descripcion,
    activo = true;

alter table public.certificados
  add column if not exists fecha_actualizacion timestamp with time zone not null default now(),
  add column if not exists fecha_revocacion timestamp with time zone;

-- Normaliza certificados inactivos preexistentes antes de exigir la consistencia.
update public.certificados
   set fecha_revocacion = coalesce(fecha_revocacion, fecha_emision, now())
 where activo = false and fecha_revocacion is null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'uq_certificado_usuario_curso'
      and conrelid = 'public.certificados'::regclass
  ) then
    alter table public.certificados
      add constraint uq_certificado_usuario_curso unique (fk_usuario, fk_curso);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'ck_certificado_revocacion_consistente'
      and conrelid = 'public.certificados'::regclass
  ) then
    alter table public.certificados
      add constraint ck_certificado_revocacion_consistente check (
        (activo = true and fecha_revocacion is null)
        or (activo = false and fecha_revocacion is not null)
      );
  end if;
end;
$$;

create table if not exists public.resenas_cursos (
  id_resena uuid primary key default gen_random_uuid(),
  fk_inscripcion uuid not null,
  calificacion smallint not null,
  comentario text not null,
  visible boolean not null default true,
  activo boolean not null default true,
  moderada_por uuid,
  motivo_moderacion text,
  fecha_creacion timestamp with time zone not null default now(),
  fecha_actualizacion timestamp with time zone not null default now(),
  constraint fk_resena_inscripcion
    foreign key (fk_inscripcion) references public.inscripciones(id_inscripcion),
  constraint fk_resena_moderador
    foreign key (moderada_por) references public.usuarios(id_usuario) on delete set null,
  constraint uq_resena_inscripcion unique (fk_inscripcion),
  constraint ck_resena_calificacion check (calificacion between 1 and 5),
  constraint ck_resena_comentario check (
    char_length(trim(comentario)) between 10 and 2000
  ),
  constraint ck_resena_moderacion check (
    visible = true or nullif(trim(motivo_moderacion), '') is not null
  )
);

alter table public.resenas_cursos enable row level security;
revoke all on table public.resenas_cursos from public, anon, authenticated;
grant select, insert, update on table public.resenas_cursos to service_role;

create index if not exists idx_resenas_visibles_fecha
  on public.resenas_cursos (fecha_creacion desc)
  where activo = true and visible = true;
create index if not exists idx_resenas_moderador
  on public.resenas_cursos (moderada_por)
  where moderada_por is not null;
create index if not exists idx_certificados_curso
  on public.certificados (fk_curso);
create index if not exists idx_certificados_tipo
  on public.certificados (fk_tipo_certificado);
create index if not exists idx_certificados_archivo
  on public.certificados (fk_archivo)
  where fk_archivo is not null;
create index if not exists idx_certificados_usuario_activos
  on public.certificados (fk_usuario, fecha_emision desc)
  where activo = true;

drop trigger if exists trg_touch_resenas_cursos on public.resenas_cursos;
create trigger trg_touch_resenas_cursos
before update on public.resenas_cursos
for each row execute function private.academix_touch_updated_at();

drop trigger if exists trg_touch_certificados on public.certificados;
create trigger trg_touch_certificados
before update on public.certificados
for each row execute function private.academix_touch_updated_at();

create or replace function private.academix_sync_enrollment_certificate()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  enrollment_status text;
  certificate_type_id smallint;
  certificate_id uuid;
  certificate_code text;
  action_id integer;
  course_allows_certificate boolean;
begin
  select ei.nombre into enrollment_status
    from public.estados_inscripcion ei
   where ei.id_estado_inscripcion = new.fk_estado_inscripcion;

  select c.permite_certificado into course_allows_certificate
    from public.cursos c
   where c.id_curso = new.fk_curso;

  if new.activo = true
     and lower(coalesce(enrollment_status, '')) = 'finalizada'
     and course_allows_certificate = true then
    select tc.id_tipo_certificado into certificate_type_id
      from public.tipos_certificado tc
     where lower(tc.nombre) = lower('Finalización') and tc.activo = true
     limit 1;

    if certificate_type_id is null then
      raise exception using errcode = 'P0001', message = 'CERTIFICATE_TYPE_NOT_CONFIGURED';
    end if;

    certificate_code := 'ACX-' || to_char(now(), 'YYYY') || '-' ||
      upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));

    insert into public.certificados (
      fk_usuario, fk_curso, fk_tipo_certificado, codigo_certificado,
      fecha_emision, activo, fecha_actualizacion, fecha_revocacion
    ) values (
      new.fk_usuario, new.fk_curso, certificate_type_id, certificate_code,
      coalesce(new.fecha_finalizacion, now()), true, now(), null
    )
    on conflict on constraint uq_certificado_usuario_curso
    do update set
      fk_tipo_certificado = excluded.fk_tipo_certificado,
      activo = true,
      fecha_actualizacion = now(),
      fecha_revocacion = null
    returning id_certificado, codigo_certificado
      into certificate_id, certificate_code;

    if tg_op = 'INSERT' then
      select taa.id_tipo_accion into action_id
        from public.tipos_accion_auditoria taa
       where taa.nombre = 'Creación' and taa.activo = true
       limit 1;
    elsif old.fk_estado_inscripcion is distinct from new.fk_estado_inscripcion
       or old.activo is distinct from new.activo then
      select taa.id_tipo_accion into action_id
        from public.tipos_accion_auditoria taa
       where taa.nombre = 'Creación' and taa.activo = true
       limit 1;
    else
      action_id := null;
    end if;

    if action_id is not null then
      insert into public.auditoria_sistema (
        fk_usuario, fk_tipo_accion, tabla_afectada,
        clave_registro_afectado, descripcion, datos_nuevos
      ) values (
        new.fk_usuario, action_id, 'certificados', certificate_id::text,
        'Certificado de finalización emitido automáticamente por Academix',
        jsonb_build_object(
          'courseId', new.fk_curso,
          'credentialCode', certificate_code,
          'type', 'Finalización'
        )
      );
    end if;
  else
    update public.certificados
       set activo = false,
           fecha_revocacion = coalesce(fecha_revocacion, now()),
           fecha_actualizacion = now()
     where fk_usuario = new.fk_usuario
       and fk_curso = new.fk_curso
       and activo = true;
  end if;

  return new;
end;
$$;

revoke all on function private.academix_sync_enrollment_certificate()
  from public, anon, authenticated, service_role;

drop trigger if exists trg_sync_enrollment_certificate on public.inscripciones;
create trigger trg_sync_enrollment_certificate
after insert or update of fk_estado_inscripcion, activo, fecha_finalizacion
on public.inscripciones
for each row execute function private.academix_sync_enrollment_certificate();

create or replace function public.academix_create_course_review(
  p_user_id uuid,
  p_course_id uuid,
  p_rating smallint,
  p_comment text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  enrollment_id uuid;
  review_id uuid;
  action_id integer;
begin
  if p_user_id is null or p_course_id is null
     or p_rating is null or p_rating not between 1 and 5
     or char_length(trim(coalesce(p_comment, ''))) not between 10 and 2000 then
    raise exception using errcode = 'P0001', message = 'INVALID_REVIEW_INPUT';
  end if;

  select i.id_inscripcion into enrollment_id
    from public.inscripciones i
    join public.estados_inscripcion ei
      on ei.id_estado_inscripcion = i.fk_estado_inscripcion
   where i.fk_usuario = p_user_id
     and i.fk_curso = p_course_id
     and i.activo = true
     and lower(ei.nombre) = 'finalizada'
   for update of i;

  if enrollment_id is null then
    raise exception using errcode = 'P0001', message = 'COURSE_COMPLETION_REQUIRED';
  end if;

  if exists (
    select 1 from public.resenas_cursos rc
     where rc.fk_inscripcion = enrollment_id
  ) then
    raise exception using errcode = 'P0001', message = 'REVIEW_ALREADY_EXISTS';
  end if;

  insert into public.resenas_cursos (
    fk_inscripcion, calificacion, comentario, visible, activo
  ) values (
    enrollment_id, p_rating, trim(p_comment), true, true
  ) returning id_resena into review_id;

  select taa.id_tipo_accion into action_id
    from public.tipos_accion_auditoria taa
   where taa.nombre = 'Creación' and taa.activo = true
   limit 1;

  if action_id is not null then
    insert into public.auditoria_sistema (
      fk_usuario, fk_tipo_accion, tabla_afectada,
      clave_registro_afectado, descripcion, datos_nuevos
    ) values (
      p_user_id, action_id, 'resenas_cursos', review_id::text,
      'Reseña creada por un estudiante con curso finalizado',
      jsonb_build_object('courseId', p_course_id, 'rating', p_rating)
    );
  end if;

  return jsonb_build_object('reviewId', review_id);
end;
$$;

create or replace function public.academix_moderate_course_review(
  p_review_id uuid,
  p_visible boolean,
  p_reason text,
  p_actor_user uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  action_id integer;
begin
  if not exists (
    select 1
      from public.usuarios_roles ur
      join public.roles r on r.id_rol = ur.fk_rol
     where ur.fk_usuario = p_actor_user
       and ur.activo = true and r.activo = true
       and lower(r.nombre) = 'administrador'
  ) then
    raise exception using errcode = 'P0001', message = 'ADMIN_REQUIRED';
  end if;

  if p_review_id is null or p_visible is null
     or (p_visible = false and nullif(trim(coalesce(p_reason, '')), '') is null) then
    raise exception using errcode = 'P0001', message = 'INVALID_MODERATION_INPUT';
  end if;

  update public.resenas_cursos
     set visible = p_visible,
         moderada_por = p_actor_user,
         motivo_moderacion = case when p_visible then null else trim(p_reason) end,
         fecha_actualizacion = now()
   where id_resena = p_review_id and activo = true;

  if not found then
    raise exception using errcode = 'P0001', message = 'REVIEW_NOT_FOUND';
  end if;

  select taa.id_tipo_accion into action_id
    from public.tipos_accion_auditoria taa
   where taa.nombre = 'Actualización' and taa.activo = true
   limit 1;

  if action_id is not null then
    insert into public.auditoria_sistema (
      fk_usuario, fk_tipo_accion, tabla_afectada,
      clave_registro_afectado, descripcion, datos_nuevos
    ) values (
      p_actor_user, action_id, 'resenas_cursos', p_review_id::text,
      'Visibilidad de reseña actualizada por administración',
      jsonb_build_object('visible', p_visible, 'reason', p_reason)
    );
  end if;

  return jsonb_build_object('reviewId', p_review_id, 'visible', p_visible);
end;
$$;

revoke all on function public.academix_create_course_review(uuid, uuid, smallint, text)
  from public, anon, authenticated;
revoke all on function public.academix_moderate_course_review(uuid, boolean, text, uuid)
  from public, anon, authenticated;
grant execute on function public.academix_create_course_review(uuid, uuid, smallint, text)
  to service_role;
grant execute on function public.academix_moderate_course_review(uuid, boolean, text, uuid)
  to service_role;

-- Emite certificados para inscripciones finalizadas que pudieran existir antes
-- de esta migración, conservando cualquier certificado previamente emitido.
insert into public.certificados (
  fk_usuario, fk_curso, fk_tipo_certificado, codigo_certificado,
  fecha_emision, activo, fecha_actualizacion, fecha_revocacion
)
select
  i.fk_usuario,
  i.fk_curso,
  tc.id_tipo_certificado,
  'ACX-' || to_char(coalesce(i.fecha_finalizacion, now()), 'YYYY') || '-' ||
    upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)),
  coalesce(i.fecha_finalizacion, now()),
  true,
  now(),
  null
from public.inscripciones i
join public.estados_inscripcion ei
  on ei.id_estado_inscripcion = i.fk_estado_inscripcion
join public.cursos c
  on c.id_curso = i.fk_curso and c.permite_certificado = true
cross join lateral (
  select id_tipo_certificado
  from public.tipos_certificado
  where lower(nombre) = lower('Finalización') and activo = true
  limit 1
) tc
where i.activo = true and lower(ei.nombre) = 'finalizada'
on conflict on constraint uq_certificado_usuario_curso
do update set
  fk_tipo_certificado = excluded.fk_tipo_certificado,
  activo = true,
  fecha_actualizacion = now(),
  fecha_revocacion = null;
