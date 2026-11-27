alter table public.usuarios
  add column if not exists avatar_preset text
  constraint ck_usuarios_avatar_preset
  check (avatar_preset in ('nova', 'pixel', 'orbita', 'chispa', 'bosque', 'marea'));
