-- Durable deletion queue. This migration DOES NOT delete existing accounts or
-- activate a scheduler. Validate on an isolated database before production.
begin;
-- A deleted organizational space may outlive its creator to preserve shared
-- course/membership history, without retaining the creator's account row.
alter table public.organizaciones alter column creada_por drop not null;
alter table public.organizaciones add constraint ck_deleted_organization_owner
  check (creada_por is not null or (not activa and fecha_eliminacion is not null));
create table if not exists public.solicitudes_eliminacion_cuenta (
  id uuid primary key default gen_random_uuid(),
  -- Intentionally independent of usuarios/auth.users: retries outlive both rows.
  user_id uuid,
  requested_at timestamptz not null default clock_timestamp(),
  delete_after timestamptz not null,
  status text not null default 'pending' check(status in ('pending','processing','cancelled','completed')),
  attempts integer not null default 0,
  next_attempt_at timestamptz,
  lease_token uuid,
  lease_until timestamptz,
  last_error_code text,
  last_error_relation text,
  completed_at timestamptz,
  private_files jsonb not null default '[]'::jsonb,
  prepared boolean not null default false,
  constraint ck_account_deletion_identity check(status='completed' or user_id is not null),
  constraint ck_account_deletion_window check(delete_after=requested_at+interval '240 hours')
);
create unique index if not exists uq_account_deletion_open on public.solicitudes_eliminacion_cuenta(user_id) where status in ('pending','processing');
create index if not exists idx_account_deletion_due on public.solicitudes_eliminacion_cuenta(delete_after,next_attempt_at) where status in ('pending','processing');
alter table public.solicitudes_eliminacion_cuenta enable row level security;
revoke all on public.solicitudes_eliminacion_cuenta from public,anon,authenticated,service_role;

create or replace function private.academix_deletion_json(r public.solicitudes_eliminacion_cuenta)
returns jsonb language sql immutable set search_path='' as $$
 select jsonb_build_object('id',r.id,'userId',r.user_id,'requestedAt',r.requested_at,'deleteAfter',r.delete_after,'status',r.status);
$$;

create or replace function private.academix_assert_deletion_ownership(p_user_id uuid)
returns void language plpgsql set search_path='' as $$
begin
  -- Shared lock contract for administrator ownership mutations.
  perform pg_advisory_xact_lock(hashtext('academix-account-administration'));
  if exists(select 1 from public.usuarios_roles ur join public.roles r on r.id_rol=ur.fk_rol
    where ur.fk_usuario=p_user_id and ur.activo and lower(r.nombre)='administrador')
    and not exists(select 1 from public.usuarios_roles ur join public.roles r on r.id_rol=ur.fk_rol
      join public.usuarios u on u.id_usuario=ur.fk_usuario
      where ur.fk_usuario<>p_user_id and ur.activo and u.activo and lower(r.nombre)='administrador') then
    raise exception using message='LAST_ADMINISTRATOR';
  end if;
  if exists(select 1 from public.organizaciones where creada_por=p_user_id and (activa or fecha_eliminacion is null))
    or exists(select 1 from public.miembros_organizacion m join public.organizaciones o on o.id_organizacion=m.fk_organizacion
      where m.fk_usuario=p_user_id and m.activo and m.rol='Administrador' and (o.activa or o.fecha_eliminacion is null)
      and not exists(select 1 from public.miembros_organizacion other_m join public.usuarios u on u.id_usuario=other_m.fk_usuario
        where other_m.fk_organizacion=m.fk_organizacion and other_m.fk_usuario<>p_user_id and other_m.activo and other_m.rol='Administrador'
          and u.activo))
    or exists(select 1 from public.cursos_instructores where fk_usuario=p_user_id and activo) then
    raise exception using message='SHARED_RESOURCE_OWNERSHIP';
  end if;
end; $$;

create or replace function public.academix_get_account_deletion(p_user_id uuid)
returns jsonb language sql security definer set search_path='' as $$
 select private.academix_deletion_json(r) from public.solicitudes_eliminacion_cuenta r
 where user_id=p_user_id and status in ('pending','processing') order by requested_at desc limit 1;
