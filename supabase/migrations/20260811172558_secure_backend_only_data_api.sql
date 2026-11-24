-- Academix usa exclusivamente: React -> Express -> Supabase.
-- Ninguna tabla de public se consume directamente con las claves del navegador.

do $$
declare
  table_record record;
begin
  for table_record in
    select tablename
      from pg_tables
     where schemaname = 'public'
  loop
    execute format(
      'alter table public.%I enable row level security',
      table_record.tablename
    );
  end loop;
end;
$$;

-- Bloquea el Data API para las claves publicable y de usuarios autenticados.
-- service_role conserva sus privilegios actuales para el cliente secreto de Express.
revoke all privileges on all tables in schema public from anon, authenticated;
revoke all privileges on all sequences in schema public from anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;

-- Los objetos futuros no se exponen automáticamente. Cada migración deberá
-- conceder de forma explícita a service_role solo lo que necesite el backend.
alter default privileges for role postgres in schema public
  revoke select, insert, update, delete on tables
  from anon, authenticated, service_role;

alter default privileges for role postgres in schema public
  revoke usage, select on sequences
  from anon, authenticated, service_role;

alter default privileges for role postgres in schema public
  revoke execute on functions
  from public, anon, authenticated, service_role;
