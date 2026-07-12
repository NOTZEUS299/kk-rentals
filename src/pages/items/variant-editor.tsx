import { useState, type FormEvent } from "react";
import { useTranslations } from "@/i18n";
import type { ItemVariant } from "@/lib/types";
import { useTenantSession } from "@/session";
import {
  createVariant,
  deleteVariant,
  updateVariant,
} from "@/lib/actions/items";
import { Button, Card, Input, Label } from "@/components/ui";

/**
 * Variant manager shown on the item edit page. Each variant is an
 * independent owned-stock axis (e.g. plate 2ft / 3ft). An item with
 * no variants behaves exactly as before.
 */
export function VariantEditor({
  itemId,
  variants,
  itemUnit,
  onChanged,
}: {
  itemId: string;
  variants: ItemVariant[];
  itemUnit: string;
  onChanged: () => void;
}) {
  const t = useTranslations("items");
  const tc = useTranslations("common");
  const { tenant, firm } = useTenantSession();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (fn: () => Promise<string | null>) => {
    setPending(true);
    setError(null);
    const err = await fn();
    setPending(false);
    if (err) setError(err);
    else onChanged();
    return err;
  };

  const onCreate = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const err = await run(() =>
      createVariant(
        { tenantId: tenant.id, firmId: firm?.id ?? null },
        itemId,
        new FormData(form),
      ),
    );
    if (!err) form.reset();
  };

  const onUpdate = async (
    e: FormEvent<HTMLFormElement>,
    variantId: string,
    oldQty: number,
  ) => {
    e.preventDefault();
    const form = e.currentTarget;
    await run(() => updateVariant(itemId, variantId, oldQty, new FormData(form)));
  };

  return (
    <Card className="mt-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">{t("variants")}</h2>
        <span className="text-xs text-muted">{t("variantsHint")}</span>
      </div>

      {variants.length > 0 && (
        <ul className="space-y-2">
          {variants.map((v) => (
            <li key={v.id}>
              <form
                onSubmit={(e) => void onUpdate(e, v.id, v.total_qty)}
                className="flex flex-wrap items-end gap-2 rounded-app border border-border p-2"
              >
                <div className="min-w-24 flex-1">
                  <Label htmlFor={`vn-${v.id}`}>{t("variantName")}</Label>
                  <Input id={`vn-${v.id}`} name="name" defaultValue={v.name} />
                </div>
                <div className="w-20">
                  <Label htmlFor={`vq-${v.id}`}>{t("totalQty")}</Label>
                  <Input
                    id={`vq-${v.id}`}
                    name="totalQty"
                    type="number"
                    step="any"
                    min="0"
                    defaultValue={v.total_qty}
                  />
                </div>
                <div className="w-20">
                  <Label htmlFor={`vr-${v.id}`}>{t("rate")}</Label>
                  <Input
                    id={`vr-${v.id}`}
                    name="rate"
                    type="number"
                    step="any"
                    min="0"
                    defaultValue={v.default_rate ?? ""}
                    placeholder={t("ruleInherit")}
                  />
                </div>
                <div className="w-20">
                  <Label htmlFor={`vm-${v.id}`}>{t("marko")}</Label>
                  <Input
                    id={`vm-${v.id}`}
                    name="marko"
                    defaultValue={v.marko ?? ""}
                    placeholder={t("markoHint")}
                  />
                </div>
                <Button type="submit" variant="outline" disabled={pending}>
                  {tc("save")}
                </Button>
                <Button
                  type="button"
                  variant="danger"
                  disabled={pending}
                  onClick={() => void run(() => deleteVariant(v.id))}
                >
                  {tc("delete")}
                </Button>
              </form>
            </li>
          ))}
        </ul>
      )}

      {/* add a new variant */}
      <form
        onSubmit={(e) => void onCreate(e)}
        className="flex flex-wrap items-end gap-2 border-t border-border pt-3"
      >
        <div className="min-w-24 flex-1">
          <Label htmlFor="nv-name">{t("variantName")}</Label>
          <Input id="nv-name" name="name" placeholder={itemUnit} required />
        </div>
        <div className="w-20">
          <Label htmlFor="nv-qty">{t("totalQty")}</Label>
          <Input
            id="nv-qty"
            name="totalQty"
            type="number"
            step="any"
            min="0"
            defaultValue={0}
          />
        </div>
        <div className="w-20">
          <Label htmlFor="nv-rate">{t("rate")}</Label>
          <Input
            id="nv-rate"
            name="rate"
            type="number"
            step="any"
            min="0"
            placeholder={t("ruleInherit")}
          />
        </div>
        <div className="w-20">
          <Label htmlFor="nv-marko">{t("marko")}</Label>
          <Input id="nv-marko" name="marko" placeholder={t("markoHint")} />
        </div>
        <Button type="submit" disabled={pending}>
          {pending ? tc("loading") : t("addVariant")}
        </Button>
      </form>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </Card>
  );
}