$$;
create or replace function public.academix_request_account_deletion(p_user_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.solicitudes_eliminacion_cuenta; requested timestamptz;
begin
  perform 1 from public.usuarios where id_usuario=p_user_id and activo for update;
  if not found then raise exception using message='USER_NOT_FOUND'; end if;
  select * into r from public.solicitudes_eliminacion_cuenta where user_id=p_user_id and status in ('pending','processing') for update;
  if found then return private.academix_deletion_json(r); end if;
  perform private.academix_assert_deletion_ownership(p_user_id);
  -- Validate the current reference graph without mutating data. The worker
  -- checks it again because ownership can change during the grace period.
  perform private.academix_delete_personal_row('public.usuarios'::regclass,'id_usuario',p_user_id::text,0,true);
  requested:=clock_timestamp();
  insert into public.solicitudes_eliminacion_cuenta(user_id,requested_at,delete_after)
  values(p_user_id,requested,requested+interval '240 hours') returning * into r;
  return private.academix_deletion_json(r);
end; $$;
create or replace function public.academix_cancel_account_deletion(p_user_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare r public.solicitudes_eliminacion_cuenta;
begin
  perform 1 from public.usuarios where id_usuario=p_user_id for update;
  select * into r from public.solicitudes_eliminacion_cuenta where user_id=p_user_id and status in ('pending','processing') for update;
  if not found then return; end if;
  if r.status<>'pending' or clock_timestamp()>=r.delete_after then raise exception using message='DELETION_DEADLINE_PASSED'; end if;
  update public.solicitudes_eliminacion_cuenta set status='cancelled' where id=r.id;
end; $$;

create or replace function public.academix_claim_account_deletions()
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.solicitudes_eliminacion_cuenta; claimed jsonb:='[]'::jsonb;
begin
  -- Bounded sweep; no in-process timers. Lease recovery survives worker crashes.
  for r in select * from public.solicitudes_eliminacion_cuenta
    where delete_after<=clock_timestamp() and (next_attempt_at is null or next_attempt_at<=clock_timestamp())
      and (status='pending' or (status='processing' and lease_until<=clock_timestamp()))
    order by delete_after for update skip locked limit 10 loop
    if r.status='pending' then
      begin
        perform private.academix_assert_deletion_ownership(r.user_id);
      exception when others then
        update public.solicitudes_eliminacion_cuenta set next_attempt_at=clock_timestamp()+interval '1 hour',
          last_error_code=case when sqlerrm in ('LAST_ADMINISTRATOR','SHARED_RESOURCE_OWNERSHIP') then sqlerrm else 'OWNERSHIP_CHECK_FAILED' end
          where id=r.id;
        continue;
      end;
    end if;
    update public.solicitudes_eliminacion_cuenta set status='processing',attempts=attempts+1,
      lease_token=gen_random_uuid(),lease_until=clock_timestamp()+interval '15 minutes' where id=r.id returning * into r;
    update public.usuarios set activo=false where id_usuario=r.user_id;
    claimed:=claimed||jsonb_build_array(private.academix_deletion_json(r)||jsonb_build_object('leaseToken',r.lease_token));
  end loop;
  return claimed;
end; $$;

-- Walk the authoritative database FK catalog, not a guessed static cascade.
-- Only explicit personal ownership edges may delete rows. Unknown populated
-- relations or shared actor references abort the entire transaction safely.
create or replace function private.academix_delete_personal_row(p_table oid,p_key text,p_value text,p_depth integer default 0,p_preview boolean default false)
returns void language plpgsql set search_path='' as $$
declare fk record; child record; pk text; has_rows boolean; supported boolean; table_name text; key_type text;
begin
  if p_depth>12 then raise exception using message='UNSUPPORTED_DELETION_RELATION'; end if;
  select relname into table_name from pg_class where oid=p_table;
  select format_type(atttypid,atttypmod) into key_type from pg_attribute where attrelid=p_table and attname=p_key and not attisdropped;
  if key_type is null then raise exception using message='UNSUPPORTED_DELETION_RELATION'; end if;
  for fk in select c.conrelid,a.attname as column_name,a.attnotnull as required_column,
      parent_a.attname as parent_column,pc.relname as child_name,pn.nspname as child_schema,c.conname,
      cardinality(c.conkey) as key_count
    from pg_constraint c join pg_class pc on pc.oid=c.conrelid join pg_namespace pn on pn.oid=pc.relnamespace
    join pg_attribute a on a.attrelid=c.conrelid and a.attnum=c.conkey[1]
    join pg_attribute parent_a on parent_a.attrelid=c.confrelid and parent_a.attnum=c.confkey[1]
    where c.contype='f' and c.confrelid=p_table loop
    execute format('select exists(select 1 from %s child join %s parent on child.%I=parent.%I where parent.%I=$1::%s)',
      fk.conrelid::regclass,p_table::regclass,fk.column_name,fk.parent_column,p_key,key_type) into has_rows using p_value;
    if not has_rows then continue; end if;
    supported:=fk.child_schema='public' and fk.key_count=1 and fk.parent_column=p_key and (
      (table_name='usuarios' and fk.column_name='fk_usuario' and fk.child_name=any(array[
        'usuarios_roles','perfiles_instructores','inscripciones','certificados','notificaciones','sesiones_usuario',
        'solicitudes_verificacion_utt','compras_simuladas','suscripciones','transacciones_planes','auditoria_sistema','resultados_evaluacion','miembros_organizacion','cursos_instructores']))
      or (table_name='inscripciones' and fk.column_name='fk_inscripcion' and fk.child_name=any(array['progreso_lecciones','resultados_evaluacion','resenas_cursos','certificados'])));
    if not supported then
      if table_name='usuarios' and fk.child_schema='public' and fk.child_name='organizaciones'
        and fk.column_name='creada_por' and fk.key_count=1 and fk.parent_column=p_key
        and not exists(select 1 from public.organizaciones where creada_por=p_value::uuid and (activa or fecha_eliminacion is null)) then
        continue;
      end if;
      if table_name='usuarios' and fk.child_schema='public' and fk.key_count=1 and fk.parent_column=p_key and not fk.required_column
        and (fk.child_name||'.'||fk.column_name)=any(array['usuarios_roles.asignado_por','miembros_organizacion.agregado_por',
          'solicitudes_verificacion_utt.revisado_por','resenas_cursos.moderada_por','moderaciones_curso.restaurada_por']) then
        -- Detach an actor reference; never delete another person's membership,
        -- role assignment, application or review merely because this user acted.
        if not p_preview then
          execute format('update %s set %I=null where %I=$1::%s',fk.conrelid::regclass,fk.column_name,fk.column_name,key_type) using p_value;
        end if;
        continue;
      end if;
      -- Keep diagnostic codes free of user data; relation is available to the operator.
      raise exception using message='UNSUPPORTED_DELETION_RELATION',detail=fk.child_schema||'.'||fk.child_name||'.'||fk.column_name;
    end if;
    select a.attname into pk from pg_constraint c join pg_attribute a on a.attrelid=c.conrelid and a.attnum=c.conkey[1]
      where c.conrelid=fk.conrelid and c.contype='p' and cardinality(c.conkey)=1;
    if pk is null then raise exception using message='UNSUPPORTED_DELETION_RELATION',detail=fk.child_name; end if;
    for child in execute format('select %I::text as id from %s where %I=$1::%s',pk,fk.conrelid::regclass,fk.column_name,key_type) using p_value loop
      perform private.academix_delete_personal_row(fk.conrelid,pk,child.id,p_depth+1,p_preview);
    end loop;
  end loop;
  if not p_preview then execute format('delete from %s where %I=$1::%s',p_table::regclass,p_key,key_type) using p_value; end if;
end; $$;

create or replace function public.academix_prepare_account_deletion(p_request_id uuid,p_lease uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.solicitudes_eliminacion_cuenta; obj record; manifest jsonb:='[]'::jsonb; has_reference boolean;
begin
  select * into r from public.solicitudes_eliminacion_cuenta where id=p_request_id and status='processing'
    and lease_token=p_lease and lease_until>clock_timestamp() for update;
  if not found then raise exception using message='LEASE_LOST'; end if;
  if r.prepared then return r.private_files; end if;
  perform 1 from public.usuarios where id_usuario=r.user_id for update;
  perform private.academix_assert_deletion_ownership(r.user_id);
  update public.organizaciones set creada_por=null
    where creada_por=r.user_id and not activa and fecha_eliminacion is not null;
  if to_regclass('storage.objects') is not null then
    for obj in execute 'select o.bucket_id,o.name,b.public from storage.objects o join storage.buckets b on b.id=o.bucket_id where coalesce(to_jsonb(o)->>''owner_id'',to_jsonb(o)->>''owner'')=$1' using r.user_id::text loop
      -- Current app owns only shared courses. Future user-private objects must
      -- have explicit per-user paths, a private bucket, and no shared metadata.
      if obj.public or obj.bucket_id='academix-course-content' or obj.name not like 'users/'||r.user_id::text||'/%' then
        raise exception using message='SHARED_RESOURCE_OWNERSHIP';
      end if;
      if to_regclass('public.archivos') is not null then
        execute 'select exists(select 1 from public.archivos where ruta_storage=$1)' into has_reference using obj.name;
        if has_reference then raise exception using message='SHARED_RESOURCE_OWNERSHIP'; end if;
      end if;
      manifest:=manifest||jsonb_build_array(jsonb_build_object('bucket',obj.bucket_id,'path',obj.name));
    end loop;
  end if;
  -- Audit actors/reviewer references deliberately fail closed until transferred.
  -- A transaction rollback restores every personal row if any FK is unsupported.
  perform private.academix_delete_personal_row('public.usuarios'::regclass,'id_usuario',r.user_id::text);
  update public.solicitudes_eliminacion_cuenta set prepared=true,private_files=manifest,
    lease_until=clock_timestamp()+interval '15 minutes' where id=r.id;
  return manifest;
end; $$;

create or replace function public.academix_finish_account_deletion(p_request_id uuid,p_lease uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
  update public.solicitudes_eliminacion_cuenta set status='completed',completed_at=clock_timestamp(),user_id=null,
    lease_token=null,lease_until=null,last_error_code=null,last_error_relation=null,private_files='[]'::jsonb
    where id=p_request_id and status='processing' and prepared and lease_token=p_lease and lease_until>clock_timestamp();
  if not found then raise exception using message='LEASE_LOST'; end if;
end; $$;
create or replace function public.academix_retry_account_deletion(p_request_id uuid,p_lease uuid,p_code text,p_relation text default null)
returns void language plpgsql security definer set search_path='' as $$
begin
  update public.solicitudes_eliminacion_cuenta set lease_until=clock_timestamp(),
    next_attempt_at=clock_timestamp()+make_interval(secs=>least(86400,power(2,least(attempts,12))::integer*30)),
    last_error_code=left(regexp_replace(p_code,'[^A-Z_]','','g'),80),
    last_error_relation=case when p_relation ~ '^[a-zA-Z_][a-zA-Z0-9_.]*$' then left(p_relation,240) else null end
    where id=p_request_id and status='processing' and lease_token=p_lease;
end; $$;

-- SECURITY DEFINER functions own the narrowly scoped deletion privilege. No
-- broad DELETE grant is added to service_role or public data clients.
do $$ declare f record; begin
 for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where (n.nspname='public' and p.proname in ('academix_get_account_deletion','academix_request_account_deletion','academix_cancel_account_deletion',
     'academix_claim_account_deletions','academix_prepare_account_deletion','academix_finish_account_deletion','academix_retry_account_deletion'))
     or (n.nspname='private' and p.proname in ('academix_deletion_json','academix_assert_deletion_ownership','academix_delete_personal_row')) loop
   execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);
   if f.signature::text like 'academix_%' or f.signature::text like 'public.academix_%' then
     execute format('grant execute on function %s to service_role',f.signature);
   end if;
 end loop;
end; $$;
commit;
