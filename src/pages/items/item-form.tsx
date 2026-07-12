import { useState, type FormEvent } from "react";
import { useTranslations } from "@/i18n";
import type { Item } from "@/lib/types";
import type { CustomFieldDef } from "@/lib/custom-fields";
import { useTenantSession } from "@/session";
import { CustomFieldInputs } from "@/components/custom-fields";
import { RateRuleFields } from "@/components/rate-rule-fields";
import { Button, Card, Input, Label } from "@/components/ui";

export function ItemForm({
  item,
  onSubmit,
  defaultMarko,
  customFields = [],
  hideQty = false,
}: {
  item?: Item;
  /** returns an error message or null on success */
  onSubmit: (formData: FormData) => Promise<string | null>;
  /** suggested owned-stock mark for a new item (business/firm based) */
  defaultMarko?: string;
  /** admin-defined extra fields for this tenant */
  customFields?: CustomFieldDef[];
  /** edit mode: owned qty moves only through stock entries */
  hideQty?: boolean;
}) {
  const t = useTranslations("items");
  const tc = useTranslations("common");
  const { features } = useTenantSession();
  const hidden = new Set(features.hiddenFields.item);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setPending(true);
    setError(null);
    const err = await onSubmit(new FormData(e.currentTarget));
    setPending(false);
    if (err) setError(err);
  };

  return (
    <Card>
      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
        <div>
          <Label htmlFor="name">{t("name")}</Label>
          <Input id="name" name="name" defaultValue={item?.name ?? ""} required />
        </div>
        <div className="grid grid-cols-2 gap-3">
          {!hidden.has("unit") && (
            <div>
              <Label htmlFor="unit">{t("unit")}</Label>
              <Input id="unit" name="unit" defaultValue={item?.unit ?? "pcs"} />
            </div>
          )}
          {!hideQty && (
            <div>
              <Label htmlFor="totalQty">{t("totalQty")}</Label>
              <Input
                id="totalQty"
                name="totalQty"
                type="number"
                step="any"
                min="0"
                defaultValue={item?.total_qty ?? 0}
              />
            </div>
          )}
        </div>
        {!hidden.has("marko") && (
          <div>
            <Label htmlFor="marko">{t("marko")}</Label>
            <Input
              id="marko"
              name="marko"
              defaultValue={item?.marko ?? defaultMarko ?? ""}
              placeholder={t("markoHint")}
            />
          </div>
        )}
        <div>
          <Label htmlFor="rate">{t("rate")}</Label>
          <Input
            id="rate"
            name="rate"
            type="number"
            step="any"
            min="0"
            defaultValue={item?.default_rate ?? 0}
            required
          />
        </div>
        {!hidden.has("rateRule") && (
          <RateRuleFields
            initialRule={item?.rate_rule}
            allowFormula={features.functions.formulaBilling}
          />
        )}
        {features.functions.customFields && (
          <CustomFieldInputs fields={customFields} values={item?.custom_fields} />
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? tc("loading") : tc("save")}
        </Button>
      </form>
    </Card>
  );
}
