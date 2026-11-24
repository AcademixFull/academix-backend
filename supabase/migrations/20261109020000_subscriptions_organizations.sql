-- Additive, backend-only subscription commerce and organization lifecycle.
begin;
create table public.planes (
  id_plan text primary key, nombre text not null,
  audiencia text not null check (audiencia in ('person','organization')),
  precio_mxn numeric(12,2), meses integer,
  beneficios jsonb not null default '[]' check (jsonb_typeof(beneficios)='array'), comprable boolean not null default true,
  activo boolean not null default true, orden integer not null default 0,
  check (not comprable or (precio_mxn is not null and precio_mxn > 0 and meses is not null and meses between 1 and 120))
);
insert into public.planes(id_plan,nombre,audiencia,precio_mxn,meses,beneficios,comprable,orden) values
 ('plus-monthly','Academix Plus Mensual','person',19.99,1,'["Cursos incluidos sin compra individual","Progreso y recursos","Certificados cuando correspondan","Acceso durante la vigencia del plan"]',true,1),
 ('plus-annual','Academix Plus Anual','person',199.99,12,'["12 meses de acceso","Cursos incluidos ilimitados","Progreso y certificados","Ahorro frente al plan mensual"]',true,2),
 ('organizations-monthly','Academix Organizaciones','organization',1000,1,'["Panel de organización","Roles de administrador, instructor y estudiante","Cursos institucionales con flujo de aprobación","Los estudiantes activos acceden sin pago adicional a los cursos de su organización"]',true,3),
 ('campus','Academix Campus','organization',null,null,'["Base multiusuario","Gobierno de cursos institucionales","Seguimiento de miembros","Gestión de miembros y cursos institucionales"]',false,4);
create table public.suscripciones (
  id_suscripcion uuid primary key default gen_random_uuid(),
  fk_usuario uuid references public.usuarios(id_usuario),
  fk_organizacion uuid references public.organizaciones(id_organizacion),
  fk_plan text not null references public.planes(id_plan),
  estado text not null default 'active' check (estado in ('active','cancelled')),
  fecha_inicio timestamptz not null, fecha_vencimiento timestamptz not null,
  fecha_actualizacion timestamptz not null default now(),
  check ((fk_usuario is null) <> (fk_organizacion is null)),
  check (fecha_vencimiento > fecha_inicio), unique(fk_usuario), unique(fk_organizacion)
);
create index idx_suscripcion_plan on public.suscripciones(fk_plan);
create table public.transacciones_planes (
  id_transaccion uuid primary key default gen_random_uuid(),
  fk_usuario uuid not null references public.usuarios(id_usuario),
  clave_idempotencia uuid not null, fk_plan text not null references public.planes(id_plan),
  fk_organizacion uuid references public.organizaciones(id_organizacion),
  importe numeric(12,2) not null check (importe > 0),
  resultado jsonb not null, fecha_creacion timestamptz not null default now(),
  unique(fk_usuario,clave_idempotencia)
);
create index idx_transacciones_plan on public.transacciones_planes(fk_plan);
create index idx_transacciones_organizacion on public.transacciones_planes(fk_organizacion);
alter table public.planes enable row level security;
alter table public.suscripciones enable row level security;
alter table public.transacciones_planes enable row level security;
revoke all on public.planes, public.suscripciones, public.transacciones_planes from public,anon,authenticated;
grant select on public.planes to service_role;
grant select,insert,update,delete on public.suscripciones to service_role;
grant select,insert,delete on public.transacciones_planes to service_role;
alter table public.organizaciones add column fecha_eliminacion timestamptz;
alter table public.cursos add column incluido_plus boolean not null default true;
alter table public.inscripciones add column origen_acceso text not null default 'individual'
  check (origen_acceso in ('individual','plus','organization'));
update public.inscripciones i set origen_acceso = 'organization'
  from public.cursos c where c.id_curso = i.fk_curso and c.fk_organizacion is not null and i.monto_pagado = 0;

