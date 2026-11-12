-- Compra simulada, sin cobros ni datos financieros. Requiere el esquema base
-- y todas las migraciones previas (incluida organizations_foundation).
-- La API obtiene p_user_id exclusivamente del JWT verificado. Solo service_role
-- puede ejecutar la función; nunca se confía en precios enviados por el cliente.
begin;

create table if not exists public.compras_simuladas (
  id_compra uuid primary key default gen_random_uuid(),
  fk_usuario uuid not null references public.usuarios(id_usuario),
  clave_idempotencia uuid not null,
  cursos uuid[] not null,
  resultado jsonb not null,
  fecha_creacion timestamp with time zone not null default now(),
  constraint uq_compra_simulada_usuario_clave unique (fk_usuario, clave_idempotencia)
);
alter table public.compras_simuladas enable row level security;
revoke all on table public.compras_simuladas from public, anon, authenticated;
grant select, insert on table public.compras_simuladas to service_role;

create or replace function public.academix_simulated_checkout(
  p_user_id uuid,
  p_course_ids uuid[],
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  sorted_courses uuid[];
  previous public.compras_simuladas%rowtype;
  course_record record;
  enrollment_record record;
  course_id uuid;
  enrollment_id uuid;
  active_state_id smallint;
  receipt_id uuid := gen_random_uuid();
  receipt jsonb;
  receipt_items jsonb := '[]'::jsonb;
  item_amount numeric;
  receipt_total numeric := 0;
  owned boolean;
begin
  if p_user_id is null or p_idempotency_key is null or p_course_ids is null
    or cardinality(p_course_ids) < 1 or cardinality(p_course_ids) > 50
    or array_position(p_course_ids, null) is not null then
    raise exception using errcode = 'P0001', message = 'INVALID_CHECKOUT_INPUT';
  end if;
  select array_agg(id order by id) into sorted_courses
    from (select distinct unnest(p_course_ids) as id) ids;
  if cardinality(sorted_courses) <> cardinality(p_course_ids) then
    raise exception using errcode = 'P0001', message = 'INVALID_CHECKOUT_INPUT';
  end if;

  -- Serialize concurrent confirmations for this account, including different
  -- request keys. A unique enrollment constraint is the final duplicate guard.
  perform 1 from public.usuarios where id_usuario = p_user_id and activo = true for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'USER_NOT_FOUND';
  end if;
  select * into previous from public.compras_simuladas
    where fk_usuario = p_user_id and clave_idempotencia = p_idempotency_key;
  if found then
    if previous.cursos <> sorted_courses then
      raise exception using errcode = 'P0001', message = 'IDEMPOTENCY_CONFLICT';
    end if;
    return previous.resultado;
  end if;

  select id_estado_inscripcion into active_state_id from public.estados_inscripcion
    where lower(nombre) = 'activa' and activo = true limit 1;
  if active_state_id is null then
    raise exception using errcode = 'P0001', message = 'ENROLLMENT_STATE_NOT_CONFIGURED';
  end if;

  foreach course_id in array sorted_courses loop
    select c.cuota_recuperacion, c.requiere_aprobacion, c.fk_organizacion
      into course_record from public.cursos c
      join public.estados_curso ec on ec.id_estado_curso = c.fk_estado_curso
      where c.id_curso = course_id and c.activo = true and ec.activo = true
        and lower(ec.nombre) = 'publicado' for share of c, ec;
    if not found then
      raise exception using errcode = 'P0001', message = 'COURSE_NOT_AVAILABLE';
    end if;
    if course_record.fk_organizacion is not null then
      perform 1 from public.miembros_organizacion mo
        where mo.fk_usuario = p_user_id and mo.fk_organizacion = course_record.fk_organizacion
          and mo.activo = true for share;
      if not found then
        raise exception using errcode = 'P0001', message = 'ORGANIZATION_MEMBERSHIP_REQUIRED';
      end if;
    end if;

    -- Existing active or completed courses remain untouched, including progress,
    -- completion date and certificates. Pending/disabled access is never elevated.
    select i.id_inscripcion, i.activo, ei.nombre into enrollment_record
      from public.inscripciones i join public.estados_inscripcion ei
        on ei.id_estado_inscripcion = i.fk_estado_inscripcion
      where i.fk_usuario = p_user_id and i.fk_curso = course_id for update of i;
    owned := found;
    if owned then
      if not enrollment_record.activo or lower(enrollment_record.nombre) not in ('activa', 'finalizada') then
        raise exception using errcode = 'P0001', message = 'ENROLLMENT_NOT_ACTIVE';
      end if;
      enrollment_id := enrollment_record.id_inscripcion;
      item_amount := 0;
    else
      if course_record.requiere_aprobacion then
        raise exception using errcode = 'P0001', message = 'COURSE_REQUIRES_APPROVAL';
      end if;
      item_amount := case when course_record.fk_organizacion is not null then 0 else course_record.cuota_recuperacion end;
      if item_amount is null or item_amount < 0 then
        raise exception using errcode = 'P0001', message = 'COURSE_NOT_AVAILABLE';
      end if;
      -- A free enrollment from a simultaneous request can win the unique key.
      -- Do not overwrite it or reset progress; resolve it under the row lock.
      insert into public.inscripciones (fk_usuario, fk_curso, fk_estado_inscripcion,
        monto_pagado, fecha_inscripcion, fecha_inicio, activo, fecha_actualizacion)
      values (p_user_id, course_id, active_state_id, 0, now(), now(), true, now())
      on conflict on constraint uq_usuario_curso do nothing
      returning id_inscripcion into enrollment_id;
      if enrollment_id is null then
        select i.id_inscripcion, i.activo, ei.nombre into enrollment_record
          from public.inscripciones i join public.estados_inscripcion ei
            on ei.id_estado_inscripcion = i.fk_estado_inscripcion
          where i.fk_usuario = p_user_id and i.fk_curso = course_id for update of i;
        if not found or not enrollment_record.activo or lower(enrollment_record.nombre) not in ('activa', 'finalizada') then
          raise exception using errcode = 'P0001', message = 'ENROLLMENT_NOT_ACTIVE';
        end if;
        enrollment_id := enrollment_record.id_inscripcion;
        owned := true;
        item_amount := 0;
      end if;
    end if;
    receipt_total := receipt_total + item_amount;
    receipt_items := receipt_items || jsonb_build_array(jsonb_build_object(
      'courseId', course_id, 'enrollmentId', enrollment_id, 'amount', item_amount, 'alreadyOwned', owned));
  end loop;
  receipt := jsonb_build_object('id', receipt_id, 'mode', 'simulated', 'currency', 'MXN', 'total', receipt_total, 'items', receipt_items);
  insert into public.compras_simuladas (id_compra, fk_usuario, clave_idempotencia, cursos, resultado)
    values (receipt_id, p_user_id, p_idempotency_key, sorted_courses, receipt);
  return receipt;
end;
$$;
revoke all on function public.academix_simulated_checkout(uuid, uuid[], uuid) from public, anon, authenticated;
grant execute on function public.academix_simulated_checkout(uuid, uuid[], uuid) to service_role;
comment on table public.compras_simuladas is 'Confirmaciones simuladas sin movimiento financiero. monto_pagado de las inscripciones permanece en cero.';
commit;
