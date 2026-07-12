import type { RateRule } from "../types";
import { validateFormula } from "./formula";

/**
 * Parse the fields posted by <RateRuleFields> into a RateRule.
 * Returns { error } when a custom formula fails validation.
 */
export function parseRateRule(formData: FormData): RateRule | { error: string } {
  const type = String(formData.get("ruleType") ?? "per_day");
  switch (type) {
    case "per_month": {
      const daysPerMonth = Number(formData.get("daysPerMonth") ?? 30) || 30;
      return { type: "per_month", daysPerMonth };
    }
    case "min_days": {
      const minDays = Number(formData.get("minDays") ?? 1) || 1;
      return { type: "min_days", minDays };
    }
    case "custom": {
      const formula = String(formData.get("formula") ?? "").trim();
      const problem = validateFormula(formula);
      if (problem) return { error: problem };
      return { type: "custom", formula };
    }
    default:
      return { type: "per_day" };
  }
}
