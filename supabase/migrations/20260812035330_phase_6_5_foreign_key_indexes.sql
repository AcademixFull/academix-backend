-- Fase 6.5: completa la cobertura de índices de claves foráneas detectada
-- por el asesor de rendimiento. No modifica ni elimina datos existentes.

create index if not exists idx_ejecuciones_reporte_reporte
  on public.ejecuciones_reporte (fk_reporte);

create index if not exists idx_ejecuciones_reporte_usuario
  on public.ejecuciones_reporte (ejecutado_por);

create index if not exists idx_evaluaciones_curso
  on public.evaluaciones (fk_curso);

create index if not exists idx_reportes_creado_por
  on public.reportes (creado_por);

create index if not exists idx_resultados_evaluacion_evaluacion
  on public.resultados_evaluacion (fk_evaluacion);

create index if not exists idx_solicitudes_verificacion_revisor
  on public.solicitudes_verificacion_utt (revisado_por)
  where revisado_por is not null;

create index if not exists idx_solicitudes_verificacion_archivo
  on public.solicitudes_verificacion_utt (fk_archivo_credencial)
  where fk_archivo_credencial is not null;
