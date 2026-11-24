# Validación manual — regularización 6.5

Esta regularización no elimina datos ni vuelve a ejecutar migraciones
anteriores. Corrige Auth, completa índices y alinea la numeración oficial.

## 1. Configurar la URL de recuperación

Agrega al `.env` local:

```dotenv
PASSWORD_RESET_REDIRECT_URL=http://localhost:5173/CursosWeb/
```

La misma URL debe estar autorizada en **Supabase → Authentication → URL
Configuration → Redirect URLs**. En producción se reemplaza por la URL HTTPS
real del frontend.

## 2. Verificar código y Supabase

```bash
npm ci
npm run check
npm audit --omit=dev
npm run supabase:verify
git diff --check
git status --short
```

`supabase:verify` es de solo lectura: comprueba las 37 tablas públicas y que el
bucket `academix-course-content` siga siendo privado.

## 3. Solicitar recuperación

```bash
curl -i -X POST http://localhost:3000/api/v1/auth/password-reset \
  -H "Content-Type: application/json" \
  -d '{"email":"usuario@example.com"}'
```

Debe responder `204` tanto si la cuenta existe como si no. El correo debe
regresar a `PASSWORD_RESET_REDIRECT_URL`. Supabase agrega el token al fragmento
de la URL; durante la integración, React debe procesarlo antes de que
`HashRouter` interprete la navegación y abrir el formulario para la nueva
contraseña.

## 4. Guardar la contraseña nueva

La pantalla de recuperación del frontend debe obtener el access token enviado
por Supabase y llamar exclusivamente al backend:

```bash
curl -i -X PATCH http://localhost:3000/api/v1/auth/password \
  -H "Authorization: Bearer TOKEN_RECUPERACION" \
  -H "Content-Type: application/json" \
  -d '{"password":"nueva-contraseña-segura"}'
```

Debe responder `204`. El backend identifica al usuario desde el token, cambia
su contraseña mediante el cliente administrativo y revoca sus sesiones. Una
contraseña menor de ocho caracteres responde `422 VALIDATION_ERROR`.

La pantalla visual que consume este contrato corresponde a la integración con
el frontend; no requiere acceso directo de React a tablas ni al cliente
administrativo de Supabase.
