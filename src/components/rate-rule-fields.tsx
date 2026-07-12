import { useMemo, useRef, useState } from "react";
import { useTranslations } from "@/i18n";
import { evaluateFormula } from "@/lib/billing/formula";
import type { RateRule } from "@/lib/types";
import { Input, Label, Select } from "./ui";

type RuleType = RateRule["type"];

/**
 * Rate-rule picker shared by the item form and the per-party rate
 * form. Posts the same field names the server actions already parse:
 * ruleType, daysPerMonth, minDays, formula.
 *
 * allowInherit adds a "same as item" choice (ruleType="inherit") for
 * party overrides that only change the rate.
 */
export function RateRuleFields({
  initialRule,
  allowInherit = false,
  allowFormula = true,
}: {
  initialRule?: RateRule | null;
  allowInherit?: boolean;
  /** admin feature gate: offer the custom-formula rule */
  allowFormula?: boolean;
}) {
  const t = useTranslations("items");
  const [ruleType, setRuleType] = useState<RuleType | "inherit">(
    initialRule?.type ?? (allowInherit ? "inherit" : "per_day"),
  );
  const rule = initialRule ?? undefined;

  return (
    <>
      <div>
        <Label htmlFor="ruleType">{t("rateRule")}</Label>
        <Select
          id="ruleType"
          name="ruleType"
          value={ruleType}
          onChange={(e) => setRuleType(e.target.value as RuleType | "inherit")}
        >
          {allowInherit && <option value="inherit">{t("ruleInherit")}</option>}
          <option value="per_day">{t("perDay")}</option>
          <option value="per_month">{t("perMonth")}</option>
          <option value="min_days">{t("minDays")}</option>
          {(allowFormula || ruleType === "custom") && (
            <option value="custom">{t("custom")}</option>
          )}
        </Select>
      </div>
      {ruleType === "per_month" && (
        <div>
          <Label htmlFor="daysPerMonth">{t("daysPerMonth")}</Label>
          <Input
            id="daysPerMonth"
            name="daysPerMonth"
            type="number"
            min="1"
            defaultValue={
              rule?.type === "per_month" ? (rule.daysPerMonth ?? 30) : 30
            }
          />
        </div>
      )}
      {ruleType === "min_days" && (
        <div>
          <Label htmlFor="minDays">{t("minDaysValue")}</Label>
          <Input
            id="minDays"
            name="minDays"
            type="number"
            min="1"
            defaultValue={rule?.type === "min_days" ? rule.minDays : 7}
          />
        </div>
      )}
      {ruleType === "custom" && (
        <FormulaEditor
          initialFormula={rule?.type === "custom" ? rule.formula : ""}
        />
      )}
    </>
  );
}

const VARIABLES = ["qty", "rate", "days"] as const;

const EXAMPLES: { labelKey: string; formula: string }[] = [
  { labelKey: "formulaExampleStandard", formula: "qty * rate * days" },
  { labelKey: "formulaExampleMin", formula: "qty * rate * max(days, 5)" },
  {
    labelKey: "formulaExampleHalfAfter",
    formula: "qty * rate * min(days, 7) + qty * rate * 0.5 * max(days - 7, 0)",
  },
];

/**
 * Formula input with tap-to-insert variables, one-tap examples and a
 * live "try it" preview so non-technical users can see what their
 * formula charges before saving.
 */
function FormulaEditor({ initialFormula }: { initialFormula: string }) {
  const t = useTranslations("items");
  const [formula, setFormula] = useState(initialFormula);
  const [sample, setSample] = useState({ qty: "100", rate: "2", days: "10" });
  const inputRef = useRef<HTMLInputElement>(null);

  const insert = (text: string) => {
    const el = inputRef.current;
    const start = el?.selectionStart ?? formula.length;
    const end = el?.selectionEnd ?? formula.length;
    const next = formula.slice(0, start) + text + formula.slice(end);
    setFormula(next);
    // restore focus so several taps compose a formula
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + text.length, start + text.length);
    });
  };

  const preview = useMemo(() => {
    if (!formula.trim()) return null;
    try {
      const result = evaluateFormula(formula, {
        qty: Number(sample.qty) || 0,
        rate: Number(sample.rate) || 0,
        days: Number(sample.days) || 0,
      });
      return { ok: true as const, value: Math.round(result * 100) / 100 };
    } catch (e) {
      return {
        ok: false as const,
        message: e instanceof Error ? e.message : "invalid",
      };
    }
  }, [formula, sample]);

  return (
    <div className="space-y-3">
      <div>
        <Label htmlFor="formula">{t("formula")}</Label>
        <Input
          ref={inputRef}
          id="formula"
          name="formula"
          value={formula}
          onChange={(e) => setFormula(e.target.value)}
          placeholder="qty * rate * days"
          className="font-mono"
          autoComplete="off"
          required
        />
        <div className="mt-2 flex flex-wrap gap-1.5">
          {VARIABLES.map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => insert(v)}
              className="rounded-full border border-border bg-background px-2.5 py-1 font-mono text-xs text-foreground active:bg-primary/10"
            >
              {v}
            </button>
          ))}
          {["+", "-", "*", "/", "min(", "max(", ")"].map((op) => (
            <button
              key={op}
              type="button"
              onClick={() => insert(` ${op} `.replace("( ", "(").replace(" )", ")"))}
              className="rounded-full border border-border bg-background px-2.5 py-1 font-mono text-xs text-muted active:bg-primary/10"
            >
              {op}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-xs text-muted">{t("formulaHint")}</p>
      </div>

      <div>
        <div className="mb-1 text-xs font-medium text-muted">
          {t("formulaExamples")}
        </div>
        <div className="space-y-1.5">
          {EXAMPLES.map((ex) => (
            <button
              key={ex.formula}
              type="button"
              onClick={() => setFormula(ex.formula)}
              className="block w-full rounded-app border border-border bg-background px-3 py-2 text-left active:bg-primary/10"
            >
              <div className="text-xs font-medium">{t(ex.labelKey)}</div>
              <div className="font-mono text-[11px] text-muted">{ex.formula}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-app border border-border bg-background p-3">
        <div className="mb-2 text-xs font-medium text-muted">
          {t("formulaPreview")}
        </div>
        <div className="grid grid-cols-3 gap-2">
          {VARIABLES.map((v) => (
            <div key={v}>
              <label
                htmlFor={`sample-${v}`}
                className="mb-0.5 block font-mono text-[11px] text-muted"
              >
                {v}
              </label>
              <Input
                id={`sample-${v}`}
                type="number"
                step="any"
                inputMode="decimal"
                className="min-h-9 px-2 text-xs"
                value={sample[v]}
                onChange={(e) =>
                  setSample((s) => ({ ...s, [v]: e.target.value }))
                }
              />
            </div>
          ))}
        </div>
        <div className="mt-2 text-sm">
          {preview === null ? (
            <span className="text-muted">—</span>
          ) : preview.ok ? (
            <span className="font-semibold">
              {t("formulaResult")}: ₹{preview.value.toLocaleString("en-IN")}
            </span>
          ) : (
            <span className="text-red-600">{preview.message}</span>
          )}
        </div>
      </div>
    </div>
  );
}
