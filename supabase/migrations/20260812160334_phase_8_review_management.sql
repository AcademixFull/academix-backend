-- Fase 8: agregación eficiente y soporte para la bandeja de moderación.
-- No recrea resenas_cursos ni modifica reseñas existentes.

create index if not exists idx_resenas_activas_fecha
  on public.resenas_cursos (fecha_creacion desc)
  where activo = true;

create or replace function public.academix_course_review_stats(
  p_course_ids uuid[]
)
returns table (
  course_id uuid,
  rating numeric,
  review_count bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    i.fk_curso as course_id,
    round(avg(r.calificacion)::numeric, 1) as rating,
    count(*)::bigint as review_count
  from public.resenas_cursos r
  join public.inscripciones i on i.id_inscripcion = r.fk_inscripcion
  where r.activo = true
    and r.visible = true
    and i.fk_curso = any(p_course_ids)
  group by i.fk_curso;
$$;

revoke all on function public.academix_course_review_stats(uuid[])
  from public, anon, authenticated;
grant execute on function public.academix_course_review_stats(uuid[])
  to service_role;
