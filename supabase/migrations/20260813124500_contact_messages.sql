-- Mensajes enviados desde el formulario público de Academix.
-- La Data API permanece cerrada: únicamente academix-backend usa service_role.

create table if not exists public.mensajes_contacto (
  id_mensaje uuid primary key default gen_random_uuid(),
  nombre varchar(160) not null,
  correo varchar(254) not null,
  asunto varchar(160) not null,
  mensaje text not null,
  estado text not null default 'pendiente'
    constraint chk_mensaje_contacto_estado
    check (estado in ('pendiente', 'atendido', 'cerrado')),
  fecha_creacion timestamptz not null default now(),
  fecha_actualizacion timestamptz not null default now(),
  constraint chk_mensaje_contacto_nombre check (char_length(btrim(nombre)) between 2 and 160),
  constraint chk_mensaje_contacto_correo check (char_length(btrim(correo)) between 3 and 254),
  constraint chk_mensaje_contacto_asunto check (char_length(btrim(asunto)) between 3 and 160),
  constraint chk_mensaje_contacto_mensaje check (char_length(btrim(mensaje)) between 12 and 4000)
);

create index if not exists idx_mensajes_contacto_estado_fecha
  on public.mensajes_contacto (estado, fecha_creacion desc);

alter table public.mensajes_contacto enable row level security;
revoke all privileges on table public.mensajes_contacto from anon, authenticated;
grant insert, select on table public.mensajes_contacto to service_role;
