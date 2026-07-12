import { describe, expect, it } from "vitest";
import { evaluateFormula, validateFormula } from "./formula";

const VARS = { qty: 10, rate: 2, days: 5 };

describe("evaluateFormula", () => {
  it("basic arithmetic with precedence", () => {
    expect(evaluateFormula("1 + 2 * 3", {})).toBe(7);
    expect(evaluateFormula("(1 + 2) * 3", {})).toBe(9);
    expect(evaluateFormula("10 / 4", {})).toBe(2.5);
  });
  it("unary minus", () => {
    expect(evaluateFormula("-3 + 5", {})).toBe(2);
    expect(evaluateFormula("2 * -2", {})).toBe(-4);
  });
  it("variables (case-insensitive)", () => {
    expect(evaluateFormula("qty * rate * days", VARS)).toBe(100);
    expect(evaluateFormula("QTY * Rate", VARS)).toBe(20);
  });
  it("functions incl. multi-arg", () => {
    expect(evaluateFormula("max(days, 7)", VARS)).toBe(7);
    expect(evaluateFormula("min(days, 3, 4)", VARS)).toBe(3);
    expect(evaluateFormula("round(10 / 3)", {})).toBe(3);
    expect(evaluateFormula("ceil(0.1) + floor(1.9) + abs(-1)", {})).toBe(3);
  });
  it("the documented half-rate-after-a-week example", () => {
    const f =
      "qty * rate * min(days, 7) + qty * rate * 0.5 * max(days - 7, 0)";
    expect(evaluateFormula(f, { qty: 1, rate: 10, days: 10 })).toBe(85);
  });

  it("rejects unknown variables", () => {
    expect(() => evaluateFormula("evil", {})).toThrow(/unknown variable/);
  });
  it("rejects unknown functions (no property access, no eval)", () => {
    expect(() => evaluateFormula("constructor(1)", {})).toThrow(
      /unknown function/,
    );
    expect(() => evaluateFormula("eval(1)", {})).toThrow(/unknown function/);
  });
  it("does not leak prototype members as variables", () => {
    expect(() => evaluateFormula("constructor", {})).toThrow(
      /unknown variable/,
    );
    expect(() => evaluateFormula("toString", {})).toThrow(/unknown variable/);
  });
  it("rejects stray characters", () => {
    expect(() => evaluateFormula("1; 2", {})).toThrow(/unexpected character/);
    // '.' outside a number lexes as a malformed number — still rejected
    expect(() => evaluateFormula("a.b", { a: 1, b: 2 })).toThrow(
      /invalid number/,
    );
  });
  it("rejects trailing input and dangling operators", () => {
    expect(() => evaluateFormula("1 2", {})).toThrow(/trailing/);
    expect(() => evaluateFormula("1 +", {})).toThrow(/unexpected end/);
  });
  it("rejects non-finite results (division by zero)", () => {
    expect(() => evaluateFormula("1 / 0", {})).toThrow(/finite/);
  });
});

describe("validateFormula", () => {
  it("null for a valid formula", () => {
    expect(validateFormula("qty * rate * days")).toBeNull();
  });
  it("message for a broken one", () => {
    expect(validateFormula("qty *")).toMatch(/unexpected end/);
  });
});
