-- Academix: organizaciones, membresías y beneficio de acceso institucional.
-- Esta migración mantiene el acceso a datos exclusivamente por el backend (service_role).

create table if not exists public.organizaciones (
  id_organizacion uuid primary key default gen_random_uuid(),
  nombre varchar(160) not null,
  slug text not null unique,
  descripcion text,
  tipo varchar(24) not null,
  codigo_union varchar(20) not null unique default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)),
  activa boolean not null default true,
  creada_por uuid not null references public.usuarios(id_usuario),
  fecha_creacion timestamptz not null default now(),
  fecha_actualizacion timestamptz not null default now(),
  constraint ck_organizacion_nombre check (char_length(btrim(nombre)) between 3 and 160),
  constraint ck_organizacion_slug check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint ck_organizacion_tipo check (tipo in ('Universidad', 'Empresa', 'Otra'))
);

create table if not exists public.miembros_organizacion (
  id_miembro uuid primary key default gen_random_uuid(),
  fk_organizacion uuid not null references public.organizaciones(id_organizacion) on delete cascade,
  fk_usuario uuid not null references public.usuarios(id_usuario) on delete cascade,
  matricula varchar(80),
  rol varchar(24) not null default 'Estudiante',
  activo boolean not null default true,
  agregado_por uuid references public.usuarios(id_usuario),
  fecha_union timestamptz not null default now(),
  fecha_actualizacion timestamptz not null default now(),
  constraint uq_miembro_organizacion unique (fk_organizacion, fk_usuario),
  constraint ck_miembro_organizacion_matricula check (matricula is null or char_length(btrim(matricula)) between 2 and 80),
  constraint ck_miembro_organizacion_rol check (rol in ('Administrador', 'Instructor', 'Estudiante'))
);

alter table public.cursos
  add column if not exists fk_organizacion uuid references public.organizaciones(id_organizacion);

create index if not exists idx_organizaciones_creada_por
  on public.organizaciones (creada_por);
create index if not exists idx_miembros_organizacion_usuario_activo
  on public.miembros_organizacion (fk_usuario, activo);
create index if not exists idx_miembros_organizacion_org_rol_activo
  on public.miembros_organizacion (fk_organizacion, rol, activo);
create unique index if not exists uq_miembros_organizacion_matricula_activa
  on public.miembros_organizacion (fk_organizacion, lower(matricula))
  where matricula is not null and activo = true;
create index if not exists idx_cursos_organizacion_estado
  on public.cursos (fk_organizacion, fk_estado_curso)
  where fk_organizacion is not null;

alter table public.organizaciones enable row level security;
alter table public.miembros_organizacion enable row level security;

revoke all on table public.organizaciones from anon, authenticated;
revoke all on table public.miembros_organizacion from anon, authenticated;
grant select, insert, update on table public.organizaciones to service_role;
grant select, insert, update on table public.miembros_organizacion to service_role;

