import { useSearchParams } from "react-router-dom";
import { useTranslations } from "@/i18n";
import { subEnabled } from "@/lib/app-access";
import { supabase } from "@/lib/supabase";
import { useQuery } from "@/lib/use-query";
import { getFormFields, type CustomFieldDef } from "@/lib/custom-fields";
import type {
  BillBook,
  ChargeType,
  Driver,
  Item,
  Party,
  PartyItemRate,
} from "@/lib/types";
import { firmsActive, useTenantSession } from "@/session";
import { ListSkeleton, PageHeader } from "@/components/ui";
import { ChallanForm, type CustLotRow, type LotRow } from "./challan-form";

interface PageData {
  parties: Party[];
  items: Item[];
  drivers: Driver[];
  rates: PartyItemRate[];
  variantsByItem: Map<string, { id: string; name: string; rate: number | null }[]>;
  lots: LotRow[];
  customerLots: CustLotRow[];
  cfDefs: CustomFieldDef[];
  chargeTypes: ChargeType[];
  billBooks: BillBook[];
}

async function loadFormData(
  tenantId: string,
  firmId: string | null,
): Promise<PageData> {
  let itemsQuery = supabase
    .from("rental_items")
    .select("*")
    .is("deleted_at", null)
    .order("name");
  if (firmId) itemsQuery = itemsQuery.eq("firm_id", firmId);

  let variantsQuery = supabase
    .from("rental_item_variants")
    .select("id, item_id, name, default_rate")
    .is("deleted_at", null)
    .order("sort")
    .order("name");
  if (firmId) variantsQuery = variantsQuery.eq("firm_id", firmId);

  // warehouse lots we can issue/give back from (in_hand > 0)
  let lotQuery = supabase
    .from("rental_lot_stock")
    .select("item_id, variant_id, lot_supplier_id, marko, in_hand, borrowed_net")
    .gt("in_hand", 0);
  if (firmId) lotQuery = lotQuery.eq("firm_id", firmId);

  // lots currently out at each customer (for returns)
  let custLotQuery = supabase
    .from("rental_lot_customer_stock")
    .select("party_id, item_id, variant_id, lot_supplier_id, marko, qty_out")
    .gt("qty_out", 0);
  if (firmId) custLotQuery = custLotQuery.eq("firm_id", firmId);

  const [
    { data: parties },
    { data: items },
    { data: drivers },
    { data: rates },
    { data: variantRows },
    { data: lotRows },
    { data: custLotRows },
    cfDefs,
    { data: chargeTypeRows },
    { data: billBookRows },
  ] = await Promise.all([
    supabase.from("rental_parties").select("*").is("deleted_at", null).order("name"),
    itemsQuery,
    supabase.from("rental_drivers").select("*").is("deleted_at", null).order("name"),
    supabase.from("rental_party_item_rates").select("*").is("deleted_at", null),
    variantsQuery,
    lotQuery,
    custLotQuery,
    getFormFields(supabase, "challan", tenantId),
    supabase
      .from("rental_charge_types")
      .select("*")
      .eq("is_active", true)
      .is("deleted_at", null)
      .order("sort"),
    supabase
      .from("rental_bill_books")
      .select("*")
      .eq("is_active", true)
      .is("deleted_at", null)
      .order("sort"),
  ]);

  const partyNameById = new Map(
    (parties ?? []).map((p) => [p.id, (p as { id: string; name: string }).name]),
  );

  // variants for the line variant picker + labels + per-variant rate
  const variantsByItem = new Map<
    string,
    { id: string; name: string; rate: number | null }[]
  >();
  for (const v of (variantRows ?? []) as {
    id: string;
    item_id: string;
    name: string;
    default_rate: number | null;
  }[]) {
    const arr = variantsByItem.get(v.item_id) ?? [];
    arr.push({ id: v.id, name: v.name, rate: v.default_rate });
    variantsByItem.set(v.item_id, arr);
  }

  // warehouse lots (issue / giveback source)
  const lots: LotRow[] = ((lotRows ?? []) as Record<string, unknown>[]).map(
    (r) => ({
      itemId: r.item_id as string,
      variantId: (r.variant_id as string | null) ?? null,
      lotSupplierId: (r.lot_supplier_id as string | null) ?? null,
      supplierName: r.lot_supplier_id
        ? (partyNameById.get(r.lot_supplier_id as string) ?? null)
        : null,
      marko: (r.marko as string) ?? "",
      qty: Number(r.in_hand ?? 0),
      borrowedNet: Number(r.borrowed_net ?? 0),
    }),
  );

  // lots out at customers (return source)
  const customerLots: CustLotRow[] = (
    (custLotRows ?? []) as Record<string, unknown>[]
  ).map((r) => ({
    customerId: r.party_id as string,
    itemId: r.item_id as string,
    variantId: (r.variant_id as string | null) ?? null,
    lotSupplierId: (r.lot_supplier_id as string | null) ?? null,
    supplierName: r.lot_supplier_id
      ? (partyNameById.get(r.lot_supplier_id as string) ?? null)
      : null,
    marko: (r.marko as string) ?? "",
    qty: Number(r.qty_out ?? 0),
  }));

  return {
    parties: (parties as Party[]) ?? [],
    items: (items as Item[]) ?? [],
    drivers: (drivers as Driver[]) ?? [],
    rates: (rates as PartyItemRate[]) ?? [],
    variantsByItem,
    lots,
    customerLots,
    cfDefs,
    chargeTypes: (chargeTypeRows as ChargeType[]) ?? [],
    // books usable in the current firm (firm-specific or shared)
    billBooks: ((billBookRows as BillBook[]) ?? []).filter(
      (b) => !b.firm_id || !firmId || b.firm_id === firmId,
    ),
  };
}

export default function NewChallanPage() {
  const [searchParams] = useSearchParams();
  const type = searchParams.get("type");
  const t = useTranslations("challans");
  const { tenant, firm, access } = useTenantSession();
  const firmId = firmsActive(tenant) ? (firm?.id ?? null) : null;

  const { data, loading } = useQuery(
    () => loadFormData(tenant.id, firmId),
    [tenant.id, firmId],
  );

  const requested =
    type === "return" || type === "borrow" || type === "giveback"
      ? type
      : "issue";
  // admin access matrix can switch off individual challan types
  const allowed = (["issue", "return", "borrow", "giveback"] as const).filter(
    (k) => subEnabled(access, "rental", "challans", k),
  );
  const initialType = allowed.includes(requested)
    ? requested
    : (allowed[0] ?? "issue");

  if (loading || !data) return <ListSkeleton />;

  return (
    <div className="mx-auto max-w-md">
      <PageHeader
        title={initialType === "issue" ? t("newIssue") : t(initialType)}
      />
      <ChallanForm
        parties={data.parties}
        items={data.items}
        drivers={data.drivers}
        partyRates={data.rates}
        initialType={initialType}
        variantsByItem={data.variantsByItem}
        lots={data.lots}
        customerLots={data.customerLots}
        customFields={data.cfDefs}
        chargeTypes={data.chargeTypes}
        billBooks={data.billBooks}
      />
    </div>
  );
}
