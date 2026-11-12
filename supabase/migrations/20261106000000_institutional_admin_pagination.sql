-- Academix: bounded administrative lists and organization-scoped administration.
-- Apply after all previous migrations, using the Supabase SQL editor/migration runner.
-- These views and the role mutation function are backend-only (service_role).
begin;

create or replace view public.academix_admin_users with (security_invoker = true) as
select u.id_usuario, u.nombres, u.apellido_paterno, u.apellido_materno, u.correo, u.activo, u.fecha_creacion,
  array(select r.nombre::text from public.usuarios_roles ur join public.roles r on r.id_rol = ur.fk_rol where ur.fk_usuario = u.id_usuario and ur.activo and r.activo) as role_names,
  exists(select 1 from public.miembros_organizacion m join public.organizaciones o on o.id_organizacion = m.fk_organizacion where m.fk_usuario = u.id_usuario and m.activo and m.rol = 'Administrador' and o.activa) as institutional_administrator,
  coalesce((select jsonb_agg(jsonb_build_object('id', o.id_organizacion, 'name', o.nombre) order by o.nombre) from public.miembros_organizacion m join public.organizaciones o on o.id_organizacion = m.fk_organizacion where m.fk_usuario = u.id_usuario and m.activo and m.rol = 'Administrador' and o.activa), '[]'::jsonb) as institutional_organizations
from public.usuarios u;

create or replace view public.academix_admin_instructors with (security_invoker = true) as
select p.fk_usuario, p.especialidad, p.anios_experiencia, (p.activo and u.activo) as activo,
  u.id_usuario, u.nombres, u.apellido_paterno, u.apellido_materno, u.correo
from public.perfiles_instructores p join public.usuarios u on u.id_usuario = p.fk_usuario
where exists(select 1 from public.usuarios_roles ur join public.roles r on r.id_rol = ur.fk_rol where ur.fk_usuario = p.fk_usuario and ur.activo and r.activo and r.nombre = 'Instructor')
  and not exists(select 1 from public.usuarios_roles ur join public.roles r on r.id_rol = ur.fk_rol where ur.fk_usuario = p.fk_usuario and ur.activo and r.activo and r.nombre = 'Moderador');

create or replace view public.academix_managed_courses with (security_invoker = true) as
select c.*, array(
  select ci.fk_usuario from public.cursos_instructores ci
  where ci.fk_curso = c.id_curso and ci.activo and (
    (c.fk_organizacion is null and exists(select 1 from public.usuarios_roles ur join public.roles r on r.id_rol = ur.fk_rol where ur.fk_usuario = ci.fk_usuario and ur.activo and r.activo and r.nombre = 'Instructor'))
    or exists(select 1 from public.miembros_organizacion m where m.fk_organizacion = c.fk_organizacion and m.fk_usuario = ci.fk_usuario and m.activo and m.rol in ('Administrador', 'Instructor'))
  )
  union
  select m.fk_usuario from public.miembros_organizacion m where m.fk_organizacion = c.fk_organizacion and m.activo and m.rol = 'Administrador'
) as manageable_user_ids
from public.cursos c;

create or replace view public.academix_organization_members with (security_invoker = true) as
select m.fk_organizacion, m.fk_usuario, m.matricula, m.rol, m.activo, m.fecha_union,
  u.id_usuario, u.nombres, u.apellido_paterno, u.apellido_materno, u.correo
from public.miembros_organizacion m join public.usuarios u on u.id_usuario = m.fk_usuario;

revoke all on public.academix_admin_users, public.academix_admin_instructors, public.academix_managed_courses, public.academix_organization_members from public, anon, authenticated;
grant select on public.academix_admin_users, public.academix_admin_instructors, public.academix_managed_courses, public.academix_organization_members to service_role;

create or replace function public.academix_set_organization_member_role(p_organization_id uuid, p_target_user uuid, p_role text, p_actor_user uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare target_role text;
begin
  -- One lock per institution also serializes competing last-administrator changes.
  perform 1 from public.organizaciones where id_organizacion = p_organization_id and activa for update;
  if not found then raise exception 'ORGANIZATION_NOT_FOUND'; end if;
  if not exists(select 1 from public.miembros_organizacion m join public.usuarios u on u.id_usuario = m.fk_usuario where m.fk_organizacion = p_organization_id and m.fk_usuario = p_actor_user and m.activo and m.rol = 'Administrador' and u.activo) then
    raise exception 'ORGANIZATION_ADMIN_REQUIRED';
  end if;
  if p_role not in ('Administrador', 'Instructor', 'Estudiante') or p_role is null then raise exception 'INVALID_ROLE'; end if;
  select rol into target_role from public.miembros_organizacion where fk_organizacion = p_organization_id and fk_usuario = p_target_user and activo for update;
  if not found then raise exception 'MEMBER_NOT_FOUND'; end if;
  if target_role = 'Administrador' and p_role <> 'Administrador' and (select count(*) from public.miembros_organizacion where fk_organizacion = p_organization_id and activo and rol = 'Administrador') <= 1 then
    raise exception 'LAST_ORGANIZATION_ADMIN';
  end if;
  update public.miembros_organizacion set rol = p_role, fecha_actualizacion = now() where fk_organizacion = p_organization_id and fk_usuario = p_target_user and activo;
end;
$$;
revoke all on function public.academix_set_organization_member_role(uuid, uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.academix_set_organization_member_role(uuid, uuid, text, uuid) to service_role;
create index if not exists idx_members_org_role_joined on public.miembros_organizacion (fk_organizacion, rol, fecha_union, fk_usuario);
create index if not exists idx_courses_org_updated on public.cursos (fk_organizacion, fecha_actualizacion desc, id_curso);
create or replace function public.academix_assign_organization_instructor(p_organization_id uuid, p_course_id uuid, p_instructor_user uuid, p_actor_user uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform 1 from public.organizaciones where id_organizacion = p_organization_id and activa for update;
  if not found then raise exception 'ORGANIZATION_NOT_FOUND'; end if;
  if not exists(select 1 from public.miembros_organizacion m join public.usuarios u on u.id_usuario = m.fk_usuario where m.fk_organizacion = p_organization_id and m.fk_usuario = p_actor_user and m.activo and m.rol = 'Administrador' and u.activo) then raise exception 'ORGANIZATION_ADMIN_REQUIRED'; end if;
  perform 1 from public.cursos where id_curso = p_course_id and fk_organizacion = p_organization_id and activo for update;
  if not found then raise exception 'COURSE_NOT_FOUND'; end if;
  if not exists(select 1 from public.miembros_organizacion m join public.usuarios u on u.id_usuario = m.fk_usuario where m.fk_organizacion = p_organization_id and m.fk_usuario = p_instructor_user and m.activo and m.rol in ('Administrador', 'Instructor') and u.activo) then raise exception 'ORGANIZATION_INSTRUCTOR_REQUIRED'; end if;
  update public.cursos_instructores set instructor_principal = false, asignado_por = p_actor_user where fk_curso = p_course_id and activo and instructor_principal;
  insert into public.cursos_instructores(fk_curso, fk_usuario, instructor_principal, activo, fecha_asignacion, asignado_por)
  values (p_course_id, p_instructor_user, true, true, now(), p_actor_user)
  on conflict on constraint uq_curso_instructor do update set instructor_principal = true, activo = true, fecha_asignacion = excluded.fecha_asignacion, asignado_por = excluded.asignado_por;
end;
$$;
revoke all on function public.academix_assign_organization_instructor(uuid, uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.academix_assign_organization_instructor(uuid, uuid, uuid, uuid) to service_role;
commit;
