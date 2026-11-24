# Checklist de producción — Academix

No guardes valores reales en Git, capturas, documentación o comandos que
queden en el historial. Marca cada control en el entorno donde se desplegará.

## Backend y secretos

- [ ] `NODE_ENV=production`.
- [ ] `FRONTEND_URL` contiene exclusivamente los orígenes HTTPS reales.
- [ ] `PASSWORD_RESET_REDIRECT_URL` coincide con una URL permitida en Auth.
- [ ] `SUPABASE_SECRET_KEY` existe solo en el backend y en el gestor de
  secretos del proveedor.
- [ ] `TRUST_PROXY_HOPS` coincide exactamente con los proxies reales; no se
  aumenta para “arreglar” una IP sin revisar la red.
- [ ] Los límites por IP se ajustaron después de una prueba de carga.
- [ ] Si hay más de una instancia de Express, el MemoryStore del limitador se
  reemplazó por un store compartido compatible (por ejemplo Redis).
- [ ] Los logs recogen JSON y `X-Request-Id`, pero nunca cuerpos, JWT, claves o
  contraseñas.

## Supabase Auth

- [ ] Confirmación de correo habilitada.
- [ ] SMTP propio configurado y probado; el servicio predeterminado no se usa
  para producción sostenida.
- [ ] URLs de sitio y redirección limitadas a dominios controlados.
- [ ] Expiración de OTP y JWT revisada de acuerdo con el riesgo de la app.
- [ ] Protección contra contraseñas filtradas habilitada cuando el plan lo
  permita.
- [ ] CAPTCHA habilitado en registro, login y recuperación si el tráfico lo
  requiere.
- [ ] MFA habilitado para la cuenta y organización que administran Supabase.

## Base de datos y Storage

- [ ] Asesores de seguridad y rendimiento revisados después de cada migración.
- [ ] Las 37 tablas conservan RLS y cero privilegios DML para `anon` y
  `authenticated`.
- [ ] Ninguna función de `public` es `SECURITY DEFINER` ni ejecutable por los
  roles del Data API.
- [ ] SSL obligatorio y restricciones de red configuradas según el plan.
- [ ] Política de backups/PITR comprobada y restauración ensayada.
- [ ] `academix-course-content` continúa privado y sin URLs permanentes.
- [ ] Los índices se revisan con estadísticas de tráfico real antes de borrar
  alguno.

## Despliegue y operación

- [ ] `npm ci` usa el lockfile confirmado.
- [ ] `npm run verify:production` termina correctamente con el `.env` del
  entorno de validación.
- [ ] `GET /api/v1/health` se usa para liveness.
- [ ] `GET /api/v1/health/ready` se usa para readiness y devuelve 503 cuando
  Postgres no está disponible.
- [ ] Alertas configuradas para 5xx, 429 sostenidos, latencia y readiness.
- [ ] Se hizo una prueba de carga en staging, no sobre producción.
- [ ] El contrato `docs/openapi.yaml` coincide con la URL pública desplegada.
- [ ] Existe un procedimiento de rotación de claves y respuesta a incidentes.

Referencia: [checklist oficial de producción de Supabase](https://supabase.com/docs/guides/deployment/going-into-prod).
