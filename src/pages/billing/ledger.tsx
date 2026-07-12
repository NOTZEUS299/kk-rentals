import { useRef, useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";
import { useLocale, useTranslations } from "@/i18n";
import {
  computeRent,
  resolveBillingInfo,
  toMovementType,
  type Movement,
  type RentChunk,
} from "@/lib/billing/engine";
import { CHALLAN_BADGE } from "@/lib/challan-badge";
import { getFormFields, type CustomFieldDef } from "@/lib/custom-fields";
import { fmtDate, fmtMoney, todayISO } from "@/lib/format";
import { downloadNodeAsJpeg, fileSlug } from "@/lib/jpeg";
import { supabase } from "@/lib/supabase";
import { useQuery } from "@/lib/use-query";
import type {
  Challan,
  ChallanLine,
  Deposit,
  Item,
  Party,
  PartyItemRate,
  Payment,
} from "@/lib/types";
import { firmsActive, useTenantSession } from "@/session";
import { addPayment } from "@/lib/actions/payments";
import { addDeposit, resolveDeposit } from "@/lib/actions/deposits";
import { CustomFieldInputs } from "@/components/custom-fields";
import { Icon } from "@/components/icons";
import { useToast } from "@/components/toast";
import {
  StatementTemplate,
  type StatementChunk,
} from "@/components/statement-template";
import {
  Button,
  Card,
  EmptyState,
  Input,
  Label,
  ListSkeleton,
  PageHeader,
  Select,
} from "@/components/ui";

type ChallanWithLines = Challan & { challan_lines: ChallanLine[] };

interface LedgerData {
  party: Party | null;
  challans: ChallanWithLines[];
  payments: Payment[];
  items: Item[];
  partyRates: PartyItemRate[];
  totalOutRows: { item_id: string; qty_out: number }[];
  cfDefs: CustomFieldDef[];
  chargeRows: { amount: number; challans: { type: string } | null }[];
  deposits: Deposit[];
}

async function loadLedger(
  tenantId: string,
  firmId: string | null,
  partyId: string,
): Promise<LedgerData> {
  let challansQuery = supabase
    .from("rental_challans")
    .select("*, challan_lines:rental_challan_lines(*)")
    .eq("party_id", partyId)
    .is("deleted_at", null)
    .order("challan_date");
  let paymentsQuery = supabase
    .from("rental_payments")
    .select("*")
    .eq("party_id", partyId)
    .is("deleted_at", null)
    .order("payment_date", { ascending: false });
  let itemsQuery = supabase.from("rental_items").select("*").is("deleted_at", null);
  if (firmId) {
    challansQuery = challansQuery.eq("firm_id", firmId);
    paymentsQuery = paymentsQuery.eq("firm_id", firmId);
    itemsQuery = itemsQuery.eq("firm_id", firmId);
  }

  // extra fees on this party's challans (join filters by party + firm)
  let chargesQuery = supabase
    .from("rental_challan_charges")
    .select("amount, challans:rental_challans!inner(party_id, type, firm_id)")
    .eq("challans.party_id", partyId)
    .is("deleted_at", null);
  if (firmId) chargesQuery = chargesQuery.eq("challans.firm_id", firmId);

  let depositsQuery = supabase
    .from("rental_deposits")
    .select("*")
    .eq("party_id", partyId)
    .is("deleted_at", null)
    .order("received_date", { ascending: false });
  if (firmId) depositsQuery = depositsQuery.eq("firm_id", firmId);

  const [
    { data: party },
    { data: challans },
    { data: payments },
    { data: items },
    { data: partyRates },
    { data: totalOutRows },
    cfDefs,
    { data: chargeRows },
    { data: depositRows },
  ] = await Promise.all([
    supabase.from("rental_parties").select("*").eq("id", partyId).maybeSingle<Party>(),
    challansQuery,
    paymentsQuery,
    itemsQuery,
    supabase
      .from("rental_party_item_rates")
      .select("*")
      .eq("party_id", partyId)
      .is("deleted_at", null),
    // total stock currently at all customers (for supplier field-stock calc)
    supabase.from("rental_outstanding_lines").select("item_id, qty_out"),
    getFormFields(supabase, "payment", tenantId),
    chargesQuery,
    depositsQuery,
  ]);

  return {
    party: party ?? null,
    challans: (challans as ChallanWithLines[]) ?? [],
    payments: (payments as Payment[]) ?? [],
    items: (items as Item[]) ?? [],
    partyRates: (partyRates as PartyItemRate[]) ?? [],
    totalOutRows:
      (totalOutRows as { item_id: string; qty_out: number }[]) ?? [],
    cfDefs,
    chargeRows:
      (chargeRows as unknown as LedgerData["chargeRows"]) ?? [],
    deposits: (depositRows as Deposit[]) ?? [],
  };
}

export default function LedgerPage() {
  const { partyId = "" } = useParams();
  const locale = useLocale();
  const t = useTranslations("billing");
  const tc = useTranslations("common");
  const tch = useTranslations("challans");
  const { tenant, firm, userId, features } = useTenantSession();
  // bills are separated per firm when a firm mode is active
  const firmId = firmsActive(tenant) ? (firm?.id ?? null) : null;
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();
  const statementRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);

  const { data, loading, reload } = useQuery(
    () => loadLedger(tenant.id, firmId, partyId),
    [tenant.id, firmId, partyId],
  );

  if (loading || !data) return <ListSkeleton />;
  if (!data.party) return <EmptyState message={tc("noData")} />;
  const { party, challans, payments, items, partyRates, totalOutRows, cfDefs } =
    data;

  const itemMap = new Map(items.map((i) => [i.id, i]));

  // Aggregate total out per item across all customers (scoped to the
  // firm's items when a firm mode is active — itemMap holds only those)
  const totalOutByItem = new Map<string, number>();
  for (const row of totalOutRows) {
    if (firmId && !itemMap.has(row.item_id)) continue;
    totalOutByItem.set(
      row.item_id,
      (totalOutByItem.get(row.item_id) ?? 0) + Number(row.qty_out ?? 0),
    );
  }
  // this party's overrides (rate and/or rule) win over item defaults
  const billingInfo = resolveBillingInfo(items, partyRates);

  // split the challan stream into what they owe us (issue/return)
  // and what we owe them (borrow/giveback)
  const receivable: Movement[] = [];
  const payable: Movement[] = [];
  for (const ch of challans) {
    for (const line of ch.challan_lines) {
      if (line.deleted_at) continue;
      const base = {
        itemId: line.item_id,
        date: ch.challan_date,
        qty: Number(line.qty),
        rate: line.rate === null ? null : Number(line.rate),
      };
      const recvType = toMovementType(ch.type, "receivable");
      if (recvType) receivable.push({ ...base, type: recvType });
      const payType = toMovementType(ch.type, "payable");
      if (payType) payable.push({ ...base, type: payType });
    }
  }

  const countReturnDay = tenant.settings?.billing?.countReturnDay ?? true;
  const asOf = todayISO();
  const rentRecv = computeRent(receivable, billingInfo, asOf, { countReturnDay });
  const rentPay = computeRent(payable, billingInfo, asOf, { countReturnDay });

  let received = 0;
  let paidOut = 0;
  for (const p of payments) {
    const amount = Number(p.amount);
    if (p.type === "receipt") received += amount;
    else if (p.type === "refund") received -= amount;
    else paidOut += amount;
  }

  // deposits: held = liability we keep aside; adjusted = kept against
  // dues, so it counts like money received
  let depositsHeld = 0;
  for (const d of data.deposits) {
    const amount = Number(d.amount);
    if (d.status === "held") depositsHeld += amount;
    else if (d.status === "adjusted") received += amount;
  }

  // extra fees split like the rent: customer challans are receivable,
  // supplier challans are payable
  let chargesRecv = 0;
  let chargesPay = 0;
  for (const row of data.chargeRows) {
    const chType = row.challans?.type;
    if (chType === "issue" || chType === "return")
      chargesRecv += Number(row.amount);
    else if (chType === "borrow" || chType === "giveback")
      chargesPay += Number(row.amount);
  }

  const showCustomer = party.kind !== "supplier" || receivable.length > 0;
  const showSupplier = party.kind !== "customer" || payable.length > 0;

  const openRecv = rentRecv.chunks.filter((c) => c.open);
  const openPay = rentPay.chunks.filter((c) => c.open);

  const onAddPayment = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    setPending(true);
    setError(null);
    const err = await addPayment({
      tenantId: tenant.id,
      firmId: firm?.id ?? null,
      userId,
      partyId: party.id,
      formData: new FormData(form),
    });
    setPending(false);
    if (err) setError(err);
    else {
      form.reset();
      reload();
    }
  };

  const chunkRow = (chunk: RentChunk, i: number) => (
    <Card key={i} className="flex items-center justify-between">
      <div>
        <div className="text-sm font-medium">
          {itemMap.get(chunk.itemId)?.name ?? "?"} × {chunk.qty}
        </div>
        <div className="text-xs text-muted">
          {t("from")} {fmtDate(chunk.from, locale)} · {chunk.days} {t("days")} ·{" "}
          {fmtMoney(chunk.rate)}
        </div>
      </div>
      <div className="text-sm font-semibold">{fmtMoney(chunk.amount)}</div>
    </Card>
  );

  // Field-stock breakdown rows (supplier view)
  const fieldStockRows = (() => {
    if (!showSupplier || openPay.length === 0) return [];
    const borrowedByItem = new Map<string, number>();
    for (const chunk of openPay) {
      borrowedByItem.set(
        chunk.itemId,
        (borrowedByItem.get(chunk.itemId) ?? 0) + chunk.qty,
      );
    }
    const rows: { itemName: string; atCustomers: number; inYard: number }[] = [];
    for (const [itemId, borrowedQty] of borrowedByItem) {
      const totalOut = totalOutByItem.get(itemId) ?? 0;
      const atCustomers = Math.min(borrowedQty, totalOut);
      const inYard = borrowedQty - atCustomers;
      rows.push({
        itemName: itemMap.get(itemId)?.name ?? "?",
        atCustomers,
        inYard,
      });
    }
    return rows;
  })();

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      {/* letterhead only on the printed statement */}
      <div className="hidden print:block">
        <div className="text-lg font-bold">{firm?.name ?? tenant.name}</div>
        <div className="text-sm">
          {party.name}
          {party.phone && <> · {party.phone}</>}
        </div>
        <div className="text-xs">{fmtDate(asOf, locale)}</div>
        <hr className="my-2" />
      </div>

      <PageHeader title={`${t("ledger")} — ${party.name}`} />

      <div className="flex gap-2 print:hidden">
        <button
          type="button"
          onClick={() => window.print()}
          className="flex min-h-10 flex-1 items-center justify-center gap-2 rounded-app border border-border bg-card text-sm font-medium hover:bg-background"
        >
          🖨 {t("printStatement")}
        </button>
        <button
          type="button"
          disabled={downloading}
          onClick={() => {
            if (!statementRef.current || downloading) return;
            setDownloading(true);
            downloadNodeAsJpeg(
              statementRef.current,
              fileSlug(`${party.name}_${t("ledger")}_${asOf}`),
            )
              .catch(() => toast(tc("downloadFailed"), "error"))
              .finally(() => setDownloading(false));
          }}
          className="flex min-h-10 flex-1 items-center justify-center gap-2 rounded-app border border-border bg-card text-sm font-medium hover:bg-background disabled:opacity-50"
        >
          <Icon name="download" className="h-4 w-4" />
          {downloading ? tc("loading") : t("downloadStatement")}
        </button>
      </div>

      {/* off-screen statement for JPEG capture */}
      <div className="fixed left-[-10000px] top-0 print:hidden" aria-hidden>
        <div ref={statementRef}>
          <StatementTemplate
            partyName={party.name}
            partyPhone={party.phone}
            asOf={asOf}
            customer={
              showCustomer
                ? {
                    rent: rentRecv.total,
                    charges: chargesRecv,
                    paid: received,
                    balance: rentRecv.total + chargesRecv - received,
                  }
                : null
            }
            supplier={
              showSupplier
                ? {
                    rent: rentPay.total,
                    charges: chargesPay,
                    paid: paidOut,
                    balance: rentPay.total + chargesPay - paidOut,
                  }
                : null
            }
            openRows={[...openRecv, ...openPay].map(
              (c): StatementChunk => ({
                itemName: itemMap.get(c.itemId)?.name ?? "?",
                qty: c.qty,
                from: c.from,
                days: c.days,
                rate: c.rate,
                amount: c.amount,
              }),
            )}
            challans={challans
              .slice()
              .reverse()
              .slice(0, 15)
              .map((ch) => ({
                id: ch.id,
                type: ch.type,
                challan_no: ch.challan_no,
                challan_date: ch.challan_date,
                summary: ch.challan_lines
                  .filter((l) => !l.deleted_at)
                  .map(
                    (l) =>
                      `${itemMap.get(l.item_id)?.name ?? "?"} × ${Number(l.qty)}`,
                  )
                  .join(", "),
              }))}
          />
        </div>
      </div>

      {showCustomer && (
        <div className="grid grid-cols-3 gap-3">
          <Card className="text-center">
            <div className="text-lg font-bold">{fmtMoney(rentRecv.total)}</div>
            <div className="text-xs text-muted">{t("rent")}</div>
            {chargesRecv > 0 && (
              <div className="text-[11px] text-muted">
                + {fmtMoney(chargesRecv)} {t("charges")}
              </div>
            )}
          </Card>
          <Card className="text-center">
            <div className="text-lg font-bold text-emerald-700">
              {fmtMoney(received)}
            </div>
            <div className="text-xs text-muted">{t("received")}</div>
          </Card>
          <Card className="text-center">
            <div
              className={`text-lg font-bold ${rentRecv.total + chargesRecv - received > 0 ? "text-red-600" : "text-emerald-700"}`}
            >
              {fmtMoney(rentRecv.total + chargesRecv - received)}
            </div>
            <div className="text-xs text-muted">{t("balance")}</div>
          </Card>
        </div>
      )}

      {showSupplier && (
        <div className="grid grid-cols-3 gap-3">
          <Card className="text-center">
            <div className="text-lg font-bold">{fmtMoney(rentPay.total)}</div>
            <div className="text-xs text-muted">{t("payable")}</div>
            {chargesPay > 0 && (
              <div className="text-[11px] text-muted">
                + {fmtMoney(chargesPay)} {t("charges")}
              </div>
            )}
          </Card>
          <Card className="text-center">
            <div className="text-lg font-bold text-emerald-700">
              {fmtMoney(paidOut)}
            </div>
            <div className="text-xs text-muted">{t("paidOut")}</div>
          </Card>
          <Card className="text-center">
            <div
              className={`text-lg font-bold ${rentPay.total + chargesPay - paidOut > 0 ? "text-red-600" : "text-emerald-700"}`}
            >
              {fmtMoney(rentPay.total + chargesPay - paidOut)}
            </div>
            <div className="text-xs text-muted">{t("toPay")}</div>
          </Card>
        </div>
      )}

      {showCustomer && (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-muted">
            {t("outstanding")}
          </h2>
          {openRecv.length === 0 ? (
            <EmptyState message={tc("noData")} />
          ) : (
            <div className="space-y-2">{openRecv.map(chunkRow)}</div>
          )}
        </section>
      )}

      {showSupplier && openPay.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-muted">
            {t("borrowed")}
          </h2>
          <div className="space-y-2">{openPay.map(chunkRow)}</div>
        </section>
      )}

      {/* Field-stock breakdown: how much of this supplier's borrowed stock
          is currently at customer sites vs still in our yard */}
      {fieldStockRows.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-muted">
            {t("fieldStock")}
          </h2>
          <div className="space-y-2">
            {fieldStockRows.map((r) => (
              <Card key={r.itemName} className="flex items-center justify-between">
                <div className="text-sm font-medium">{r.itemName}</div>
                <div className="flex gap-4 text-xs">
                  {r.atCustomers > 0 && (
                    <span className="text-orange-600">
                      {r.atCustomers} at customers
                    </span>
                  )}
                  {r.inYard > 0 && (
                    <span className="text-muted">{r.inYard} in yard</span>
                  )}
                </div>
              </Card>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-2 text-sm font-semibold text-muted">{tch("title")}</h2>
        {challans.length === 0 ? (
          <EmptyState message={tc("noData")} />
        ) : (
          <div className="space-y-2">
            {challans
              .slice()
              .reverse()
              .map((ch) => (
                <Card key={ch.id} className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium">{ch.challan_no}</div>
                    <div className="text-xs text-muted">
                      {fmtDate(ch.challan_date, locale)} ·{" "}
                      {ch.challan_lines
                        .filter((l) => !l.deleted_at)
                        .map(
                          (l) =>
                            `${itemMap.get(l.item_id)?.name ?? "?"} × ${Number(l.qty)}`,
                        )
                        .join(", ")}
                    </div>
                  </div>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${CHALLAN_BADGE[ch.type] ?? CHALLAN_BADGE.issue}`}
                  >
                    {tch(ch.type)}
                  </span>
                </Card>
              ))}
          </div>
        )}
      </section>

      {features.functions.deposits && (
      <section>
        <h2 className="mb-2 text-sm font-semibold text-muted">
          {t("deposits")}
        </h2>
        {depositsHeld > 0 && (
          <Card className="mb-2 flex items-center justify-between">
            <span className="text-sm text-muted">{t("depositHeld")}</span>
            <span className="text-sm font-bold">{fmtMoney(depositsHeld)}</span>
          </Card>
        )}
        {data.deposits.length > 0 && (
          <div className="mb-2 space-y-2">
            {data.deposits.map((d) => (
              <Card key={d.id} className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium">
                    {fmtMoney(Number(d.amount))}
                    <span
                      className={`ml-2 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        d.status === "held"
                          ? "bg-amber-100 text-amber-800"
                          : d.status === "adjusted"
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-gray-100 text-gray-700"
                      }`}
                    >
                      {t(`dep_${d.status}`)}
                    </span>
                  </div>
                  <div className="text-xs text-muted">
                    {fmtDate(d.received_date, locale)} · {t(d.method)}
                    {d.notes && <> · {d.notes}</>}
                  </div>
                </div>
                {d.status === "held" && (
                  <div className="flex gap-1 print:hidden">
                    <button
                      type="button"
                      className="min-h-9 rounded-app border border-border px-2 text-xs text-muted hover:text-foreground"
                      onClick={() =>
                        void resolveDeposit(d.id, "refunded").then((err) => {
                          if (err) setError(err);
                          else reload();
                        })
                      }
                    >
                      {t("depRefund")}
                    </button>
                    <button
                      type="button"
                      className="min-h-9 rounded-app border border-border px-2 text-xs text-muted hover:text-foreground"
                      onClick={() =>
                        void resolveDeposit(d.id, "adjusted").then((err) => {
                          if (err) setError(err);
                          else reload();
                        })
                      }
                    >
                      {t("depAdjust")}
                    </button>
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}
        <Card className="print:hidden">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const form = e.currentTarget;
              const fd = new FormData(form);
              setPending(true);
              setError(null);
              void addDeposit({
                tenantId: tenant.id,
                firmId: firm?.id ?? null,
                userId,
                partyId: party.id,
                amount: Number(fd.get("depAmount") ?? 0),
                method: String(fd.get("depMethod") ?? "cash"),
              }).then((err) => {
                setPending(false);
                if (err) setError(err);
                else {
                  form.reset();
                  reload();
                }
              });
            }}
            className="flex items-end gap-2"
          >
            <div className="flex-1">
              <Label htmlFor="depAmount">{t("amount")}</Label>
              <Input
                id="depAmount"
                name="depAmount"
                type="number"
                step="any"
                min="1"
                inputMode="decimal"
                required
              />
            </div>
            <div className="w-32">
              <Label htmlFor="depMethod">{t("method")}</Label>
              <Select id="depMethod" name="depMethod" defaultValue="cash">
                <option value="cash">{t("cash")}</option>
                <option value="upi">{t("upi")}</option>
                <option value="bank">{t("bank")}</option>
                <option value="cheque">{t("cheque")}</option>
                <option value="other">{t("other")}</option>
              </Select>
            </div>
            <Button type="submit" disabled={pending}>
              {t("addDeposit")}
            </Button>
          </form>
        </Card>
      </section>
      )}

      <section>
        <h2 className="mb-2 text-sm font-semibold text-muted">
          {t("payments")}
        </h2>
        <Card className="print:hidden">
          <form onSubmit={(e) => void onAddPayment(e)} className="space-y-3">
            {showCustomer && showSupplier ? (
              <div>
                <Label htmlFor="type">{t("paymentType")}</Label>
                <Select id="type" name="type" defaultValue="receipt">
                  <option value="receipt">{t("pmtReceived")}</option>
                  <option value="paid">{t("pmtPaid")}</option>
                </Select>
              </div>
            ) : (
              <input
                type="hidden"
                name="type"
                value={showSupplier ? "paid" : "receipt"}
              />
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="amount">{t("amount")}</Label>
                <Input
                  id="amount"
                  name="amount"
                  type="number"
                  step="any"
                  min="1"
                  inputMode="decimal"
                  required
                />
              </div>
              <div>
                <Label htmlFor="method">{t("method")}</Label>
                <Select id="method" name="method" defaultValue="cash">
                  <option value="cash">{t("cash")}</option>
                  <option value="upi">{t("upi")}</option>
                  <option value="bank">{t("bank")}</option>
                  <option value="cheque">{t("cheque")}</option>
                  <option value="other">{t("other")}</option>
                </Select>
              </div>
            </div>
            <div>
              <Label htmlFor="date">{tc("date")}</Label>
              <Input id="date" name="date" type="date" defaultValue={todayISO()} />
            </div>
            {features.functions.customFields && (
              <CustomFieldInputs fields={cfDefs} />
            )}
            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button type="submit" className="w-full" disabled={pending}>
              {pending ? tc("loading") : t("addPayment")}
            </Button>
          </form>
        </Card>
        {payments.length > 0 && (
          <div className="mt-2 space-y-2">
            {payments.map((p) => (
              <Card key={p.id} className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium">
                    {fmtMoney(Number(p.amount))}
                  </div>
                  <div className="text-xs text-muted">
                    {fmtDate(p.payment_date, locale)} · {t(p.method)}
                    {p.type === "paid" && <> · {t("pmtPaid")}</>}
                  </div>
                </div>
                <span
                  className={`text-xs ${p.type === "receipt" ? "text-emerald-700" : "text-red-600"}`}
                >
                  {p.type === "receipt" ? "+" : "−"}
                </span>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
