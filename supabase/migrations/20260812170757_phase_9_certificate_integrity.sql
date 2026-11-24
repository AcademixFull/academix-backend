-- Fase 9: certificados inmutables, firmados y verificables.
-- Conserva certificados y relaciones existentes; no elimina datos.

alter table public.certificados
  alter column fecha_emision type timestamp with time zone
    using fecha_emision at time zone 'UTC',
  add column if not exists nombre_destinatario varchar(300),
  add column if not exists titulo_curso varchar(300),
  add column if not exists duracion_horas numeric(7, 2),
  add column if not exists emisor varchar(100),
  add column if not exists firma_sistema varchar(64),
  add column if not exists version_plantilla smallint;

create or replace function private.academix_certificate_signature(
  p_certificate_id uuid,
  p_credential_code text,
  p_user_id uuid,
  p_course_id uuid,
  p_issued_at timestamp with time zone,
  p_recipient_name text,
  p_course_title text,
  p_duration_hours numeric,
  p_issuer text,
  p_template_version smallint
)
returns text
language sql
immutable
security invoker
set search_path = ''
as $$
  select upper(pg_catalog.encode(extensions.digest(
    concat_ws('|',
      p_certificate_id::text,
      upper(trim(p_credential_code)),
      p_user_id::text,
      p_course_id::text,
      to_char(
        date_trunc('milliseconds', p_issued_at) at time zone 'UTC',
        'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
      ),
      trim(p_recipient_name),
      trim(p_course_title),
      p_duration_hours::numeric(7, 2)::text,
      trim(p_issuer),
      p_template_version::text
    )::bytea,
    'sha256'
  ), 'hex'));
$$;

revoke all on function private.academix_certificate_signature(
  uuid, text, uuid, uuid, timestamp with time zone,
  text, text, numeric, text, smallint
) from public, anon, authenticated;
grant usage on schema private to service_role;
grant execute on function private.academix_certificate_signature(
  uuid, text, uuid, uuid, timestamp with time zone,
  text, text, numeric, text, smallint
) to service_role;

update public.certificados cert
   set fecha_emision = date_trunc('milliseconds', cert.fecha_emision),
       nombre_destinatario = concat_ws(' ',
         nullif(trim(u.nombres), ''),
         nullif(trim(u.apellido_paterno), ''),
         nullif(trim(u.apellido_materno), '')
       ),
       titulo_curso = c.titulo,
       duracion_horas = coalesce(c.duracion_estimada_horas, 0),
       emisor = 'Academix',
       version_plantilla = 1
  from public.usuarios u, public.cursos c
 where u.id_usuario = cert.fk_usuario
   and c.id_curso = cert.fk_curso
   and (
     cert.nombre_destinatario is null
     or cert.titulo_curso is null
     or cert.duracion_horas is null
     or cert.emisor is null
     or cert.version_plantilla is null
   );

update public.certificados cert
   set firma_sistema = private.academix_certificate_signature(
     cert.id_certificado,
     cert.codigo_certificado,
     cert.fk_usuario,
     cert.fk_curso,
     cert.fecha_emision,
     cert.nombre_destinatario,
     cert.titulo_curso,
     cert.duracion_horas,
     cert.emisor,
     cert.version_plantilla
   )
 where cert.firma_sistema is null;

alter table public.certificados
  alter column nombre_destinatario set not null,
  alter column titulo_curso set not null,
  alter column duracion_horas set not null,
  alter column emisor set default 'Academix',
  alter column emisor set not null,
  alter column firma_sistema set not null,
  alter column version_plantilla set default 1,
  alter column version_plantilla set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'ck_certificado_snapshot_valido'
      and conrelid = 'public.certificados'::regclass
  ) then
    alter table public.certificados
      add constraint ck_certificado_snapshot_valido check (
        char_length(trim(nombre_destinatario)) between 1 and 300
        and char_length(trim(titulo_curso)) between 1 and 300
        and duracion_horas >= 0
        and char_length(trim(emisor)) between 1 and 100
        and version_plantilla > 0
      ) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'ck_certificado_firma_sistema'
      and conrelid = 'public.certificados'::regclass
  ) then
    alter table public.certificados
      add constraint ck_certificado_firma_sistema check (
        firma_sistema ~ '^[A-F0-9]{64}$'
      ) not valid;
  end if;
end;
$$;

alter table public.certificados
  validate constraint ck_certificado_snapshot_valido;
alter table public.certificados
  validate constraint ck_certificado_firma_sistema;

create or replace function private.academix_protect_certificate_identity()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if old.id_certificado is distinct from new.id_certificado
     or old.fk_usuario is distinct from new.fk_usuario
     or old.fk_curso is distinct from new.fk_curso
     or old.fk_tipo_certificado is distinct from new.fk_tipo_certificado
     or old.codigo_certificado is distinct from new.codigo_certificado
     or old.fecha_emision is distinct from new.fecha_emision
     or old.nombre_destinatario is distinct from new.nombre_destinatario
     or old.titulo_curso is distinct from new.titulo_curso
     or old.duracion_horas is distinct from new.duracion_horas
     or old.emisor is distinct from new.emisor
     or old.firma_sistema is distinct from new.firma_sistema
     or old.version_plantilla is distinct from new.version_plantilla then
    raise exception using errcode = 'P0001', message = 'CERTIFICATE_IDENTITY_IMMUTABLE';
  end if;
  return new;
end;
$$;

revoke all on function private.academix_protect_certificate_identity()
  from public, anon, authenticated, service_role;

