-- Aggregate in PostgreSQL: the dashboard never downloads the whole library.
begin;
create or replace function public.academix_learning_summary(p_user_id uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
 with library as (
   select i.id_inscripcion,i.fk_curso,e.nombre,c.duracion_estimada_horas
   from public.inscripciones i join public.estados_inscripcion e on e.id_estado_inscripcion=i.fk_estado_inscripcion
     join public.cursos c on c.id_curso=i.fk_curso
   where i.fk_usuario=p_user_id and i.activo and e.nombre in ('Activa','Finalizada')
 ), lessons as (
   select m.fk_curso,count(*) as total from public.modulos m join public.lecciones l on l.fk_modulo=m.id_modulo
   where m.activo and l.activo and m.fk_curso in (select fk_curso from library) group by m.fk_curso
 ), completed as (
   select p.fk_inscripcion,count(*) as total from public.progreso_lecciones p
   join public.lecciones l on l.id_leccion=p.fk_leccion and l.activo
   join public.modulos m on m.id_modulo=l.fk_modulo and m.activo
   join library i on i.id_inscripcion=p.fk_inscripcion and i.fk_curso=m.fk_curso
   where p.completada group by p.fk_inscripcion
 )
 select jsonb_build_object(
   'inProgress',(select count(*) from library where nombre='Activa'),
   'completed',(select count(*) from library where nombre='Finalizada'),
   'certificates',(select count(*) from public.certificados where fk_usuario=p_user_id and activo),
   'learningHours',coalesce((select round(sum(coalesce(i.duracion_estimada_horas,0)*least(1,coalesce(p.total,0)::numeric/nullif(l.total,0))))
     from library i left join lessons l on l.fk_curso=i.fk_curso left join completed p on p.fk_inscripcion=i.id_inscripcion),0)
 );
$$;
revoke all on function public.academix_learning_summary(uuid) from public,anon,authenticated;
grant execute on function public.academix_learning_summary(uuid) to service_role;
create index if not exists idx_inscripciones_library_page on public.inscripciones(fk_usuario,fecha_inscripcion desc,id_inscripcion) where activo;
create index if not exists idx_certificados_library_page on public.certificados(fk_usuario,fecha_emision desc,id_certificado) where activo;
commit;
