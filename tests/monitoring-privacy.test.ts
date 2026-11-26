import { describe, expect, it } from 'vitest';
import { sanitizeEvent } from '../src/monitoring/privacy';

describe('monitoring privacy boundary', () => {
  it('removes credentials and personal data while retaining a usable stack and release', () => {
    const secret = 'test-private-value';
    const event = {
      event_id: 'abc', release: 'academix@1.0.0', environment: 'production',
      request: { url: `https://example.test/?token=${secret}`, data: { password: secret } },
      user: { email: secret }, extra: { token: secret }, breadcrumbs: [{ message: secret }],
      contexts: { custom: { secret } }, tags: { private: secret }, message: secret,
      exception: { values: [{ type: 'Error', value: secret, stacktrace: { frames: [{
        filename: `https://example.test/assets/app.js?token=${secret}#${secret}`,
        function: 'login', lineno: 10, colno: 20, vars: { password: secret }, pre_context: [secret],
      }] } }] },
    };
    const sanitized = sanitizeEvent(event);
    expect(JSON.stringify(sanitized)).not.toContain(secret);
    expect(sanitized.release).toBe('academix@1.0.0');
    expect(sanitized.exception?.values?.[0]?.stacktrace?.frames?.[0]).toEqual({
      filename: 'https://example.test/assets/app.js', function: 'login', lineno: 10, colno: 20,
      in_app: undefined,
    });
  });
});
