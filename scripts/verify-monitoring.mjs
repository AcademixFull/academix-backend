import process from 'node:process';
import console from 'node:console';
// Manual verification only: sends one synthetic error, never user data.
import * as Sentry from '@sentry/node';
const dsn = process.env.SENTRY_DSN;
if (!dsn) throw new Error('Set SENTRY_DSN in the process environment. Never paste auth tokens.');
Sentry.init({ dsn, environment: 'verification', release: 'academix-backend-monitoring-verification',
  defaultIntegrations: false, dataCollection: { userInfo: false, cookies: false, httpHeaders: false,
    httpBodies: [], urlQueryParams: false, stackFrameVariables: false, frameContextLines: 0 },
});
const id = Sentry.captureException(new Error('Academix: prueba controlada de monitoreo'));
if (!await Sentry.flush(10000)) throw new Error('Sentry did not finish sending the verification event');
console.log('Verification event:', id);
await Sentry.close(2000);
