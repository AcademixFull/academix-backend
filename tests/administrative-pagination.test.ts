import { describe, expect, it } from "vitest";
import { managedCourseListQuerySchema, userListQuerySchema } from "../src/schemas/administration.schemas";
import { instructorApplicationListQuerySchema } from "../src/schemas/instructor-application.schemas";
import { organizationMemberListQuerySchema } from "../src/schemas/organization.schemas";

describe("bounded administrative list contracts", () => {
  it("preserves institution scope and delivery type as server filters", () => {
    expect(managedCourseListQuerySchema.parse({ scope: "institutional", organizationId: "11111111-1111-4111-8111-111111111111", page: "3", limit: "10" })).toMatchObject({ scope: "institutional", organizationId: "11111111-1111-4111-8111-111111111111", page: 3, limit: 10 });
    expect(userListQuerySchema.parse({ role: "institutional_administrator", active: "false" })).toMatchObject({ role: "institutional_administrator", active: false });
  });
  it("bounds applications and organization members", () => {
    expect(instructorApplicationListQuerySchema.parse({})).toMatchObject({ page: 1, limit: 20 });
    expect(instructorApplicationListQuerySchema.safeParse({ limit: 500 }).success).toBe(false);
    expect(organizationMemberListQuerySchema.parse({ role: "administrator", search: " Ana ", page: "2" })).toMatchObject({ role: "administrator", search: "Ana", page: 2, limit: 20 });
  });
});


it("only accepts whitelisted user ordering", () => {
  expect(userListQuerySchema.parse({ sort: "email", direction: "asc" })).toMatchObject({ sort: "email", direction: "asc" });
  expect(userListQuerySchema.safeParse({ sort: "raw_sql" }).success).toBe(false);
});
