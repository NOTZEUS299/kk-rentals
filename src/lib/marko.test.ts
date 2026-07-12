import { describe, expect, it } from "vitest";
import { genMarko } from "./marko";

describe("genMarko", () => {
  it("initials for multi-word names (max three)", () => {
    expect(genMarko("Ramesh Construction")).toBe("RC");
    expect(genMarko("Shree Ram Traders Pvt")).toBe("SRT");
  });
  it("first three letters for single words", () => {
    expect(genMarko("Shah")).toBe("SHA");
  });
  it("empty-ish input gives empty mark", () => {
    expect(genMarko("")).toBe("");
    expect(genMarko("   ")).toBe("");
    expect(genMarko(null)).toBe("");
    expect(genMarko(undefined)).toBe("");
  });
});
