import request from "supertest";
import { beforeEach, expect, it, vi } from "vitest";
vi.mock("../src/services/auth.service", () => ({ authService: { verifyAccessToken: vi.fn() } }));
vi.mock("../src/services/account-deletion.runtime", () => ({ accountDeletionService: { get: vi.fn(), request: vi.fn(), cancel: vi.fn() } }));
import { createApp } from "../src/app";
import { authService } from "../src/services/auth.service";
import { accountDeletionService } from "../src/services/account-deletion.runtime";
const app=createApp(); const user={ id:"11111111-1111-4111-8111-111111111111",email:"user@example.test",fullName:"Test",role:"student" as const };
beforeEach(() => { vi.clearAllMocks(); vi.mocked(authService.verifyAccessToken).mockResolvedValue(user); });
it("requires an authenticated account",async () => {
  expect((await request(app).post('/api/v1/users/me/deletion').send({})).status).toBe(401);
  expect(accountDeletionService.request).not.toHaveBeenCalled();
});
it("requires password, explicit confirmation, and rejects client-supplied identities",async () => {
  for(const body of [{password:'pw'},{password:'pw',confirmation:'ELIMINAR MI CUENTA',userId:'other'}]) {
    expect((await request(app).post('/api/v1/users/me/deletion').set('Authorization','Bearer token').send(body)).status).toBe(422);
  }
  expect(accountDeletionService.request).not.toHaveBeenCalled();
});
it("uses the server verified identity and disables response caching",async () => {
  vi.mocked(accountDeletionService.request).mockResolvedValue({ id:'r',userId:user.id,requestedAt:'2026-01-01T00:00:00Z',deleteAfter:'2026-01-11T00:00:00Z',status:'pending' });
  const result=await request(app).post('/api/v1/users/me/deletion').set('Authorization','Bearer token').send({password:'pw',confirmation:'ELIMINAR MI CUENTA'});
  expect(result.status).toBe(201); expect(result.headers['cache-control']).toBe('no-store');
  expect(accountDeletionService.request).toHaveBeenCalledWith(user,'pw');
});
it("cancels only for the current account",async () => {
  expect((await request(app).delete('/api/v1/users/me/deletion').set('Authorization','Bearer token')).status).toBe(200);
  expect(accountDeletionService.cancel).toHaveBeenCalledWith(user.id);
});
