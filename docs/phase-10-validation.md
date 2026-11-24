# Validación final — Fase 10

La Fase 10 no contiene ni aplica una migración. Usa el `.env` local existente
y agrega las cuatro variables nuevas tomando `.env.example` como referencia.

## 1. Verificación completa

```bash
npm ci
npm run check
npm audit --omit=dev
npm run supabase:verify
npm run test:integration
git diff --check
git status --short
```

También puedes ejecutar las verificaciones funcionales en una sola orden:

```bash
npm run verify:production
```

Resultados esperados:

- lint, typecheck y build correctos;
- 20 archivos y 115 pruebas offline aprobadas;
- cero vulnerabilidades en dependencias de producción;
- 37 tablas, bucket privado y firma de certificados disponibles;
- 2 pruebas de integración de solo lectura aprobadas.

## 2. Liveness y readiness

Con el backend iniciado:

```bash
curl -i http://localhost:3000/api/v1/health
curl -i http://localhost:3000/api/v1/health/ready
```

Ambas responden 200. Readiness debe incluir `status: "ready"` y no debe
mostrar URL, claves o mensajes internos de Supabase.

## 3. Correlación y caché

```bash
curl -i http://localhost:3000/api/v1/health \
  -H "X-Request-Id: academix-manual-1"

curl -i http://localhost:3000/api/v1/auth/me
```

La primera respuesta conserva `X-Request-Id: academix-manual-1`. La segunda
responde 401 e incluye `Cache-Control: no-store` y un identificador generado.

## 4. Límites

Las pruebas automatizadas verifican el contrato `429 RATE_LIMITED`, la
cabecera estándar `RateLimit` y la ausencia de cabeceras heredadas. No hagas
una prueba repetitiva sobre recuperación de contraseña para evitar envíos de
correo. Ajusta cuotas con `RATE_LIMIT_*` únicamente después de observar tráfico
legítimo.

## 5. Cierre operativo

Revisa `docs/production-checklist.md`. Las opciones de Auth, SMTP, CAPTCHA,
MFA, SSL, red y backups son controles del Dashboard/proveedor y no se aplican
mediante este parche.
