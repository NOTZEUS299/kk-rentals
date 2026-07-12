import { describe, expect, it } from "vitest";
import {
  chunkRent,
  computeRent,
  rentalDays,
  resolveBillingInfo,
  toMovementType,
  type Movement,
} from "./engine";

const PER_DAY = { rule: { type: "per_day" as const }, defaultRate: 2 };

describe("rentalDays", () => {
  it("counts both ends by default", () => {
    expect(rentalDays("2026-01-01", "2026-01-03")).toBe(3);
  });
  it("same day is one day", () => {
    expect(rentalDays("2026-01-01", "2026-01-01")).toBe(1);
  });
  it("excludes the return day when configured", () => {
    expect(rentalDays("2026-01-01", "2026-01-03", false)).toBe(2);
  });
  it("never goes below one day", () => {
    expect(rentalDays("2026-01-01", "2026-01-01", false)).toBe(1);
  });
});

describe("chunkRent", () => {
  it("per_day", () => {
    expect(chunkRent({ type: "per_day" }, 10, 2, 5)).toBe(100);
  });
  it("per_month prorates by daysPerMonth", () => {
    expect(chunkRent({ type: "per_month", daysPerMonth: 30 }, 10, 300, 15)).toBe(
      1500,
    );
    // default 30 when unset
    expect(chunkRent({ type: "per_month" }, 10, 300, 30)).toBe(3000);
  });
  it("min_days charges the floor", () => {
    expect(chunkRent({ type: "min_days", minDays: 7 }, 1, 10, 3)).toBe(70);
    expect(chunkRent({ type: "min_days", minDays: 7 }, 1, 10, 9)).toBe(90);
  });
  it("custom formula", () => {
    expect(
      chunkRent({ type: "custom", formula: "qty * rate * max(days, 5)" }, 2, 3, 2),
    ).toBe(30);
  });
});

describe("toMovementType", () => {
  it("maps customer flow to receivable", () => {
    expect(toMovementType("issue", "receivable")).toBe("issue");
    expect(toMovementType("return", "receivable")).toBe("return");
    expect(toMovementType("borrow", "receivable")).toBeNull();
    expect(toMovementType("giveback", "receivable")).toBeNull();
  });
  it("maps supplier flow to payable", () => {
    expect(toMovementType("borrow", "payable")).toBe("issue");
    expect(toMovementType("giveback", "payable")).toBe("return");
    expect(toMovementType("issue", "payable")).toBeNull();
  });
});

describe("resolveBillingInfo", () => {
  const item = {
    id: "i1",
    default_rate: 5,
    rate_rule: { type: "min_days", minDays: 7 } as const,
  };
  it("uses item defaults without overrides", () => {
    const info = resolveBillingInfo([item]);
    expect(info.i1.defaultRate).toBe(5);
    expect(info.i1.rule).toEqual({ type: "min_days", minDays: 7 });
  });
  it("party override wins; null fields fall back", () => {
    const info = resolveBillingInfo(
      [item],
      [{ item_id: "i1", rate: 9, rate_rule: null }],
    );
    expect(info.i1.defaultRate).toBe(9);
    expect(info.i1.rule).toEqual({ type: "min_days", minDays: 7 });
  });
  it("missing rule falls back to per_day", () => {
    const info = resolveBillingInfo([{ id: "i2", default_rate: 1, rate_rule: null }]);
    expect(info.i2.rule).toEqual({ type: "per_day" });
  });
});

describe("computeRent", () => {
  it("closes a partial return FIFO and keeps the rest open", () => {
    const movements: Movement[] = [
      { itemId: "i1", type: "issue", date: "2026-01-01", qty: 10, rate: 2 },
      { itemId: "i1", type: "return", date: "2026-01-03", qty: 4, rate: null },
    ];
    const { chunks, total } = computeRent(
      movements,
      { i1: PER_DAY },
      "2026-01-05",
    );
    expect(chunks).toHaveLength(2);
    const closed = chunks.find((c) => !c.open)!;
    expect(closed).toMatchObject({ qty: 4, days: 3, amount: 24 });
    const open = chunks.find((c) => c.open)!;
    expect(open).toMatchObject({ qty: 6, days: 5, amount: 60 });
    expect(total).toBe(84);
  });

  it("matches returns against issues strictly FIFO with per-issue rates", () => {
    const movements: Movement[] = [
      { itemId: "i1", type: "issue", date: "2026-01-01", qty: 5, rate: 2 },
      { itemId: "i1", type: "issue", date: "2026-01-02", qty: 5, rate: 3 },
      { itemId: "i1", type: "return", date: "2026-01-03", qty: 7, rate: null },
    ];
    const { chunks } = computeRent(movements, { i1: PER_DAY }, "2026-01-03");
    const closed = chunks.filter((c) => !c.open);
    expect(closed[0]).toMatchObject({ qty: 5, rate: 2, days: 3, amount: 30 });
    expect(closed[1]).toMatchObject({ qty: 2, rate: 3, days: 2, amount: 12 });
    const open = chunks.find((c) => c.open)!;
    expect(open).toMatchObject({ qty: 3, rate: 3 });
  });

  it("ignores over-returns instead of charging negative rent", () => {
    const movements: Movement[] = [
      { itemId: "i1", type: "issue", date: "2026-01-01", qty: 2, rate: 2 },
      { itemId: "i1", type: "return", date: "2026-01-02", qty: 5, rate: null },
    ];
    const { chunks, total } = computeRent(movements, { i1: PER_DAY }, "2026-01-05");
    expect(chunks).toHaveLength(1);
    expect(chunks[0].qty).toBe(2);
    expect(total).toBe(8); // 2 * 2 * 2 days
  });

  it("falls back to the item default rate when the issue has no snapshot", () => {
    const movements: Movement[] = [
      { itemId: "i1", type: "issue", date: "2026-01-01", qty: 1, rate: null },
    ];
    const { chunks } = computeRent(movements, { i1: PER_DAY }, "2026-01-01");
    expect(chunks[0].rate).toBe(2);
  });

  it("respects countReturnDay=false", () => {
    const movements: Movement[] = [
      { itemId: "i1", type: "issue", date: "2026-01-01", qty: 1, rate: 10 },
      { itemId: "i1", type: "return", date: "2026-01-03", qty: 1, rate: null },
    ];
    const { total } = computeRent(movements, { i1: PER_DAY }, "2026-01-05", {
      countReturnDay: false,
    });
    expect(total).toBe(20); // 2 days instead of 3
  });

  it("processes movements date-sorted regardless of input order", () => {
    const movements: Movement[] = [
      { itemId: "i1", type: "return", date: "2026-01-03", qty: 1, rate: null },
      { itemId: "i1", type: "issue", date: "2026-01-01", qty: 1, rate: 2 },
    ];
    const { chunks } = computeRent(movements, { i1: PER_DAY }, "2026-01-05");
    expect(chunks).toHaveLength(1);
    expect(chunks[0].open).toBe(false);
  });
});