create or replace function public.academix_create_organization(
  p_user_id uuid,
  p_name text,
  p_slug text,
  p_description text,
  p_type text
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  organization_id uuid;
begin
  if not exists (
    select 1
      from public.usuarios u
     where u.id_usuario = p_user_id
       and u.activo = true
  ) then
    raise exception using errcode = 'P0001', message = 'USER_NOT_FOUND';
  end if;

  insert into public.organizaciones (
    nombre,
    slug,
    descripcion,
    tipo,
    creada_por
  ) values (
    btrim(p_name),
    btrim(p_slug),
    nullif(btrim(coalesce(p_description, '')), ''),
    p_type,
    p_user_id
  ) returning id_organizacion into organization_id;

  insert into public.miembros_organizacion (
    fk_organizacion,
    fk_usuario,
    rol,
    activo,
    agregado_por
  ) values (
    organization_id,
    p_user_id,
    'Administrador',
    true,
    p_user_id
  );

  return organization_id;
end;
$$;

create or replace function public.academix_join_organization(
  p_user_id uuid,
  p_join_code text,
  p_student_number text
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  organization_id uuid;
  current_active boolean;
begin
  if p_student_number is null or char_length(btrim(p_student_number)) < 2 then
    raise exception using errcode = 'P0001', message = 'INVALID_STUDENT_NUMBER';
  end if;

  if not exists (
    select 1
      from public.usuarios u
     where u.id_usuario = p_user_id
       and u.activo = true
  ) then
    raise exception using errcode = 'P0001', message = 'USER_NOT_FOUND';
  end if;

  select o.id_organizacion
    into organization_id
    from public.organizaciones o
   where upper(o.codigo_union) = upper(btrim(p_join_code))
     and o.activa = true
   limit 1;

  if organization_id is null then
    raise exception using errcode = 'P0001', message = 'ORGANIZATION_NOT_FOUND';
  end if;

  if exists (
    select 1
      from public.miembros_organizacion mo
     where mo.fk_organizacion = organization_id
       and lower(mo.matricula) = lower(btrim(p_student_number))
       and mo.activo = true
       and mo.fk_usuario <> p_user_id
  ) then
    raise exception using errcode = 'P0001', message = 'STUDENT_NUMBER_ALREADY_USED';
  end if;

  select mo.activo
    into current_active
    from public.miembros_organizacion mo
   where mo.fk_organizacion = organization_id
     and mo.fk_usuario = p_user_id;

  if found and current_active then
    raise exception using errcode = 'P0001', message = 'ORGANIZATION_ALREADY_MEMBER';
  end if;

  insert into public.miembros_organizacion (
    fk_organizacion,
    fk_usuario,
    matricula,
    rol,
    activo,
    agregado_por,
    fecha_union,
    fecha_actualizacion
  ) values (
    organization_id,
    p_user_id,
    btrim(p_student_number),
    'Estudiante',
    true,
    null,
    now(),
    now()
  )
  on conflict on constraint uq_miembro_organizacion
  do update set
    matricula = excluded.matricula,
    rol = 'Estudiante',
    activo = true,
    agregado_por = null,
    fecha_union = now(),
    fecha_actualizacion = now();

  return organization_id;
end;
$$;

revoke all on function public.academix_create_organization(uuid, text, text, text, text)
  from public, anon, authenticated;
revoke all on function public.academix_join_organization(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.academix_create_organization(uuid, text, text, text, text)
  to service_role;
grant execute on function public.academix_join_organization(uuid, text, text)
  to service_role;

-- Extiende la inscripción existente: un miembro activo obtiene acceso sin cobro
-- cuando el curso pertenece a su misma organización. La organización no controla
-- el precio para personas externas; esa política queda en manos de Academix.
create or replace function public.academix_enroll_user(
  p_user_id uuid,
  p_course_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  enrollment_id uuid;
  desired_state_id smallint;
  cancelled_state_id smallint;
  desired_state_name text;
  course_price numeric;
  requires_approval boolean;
  course_organization_id uuid;
  has_organization_benefit boolean := false;
  action_id integer;
begin
  if p_user_id is null or p_course_id is null then
    raise exception using errcode = 'P0001', message = 'INVALID_ENROLLMENT_INPUT';
  end if;

  if not exists (
    select 1 from public.usuarios u
    where u.id_usuario = p_user_id and u.activo = true
  ) then
    raise exception using errcode = 'P0001', message = 'USER_NOT_FOUND';
  end if;

  select c.cuota_recuperacion, c.requiere_aprobacion, c.fk_organizacion
    into course_price, requires_approval, course_organization_id
    from public.cursos c
    join public.estados_curso ec on ec.id_estado_curso = c.fk_estado_curso
   where c.id_curso = p_course_id
     and c.activo = true
     and ec.activo = true
     and lower(ec.nombre) = 'publicado';

  if not found then
    raise exception using errcode = 'P0001', message = 'COURSE_NOT_AVAILABLE';
  end if;

  if course_organization_id is not null then
    select exists (
      select 1
        from public.miembros_organizacion mo
       where mo.fk_organizacion = course_organization_id
         and mo.fk_usuario = p_user_id
         and mo.activo = true
    ) into has_organization_benefit;
  end if;

  if course_price > 0 and not has_organization_benefit then
    raise exception using errcode = 'P0001', message = 'PAYMENT_NOT_AVAILABLE';
  end if;

  if requires_approval then
    raise exception using errcode = 'P0001', message = 'COURSE_REQUIRES_APPROVAL';
  end if;

  desired_state_name := 'Activa';

  select id_estado_inscripcion into desired_state_id
    from public.estados_inscripcion
   where lower(nombre) = lower(desired_state_name) and activo = true
   limit 1;

  select id_estado_inscripcion into cancelled_state_id
    from public.estados_inscripcion
   where lower(nombre) = 'cancelada' and activo = true
   limit 1;

  if desired_state_id is null or cancelled_state_id is null then
    raise exception using errcode = 'P0001', message = 'ENROLLMENT_STATE_NOT_CONFIGURED';
  end if;

  insert into public.inscripciones (
    fk_usuario,
    fk_curso,
    fk_estado_inscripcion,
    monto_pagado,
    fecha_inscripcion,
    fecha_inicio,
    fecha_finalizacion,
    activo,
    fecha_actualizacion
  ) values (
    p_user_id,
    p_course_id,
    desired_state_id,
    0,
    now(),
    now(),
    null,
    true,
    now()
  )
  on conflict on constraint uq_usuario_curso
  do update set
    fk_estado_inscripcion = excluded.fk_estado_inscripcion,
    monto_pagado = 0,
    fecha_inscripcion = excluded.fecha_inscripcion,
    fecha_inicio = excluded.fecha_inicio,
    fecha_finalizacion = null,
    activo = true,
    fecha_actualizacion = now()
  where public.inscripciones.activo = false
     or public.inscripciones.fk_estado_inscripcion = cancelled_state_id
  returning id_inscripcion into enrollment_id;

  if enrollment_id is null then
    raise exception using errcode = 'P0001', message = 'ENROLLMENT_ALREADY_EXISTS';
  end if;

  select id_tipo_accion into action_id
    from public.tipos_accion_auditoria
   where nombre = 'Creación' and activo = true
   limit 1;

  if action_id is not null then
    insert into public.auditoria_sistema (
      fk_usuario,
      fk_tipo_accion,
      tabla_afectada,
      clave_registro_afectado,
      descripcion,
      datos_nuevos
    ) values (
      p_user_id,
      action_id,
      'inscripciones',
      enrollment_id::text,
      'Inscripción creada desde la API del estudiante',
      jsonb_build_object(
        'courseId', p_course_id,
        'status', lower(desired_state_name),
        'amountPaid', 0,
        'organizationBenefit', has_organization_benefit
      )
    );
  end if;

  return jsonb_build_object(
    'enrollmentId', enrollment_id,
    'status', lower(desired_state_name),
    'organizationBenefit', has_organization_benefit
  );
end;
$$;

revoke all on function public.academix_enroll_user(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.academix_enroll_user(uuid, uuid)
  to service_role;
