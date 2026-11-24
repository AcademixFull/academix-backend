import { describe, expect, it } from "vitest";
import { BoundedCache } from "../src/utils/bounded-cache";

describe("public response cache", () => {
  it("deduplicates concurrent reads, expires entries and evicts least recently used values", async () => {
    let now = 0; let reads = 0;
    const cache = new BoundedCache(2, 100, () => now);
    const load = async () => ++reads;
    expect(await Promise.all([cache.get("a", load), cache.get("a", load)])).toEqual([1, 1]);
    await cache.get("b", load); await cache.get("a", load); await cache.get("c", load);
    expect(await cache.get("a", load)).toBe(1);
    expect(await cache.get("b", load)).toBe(4);
    now = 101;
    expect(await cache.get("b", load)).toBe(5);
    expect(cache.size).toBeLessThanOrEqual(2);
  });
  it("does not restore old data when a mutation invalidates an in-flight response", async () => {
    const cache = new BoundedCache(2, 100);
    let finish!: (value: string) => void;
    const old = cache.get("featured", () => new Promise<string>((resolve) => { finish = resolve; }));
    await Promise.resolve(); cache.clear(); finish("old");
    expect(await old).toBe("old");
    expect(await cache.get("featured", async () => "new")).toBe("new");
  });
});
