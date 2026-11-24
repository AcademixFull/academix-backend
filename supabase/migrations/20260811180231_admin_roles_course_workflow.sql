-- Fase 3: administración por roles, instructores y ciclo de vida de cursos.
-- Arquitectura: React -> Express -> Supabase. Las funciones de esta migración
-- solo pueden ejecutarse con service_role/secret key desde el backend.

alter table public.perfiles_instructores
  add column if not exists activo boolean not null default true;

alter table public.categorias
  add column if not exists fecha_creacion timestamptz not null default now(),
  add column if not exists fecha_actualizacion timestamptz not null default now(),
  add column if not exists creado_por uuid,
  add column if not exists actualizado_por uuid;

alter table public.cursos
  add column if not exists creado_por uuid,
  add column if not exists actualizado_por uuid;

alter table public.cursos_instructores
  add column if not exists activo boolean not null default true,
  add column if not exists asignado_por uuid,
  add column if not exists fecha_actualizacion timestamptz not null default now();

alter table public.auditoria_sistema
  add column if not exists clave_registro_afectado text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'fk_categoria_creado_por'
       and conrelid = 'public.categorias'::regclass
  ) then
    alter table public.categorias
      add constraint fk_categoria_creado_por
      foreign key (creado_por) references public.usuarios (id_usuario);
  end if;

  if not exists (
    select 1 from pg_constraint
     where conname = 'fk_categoria_actualizado_por'
       and conrelid = 'public.categorias'::regclass
  ) then
    alter table public.categorias
      add constraint fk_categoria_actualizado_por
      foreign key (actualizado_por) references public.usuarios (id_usuario);
  end if;

  if not exists (
    select 1 from pg_constraint
     where conname = 'fk_curso_creado_por'
       and conrelid = 'public.cursos'::regclass
  ) then
    alter table public.cursos
      add constraint fk_curso_creado_por
      foreign key (creado_por) references public.usuarios (id_usuario);
  end if;

  if not exists (
    select 1 from pg_constraint
     where conname = 'fk_curso_actualizado_por'
       and conrelid = 'public.cursos'::regclass
  ) then
    alter table public.cursos
      add constraint fk_curso_actualizado_por
      foreign key (actualizado_por) references public.usuarios (id_usuario);
  end if;

  if not exists (
    select 1 from pg_constraint
     where conname = 'fk_ci_asignado_por'
       and conrelid = 'public.cursos_instructores'::regclass
  ) then
    alter table public.cursos_instructores
      add constraint fk_ci_asignado_por
      foreign key (asignado_por) references public.usuarios (id_usuario);
  end if;

  if not exists (
    select 1 from pg_constraint
     where conname = 'chk_cursos_duracion_positiva'
       and conrelid = 'public.cursos'::regclass
  ) then
    alter table public.cursos
      add constraint chk_cursos_duracion_positiva
      check (duracion_estimada_horas is null or duracion_estimada_horas > 0);
  end if;

  if not exists (
    select 1 from pg_constraint
     where conname = 'chk_cursos_cuota_no_negativa'
       and conrelid = 'public.cursos'::regclass
  ) then
    alter table public.cursos
      add constraint chk_cursos_cuota_no_negativa
      check (cuota_recuperacion >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint
     where conname = 'chk_cursos_fechas_validas'
       and conrelid = 'public.cursos'::regclass
  ) then
    alter table public.cursos
      add constraint chk_cursos_fechas_validas
      check (
        fecha_cierre is null
        or fecha_publicacion is null
        or fecha_cierre > fecha_publicacion
      );
  end if;
end;
$$;

create index if not exists idx_categoria_creado_por
  on public.categorias (creado_por)
  where creado_por is not null;

create index if not exists idx_categoria_actualizado_por
  on public.categorias (actualizado_por)
  where actualizado_por is not null;

create index if not exists idx_curso_creado_por
  on public.cursos (creado_por)
  where creado_por is not null;

create index if not exists idx_curso_actualizado_por
  on public.cursos (actualizado_por)
  where actualizado_por is not null;

create index if not exists idx_ci_asignado_por
  on public.cursos_instructores (asignado_por)
  where asignado_por is not null;

create index if not exists idx_usuario_roles_asignado_por
  on public.usuarios_roles (asignado_por)
  where asignado_por is not null;

create index if not exists idx_auditoria_tipo_accion
  on public.auditoria_sistema (fk_tipo_accion);

drop index if exists public.uq_curso_instructor_principal;
create unique index uq_curso_instructor_principal
  on public.cursos_instructores (fk_curso)
  where instructor_principal = true and activo = true;

create or replace function private.academix_touch_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.fecha_actualizacion := now();
  return new;
end;
$$;

revoke all on function private.academix_touch_updated_at()
  from public, anon, authenticated, service_role;

drop trigger if exists touch_categoria_updated_at on public.categorias;
create trigger touch_categoria_updated_at
  before update on public.categorias
  for each row execute function private.academix_touch_updated_at();

drop trigger if exists touch_curso_updated_at on public.cursos;
create trigger touch_curso_updated_at
  before update on public.cursos
  for each row execute function private.academix_touch_updated_at();

