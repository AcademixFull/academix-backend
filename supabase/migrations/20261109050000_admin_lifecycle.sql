-- Serialize global role/status changes with scheduled account deletion.
begin;
do $$
declare definition text;
begin
  select pg_get_functiondef('public.academix_set_user_roles(uuid,text[],uuid)'::regprocedure) into definition;
  if position('academix-account-administration' in definition)=0 then
    definition:=regexp_replace(definition,E'\n[ \t]*BEGIN[ \t]*\r?\n',E'\nBEGIN\n  perform pg_advisory_xact_lock(hashtext(''academix-account-administration''));\n','i');
    if position('academix-account-administration' in definition)=0 then raise exception 'ROLE_FUNCTION_NOT_PATCHED'; end if;
    execute definition;
  end if;
end;
$$;
create or replace function public.academix_set_user_active(p_target_user uuid,p_active boolean,p_actor_user uuid)
returns void language plpgsql security invoker set search_path='' as $$
begin
  perform pg_advisory_xact_lock(hashtext('academix-account-administration'));
  if not exists(select 1 from public.usuarios_roles ur join public.roles r on r.id_rol=ur.fk_rol
    join public.usuarios u on u.id_usuario=ur.fk_usuario where ur.fk_usuario=p_actor_user and ur.activo and r.activo
      and lower(r.nombre)='administrador' and u.activo) then raise exception 'ADMIN_REQUIRED'; end if;
  perform 1 from public.usuarios where id_usuario=p_target_user for update;
  if not found then raise exception 'USER_NOT_FOUND'; end if;
  if p_active is null then raise exception 'INVALID_USER_STATUS'; end if;
  if not p_active and p_actor_user=p_target_user then raise exception 'CANNOT_DEACTIVATE_SELF'; end if;
  if p_active and exists(select 1 from public.solicitudes_eliminacion_cuenta where user_id=p_target_user and status in ('processing','completed')) then
    raise exception 'ACCOUNT_DELETION_IN_PROGRESS';
  end if;
  if not p_active and exists(select 1 from public.usuarios_roles ur join public.roles r on r.id_rol=ur.fk_rol
    where ur.fk_usuario=p_target_user and ur.activo and lower(r.nombre)='administrador')
    and not exists(select 1 from public.usuarios_roles ur join public.roles r on r.id_rol=ur.fk_rol join public.usuarios u on u.id_usuario=ur.fk_usuario
      where ur.fk_usuario<>p_target_user and ur.activo and r.activo and lower(r.nombre)='administrador' and u.activo) then
    raise exception 'LAST_ADMIN_REQUIRED';
  end if;
  update public.usuarios set activo=p_active,fecha_actualizacion=now() where id_usuario=p_target_user;
end; $$;
revoke all on function public.academix_set_user_active(uuid,boolean,uuid) from public,anon,authenticated;
grant execute on function public.academix_set_user_active(uuid,boolean,uuid) to service_role;
commit;
