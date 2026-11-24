-- Fase 4: inscripciones, biblioteca del estudiante y progreso por lección.
-- Solo Express invoca estas funciones con service_role; React no accede a tablas.

alter table public.inscripciones
  add column if not exists fecha_actualizacion timestamp without time zone not null default now();

alter table public.progreso_lecciones
  add column if not exists fecha_actualizacion timestamp without time zone not null default now();

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'ck_inscripciones_monto_no_negativo'
      and conrelid = 'public.inscripciones'::regclass
  ) then
    alter table public.inscripciones
      add constraint ck_inscripciones_monto_no_negativo check (monto_pagado >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'ck_inscripciones_fechas_validas'
      and conrelid = 'public.inscripciones'::regclass
  ) then
    alter table public.inscripciones
      add constraint ck_inscripciones_fechas_validas check (
        fecha_inicio is null
        or fecha_finalizacion is null
        or fecha_finalizacion >= fecha_inicio
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'ck_progreso_porcentaje_rango'
      and conrelid = 'public.progreso_lecciones'::regclass
  ) then
    alter table public.progreso_lecciones
      add constraint ck_progreso_porcentaje_rango check (
        porcentaje_avance >= 0 and porcentaje_avance <= 100
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'ck_progreso_completado_consistente'
      and conrelid = 'public.progreso_lecciones'::regclass
  ) then
    alter table public.progreso_lecciones
      add constraint ck_progreso_completado_consistente check (
        (completada = true and porcentaje_avance = 100 and fecha_completado is not null)
        or
        (completada = false and porcentaje_avance < 100 and fecha_completado is null)
      );
  end if;
end;
$$;

create index if not exists idx_inscripciones_usuario_estado_activas
  on public.inscripciones (fk_usuario, fk_estado_inscripcion, fecha_inscripcion desc)
  where activo = true;

create index if not exists idx_progreso_leccion
  on public.progreso_lecciones (fk_leccion);

create index if not exists idx_progreso_inscripcion_completada
  on public.progreso_lecciones (fk_inscripcion, completada);

drop trigger if exists trg_touch_inscripciones on public.inscripciones;
create trigger trg_touch_inscripciones
before update on public.inscripciones
for each row execute function private.academix_touch_updated_at();

drop trigger if exists trg_touch_progreso_lecciones on public.progreso_lecciones;
create trigger trg_touch_progreso_lecciones
before update on public.progreso_lecciones
for each row execute function private.academix_touch_updated_at();

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

  select c.cuota_recuperacion, c.requiere_aprobacion
    into course_price, requires_approval
    from public.cursos c
    join public.estados_curso ec on ec.id_estado_curso = c.fk_estado_curso
   where c.id_curso = p_course_id
     and c.activo = true
     and ec.activo = true
     and lower(ec.nombre) = 'publicado';

  if not found then
    raise exception using errcode = 'P0001', message = 'COURSE_NOT_AVAILABLE';
  end if;

  if course_price > 0 then
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
    case when desired_state_name = 'Activa' then now() else null end,
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
        'amountPaid', 0
      )
    );
  end if;

  return jsonb_build_object(
    'enrollmentId', enrollment_id,
    'status', lower(desired_state_name)
  );
end;
$$;

