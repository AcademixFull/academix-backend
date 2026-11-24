-- Fase 4: índices faltantes para las relaciones de estado y pago.

create index if not exists idx_inscripciones_estado
  on public.inscripciones (fk_estado_inscripcion);

create index if not exists idx_inscripciones_metodo_pago
  on public.inscripciones (fk_metodo_pago)
  where fk_metodo_pago is not null;

create index if not exists idx_inscripciones_estado_pago
  on public.inscripciones (fk_estado_pago)
  where fk_estado_pago is not null;
