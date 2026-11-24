import { describe, expect, it } from "vitest";
import { parseFrontendOrigins } from "../src/config/env";

describe("parseFrontendOrigins", () => {
  it("acepta uno o varios orígenes y elimina duplicados", () => {
    expect(
      parseFrontendOrigins(
        "http://localhost:5173, https://marco.github.io/,http://localhost:5173"
      )
    ).toEqual(["http://localhost:5173", "https://marco.github.io"]);
  });

  it("rechaza listas vacías o URLs inválidas", () => {
    expect(() => parseFrontendOrigins(" ")).toThrow(/URL/i);
    expect(() => parseFrontendOrigins("localhost:5173")).toThrow(/URL/i);
  });
});
