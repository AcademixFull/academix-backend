import express from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '../src/errors/app-error';
vi.mock('../src/monitoring/instrument', () => ({ reportServerError: vi.fn() }));
import { reportServerError } from '../src/monitoring/instrument';
import { errorHandler } from '../src/middleware/error-handler';

afterEach(() => vi.restoreAllMocks());
describe('server error monitoring', () => {
  it.each([400, 401, 403, 404, 422, 500, 503])('reports only server failures: %s', async status => {
    vi.mocked(reportServerError).mockClear();
    const error = new AppError(status, 'TEST', 'Test');
    const app = express();
    app.get('/', (_req, _res, next) => next(error));
    app.use(errorHandler);
    expect((await request(app).get('/')).status).toBe(status);
    expect(reportServerError).toHaveBeenCalledTimes(status >= 500 ? 1 : 0);
  });
  it('captures unexpected failures and keeps the public response generic', async () => {
    vi.mocked(reportServerError).mockClear();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const error = new Error('private provider detail');
    const app = express();
    app.get('/', (_req, _res, next) => next(error));
    app.use(errorHandler);
    const response = await request(app).get('/');
    expect(response.status).toBe(500);
    expect(reportServerError).toHaveBeenCalledWith(error);
    expect(JSON.stringify(response.body)).not.toContain('private provider detail');
  });
});