-- Repair only missing creator memberships. Explicit inactive/revoked memberships stay revoked.
insert into public.miembros_organizacion(fk_organizacion,fk_usuario,rol,activo,agregado_por)
select o.id_organizacion,o.creada_por,'Administrador',true,o.creada_por
from public.organizaciones o join public.usuarios u on u.id_usuario=o.creada_por and u.activo
where o.fecha_eliminacion is null and not exists(select 1 from public.miembros_organizacion m where m.fk_organizacion=o.id_organizacion and m.fk_usuario=o.creada_por)
on conflict on constraint uq_miembro_organizacion do nothing;

create or replace function public.academix_organization_has_subscription(p_organization_id uuid)
returns boolean language sql stable security invoker set search_path='' as $$
 select exists(select 1 from public.suscripciones s join public.organizaciones o on o.id_organizacion=s.fk_organizacion
   join public.planes p on p.id_plan=s.fk_plan and p.audiencia='organization'
   where s.fk_organizacion=p_organization_id and s.estado='active' and s.fecha_inicio<=now() and s.fecha_vencimiento>now()
     and o.activa and o.fecha_eliminacion is null)
$$;
create or replace function public.academix_person_has_subscription(p_user_id uuid)
returns boolean language sql stable security invoker set search_path='' as $$
 select exists(select 1 from public.suscripciones s join public.planes p on p.id_plan=s.fk_plan and p.audiencia='person'
   where s.fk_usuario=p_user_id and s.estado='active' and s.fecha_inicio<=now() and s.fecha_vencimiento>now())
