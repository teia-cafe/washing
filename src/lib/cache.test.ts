import { describe, expect, it } from "vitest";
import { evictionPlan } from "./cache";

const entry = (path: string, size: number, used: number) => ({ path, size, used });

describe("evictionPlan", () => {
  it("keeps everything while it fits", () => {
    expect(evictionPlan([entry("a", 10, 1), entry("b", 10, 2)], 100)).toEqual([]);
  });

  it("drops the answers used longest ago first, and only as many as needed", () => {
    const entries = [entry("new", 40, 300), entry("old", 40, 100), entry("middle", 40, 200)];
    expect(evictionPlan(entries, 100)).toEqual(["old"]);
  });

  it("drops several when one is not enough", () => {
    const entries = [entry("new", 40, 300), entry("old", 40, 100), entry("middle", 40, 200)];
    expect(evictionPlan(entries, 50)).toEqual(["old", "middle"]);
  });

  it("leaves the store empty when nothing fits", () => {
    const entries = [entry("a", 40, 1), entry("b", 40, 2)];
    expect(evictionPlan(entries, 0)).toEqual(["a", "b"]);
  });
});