drop trigger if exists touch_perfil_instructor_updated_at on public.perfiles_instructores;
create trigger touch_perfil_instructor_updated_at
  before update on public.perfiles_instructores
  for each row execute function private.academix_touch_updated_at();

drop trigger if exists touch_curso_instructor_updated_at on public.cursos_instructores;
create trigger touch_curso_instructor_updated_at
  before update on public.cursos_instructores
  for each row execute function private.academix_touch_updated_at();

create or replace function private.academix_audit_catalog_change()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  action_id smallint;
  actor_id uuid;
  record_key text;
  previous_data jsonb;
  next_data jsonb;
begin
  select id_tipo_accion
    into action_id
    from public.tipos_accion_auditoria
   where nombre = case when tg_op = 'INSERT' then 'Creación' else 'Actualización' end
     and activo = true
   limit 1;

  if action_id is null then
    raise exception using errcode = 'P0001', message = 'AUDIT_ACTION_NOT_CONFIGURED';
  end if;

  if tg_table_name = 'cursos' then
    actor_id := coalesce(new.actualizado_por, new.creado_por);
    record_key := new.id_curso::text;
  elsif tg_table_name = 'categorias' then
    actor_id := coalesce(new.actualizado_por, new.creado_por);
    record_key := new.id_categoria::text;
  else
    raise exception using errcode = 'P0001', message = 'AUDIT_TABLE_NOT_SUPPORTED';
  end if;

  if tg_op = 'INSERT' then
    previous_data := null;
    next_data := to_jsonb(new);
  else
    previous_data := to_jsonb(old);
    next_data := to_jsonb(new);
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
    actor_id,
    action_id,
    tg_table_name,
    record_key,
    case when tg_op = 'INSERT' then 'Registro creado desde la API administrativa'
         else 'Registro actualizado desde la API administrativa' end,
    previous_data,
    next_data
  );

  return new;
end;
$$;

revoke all on function private.academix_audit_catalog_change()
  from public, anon, authenticated, service_role;

drop trigger if exists audit_categoria_change on public.categorias;
create trigger audit_categoria_change
  after insert or update on public.categorias
  for each row execute function private.academix_audit_catalog_change();

drop trigger if exists audit_curso_change on public.cursos;
create trigger audit_curso_change
  after insert or update on public.cursos
  for each row execute function private.academix_audit_catalog_change();

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
     where lower(requested.name) not in ('administrador', 'alumno', 'instructor')
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

create or replace function public.academix_upsert_instructor(
  p_target_user uuid,
  p_specialty text,
  p_experience_years smallint,
  p_actor_user uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  instructor_role_id uuid;
  action_id smallint;
  existed boolean;
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

  if nullif(btrim(p_specialty), '') is null then
    raise exception using errcode = 'P0001', message = 'SPECIALTY_REQUIRED';
  end if;

  if p_experience_years < 0 or p_experience_years > 80 then
    raise exception using errcode = 'P0001', message = 'INVALID_EXPERIENCE_YEARS';
  end if;

  select exists (
    select 1 from public.perfiles_instructores
     where fk_usuario = p_target_user
  ) into existed;

  insert into public.perfiles_instructores (
    fk_usuario,
    especialidad,
    anios_experiencia,
    activo
  ) values (
    p_target_user,
    btrim(p_specialty),
    p_experience_years,
    true
  )
  on conflict (fk_usuario)
  do update set
    especialidad = excluded.especialidad,
    anios_experiencia = excluded.anios_experiencia,
    activo = true;

  select id_rol into instructor_role_id
    from public.roles
   where lower(nombre) = 'instructor' and activo = true
   limit 1;

  if instructor_role_id is null then
    raise exception using errcode = 'P0001', message = 'INSTRUCTOR_ROLE_NOT_CONFIGURED';
  end if;

  insert into public.usuarios_roles (
    fk_usuario,
    fk_rol,
    activo,
    fecha_asignacion,
    asignado_por
  ) values (
    p_target_user,
    instructor_role_id,
    true,
    now(),
    p_actor_user
  )
  on conflict on constraint uq_usuario_rol
  do update set
    activo = true,
    fecha_asignacion = excluded.fecha_asignacion,
    asignado_por = excluded.asignado_por;

  select id_tipo_accion into action_id
    from public.tipos_accion_auditoria
   where nombre = case when existed then 'Actualización' else 'Creación' end
     and activo = true
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
    datos_nuevos
  ) values (
    p_actor_user,
    action_id,
    'perfiles_instructores',
    p_target_user::text,
    'Perfil de instructor guardado desde la API administrativa',
    jsonb_build_object(
      'especialidad', btrim(p_specialty),
      'anios_experiencia', p_experience_years,
      'activo', true
    )
  );

  return jsonb_build_object(
    'userId', p_target_user,
    'specialty', btrim(p_specialty),
    'experienceYears', p_experience_years,
    'active', true
  );
end;
$$;

