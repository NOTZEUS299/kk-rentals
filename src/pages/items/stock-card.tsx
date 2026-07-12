import { useState, type FormEvent } from "react";
import { useLocale, useTranslations } from "@/i18n";
import { fmtDate, fmtMoney } from "@/lib/format";
import type { Item, ItemVariant, StockEntry } from "@/lib/types";
import { adjustStock } from "@/lib/actions/items";
import { Button, Card, Input, Label, Select } from "@/components/ui";

const KIND_COLOR: Record<StockEntry["kind"], string> = {
  add: "text-emerald-700",
  initial: "text-emerald-700",
  correction: "text-amber-600",
  remove: "text-red-600",
  writeoff: "text-red-600",
};

/**
 * Owned-stock manager on the item edit page: current qty, an
 * add/remove form (with purchase price) and the audit history.
 * All changes go through the adjust_stock RPC.
 */
export function StockCard({
  item,
  variants,
  entries,
  onChanged,
}: {
  item: Item;
  variants: ItemVariant[];
  entries: StockEntry[];
  onChanged: () => void;
}) {
  const t = useTranslations("items");
  const tc = useTranslations("common");
  const locale = useLocale();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const variantName = (id: string | null) =>
    id ? (variants.find((v) => v.id === id)?.name ?? "?") : null;

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const qty = Number(fd.get("qty") ?? 0);
    const direction = String(fd.get("direction") ?? "add");
    const priceRaw = String(fd.get("price") ?? "").trim();
    if (!(qty > 0)) return;
    setPending(true);
    setError(null);
    const err = await adjustStock({
      itemId: item.id,
      variantId: String(fd.get("variantId") ?? "") || null,
      delta: direction === "remove" ? -qty : qty,
      kind: direction === "remove" ? "remove" : "add",
      unitPrice: priceRaw === "" ? null : Number(priceRaw),
      notes: String(fd.get("notes") ?? "").trim() || null,
    });
    setPending(false);
    if (err) setError(err);
    else {
      form.reset();
      onChanged();
    }
  };

  return (
    <Card className="mt-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">{t("stock")}</h2>
        <span className="text-sm font-bold">
          {item.total_qty +
            variants.reduce((s, v) => s + Number(v.total_qty), 0)}{" "}
          {item.unit}
        </span>
      </div>

      {/* add / remove stock with purchase price */}
      <form
        onSubmit={(e) => void onSubmit(e)}
        className="flex flex-wrap items-end gap-2 border-t border-border pt-3"
      >
        <div className="w-24">
          <Label htmlFor="st-dir">{t("stockDirection")}</Label>
          <Select id="st-dir" name="direction" defaultValue="add">
            <option value="add">{t("stockAdd")}</option>
            <option value="remove">{t("stockRemove")}</option>
          </Select>
        </div>
        {variants.length > 0 && (
          <div className="w-28">
            <Label htmlFor="st-var">{t("variant")}</Label>
            <Select id="st-var" name="variantId" defaultValue="">
              <option value="">{t("baseVariant")}</option>
              {variants.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </Select>
          </div>
        )}
        <div className="w-20">
          <Label htmlFor="st-qty">{t("qty")}</Label>
          <Input
            id="st-qty"
            name="qty"
            type="number"
            step="any"
            min="0"
            inputMode="decimal"
            required
          />
        </div>
        <div className="w-24">
          <Label htmlFor="st-price">{t("unitPrice")}</Label>
          <Input
            id="st-price"
            name="price"
            type="number"
            step="any"
            min="0"
            inputMode="decimal"
            placeholder="₹"
          />
        </div>
        <div className="min-w-24 flex-1">
          <Label htmlFor="st-notes">{tc("notes")}</Label>
          <Input id="st-notes" name="notes" />
        </div>
        <Button type="submit" disabled={pending}>
          {pending ? tc("loading") : tc("save")}
        </Button>
      </form>
      {error && <p className="text-xs text-red-600">{error}</p>}

      {/* audit history */}
      {entries.length > 0 && (
        <div className="space-y-1 border-t border-border pt-3">
          <h3 className="text-xs font-medium text-muted">
            {t("stockHistory")}
          </h3>
          {entries.map((en) => (
            <div
              key={en.id}
              className="flex items-center justify-between text-xs"
            >
              <span className="text-muted">
                {fmtDate(en.created_at, locale)} · {t(`stock_${en.kind}`)}
                {variantName(en.variant_id) && (
                  <> · {variantName(en.variant_id)}</>
                )}
                {en.unit_price != null && (
                  <> · {fmtMoney(Number(en.unit_price))}/{item.unit}</>
                )}
                {en.notes && <> · {en.notes}</>}
              </span>
              <span className={`font-semibold ${KIND_COLOR[en.kind]}`}>
                {Number(en.qty_delta) > 0 ? "+" : ""}
                {Number(en.qty_delta)}
              </span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