create or replace function public.academix_set_lesson_progress(
  p_user_id uuid,
  p_lesson_id uuid,
  p_completed boolean
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  enrollment_id uuid;
  course_id uuid;
  enrollment_state text;
  active_state_id smallint;
  completed_state_id smallint;
  total_lessons integer;
  completed_lessons integer;
  resulting_status text;
begin
  if p_user_id is null or p_lesson_id is null or p_completed is null then
    raise exception using errcode = 'P0001', message = 'INVALID_PROGRESS_INPUT';
  end if;

  select i.id_inscripcion, i.fk_curso, ei.nombre
    into enrollment_id, course_id, enrollment_state
    from public.inscripciones i
    join public.estados_inscripcion ei
      on ei.id_estado_inscripcion = i.fk_estado_inscripcion
    join public.modulos m
      on m.fk_curso = i.fk_curso and m.activo = true
    join public.lecciones l
      on l.fk_modulo = m.id_modulo and l.activo = true
   where i.fk_usuario = p_user_id
     and i.activo = true
     and l.id_leccion = p_lesson_id
   for update of i;

  if not found then
    raise exception using errcode = 'P0001', message = 'ENROLLMENT_REQUIRED';
  end if;

  if lower(enrollment_state) not in ('activa', 'finalizada') then
    raise exception using errcode = 'P0001', message = 'ENROLLMENT_NOT_ACTIVE';
  end if;

  select id_estado_inscripcion into active_state_id
    from public.estados_inscripcion
   where lower(nombre) = 'activa' and activo = true
   limit 1;

  select id_estado_inscripcion into completed_state_id
    from public.estados_inscripcion
   where lower(nombre) = 'finalizada' and activo = true
   limit 1;

  if active_state_id is null or completed_state_id is null then
    raise exception using errcode = 'P0001', message = 'ENROLLMENT_STATE_NOT_CONFIGURED';
  end if;

  insert into public.progreso_lecciones (
    fk_inscripcion,
    fk_leccion,
    completada,
    porcentaje_avance,
    fecha_inicio,
    fecha_completado,
    ultima_visualizacion,
    fecha_actualizacion
  ) values (
    enrollment_id,
    p_lesson_id,
    p_completed,
    case when p_completed then 100 else 0 end,
    now(),
    case when p_completed then now() else null end,
    now(),
    now()
  )
  on conflict on constraint uq_progreso_leccion
  do update set
    completada = excluded.completada,
    porcentaje_avance = excluded.porcentaje_avance,
    fecha_inicio = coalesce(public.progreso_lecciones.fecha_inicio, now()),
    fecha_completado = excluded.fecha_completado,
    ultima_visualizacion = now(),
    fecha_actualizacion = now();

  select count(*)::integer
    into total_lessons
    from public.modulos m
    join public.lecciones l on l.fk_modulo = m.id_modulo
   where m.fk_curso = course_id
     and m.activo = true
     and l.activo = true;

  if total_lessons = 0 then
    raise exception using errcode = 'P0001', message = 'COURSE_HAS_NO_LESSONS';
  end if;

  select count(*)::integer
    into completed_lessons
    from public.progreso_lecciones pl
    join public.lecciones l on l.id_leccion = pl.fk_leccion and l.activo = true
    join public.modulos m on m.id_modulo = l.fk_modulo and m.activo = true
   where pl.fk_inscripcion = enrollment_id
     and m.fk_curso = course_id
     and pl.completada = true;

  if completed_lessons = total_lessons then
    resulting_status := 'completed';
    update public.inscripciones
       set fk_estado_inscripcion = completed_state_id,
           fecha_inicio = coalesce(fecha_inicio, now()),
           fecha_finalizacion = coalesce(fecha_finalizacion, now()),
           fecha_actualizacion = now()
     where id_inscripcion = enrollment_id;
  else
    resulting_status := 'in_progress';
    update public.inscripciones
       set fk_estado_inscripcion = active_state_id,
           fecha_inicio = coalesce(fecha_inicio, now()),
           fecha_finalizacion = null,
           fecha_actualizacion = now()
     where id_inscripcion = enrollment_id;
  end if;

  return jsonb_build_object(
    'lessonId', p_lesson_id,
    'completed', p_completed,
    'progressPercentage', round((completed_lessons::numeric / total_lessons::numeric) * 100, 2),
    'completedLessons', completed_lessons,
    'totalLessons', total_lessons,
    'status', resulting_status
  );
end;
$$;

revoke all on function public.academix_enroll_user(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.academix_set_lesson_progress(uuid, uuid, boolean)
  from public, anon, authenticated;

grant execute on function public.academix_enroll_user(uuid, uuid)
  to service_role;
grant execute on function public.academix_set_lesson_progress(uuid, uuid, boolean)
  to service_role;
