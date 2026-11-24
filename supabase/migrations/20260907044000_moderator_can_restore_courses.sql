-- Academix: permite a Moderador o Administrador restaurar un curso moderado
-- cuando el contenido vuelve a cumplir con los lineamientos.

update public.estados_curso
   set descripcion = 'Curso retirado por moderación; conserva contenido e historial y puede ser restaurado por un Moderador o Administrador cuando vuelva a cumplir los lineamientos.'
 where lower(nombre) = 'dado de baja por moderación';

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

revoke all on function public.academix_restore_moderated_course(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.academix_restore_moderated_course(uuid, uuid)
  to service_role;
