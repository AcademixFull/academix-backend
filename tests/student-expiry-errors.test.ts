import { describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ code: "" }));
vi.mock("../src/config/supabase", () => ({ supabaseAdmin: { rpc: vi.fn(async () => ({ data: null, error: { message: state.code } })) } }));
import { studentRepository } from "../src/repositories/student.repository";
describe("progress access expiry", () => {
  it.each(["SUBSCRIPTION_REQUIRED", "ORGANIZATION_SUBSCRIPTION_REQUIRED"])("returns403 for %s", async (code) => {
    state.code = code;
    await expect(studentRepository.setLessonProgress("user", "lesson", true)).rejects.toMatchObject({ status: 403, code });
  });
});
