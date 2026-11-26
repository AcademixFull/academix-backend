import 'dotenv/config';
import * as Sentry from '@sentry/node';
import { sanitizeEvent } from './privacy';

if (process.env.SENTRY_DSN && process.env.NODE_ENV !== 'test') {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV ?? 'development',
    release: process.env.SENTRY_RELEASE || `academix-backend@${process.env.npm_package_version ?? 'unknown'}${process.env.RENDER_GIT_COMMIT ? '+' + process.env.RENDER_GIT_COMMIT.slice(0, 12) : ''}`,
    // HTTP payloads and auth breadcrumbs must never be collected.
    defaultIntegrations: false,
    integrations: [Sentry.onUncaughtExceptionIntegration(), Sentry.onUnhandledRejectionIntegration()],
    dataCollection: {
      userInfo: false, cookies: false, httpHeaders: false, httpBodies: [],
      urlQueryParams: false, databaseQueryData: false, stackFrameVariables: false,
      frameContextLines: 0,
    },
    beforeSend: sanitizeEvent,
  });
}

export function reportServerError(error: unknown): void {
  if (Sentry.isInitialized()) Sentry.captureException(error);
}

export async function closeMonitoring(): Promise<void> {
  await Sentry.close(2000);
}
