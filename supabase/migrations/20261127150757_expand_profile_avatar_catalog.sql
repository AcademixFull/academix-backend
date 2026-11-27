alter table public.usuarios
  drop constraint ck_usuarios_avatar_preset,
  add constraint ck_usuarios_avatar_preset
  check (avatar_preset in (
    'nova', 'pixel', 'orbita', 'chispa', 'bosque', 'marea',
    'zorro', 'ajolote', 'buho', 'carpincho',
    'rover', 'prisma', 'buzo', 'antena',
    'cartografa', 'ritmo', 'cobalto', 'alquimista'
  ));
