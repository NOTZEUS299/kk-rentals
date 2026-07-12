import { describe, expect, it } from "vitest";
import {
  FUNCTION_KEYS,
  LEDGER_KEYS,
  packFeatures,
  parseFeatures,
} from "./features";

describe("parseFeatures", () => {
  it("defaults everything to enabled / visible", () => {
    const f = parseFeatures({});
    for (const k of FUNCTION_KEYS) expect(f.functions[k]).toBe(true);
    for (const k of LEDGER_KEYS) expect(f.ledgers[k]).toBe(true);
    expect(f.hiddenFields.party).toEqual([]);
  });
  it("tolerates garbage documents", () => {
    expect(parseFeatures(null).functions.charges).toBe(true);
    expect(parseFeatures("junk").ledgers.party).toBe(true);
    expect(parseFeatures([1, 2]).hiddenFields.item).toEqual([]);
  });
  it("only an explicit false disables", () => {
    const f = parseFeatures({ functions: { charges: false, deposits: 0 } });
    expect(f.functions.charges).toBe(false);
    expect(f.functions.deposits).toBe(true);
  });
  it("drops unknown hidden fields", () => {
    const f = parseFeatures({
      hiddenFields: { party: ["phone", "hack", 42], challan: ["driver"] },
    });
    expect(f.hiddenFields.party).toEqual(["phone"]);
    expect(f.hiddenFields.challan).toEqual(["driver"]);
  });
});

describe("packFeatures", () => {
  it("stores only what deviates from the defaults", () => {
    const f = parseFeatures({});
    expect(packFeatures(f)).toEqual({});
  });
  it("round-trips through parseFeatures", () => {
    const original = parseFeatures({
      functions: { borrow: false },
      ledgers: { dayBook: false },
      hiddenFields: { driver: ["license"] },
    });
    const packed = packFeatures(original);
    expect(packed).toEqual({
      functions: { borrow: false },
      ledgers: { dayBook: false },
      hiddenFields: { driver: ["license"] },
    });
    expect(parseFeatures(packed)).toEqual(original);
  });
});
