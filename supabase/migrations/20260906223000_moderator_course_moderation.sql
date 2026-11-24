-- Academix: rol global Moderador y trazabilidad de bajas de cursos.
-- React nunca accede directamente a estas tablas/RPC; Express usa service_role.

insert into public.roles (nombre, descripcion, activo)
select
  'Moderador',
  'Puede revisar contenido y dar de baja cursos inapropiados sin administrar usuarios o precios',
  true
where not exists (
  select 1 from public.roles where lower(nombre) = 'moderador'
);

update public.roles
   set activo = true,
       descripcion = 'Puede revisar contenido y dar de baja cursos inapropiados sin administrar usuarios o precios',
       fecha_actualizacion = now()
 where lower(nombre) = 'moderador';

do $$
begin
  if not exists (
    select 1
      from public.estados_curso
     where lower(nombre) = 'dado de baja por moderación'
  ) then
    insert into public.estados_curso (
      nombre,
      descripcion,
      activo
    ) values (
      'Dado de baja por moderación',
      'Curso retirado por moderación; conserva contenido e historial y puede ser restaurado por un Moderador o Administrador cuando vuelva a cumplir los lineamientos.',
      true
    );
  end if;

  update public.estados_curso
     set activo = true,
         descripcion = 'Curso retirado por moderación; conserva contenido e historial y puede ser restaurado por un Moderador o Administrador cuando vuelva a cumplir los lineamientos.'
   where lower(nombre) = 'dado de baja por moderación';
end;
$$;

create table if not exists public.moderaciones_curso (
  id_moderacion uuid primary key default gen_random_uuid(),
  fk_curso uuid not null,
  fk_moderador uuid not null,
  fk_estado_anterior smallint not null,
  motivo text not null,
  activa boolean not null default true,
  fecha_moderacion timestamptz not null default now(),
  restaurada_por uuid,
  fecha_restauracion timestamptz,
  constraint fk_moderacion_curso
    foreign key (fk_curso) references public.cursos (id_curso),
  constraint fk_moderacion_moderador
    foreign key (fk_moderador) references public.usuarios (id_usuario),
  constraint fk_moderacion_estado_anterior
    foreign key (fk_estado_anterior) references public.estados_curso (id_estado_curso),
  constraint fk_moderacion_restaurada_por
    foreign key (restaurada_por) references public.usuarios (id_usuario),
  constraint ck_moderacion_motivo
    check (char_length(btrim(motivo)) between 10 and 2000),
  constraint ck_moderacion_restauracion
    check (
      (activa = true and restaurada_por is null and fecha_restauracion is null)
      or
      (activa = false and restaurada_por is not null and fecha_restauracion is not null)
    )
);

create unique index if not exists uq_moderacion_activa_por_curso
  on public.moderaciones_curso (fk_curso)
  where activa = true;

create index if not exists idx_moderaciones_curso_fecha
  on public.moderaciones_curso (fk_curso, fecha_moderacion desc);

create index if not exists idx_moderaciones_moderador_fecha
  on public.moderaciones_curso (fk_moderador, fecha_moderacion desc);

create index if not exists idx_moderaciones_restaurada_por
  on public.moderaciones_curso (restaurada_por)
  where restaurada_por is not null;

alter table public.moderaciones_curso enable row level security;
revoke all on table public.moderaciones_curso from anon, authenticated, service_role;
grant select, insert, update on table public.moderaciones_curso to service_role;

