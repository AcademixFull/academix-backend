-- Preserve existing popularity ranking and let administrators exclude a course.
alter table public.cursos add column if not exists visible_destacados boolean not null default true;
-- PostgreSQL expands c.* when a view is created. Append this column while
-- preserving every existing column's name, type and position in the view.
do $$ declare original_definition text; begin
  if to_regclass('public.academix_managed_courses') is not null and not exists(
    select 1 from information_schema.columns where table_schema='public' and table_name='academix_managed_courses' and column_name='visible_destacados'
  ) then
    original_definition:=rtrim(pg_get_viewdef('public.academix_managed_courses'::regclass,true),E'; \r\n');
    execute 'create or replace view public.academix_managed_courses with (security_invoker=true) as select original_view.*,c.visible_destacados from ('||original_definition||') original_view join public.cursos c on c.id_curso=original_view.id_curso';
  end if;
end $$;
create index if not exists cursos_catalogo_destacados_idx
  on public.cursos (fk_estado_curso, fecha_publicacion desc, id_curso)
  where activo and visible_destacados and fk_organizacion is null;

create or replace function public.academix_featured_course_ids(p_limit integer default 5)
returns table (id_curso uuid)
language sql stable security definer set search_path = public
as $$
  select c.id_curso
  from public.cursos c
  join public.estados_curso ec on ec.id_estado_curso = c.fk_estado_curso
  left join lateral (
    select count(*) as total
    from public.inscripciones i
    join public.estados_inscripcion ei on ei.id_estado_inscripcion = i.fk_estado_inscripcion
    where i.fk_curso = c.id_curso and i.activo and ei.activo
      and ei.nombre in ('Activa', 'Finalizada')
  ) popularity on true
  where c.activo and c.visible_destacados and c.fk_organizacion is null
    and ec.activo and ec.nombre = 'Publicado'
    and exists (
      select 1 from public.cursos_instructores ci
      join public.usuarios u on u.id_usuario = ci.fk_usuario and u.activo
      where ci.fk_curso = c.id_curso and ci.activo and ci.instructor_principal
    )
  order by popularity.total desc, c.fecha_publicacion desc nulls last, c.id_curso
  limit greatest(1, least(coalesce(p_limit, 5), 5));
$$;
revoke all on function public.academix_featured_course_ids(integer) from public, anon, authenticated;
grant execute on function public.academix_featured_course_ids(integer) to service_role;
