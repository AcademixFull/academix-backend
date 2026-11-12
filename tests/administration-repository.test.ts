import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ names: [] as string[] }));
vi.mock("../src/config/supabase", () => ({ supabaseAdmin: { from: (table: string) => {
  let name = "";
  const rows = table === "estados_curso" ? [{ nombre: "En revisión" }, { nombre: "Dado de baja por moderación" }]
    : table === "niveles_curso" ? [{ nombre: "Básico" }] : [];
  const result = { data: rows, error: null };
  const builder = {
    select: () => builder, order: () => builder, update: () => builder,
    eq: (column: string, value: string) => { if (column === "nombre") { name = value; mocks.names.push(value); } return builder; },
    maybeSingle: () => Promise.resolve({ data: table === "estados_curso" && name === "En revisión" ? {id_estado_curso: 2} : null, error: null }),
    range: () => Promise.resolve({ data: [], count: 0, error: null }),
    then: (resolve: (value: object) => unknown) => Promise.resolve(result).then(resolve),
  };
  return builder;
} } }));

import { administrationRepository } from "../src/repositories/administration.repository";

describe("stored Spanish course vocabulary", () => {
  it("recognizes persisted review and moderation states", async () => {
    const options = await administrationRepository.courseOptions();
    expect(options.statuses).toEqual([
      {value: "review", label: "En revisión"},
      {value: "moderated", label: "Dado de baja por moderación"},
    ]);
  });
  it("filters courses using the existing accented lookup name", async () => {
    await expect(administrationRepository.listCourses({ status: "review", page: 1, limit: 20 })).resolves.toEqual({records: [], total: 0});
    expect(mocks.names).toContain("En revisión");
  });
});