create or replace function public.academix_assign_principal_instructor(
  p_course_id uuid,
  p_instructor_user uuid,
  p_actor_user uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  assignment_id uuid;
  action_id smallint;
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
    select 1 from public.cursos
     where id_curso = p_course_id and activo = true
  ) then
    raise exception using errcode = 'P0001', message = 'COURSE_NOT_FOUND';
  end if;

  if not exists (
    select 1
      from public.perfiles_instructores pi
      join public.usuarios u on u.id_usuario = pi.fk_usuario
      join public.usuarios_roles ur on ur.fk_usuario = pi.fk_usuario
      join public.roles r on r.id_rol = ur.fk_rol
     where pi.fk_usuario = p_instructor_user
       and pi.activo = true
       and u.activo = true
       and ur.activo = true
       and r.activo = true
       and lower(r.nombre) = 'instructor'
  ) then
    raise exception using errcode = 'P0001', message = 'INSTRUCTOR_NOT_FOUND';
  end if;

  update public.cursos_instructores
     set instructor_principal = false,
         asignado_por = p_actor_user
   where fk_curso = p_course_id
     and activo = true
     and instructor_principal = true;

  insert into public.cursos_instructores (
    fk_curso,
    fk_usuario,
    instructor_principal,
    activo,
    fecha_asignacion,
    asignado_por
  ) values (
    p_course_id,
    p_instructor_user,
    true,
    true,
    now(),
    p_actor_user
  )
  on conflict on constraint uq_curso_instructor
  do update set
    instructor_principal = true,
    activo = true,
    fecha_asignacion = excluded.fecha_asignacion,
    asignado_por = excluded.asignado_por
  returning id_curso_instructor into assignment_id;

  select id_tipo_accion into action_id
    from public.tipos_accion_auditoria
   where nombre = 'Actualización' and activo = true
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
    datos_nuevos
  ) values (
    p_actor_user,
    action_id,
    'cursos_instructores',
    assignment_id::text,
    'Instructor principal asignado desde la API administrativa',
    jsonb_build_object(
      'courseId', p_course_id,
      'instructorId', p_instructor_user,
      'principal', true,
      'active', true
    )
  );

  return jsonb_build_object(
    'assignmentId', assignment_id,
    'courseId', p_course_id,
    'instructorId', p_instructor_user
  );
end;
$$;

create or replace function public.academix_bootstrap_admin(p_email text)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target_user uuid;
  admin_role uuid;
  action_id integer;
begin
  if nullif(trim(p_email), '') is null then
    raise exception using errcode = 'P0001', message = 'INVALID_EMAIL';
  end if;

  if exists (
    select 1
      from public.usuarios_roles ur
      join public.roles r on r.id_rol = ur.fk_rol
     where ur.activo = true and r.activo = true and lower(r.nombre) = 'administrador'
  ) then
    raise exception using errcode = 'P0001', message = 'ADMIN_ALREADY_CONFIGURED';
  end if;

  select id_usuario into target_user
    from public.usuarios
   where lower(correo) = lower(trim(p_email)) and activo = true
   limit 1;
  if target_user is null then
    raise exception using errcode = 'P0001', message = 'USER_NOT_FOUND';
  end if;

  select id_rol into admin_role
    from public.roles
   where lower(nombre) = 'administrador' and activo = true
   limit 1;
  if admin_role is null then
    raise exception using errcode = 'P0001', message = 'ADMIN_ROLE_NOT_FOUND';
  end if;

  insert into public.usuarios_roles (fk_usuario, fk_rol, activo, fecha_asignacion, asignado_por)
  values (target_user, admin_role, true, now(), null)
  on conflict on constraint uq_usuario_rol
  do update set activo = true, fecha_asignacion = excluded.fecha_asignacion, asignado_por = null;

  select id_tipo_accion into action_id
    from public.tipos_accion_auditoria
   where nombre = 'Cambio de permisos' and activo = true
   limit 1;
  if action_id is null then
    raise exception using errcode = 'P0001', message = 'AUDIT_ACTION_NOT_CONFIGURED';
  end if;

  insert into public.auditoria_sistema (
    fk_usuario, fk_tipo_accion, tabla_afectada, clave_registro_afectado,
    descripcion, datos_nuevos
  ) values (
    target_user, action_id, 'usuarios_roles', target_user::text,
    'Primer administrador configurado mediante el comando de bootstrap',
    jsonb_build_object('roles', jsonb_build_array('Administrador'))
  );

  return jsonb_build_object('userId', target_user, 'email', lower(trim(p_email)));
end;
$$;

revoke all on function public.academix_set_user_roles(uuid, text[], uuid)
  from public, anon, authenticated;
revoke all on function public.academix_upsert_instructor(uuid, text, smallint, uuid)
  from public, anon, authenticated;
revoke all on function public.academix_assign_principal_instructor(uuid, uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.academix_bootstrap_admin(text)
  from public, anon, authenticated;

grant execute on function public.academix_set_user_roles(uuid, text[], uuid)
  to service_role;
grant execute on function public.academix_upsert_instructor(uuid, text, smallint, uuid)
  to service_role;
grant execute on function public.academix_assign_principal_instructor(uuid, uuid, uuid)
  to service_role;
grant execute on function public.academix_bootstrap_admin(text)
  to service_role;