$$;
create or replace function public.academix_purchase_plan(p_user_id uuid,p_plan_id text,p_organization_id uuid,p_idempotency_key uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare p public.planes%rowtype; previous public.transacciones_planes%rowtype;
 s public.suscripciones%rowtype; receipt jsonb; receipt_id uuid:=gen_random_uuid();
begin
 if p_idempotency_key is null then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
 perform 1 from public.usuarios where id_usuario=p_user_id and activo for update;
 if not found then raise exception 'USER_NOT_FOUND'; end if;
 select * into previous from public.transacciones_planes where fk_usuario=p_user_id and clave_idempotencia=p_idempotency_key;
 if found then
   if previous.fk_plan<>p_plan_id or previous.fk_organizacion is distinct from p_organization_id then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
   return previous.resultado;
 end if;
 select * into p from public.planes where id_plan=p_plan_id and activo and comprable;
 if not found then raise exception 'PLAN_NOT_AVAILABLE'; end if;
 if p.audiencia='organization' then
   if p_organization_id is null then raise exception 'ORGANIZATION_REQUIRED'; end if;
   perform 1 from public.organizaciones where id_organizacion=p_organization_id and activa and fecha_eliminacion is null for update;
   if not found then raise exception 'ORGANIZATION_NOT_FOUND'; end if;
   if not exists(select 1 from public.miembros_organizacion where fk_organizacion=p_organization_id and fk_usuario=p_user_id and activo and rol='Administrador') then raise exception 'ORGANIZATION_ADMIN_REQUIRED'; end if;
 else
   if p_organization_id is not null then raise exception 'PLAN_NOT_AVAILABLE'; end if;
 end if;
 select * into s from public.suscripciones where (p_organization_id is not null and fk_organizacion=p_organization_id)
    or (p_organization_id is null and fk_usuario=p_user_id) for update;
 if found then
   update public.suscripciones set fk_plan=p.id_plan, estado='active',
    fecha_inicio=case when estado='active' and fecha_vencimiento>now() then fecha_inicio else now() end,
    fecha_vencimiento=(case when estado='active' and fecha_vencimiento>now() then fecha_vencimiento else now() end)+make_interval(months=>p.meses),
    fecha_actualizacion=now() where id_suscripcion=s.id_suscripcion returning * into s;
 else
   insert into public.suscripciones(fk_usuario,fk_organizacion,fk_plan,fecha_inicio,fecha_vencimiento)
   values(case when p_organization_id is null then p_user_id else null end,p_organization_id,p.id_plan,now(),now()+make_interval(months=>p.meses)) returning * into s;
 end if;
 receipt:=jsonb_build_object('id',receipt_id,'mode','simulated','currency','MXN','amount',p.precio_mxn,
  'subscription',jsonb_build_object('id',s.id_suscripcion,'planId',s.fk_plan,'planName',p.nombre,'organizationId',s.fk_organizacion,'startsAt',s.fecha_inicio,'endsAt',s.fecha_vencimiento,'status','active'));
 insert into public.transacciones_planes(id_transaccion,fk_usuario,clave_idempotencia,fk_plan,fk_organizacion,importe,resultado)
 values(receipt_id,p_user_id,p_idempotency_key,p.id_plan,p_organization_id,p.precio_mxn,receipt);
 return receipt;
end $$;

create or replace function public.academix_list_subscriptions(p_user_id uuid,p_page integer,p_limit integer)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare result jsonb; n bigint;
begin
 if p_page<1 or p_limit<1 or p_limit>50 then raise exception 'INVALID_PAGINATION'; end if;
 select count(*) into n from public.suscripciones s where s.fk_usuario=p_user_id or exists(select 1 from public.miembros_organizacion m join public.organizaciones o on o.id_organizacion=m.fk_organizacion where m.fk_usuario=p_user_id and m.activo and m.fk_organizacion=s.fk_organizacion and o.fecha_eliminacion is null);
 select coalesce(jsonb_agg(x.item),'[]') into result from (
 select jsonb_build_object('id',s.id_suscripcion,'planId',s.fk_plan,'planName',p.nombre,'organizationId',s.fk_organizacion,'startsAt',s.fecha_inicio,'endsAt',s.fecha_vencimiento,
  'status',case when s.estado='cancelled' then 'cancelled' when s.fecha_vencimiento<=now() then 'expired' else 'active' end) item
 from public.suscripciones s join public.planes p on p.id_plan=s.fk_plan
 where s.fk_usuario=p_user_id or exists(select 1 from public.miembros_organizacion m join public.organizaciones o on o.id_organizacion=m.fk_organizacion where m.fk_usuario=p_user_id and m.activo and m.fk_organizacion=s.fk_organizacion and o.fecha_eliminacion is null)
 order by s.fecha_actualizacion desc,s.id_suscripcion limit p_limit offset (p_page-1)*p_limit) x;
 return jsonb_build_object('records',result,'total',n);
end $$;

create or replace view public.academix_organization_access with(security_invoker=true) as
select o.id_organizacion,o.nombre,o.slug,o.descripcion,o.tipo,o.codigo_union,o.activa,o.fecha_creacion,o.creada_por,
 m.fk_usuario,m.matricula,m.rol,m.activo,m.fecha_union,
 (select count(*)::int from public.miembros_organizacion mm where mm.fk_organizacion=o.id_organizacion and mm.activo) member_count,
 public.academix_organization_has_subscription(o.id_organizacion) paid_active,
 s.fecha_inicio subscription_start,s.fecha_vencimiento subscription_end
from public.organizaciones o join public.miembros_organizacion m on m.fk_organizacion=o.id_organizacion and m.activo
left join public.suscripciones s on s.fk_organizacion=o.id_organizacion
where o.fecha_eliminacion is null;
revoke all on public.academix_organization_access from public,anon,authenticated;
grant select on public.academix_organization_access to service_role;

create or replace function public.academix_delete_organization(p_organization_id uuid,p_actor_user uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare o public.organizaciones%rowtype; archived smallint;
begin
 select * into o from public.organizaciones where id_organizacion=p_organization_id for update;
 if not found then raise exception 'ORGANIZATION_NOT_FOUND'; end if;
 if o.creada_por is distinct from p_actor_user or not exists(select 1 from public.miembros_organizacion m join public.usuarios u on u.id_usuario=m.fk_usuario where m.fk_organizacion=p_organization_id and m.fk_usuario=p_actor_user and m.rol='Administrador' and u.activo and (m.activo or o.fecha_eliminacion is not null)) then raise exception 'ORGANIZATION_DELETE_DENIED'; end if;
 if o.fecha_eliminacion is not null then return jsonb_build_object('deleted',true); end if;
 select id_estado_curso into archived from public.estados_curso where nombre='Archivado' and activo limit 1;
 if archived is null then raise exception 'COURSE_STATE_NOT_CONFIGURED'; end if;
 update public.cursos set fk_estado_curso=archived,fecha_actualizacion=now() where fk_organizacion=p_organization_id;
 update public.miembros_organizacion set activo=false,fecha_actualizacion=now() where fk_organizacion=p_organization_id;
 update public.suscripciones set estado='cancelled',fecha_actualizacion=now() where fk_organizacion=p_organization_id;
 update public.organizaciones set activa=false,fecha_eliminacion=now(),fecha_actualizacion=now() where id_organizacion=p_organization_id;
 return jsonb_build_object('deleted',true);
end $$;

create or replace function public.academix_assert_course_learning_access(p_user_id uuid,p_course_id uuid)
returns void language plpgsql stable security invoker set search_path='' as $$
declare source text; org uuid; included boolean;
begin
 if not exists(select 1 from public.usuarios where id_usuario=p_user_id and activo) then raise exception 'USER_NOT_FOUND'; end if;
 select i.origen_acceso,c.fk_organizacion,c.incluido_plus into source,org,included
 from public.inscripciones i join public.estados_inscripcion e on e.id_estado_inscripcion=i.fk_estado_inscripcion
 join public.cursos c on c.id_curso=i.fk_curso
 where i.fk_usuario=p_user_id and i.fk_curso=p_course_id and i.activo and lower(e.nombre) in ('activa','finalizada');
 if not found then raise exception 'ENROLLMENT_REQUIRED'; end if;
 if source='organization' then
   if not exists(select 1 from public.miembros_organizacion where fk_usuario=p_user_id and fk_organizacion=org and activo) then raise exception 'ORGANIZATION_MEMBERSHIP_REQUIRED'; end if;
   if not public.academix_organization_has_subscription(org) then raise exception 'ORGANIZATION_SUBSCRIPTION_REQUIRED'; end if;
 elsif source='plus' then
   if org is not null or not included or not public.academix_person_has_subscription(p_user_id) then raise exception 'SUBSCRIPTION_REQUIRED'; end if;
 end if;
end $$;

create or replace function private.academix_guard_progress_access()
returns trigger language plpgsql security invoker set search_path='' as $$
declare u uuid; c uuid;
begin
 select fk_usuario,fk_curso into u,c from public.inscripciones where id_inscripcion=new.fk_inscripcion;
 perform public.academix_assert_course_learning_access(u,c);
 return new;
end $$;
create trigger trg_guard_progress_access before insert or update on public.progreso_lecciones
for each row execute function private.academix_guard_progress_access();

create or replace function public.academix_current_course_ownership(p_user_id uuid,p_course_ids uuid[])
returns uuid[] language plpgsql stable security invoker set search_path='' as $$
declare cid uuid; owned uuid[]:=array[]::uuid[];
begin
 if p_course_ids is null or cardinality(p_course_ids)>50 or array_position(p_course_ids,null) is not null then raise exception 'INVALID_CHECKOUT_INPUT'; end if;
 foreach cid in array p_course_ids loop
   begin
     perform public.academix_assert_course_learning_access(p_user_id,cid);
     owned:=array_append(owned,cid);
   exception when raise_exception then
     if sqlerrm not in ('ENROLLMENT_REQUIRED','ORGANIZATION_MEMBERSHIP_REQUIRED','ORGANIZATION_SUBSCRIPTION_REQUIRED','SUBSCRIPTION_REQUIRED','USER_NOT_FOUND') then raise; end if;
   end;
 end loop;
 return owned;
end $$;
revoke all on function public.academix_current_course_ownership(uuid,uuid[]) from public,anon,authenticated;
grant execute on function public.academix_current_course_ownership(uuid,uuid[]) to service_role;

-- A bounded offline authorization snapshot uses the same entitlement deadline.
-- Individually acquired courses have no subscription deadline.
create or replace function public.academix_course_access_expiry(p_user_id uuid,p_course_id uuid)
returns timestamptz language plpgsql stable security invoker set search_path='' as $$
declare source text; organization_id uuid; expiry timestamptz;
begin
 perform public.academix_assert_course_learning_access(p_user_id,p_course_id);
 select i.origen_acceso,c.fk_organizacion into source,organization_id
 from public.inscripciones i join public.cursos c on c.id_curso=i.fk_curso
 where i.fk_usuario=p_user_id and i.fk_curso=p_course_id;
 if source='plus' then
   select fecha_vencimiento into expiry from public.suscripciones where fk_usuario=p_user_id;
 elsif source='organization' then
   select fecha_vencimiento into expiry from public.suscripciones where fk_organizacion=organization_id;
 end if;
 return expiry;
end $$;
revoke all on function public.academix_course_access_expiry(uuid,uuid) from public,anon,authenticated;
grant execute on function public.academix_course_access_expiry(uuid,uuid) to service_role;

-- Keep membership/role administration available after expiry. Paid course mutations
-- are guarded by the service and creation/enrollment RPCs below.
revoke all on function public.academix_organization_has_subscription(uuid),public.academix_person_has_subscription(uuid),public.academix_purchase_plan(uuid,text,uuid,uuid),public.academix_list_subscriptions(uuid,integer,integer),public.academix_delete_organization(uuid,uuid),public.academix_assert_course_learning_access(uuid,uuid) from public,anon,authenticated;
grant execute on function public.academix_organization_has_subscription(uuid),public.academix_person_has_subscription(uuid),public.academix_purchase_plan(uuid,text,uuid,uuid),public.academix_list_subscriptions(uuid,integer,integer),public.academix_delete_organization(uuid,uuid),public.academix_assert_course_learning_access(uuid,uuid) to service_role;

create or replace function public.academix_enroll_user(p_user_id uuid,p_course_id uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare c public.cursos%rowtype; i public.inscripciones%rowtype; state_id smallint; source text;
begin
 perform 1 from public.usuarios where id_usuario=p_user_id and activo for update;
 if not found then raise exception 'USER_NOT_FOUND'; end if;
 select cc.* into c from public.cursos cc join public.estados_curso e on e.id_estado_curso=cc.fk_estado_curso and e.activo and e.nombre='Publicado' where cc.id_curso=p_course_id and cc.activo for share of cc;
 if not found then raise exception 'COURSE_NOT_AVAILABLE'; end if;
 if c.fk_organizacion is not null then
   if not exists(select 1 from public.miembros_organizacion where fk_usuario=p_user_id and fk_organizacion=c.fk_organizacion and activo) then raise exception 'ORGANIZATION_MEMBERSHIP_REQUIRED'; end if;
   if not public.academix_organization_has_subscription(c.fk_organizacion) then raise exception 'ORGANIZATION_SUBSCRIPTION_REQUIRED'; end if;
   source:='organization';
 elsif c.cuota_recuperacion=0 then source:='individual';
 elsif c.incluido_plus and public.academix_person_has_subscription(p_user_id) then source:='plus';
 else raise exception 'PAYMENT_NOT_AVAILABLE'; end if;
 if c.requiere_aprobacion then raise exception 'COURSE_REQUIRES_APPROVAL'; end if;
 select id_estado_inscripcion into state_id from public.estados_inscripcion where lower(nombre)='activa' and activo limit 1;
 if state_id is null then raise exception 'ENROLLMENT_STATE_NOT_CONFIGURED'; end if;
 select * into i from public.inscripciones where fk_usuario=p_user_id and fk_curso=p_course_id for update;
 if found then
   if i.activo and exists(select 1 from public.estados_inscripcion where id_estado_inscripcion=i.fk_estado_inscripcion and lower(nombre) in ('activa','finalizada')) then
     if i.origen_acceso='plus' and source='individual' and c.cuota_recuperacion=0 then
       update public.inscripciones set origen_acceso='individual',fecha_actualizacion=now() where id_inscripcion=i.id_inscripcion;
     end if;
     perform public.academix_assert_course_learning_access(p_user_id,p_course_id);
     return jsonb_build_object('enrollmentId',i.id_inscripcion,'status','activa');
   end if;
   if i.activo and not exists(select 1 from public.estados_inscripcion where id_estado_inscripcion=i.fk_estado_inscripcion and lower(nombre)='cancelada') then raise exception 'ENROLLMENT_NOT_ACTIVE'; end if;
   update public.inscripciones set activo=true,fk_estado_inscripcion=state_id,origen_acceso=source,fecha_inicio=now(),fecha_finalizacion=null,fecha_actualizacion=now() where id_inscripcion=i.id_inscripcion;
 else
   insert into public.inscripciones(fk_usuario,fk_curso,fk_estado_inscripcion,origen_acceso,monto_pagado,fecha_inicio)
   values(p_user_id,p_course_id,state_id,source,0,now()) returning * into i;
 end if;
 return jsonb_build_object('enrollmentId',i.id_inscripcion,'status','activa');
end $$;

create or replace function public.academix_simulated_checkout(p_user_id uuid,p_course_ids uuid[],p_idempotency_key uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare ids uuid[]; previous public.compras_simuladas%rowtype; c public.cursos%rowtype;
 i public.inscripciones%rowtype; cid uuid; eid uuid; state_id smallint; source text;
 receipt_id uuid:=gen_random_uuid(); receipt jsonb; items jsonb:='[]'; total numeric:=0; amount numeric; owned boolean;
begin
 if p_idempotency_key is null or p_course_ids is null or cardinality(p_course_ids)<1 or cardinality(p_course_ids)>50 or array_position(p_course_ids,null) is not null then raise exception 'INVALID_CHECKOUT_INPUT'; end if;
 select array_agg(id order by id) into ids from(select distinct unnest(p_course_ids) id) x;
 if cardinality(ids)<>cardinality(p_course_ids) then raise exception 'INVALID_CHECKOUT_INPUT'; end if;
 perform 1 from public.usuarios where id_usuario=p_user_id and activo for update;
 if not found then raise exception 'USER_NOT_FOUND'; end if;
 select * into previous from public.compras_simuladas where fk_usuario=p_user_id and clave_idempotencia=p_idempotency_key;
 if found then
   if previous.cursos<>ids then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
   return previous.resultado;
 end if;
 select id_estado_inscripcion into state_id from public.estados_inscripcion where lower(nombre)='activa' and activo limit 1;
 if state_id is null then raise exception 'ENROLLMENT_STATE_NOT_CONFIGURED'; end if;
 foreach cid in array ids loop
   select cc.* into c from public.cursos cc join public.estados_curso e on e.id_estado_curso=cc.fk_estado_curso and e.activo and e.nombre='Publicado' where cc.id_curso=cid and cc.activo for share of cc;
   if not found then raise exception 'COURSE_NOT_AVAILABLE'; end if;
   if c.fk_organizacion is not null then
     if not exists(select 1 from public.miembros_organizacion where fk_usuario=p_user_id and fk_organizacion=c.fk_organizacion and activo) then raise exception 'ORGANIZATION_MEMBERSHIP_REQUIRED'; end if;
     if not public.academix_organization_has_subscription(c.fk_organizacion) then raise exception 'ORGANIZATION_SUBSCRIPTION_REQUIRED'; end if;
     source:='organization'; amount:=0;
   elsif c.cuota_recuperacion=0 then source:='individual'; amount:=0;
   elsif c.incluido_plus and public.academix_person_has_subscription(p_user_id) then source:='plus'; amount:=0;
   else source:='individual'; amount:=c.cuota_recuperacion; end if;
   if amount is null or amount<0 then raise exception 'COURSE_NOT_AVAILABLE'; end if;
   select * into i from public.inscripciones where fk_usuario=p_user_id and fk_curso=cid for update;
   owned:=found;
   if owned then
     if not i.activo or not exists(select 1 from public.estados_inscripcion where id_estado_inscripcion=i.fk_estado_inscripcion and lower(nombre) in ('activa','finalizada')) then raise exception 'ENROLLMENT_NOT_ACTIVE'; end if;
     eid:=i.id_inscripcion;
     if i.origen_acceso='plus' and source='individual' then
       -- Expired plan enrollment can become an individual purchase without losing progress.
       update public.inscripciones set origen_acceso='individual',fecha_actualizacion=now() where id_inscripcion=eid;
       owned:=false;
     else amount:=0; end if;
   else
     if c.requiere_aprobacion then raise exception 'COURSE_REQUIRES_APPROVAL'; end if;
     insert into public.inscripciones(fk_usuario,fk_curso,fk_estado_inscripcion,origen_acceso,monto_pagado,fecha_inicio)
     values(p_user_id,cid,state_id,source,0,now()) returning id_inscripcion into eid;
   end if;
   total:=total+amount;
   items:=items||jsonb_build_array(jsonb_build_object('courseId',cid,'enrollmentId',eid,'amount',amount,'alreadyOwned',owned));
 end loop;
 receipt:=jsonb_build_object('id',receipt_id,'mode','simulated','currency','MXN','total',total,'items',items);
 insert into public.compras_simuladas(id_compra,fk_usuario,clave_idempotencia,cursos,resultado) values(receipt_id,p_user_id,p_idempotency_key,ids,receipt);
 return receipt;
end $$;
revoke all on function public.academix_enroll_user(uuid,uuid),public.academix_simulated_checkout(uuid,uuid[],uuid) from public,anon,authenticated;
grant execute on function public.academix_enroll_user(uuid,uuid),public.academix_simulated_checkout(uuid,uuid[],uuid) to service_role;
create or replace function private.academix_guard_organization_course_plan()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.fk_organizacion is not null and not public.academix_organization_has_subscription(new.fk_organizacion) then raise exception 'ORGANIZATION_SUBSCRIPTION_REQUIRED'; end if;
 return new;
end $$;
create trigger trg_guard_organization_course_plan before insert or update of fk_organizacion on public.cursos
for each row execute function private.academix_guard_organization_course_plan();
create or replace function private.academix_guard_institutional_content_plan()
returns trigger language plpgsql security invoker set search_path='' as $$
declare course_id uuid; organization_id uuid;
begin
 -- Disabling resources/assignments remains available for moderation and cleanup.
 if not new.activo then return new; end if;
 if tg_table_name in ('modulos','cursos_instructores') then course_id:=new.fk_curso;
 elsif tg_table_name='archivos' then course_id:=new.fk_curso_contenido;
 elsif tg_table_name='lecciones' then select fk_curso into course_id from public.modulos where id_modulo=new.fk_modulo;
 elsif tg_table_name='recursos' then select m.fk_curso into course_id from public.lecciones l join public.modulos m on m.id_modulo=l.fk_modulo where l.id_leccion=new.fk_leccion;
 end if;
 select fk_organizacion into organization_id from public.cursos where id_curso=course_id;
 if organization_id is not null and not public.academix_organization_has_subscription(organization_id) then raise exception 'ORGANIZATION_SUBSCRIPTION_REQUIRED'; end if;
 return new;
end $$;
create trigger trg_guard_institutional_modulos before insert or update on public.modulos for each row execute function private.academix_guard_institutional_content_plan();
create trigger trg_guard_institutional_lecciones before insert or update on public.lecciones for each row execute function private.academix_guard_institutional_content_plan();
create trigger trg_guard_institutional_recursos before insert or update on public.recursos for each row execute function private.academix_guard_institutional_content_plan();
create trigger trg_guard_institutional_archivos before insert or update on public.archivos for each row execute function private.academix_guard_institutional_content_plan();
create trigger trg_guard_institutional_assignment before insert or update on public.cursos_instructores for each row execute function private.academix_guard_institutional_content_plan();
revoke all on function private.academix_guard_institutional_content_plan() from public,anon,authenticated;
revoke all on function private.academix_guard_organization_course_plan(),private.academix_guard_progress_access() from public,anon,authenticated;
commit;
