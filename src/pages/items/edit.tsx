import { useNavigate, useParams } from "react-router-dom";
import { useTranslations } from "@/i18n";
import { useToast } from "@/components/toast";
import { supabase } from "@/lib/supabase";
import { useQuery } from "@/lib/use-query";
import { getFormFields, type CustomFieldDef } from "@/lib/custom-fields";
import { genMarko } from "@/lib/marko";
import type { Item, ItemVariant, StockEntry } from "@/lib/types";
import { useTenantSession } from "@/session";
import { deleteItem, updateItem } from "@/lib/actions/items";
import {
  ConfirmButton,
  EmptyState,
  ListSkeleton,
  PageHeader,
} from "@/components/ui";
import { ItemForm } from "./item-form";
import { StockCard } from "./stock-card";
import { VariantEditor } from "./variant-editor";

interface PageData {
  item: Item | null;
  variants: ItemVariant[];
  cfDefs: CustomFieldDef[];
  stockEntries: StockEntry[];
}

async function loadItem(tenantId: string, id: string): Promise<PageData> {
  const [cfDefs, { data: item }, { data: variants }, { data: stockEntries }] =
    await Promise.all([
      getFormFields(supabase, "item", tenantId),
      supabase
        .from("rental_items")
        .select("*")
        .eq("id", id)
        .is("deleted_at", null)
        .maybeSingle<Item>(),
      supabase
        .from("rental_item_variants")
        .select("*")
        .eq("item_id", id)
        .is("deleted_at", null)
        .order("sort")
        .order("name"),
      supabase
        .from("rental_stock_entries")
        .select("*")
        .eq("item_id", id)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);
  return {
    item: item ?? null,
    variants: (variants as ItemVariant[]) ?? [],
    cfDefs,
    stockEntries: (stockEntries as StockEntry[]) ?? [],
  };
}

export default function EditItemPage() {
  const { id = "" } = useParams();
  const t = useTranslations("items");
  const tc = useTranslations("common");
  const toast = useToast();
  const { tenant, firm, features } = useTenantSession();
  const navigate = useNavigate();

  const { data, loading, reload } = useQuery(
    () => loadItem(tenant.id, id),
    [tenant.id, id],
  );

  if (loading || !data) return <ListSkeleton />;
  if (!data.item) return <EmptyState message={tc("noData")} />;
  const item = data.item;

  const onUpdate = async (formData: FormData) => {
    const err = await updateItem(tenant.id, item.id, formData);
    if (!err) {
      toast(tc("saved"));
      void navigate("/items");
    }
    return err;
  };

  const onDelete = async () => {
    const err = await deleteItem(item.id);
    if (!err) {
      toast(tc("saved"));
      void navigate("/items");
    }
  };

  return (
    <div className="mx-auto max-w-md">
      <PageHeader title={t("editTitle")} />
      <ItemForm
        item={item}
        onSubmit={onUpdate}
        defaultMarko={genMarko(firm?.name ?? tenant.name)}
        customFields={data.cfDefs}
        hideQty
      />
      <StockCard
        item={item}
        variants={data.variants}
        entries={data.stockEntries}
        onChanged={reload}
      />
      {features.functions.variants && (
        <VariantEditor
          itemId={item.id}
          variants={data.variants}
          itemUnit={item.unit}
          onChanged={reload}
        />
      )}
      <ConfirmButton
        label={tc("delete")}
        confirmLabel={tc("confirmDelete")}
        className="mt-3 w-full"
        onConfirm={() => void onDelete()}
      />
    </div>
  );
}