-- Extiende la administración de roles para aceptar Moderador sin otorgarle
-- funciones de administrador global.
create or replace function public.academix_set_user_roles(
  p_target_user uuid,
  p_role_names text[],
  p_actor_user uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  old_roles jsonb;
  new_roles jsonb;
  action_id smallint;
  target_is_admin boolean;
  requested_admin boolean;
begin
  if not exists (
    select 1
      from public.usuarios_roles ur
      join public.roles r on r.id_rol = ur.fk_rol
      join public.usuarios u on u.id_usuario = ur.fk_usuario
     where ur.fk_usuario = p_actor_user
       and ur.activo = true
       and r.activo = true
       and lower(r.nombre) = 'administrador'
       and u.activo = true
  ) then
    raise exception using errcode = 'P0001', message = 'ADMIN_REQUIRED';
  end if;

  if not exists (
    select 1 from public.usuarios
     where id_usuario = p_target_user and activo = true
  ) then
    raise exception using errcode = 'P0001', message = 'USER_NOT_FOUND';
  end if;

  if p_role_names is null or cardinality(p_role_names) = 0 then
    raise exception using errcode = 'P0001', message = 'AT_LEAST_ONE_ROLE_REQUIRED';
  end if;

  if exists (
    select 1 from unnest(p_role_names) as requested(name)
     where lower(requested.name) not in ('administrador', 'alumno', 'instructor', 'moderador')
  ) then
    raise exception using errcode = 'P0001', message = 'INVALID_ROLE';
  end if;

  if exists (
    select 1 from unnest(p_role_names) as requested(name)
     where lower(requested.name) = 'instructor'
  ) and not exists (
    select 1 from public.perfiles_instructores
     where fk_usuario = p_target_user and activo = true
  ) then
    raise exception using errcode = 'P0001', message = 'INSTRUCTOR_PROFILE_REQUIRED';
  end if;

  select exists (
    select 1
      from public.usuarios_roles ur
      join public.roles r on r.id_rol = ur.fk_rol
     where ur.fk_usuario = p_target_user
       and ur.activo = true
       and lower(r.nombre) = 'administrador'
  ) into target_is_admin;

  select exists (
    select 1 from unnest(p_role_names) as requested(name)
     where lower(requested.name) = 'administrador'
  ) into requested_admin;

  if target_is_admin and not requested_admin and not exists (
    select 1
      from public.usuarios_roles ur
      join public.roles r on r.id_rol = ur.fk_rol
      join public.usuarios u on u.id_usuario = ur.fk_usuario
     where ur.fk_usuario <> p_target_user
       and ur.activo = true
       and r.activo = true
       and lower(r.nombre) = 'administrador'
       and u.activo = true
  ) then
    raise exception using errcode = 'P0001', message = 'LAST_ADMIN_REQUIRED';
  end if;

  select coalesce(jsonb_agg(r.nombre order by r.nombre), '[]'::jsonb)
    into old_roles
    from public.usuarios_roles ur
    join public.roles r on r.id_rol = ur.fk_rol
   where ur.fk_usuario = p_target_user and ur.activo = true;

  update public.usuarios_roles
     set activo = false,
         asignado_por = p_actor_user
   where fk_usuario = p_target_user;

  insert into public.usuarios_roles (
    fk_usuario,
    fk_rol,
    activo,
    fecha_asignacion,
    asignado_por
  )
  select
    p_target_user,
    r.id_rol,
    true,
    now(),
    p_actor_user
  from public.roles r
  where r.activo = true
    and lower(r.nombre) in (
      select distinct lower(requested.name)
      from unnest(p_role_names) as requested(name)
    )
  on conflict on constraint uq_usuario_rol
  do update set
    activo = true,
    fecha_asignacion = excluded.fecha_asignacion,
    asignado_por = excluded.asignado_por;

  select coalesce(jsonb_agg(r.nombre order by r.nombre), '[]'::jsonb)
    into new_roles
    from public.usuarios_roles ur
    join public.roles r on r.id_rol = ur.fk_rol
   where ur.fk_usuario = p_target_user and ur.activo = true;

  select id_tipo_accion into action_id
    from public.tipos_accion_auditoria
   where nombre = 'Cambio de permisos' and activo = true
   limit 1;

  if action_id is null then
    raise exception using errcode = 'P0001', message = 'AUDIT_ACTION_NOT_CONFIGURED';
  end if;

  insert into public.auditoria_sistema (
    fk_usuario,
    fk_tipo_accion,
    tabla_afectada,
    clave_registro_afectado,
    descripcion,
    datos_anteriores,
    datos_nuevos
  ) values (
    p_actor_user,
    action_id,
    'usuarios_roles',
    p_target_user::text,
    'Roles actualizados desde la API administrativa',
    jsonb_build_object('roles', old_roles),
    jsonb_build_object('roles', new_roles)
  );

  return new_roles;
end;
$$;

create or replace function public.academix_moderate_course(
  p_course_id uuid,
  p_actor_user uuid,
  p_reason text
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_state_id smallint;
  current_state_name text;
  moderated_state_id smallint;
  moderation_id uuid;
begin
  if p_reason is null or char_length(btrim(p_reason)) < 10 or char_length(btrim(p_reason)) > 2000 then
    raise exception using errcode = 'P0001', message = 'INVALID_MODERATION_REASON';
  end if;

  if not exists (
    select 1
      from public.usuarios_roles ur
      join public.roles r on r.id_rol = ur.fk_rol
      join public.usuarios u on u.id_usuario = ur.fk_usuario
     where ur.fk_usuario = p_actor_user
       and ur.activo = true
       and r.activo = true
       and u.activo = true
       and lower(r.nombre) in ('moderador', 'administrador')
  ) then
    raise exception using errcode = 'P0001', message = 'MODERATOR_REQUIRED';
  end if;

  select c.fk_estado_curso, ec.nombre
    into current_state_id, current_state_name
    from public.cursos c
    join public.estados_curso ec on ec.id_estado_curso = c.fk_estado_curso
   where c.id_curso = p_course_id
   for update of c;

  if not found then
    raise exception using errcode = 'P0001', message = 'COURSE_NOT_FOUND';
  end if;

  if lower(current_state_name) = 'dado de baja por moderación' then
    raise exception using errcode = 'P0001', message = 'COURSE_ALREADY_MODERATED';
  end if;

  if lower(current_state_name) not in ('en revisión', 'publicado') then
    raise exception using errcode = 'P0001', message = 'INVALID_MODERATION_STATE';
  end if;

  select id_estado_curso
    into moderated_state_id
    from public.estados_curso
   where lower(nombre) = 'dado de baja por moderación'
     and activo = true
   limit 1;

  if moderated_state_id is null then
    raise exception using errcode = 'P0001', message = 'MODERATION_STATE_NOT_CONFIGURED';
  end if;

  insert into public.moderaciones_curso (
    fk_curso,
    fk_moderador,
    fk_estado_anterior,
    motivo,
    activa
  ) values (
    p_course_id,
    p_actor_user,
    current_state_id,
    btrim(p_reason),
    true
  )
  returning id_moderacion into moderation_id;

  update public.cursos
     set fk_estado_curso = moderated_state_id,
         activo = false,
         actualizado_por = p_actor_user
   where id_curso = p_course_id
     and fk_estado_curso = current_state_id;

  if not found then
    raise exception using errcode = 'P0001', message = 'COURSE_STATE_CHANGED';
  end if;

  return moderation_id;
end;
$$;

create or replace function public.academix_restore_moderated_course(
  p_course_id uuid,
  p_actor_user uuid
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  moderation_id uuid;
  previous_state_id smallint;
  moderated_state_id smallint;
begin
  if not exists (
    select 1
      from public.usuarios_roles ur
      join public.roles r on r.id_rol = ur.fk_rol
      join public.usuarios u on u.id_usuario = ur.fk_usuario
     where ur.fk_usuario = p_actor_user
       and ur.activo = true
       and r.activo = true
       and u.activo = true
       and lower(r.nombre) in ('moderador', 'administrador')
  ) then
    raise exception using errcode = 'P0001', message = 'MODERATOR_REQUIRED';
  end if;

  select mc.id_moderacion, mc.fk_estado_anterior
    into moderation_id, previous_state_id
    from public.moderaciones_curso mc
   where mc.fk_curso = p_course_id
     and mc.activa = true
   order by mc.fecha_moderacion desc
   limit 1
   for update;

  if moderation_id is null then
    raise exception using errcode = 'P0001', message = 'MODERATION_NOT_FOUND';
  end if;

  select id_estado_curso
    into moderated_state_id
    from public.estados_curso
   where lower(nombre) = 'dado de baja por moderación'
     and activo = true
   limit 1;

  if moderated_state_id is null then
    raise exception using errcode = 'P0001', message = 'MODERATION_STATE_NOT_CONFIGURED';
  end if;

  update public.cursos
     set fk_estado_curso = previous_state_id,
         activo = true,
         actualizado_por = p_actor_user
   where id_curso = p_course_id
     and fk_estado_curso = moderated_state_id;

  if not found then
    raise exception using errcode = 'P0001', message = 'COURSE_STATE_CHANGED';
  end if;

  update public.moderaciones_curso
     set activa = false,
         restaurada_por = p_actor_user,
         fecha_restauracion = now()
   where id_moderacion = moderation_id
     and activa = true;

  return moderation_id;
end;
$$;

revoke all on function public.academix_set_user_roles(uuid, text[], uuid)
  from public, anon, authenticated;
revoke all on function public.academix_moderate_course(uuid, uuid, text)
  from public, anon, authenticated;
revoke all on function public.academix_restore_moderated_course(uuid, uuid)
  from public, anon, authenticated;

grant execute on function public.academix_set_user_roles(uuid, text[], uuid)
  to service_role;
grant execute on function public.academix_moderate_course(uuid, uuid, text)
  to service_role;
grant execute on function public.academix_restore_moderated_course(uuid, uuid)
  to service_role;