drop trigger if exists trg_protect_certificate_identity on public.certificados;
create trigger trg_protect_certificate_identity
before update on public.certificados
for each row execute function private.academix_protect_certificate_identity();

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
  certificate_signature text;
  action_id integer;
  course_allows_certificate boolean;
  course_title text;
  duration_hours numeric(7, 2);
  recipient_name text;
  issued_at timestamp with time zone;
  issuer_name constant text := 'Academix';
  template_version constant smallint := 1;
begin
  select ei.nombre into enrollment_status
    from public.estados_inscripcion ei
   where ei.id_estado_inscripcion = new.fk_estado_inscripcion;

  select c.permite_certificado, c.titulo,
         coalesce(c.duracion_estimada_horas, 0)::numeric(7, 2)
    into course_allows_certificate, course_title, duration_hours
    from public.cursos c
   where c.id_curso = new.fk_curso;

  select concat_ws(' ',
           nullif(trim(u.nombres), ''),
           nullif(trim(u.apellido_paterno), ''),
           nullif(trim(u.apellido_materno), '')
         )
    into recipient_name
    from public.usuarios u
   where u.id_usuario = new.fk_usuario;

  if new.activo = true
     and lower(coalesce(enrollment_status, '')) = 'finalizada'
     and course_allows_certificate = true then
    if nullif(trim(coalesce(recipient_name, '')), '') is null
       or nullif(trim(coalesce(course_title, '')), '') is null then
      raise exception using errcode = 'P0001', message = 'CERTIFICATE_SNAPSHOT_NOT_AVAILABLE';
    end if;

    select tc.id_tipo_certificado into certificate_type_id
      from public.tipos_certificado tc
     where lower(tc.nombre) = lower('Finalización') and tc.activo = true
     limit 1;

    if certificate_type_id is null then
      raise exception using errcode = 'P0001', message = 'CERTIFICATE_TYPE_NOT_CONFIGURED';
    end if;

    issued_at := date_trunc(
      'milliseconds',
      coalesce(new.fecha_finalizacion::timestamp with time zone, now())
    );
    certificate_id := gen_random_uuid();
    certificate_code := 'ACX-' || to_char(issued_at, 'YYYY') || '-' ||
      upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
    certificate_signature := private.academix_certificate_signature(
      certificate_id,
      certificate_code,
      new.fk_usuario,
      new.fk_curso,
      issued_at,
      recipient_name,
      course_title,
      duration_hours,
      issuer_name,
      template_version
    );

    insert into public.certificados (
      id_certificado, fk_usuario, fk_curso, fk_tipo_certificado,
      codigo_certificado, fecha_emision, activo, fecha_actualizacion,
      fecha_revocacion, nombre_destinatario, titulo_curso, duracion_horas,
      emisor, firma_sistema, version_plantilla
    ) values (
      certificate_id, new.fk_usuario, new.fk_curso, certificate_type_id,
      certificate_code, issued_at, true, now(), null,
      recipient_name, course_title, duration_hours,
      issuer_name, certificate_signature, template_version
    )
    on conflict on constraint uq_certificado_usuario_curso
    do update set
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
          'type', 'Finalización',
          'issuer', issuer_name,
          'templateVersion', template_version
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

create or replace function private.academix_sync_course_certificate_setting()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if old.permite_certificado is not distinct from new.permite_certificado then
    return new;
  end if;

  if new.permite_certificado = true then
    update public.inscripciones i
       set fecha_finalizacion = i.fecha_finalizacion
      from public.estados_inscripcion ei
     where i.fk_curso = new.id_curso
       and i.fk_estado_inscripcion = ei.id_estado_inscripcion
       and i.activo = true
       and lower(ei.nombre) = 'finalizada';
  else
    update public.certificados
       set activo = false,
           fecha_revocacion = coalesce(fecha_revocacion, now()),
           fecha_actualizacion = now()
     where fk_curso = new.id_curso
       and activo = true;
  end if;

  return new;
end;
$$;

revoke all on function private.academix_sync_course_certificate_setting()
  from public, anon, authenticated, service_role;

drop trigger if exists trg_sync_course_certificate_setting on public.cursos;
create trigger trg_sync_course_certificate_setting
after update of permite_certificado on public.cursos
for each row execute function private.academix_sync_course_certificate_setting();

create or replace function public.academix_certificate_signature_is_valid(
  p_certificate_id uuid
)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce((
    select cert.firma_sistema = private.academix_certificate_signature(
      cert.id_certificado,
      cert.codigo_certificado,
      cert.fk_usuario,
      cert.fk_curso,
      cert.fecha_emision,
      cert.nombre_destinatario,
      cert.titulo_curso,
      cert.duracion_horas,
      cert.emisor,
      cert.version_plantilla
    )
    from public.certificados cert
    where cert.id_certificado = p_certificate_id
  ), false);
$$;

revoke all on function public.academix_certificate_signature_is_valid(uuid)
  from public, anon, authenticated;
grant execute on function public.academix_certificate_signature_is_valid(uuid)
  to service_role;

revoke all on table public.certificados from public, anon, authenticated;
revoke delete, truncate, references, trigger on table public.certificados
  from service_role;
grant select, insert, update on table public.certificados to service_role;

revoke all on table public.tipos_certificado from public, anon, authenticated;
revoke insert, update, delete, truncate, references, trigger
  on table public.tipos_certificado from service_role;
grant select on table public.tipos_certificado to service_role;
