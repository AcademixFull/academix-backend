-- Academix Auth: el frontend nunca accede directamente a estas tablas.
-- El backend usa la clave secreta y valida cada JWT con Supabase Auth.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create or replace function private.handle_new_academix_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  student_role_id uuid;
  full_name text;
begin
  full_name := nullif(btrim(new.raw_user_meta_data ->> 'full_name'), '');
  full_name := coalesce(full_name, split_part(coalesce(new.email, 'Usuario'), '@', 1));

  insert into public.usuarios (
    id_usuario,
    nombres,
    apellido_paterno,
    correo
  )
  values (
    new.id,
    full_name,
    '',
    coalesce(new.email, '')
  )
  on conflict (id_usuario) do nothing;

  select id_rol
    into student_role_id
    from public.roles
   where lower(nombre) = 'alumno'
     and activo = true
   limit 1;

  if student_role_id is null then
    raise exception 'El rol Alumno activo no está configurado';
  end if;

  insert into public.usuarios_roles (fk_usuario, fk_rol)
  select new.id, student_role_id
  where not exists (
    select 1
      from public.usuarios_roles
     where fk_usuario = new.id
       and fk_rol = student_role_id
  );

  return new;
end;
$$;

revoke all on function private.handle_new_academix_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created_academix on auth.users;
create trigger on_auth_user_created_academix
  after insert on auth.users
  for each row execute function private.handle_new_academix_user();

alter table public.roles enable row level security;
alter table public.usuarios enable row level security;
alter table public.usuarios_roles enable row level security;

revoke all on table public.roles from anon, authenticated;
revoke all on table public.usuarios from anon, authenticated;
revoke all on table public.usuarios_roles from anon, authenticated;
