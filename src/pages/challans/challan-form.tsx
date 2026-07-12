import { useState, useTransition } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslations } from "@/i18n";
import { useToast } from "@/components/toast";
import type {
  BillBook,
  ChallanType,
  ChargeType,
  Driver,
  Item,
  Party,
  PartyItemRate,
} from "@/lib/types";
import { todayISO } from "@/lib/format";
import { genMarko } from "@/lib/marko";
import type { CustomFieldDef } from "@/lib/custom-fields";
import { useTenantSession } from "@/session";
import { CustomFieldControl } from "@/components/custom-fields";
import { Button, Card, Input, Label, Select } from "@/components/ui";
import { Icon } from "@/components/icons";
import {
  createChallan,
  type ChallanFormState,
  type StockError,
} from "@/lib/actions/challans";
import { ensureDriver } from "@/lib/actions/drivers";

/** A warehouse lot (own or borrowed) available to issue / give back. */
export interface LotRow {
  itemId: string;
  variantId: string | null;
  lotSupplierId: string | null;
  supplierName: string | null;
  marko: string;
  qty: number;
  borrowedNet: number;
}

/** A lot currently out at a specific customer (return source). */
export interface CustLotRow {
  customerId: string;
  itemId: string;
  variantId: string | null;
  lotSupplierId: string | null;
  supplierName: string | null;
  marko: string;
  qty: number;
}

interface ChargeEntry {
  chargeTypeId: string;
  amount: string;
  /** lost/damage etc. may carry a quantity */
  qty: string;
  /** line-level charges point at one of the challan's items */
  itemId: string;
}

interface Line {
  itemId: string;
  variantId: string; // "" = base item
  rate: string; // one customer/supplier rate for the whole item block
  /** lot-picker types: qty drawn from each lot, keyed by lot key */
  allocs: Record<string, string>;
  /** borrow only: single qty + the supplier's new mark */
  qty: string;
  marko: string;
}

// lot key = supplier + mark (the variant is fixed per line by its own
// dropdown). U+2016 is a non-typable delimiter.
const SEP = "‖";
const lotKey = (lotSupplierId: string | null, marko: string) =>
  `${lotSupplierId ?? ""}${SEP}${marko}`;

/** Human-readable stock-error banner */
function StockErrorBanner({ err }: { err: StockError }) {
  const messages: Record<StockError["kind"], string> = {
    STOCK_INSUFFICIENT: `Not enough stock for "${err.item}". Available: ${err.available}, Requested: ${err.requested}.`,
    STOCK_OVER_RETURN: `Cannot return more than issued for "${err.item}". Outstanding: ${err.available}, Requested: ${err.requested}.`,
    STOCK_OVER_GIVEBACK: `Cannot give back more than borrowed for "${err.item}". Borrowed: ${err.available}, Requested: ${err.requested}.`,
    STOCK_NOT_IN_HAND: `Cannot give back "${err.item}" — only ${err.available} in hand, the rest is still out at customers. Requested: ${err.requested}.`,
  };
  return (
    <div className="rounded-app border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
      {messages[err.kind]}
    </div>
  );
}

export function ChallanForm({
  parties,
  items,
  drivers,
  partyRates,
  initialType,
  variantsByItem,
  lots,
  customerLots,
  customFields = [],
  chargeTypes = [],
  billBooks = [],
}: {
  parties: Party[];
  items: Item[];
  drivers: Driver[];
  partyRates: PartyItemRate[];
  initialType: ChallanType;
  /** item_id -> its variants (name + optional own rate) */
  variantsByItem: Map<
    string,
    { id: string; name: string; rate: number | null }[]
  >;
  /** warehouse lots with in_hand > 0 (issue + giveback sources) */
  lots: LotRow[];
  /** lots out at each customer (return sources) */
  customerLots: CustLotRow[];
  /** admin-defined extra fields for challans */
  customFields?: CustomFieldDef[];
  /** tenant's fee catalog (loading, petrol, damage, lost…) */
  chargeTypes?: ChargeType[];
  /** numbered series available for this challan (empty = default numbering) */
  billBooks?: BillBook[];
}) {
  const t = useTranslations("challans");
  const tc = useTranslations("common");
  const toast = useToast();
  const { tenant, firm, userId, features } = useTenantSession();
  const fns = features.functions;
  const hidden = new Set(features.hiddenFields.challan);
  const navigate = useNavigate();
  const [type, setType] = useState<ChallanType>(initialType);
  const [partyId, setPartyId] = useState("");
  const [date, setDate] = useState(todayISO());
  const [driverName, setDriverName] = useState("");
  const [vehicleNo, setVehicleNo] = useState("");
  const [notes, setNotes] = useState("");
  const [cfValues, setCfValues] = useState<Record<string, string | boolean>>({});
  const [lines, setLines] = useState<Line[]>([blankLine()]);
  const [charges, setCharges] = useState<ChargeEntry[]>([]);
  const [depositAmount, setDepositAmount] = useState("");
  const [billBookId, setBillBookId] = useState(
    () => billBooks.find((b) => b.is_default)?.id ?? billBooks[0]?.id ?? "",
  );
  const [state, setState] = useState<ChallanFormState>(null);
  const [pending, startTransition] = useTransition();

  const itemById = new Map(items.map((i) => [i.id, i]));
  const driverByName = (name: string) =>
    drivers.find(
      (d) => d.name.trim().toLowerCase() === name.trim().toLowerCase(),
    );
  const partyNameOf = (id: string) =>
    parties.find((p) => p.id === id)?.name ?? "";
  const variantsOf = (itemId: string) => variantsByItem.get(itemId) ?? [];
  const markoDefaultFor = (challanType: ChallanType, pid: string) =>
    challanType === "borrow" && pid ? genMarko(partyNameOf(pid)) : "";

  const outward = type === "issue" || type === "return";
  const eligibleParties = parties.filter((p) =>
    outward ? p.kind !== "supplier" : p.kind !== "customer",
  );
  const rateApplies = type === "issue" || type === "borrow";
  // issue / return / giveback draw from existing lots; borrow makes one
  const usesLotPicker =
    type === "issue" || type === "return" || type === "giveback";

  function blankLine(): Line {
    return { itemId: "", variantId: "", rate: "", allocs: {}, qty: "", marko: "" };
  }

  // party override rate wins; else the variant's own rate; else the item's
  const rateFor = (
    forParty: string,
    itemId: string,
    variantId: string,
  ): string => {
    const item = itemById.get(itemId);
    if (!item) return "";
    const override = partyRates.find(
      (r) => r.party_id === forParty && r.item_id === itemId && r.rate !== null,
    );
    if (override?.rate != null) return String(override.rate);
    if (variantId) {
      const v = variantsOf(itemId).find((x) => x.id === variantId);
      if (v && v.rate != null) return String(v.rate);
    }
    return String(item.default_rate);
  };

  /** Lot options for a line given its item + variant + the current party. */
  const lotsFor = (
    itemId: string,
    variantId: string,
    forParty: string,
  ): LotRow[] => {
    if (!itemId) return [];
    const vmatch = (v: string | null) => (v ?? "") === variantId;
    if (type === "issue")
      return lots.filter((l) => l.itemId === itemId && vmatch(l.variantId));
    if (type === "giveback")
      return lots.filter(
        (l) =>
          l.itemId === itemId &&
          vmatch(l.variantId) &&
          l.lotSupplierId === forParty,
      );
    if (type === "return")
      return customerLots
        .filter(
          (l) =>
            l.customerId === forParty &&
            l.itemId === itemId &&
            vmatch(l.variantId),
        )
        .map((l) => ({ ...l, borrowedNet: 0 }));
    return [];
  };

  const allocQty = (line: Line, lot: LotRow) =>
    Number(line.allocs[lotKey(lot.lotSupplierId, lot.marko)] ?? "") || 0;

  const lineTotal = (line: Line): number => {
    if (!usesLotPicker) return Number(line.qty) || 0;
    return lotsFor(line.itemId, line.variantId, partyId).reduce(
      (s, lot) => s + allocQty(line, lot),
      0,
    );
  };

  const setLine = (index: number, patch: Partial<Line>) =>
    setLines((prev) =>
      prev.map((line, i) => (i === index ? { ...line, ...patch } : line)),
    );

  const setAlloc = (index: number, key: string, value: string) =>
    setLines((prev) =>
      prev.map((line, i) =>
        i === index ? { ...line, allocs: { ...line.allocs, [key]: value } } : line,
      ),
    );

  const onItemChange = (index: number, itemId: string) =>
    setLine(index, {
      itemId,
      variantId: "",
      allocs: {},
      qty: "",
      marko: type === "borrow" ? markoDefaultFor(type, partyId) : "",
      rate: itemId ? rateFor(partyId, itemId, "") : "",
    });

  const onVariantChange = (index: number, variantId: string) => {
    const line = lines[index];
    setLine(index, {
      variantId,
      allocs: {}, // available lots change with the variant
      rate: line.itemId ? rateFor(partyId, line.itemId, variantId) : line.rate,
    });
  };

  const onTypeChange = (next: ChallanType) => {
    const nextOutward = next === "issue" || next === "return";
    setType(next);
    setState(null);
    if (nextOutward !== outward) setPartyId("");
    setLines((prev) => prev.map((l) => ({ ...l, allocs: {} })));
  };

  const onPartyChange = (nextParty: string) => {
    setPartyId(nextParty);
    setState(null);
    const suggested = markoDefaultFor(type, nextParty);
    setLines((prev) =>
      prev.map((line) => ({
        ...line,
        rate: line.itemId
          ? rateFor(nextParty, line.itemId, line.variantId)
          : line.rate,
        // return/giveback lots depend on the party — clear allocations
        allocs: type === "return" || type === "giveback" ? {} : line.allocs,
        marko:
          type === "borrow"
            ? line.marko.trim() === ""
              ? suggested
              : line.marko
            : line.marko,
      })),
    );
  };

  // combobox: an existing name autofills the vehicle; a new name will
  // create the driver on save (ensureDriver)
  const onDriverChange = (name: string) => {
    setDriverName(name);
    const driver = driverByName(name);
    if (driver?.vehicle_no) setVehicleNo(driver.vehicle_no);
  };

  const capLabel =
    type === "return" ? "outstanding" : type === "giveback" ? "borrowed" : "available";

  // a lot allocation that exceeds the lot's stock
  const lotOver = (line: Line, lot: LotRow) => allocQty(line, lot) > lot.qty;
  const hasLineErrors = lines.some((l) =>
    usesLotPicker
      ? lotsFor(l.itemId, l.variantId, partyId).some((lot) => lotOver(l, lot))
      : false,
  );
  const hasAnyQty = lines.some((l) => lineTotal(l) > 0);

  const rateOf = (line: Line): number | null =>
    rateApplies && line.rate !== "" ? Number(line.rate) : null;

  const submit = () => {
    startTransition(async () => {
      // expand each item block into one payload line per lot drawn from
      const payloadLines = lines.flatMap((l) => {
        if (!l.itemId) return [];
        if (!usesLotPicker) {
          const qty = Number(l.qty) || 0;
          if (qty <= 0) return [];
          return [
            {
              itemId: l.itemId,
              variantId: l.variantId || null,
              qty,
              rate: rateOf(l),
              marko: l.marko.trim() || null,
              lotSupplierId: null,
            },
          ];
        }
        return lotsFor(l.itemId, l.variantId, partyId)
          .map((lot) => ({ lot, qty: allocQty(l, lot) }))
          .filter((x) => x.qty > 0)
          .map(({ lot, qty }) => ({
            itemId: l.itemId,
            variantId: l.variantId || null,
            qty,
            rate: rateOf(l),
            marko: lot.marko || null,
            lotSupplierId: lot.lotSupplierId || null,
          }));
      });

      // resolve the typed driver name: existing -> id, new -> create
      let driverId: string | null = driverByName(driverName)?.id ?? null;
      if (!driverId && driverName.trim()) {
        const ensured = await ensureDriver(tenant.id, driverName);
        if (ensured.error) {
          setState({ error: ensured.error });
          return;
        }
        driverId = ensured.id;
      }

      const result = await createChallan(
        { tenantId: tenant.id, firmId: firm?.id ?? null, userId },
        {
        partyId,
        type,
        date,
        notes,
        driverId,
        vehicleNo,
        customFields: cfValues,
        lines: payloadLines,
        charges: charges
          .filter((c) => c.chargeTypeId && Number(c.amount) > 0)
          .map((c) => ({
            chargeTypeId: c.chargeTypeId,
            amount: Number(c.amount),
            qty: c.qty !== "" ? Number(c.qty) : null,
            itemId: c.itemId || null,
            notes: null,
          })),
        deposit:
          Number(depositAmount) > 0
            ? { amount: Number(depositAmount), method: "cash" }
            : null,
        billBookId: billBookId || null,
        },
      );
      if (result?.error) setState(result);
      else {
      toast(tc("saved"));
      void navigate("/challans");
    }
    });
  };

  const stockError = state && "stockError" in state ? state.stockError : null;

  return (
    <div className="space-y-4">
      {/* challan type: customer row (issue/return), supplier row (borrow/giveback) */}
      <div className="grid grid-cols-2 gap-2">
        {(fns.borrow
          ? (["issue", "return", "borrow", "giveback"] as const)
          : (["issue", "return"] as const)
        ).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => onTypeChange(option)}
            className={`min-h-11 rounded-app border text-sm font-medium ${
              type === option
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-muted"
            }`}
          >
            {t(option)}
          </button>
        ))}
      </div>

      <Card className="space-y-4">
        <div>
          <Label htmlFor="party">{t("party")}</Label>
          <Select
            id="party"
            value={partyId}
            onChange={(e) => onPartyChange(e.target.value)}
            required
          >
            <option value="">{t("selectParty")}</option>
            {eligibleParties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="date">{tc("date")}</Label>
          <Input
            id="date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
        {/* numbered series — only when the tenant runs more than one */}
        {fns.billBooks && billBooks.length > 1 && (
          <div>
            <Label htmlFor="billBook">{t("billBook")}</Label>
            <Select
              id="billBook"
              value={billBookId}
              onChange={(e) => setBillBookId(e.target.value)}
            >
              {billBooks.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} ({b.prefix})
                </option>
              ))}
            </Select>
          </div>
        )}
        {(!hidden.has("driver") || !hidden.has("vehicle")) &&
          fns.drivers && (
            <div className="grid grid-cols-2 gap-3">
              {!hidden.has("driver") && (
                <div>
                  <Label htmlFor="driver">{t("driver")}</Label>
                  <Input
                    id="driver"
                    list="driver-options"
                    value={driverName}
                    onChange={(e) => onDriverChange(e.target.value)}
                    placeholder={t("driverTypeHint")}
                    autoComplete="off"
                  />
                  <datalist id="driver-options">
                    {drivers.map((d) => (
                      <option key={d.id} value={d.name} />
                    ))}
                  </datalist>
                </div>
              )}
              {!hidden.has("vehicle") && (
                <div>
                  <Label htmlFor="vehicle">{t("vehicle")}</Label>
                  <Input
                    id="vehicle"
                    value={vehicleNo}
                    onChange={(e) => setVehicleNo(e.target.value)}
                    placeholder="GJ 01 AB 1234"
                  />
                </div>
              )}
            </div>
          )}
      </Card>

      <div className="space-y-2">
        {lines.map((line, index) => {
          const variants = variantsOf(line.itemId);
          const options = usesLotPicker
            ? lotsFor(line.itemId, line.variantId, partyId)
            : [];
          // multi-source table only when there's a genuine choice
          const multiSource = usesLotPicker && options.length >= 2;
          const single = usesLotPicker ? options[0] : undefined;
          const total = lineTotal(line);

          return (
            <Card key={index} className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <Label htmlFor={`item-${index}`}>{t("item")}</Label>
                  <Select
                    id={`item-${index}`}
                    value={line.itemId}
                    onChange={(e) => onItemChange(index, e.target.value)}
                  >
                    <option value="">{t("selectItem")}</option>
                    {items.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </Select>
                </div>
                {lines.length > 1 && (
                  <button
                    type="button"
                    onClick={() =>
                      setLines((prev) => prev.filter((_, i) => i !== index))
                    }
                    className="mt-6 flex min-h-9 min-w-9 items-center justify-center rounded-app text-muted hover:text-red-600"
                    aria-label={tc("delete")}
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* Variant — shown for any type when the item has variants. */}
              {fns.variants && line.itemId && variants.length > 0 && (
                <div>
                  <Label htmlFor={`var-${index}`}>{t("variant")}</Label>
                  <Select
                    id={`var-${index}`}
                    value={line.variantId}
                    onChange={(e) => onVariantChange(index, e.target.value)}
                  >
                    <option value="">{t("baseVariant")}</option>
                    {variants.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name}
                      </option>
                    ))}
                  </Select>
                </div>
              )}

              {/* Rate — one value for the whole item block (issue/borrow). */}
              {rateApplies && line.itemId && (
                <div>
                  <Label htmlFor={`rate-${index}`}>{t("rate")}</Label>
                  <Input
                    id={`rate-${index}`}
                    type="number"
                    step="any"
                    min="0"
                    inputMode="decimal"
                    value={line.rate}
                    onChange={(e) => setLine(index, { rate: e.target.value })}
                  />
                </div>
              )}

              {/* Qty: borrow = single box; lot pickers = per-source qty. */}
              {!usesLotPicker ? (
                <div>
                  <Label htmlFor={`qty-${index}`}>{t("qty")}</Label>
                  <Input
                    id={`qty-${index}`}
                    type="number"
                    step="any"
                    min="0"
                    inputMode="decimal"
                    value={line.qty}
                    onChange={(e) => setLine(index, { qty: e.target.value })}
                  />
                </div>
              ) : !line.itemId ? null : options.length === 0 ? (
                <p className="text-xs text-red-600">{t("noStock")}</p>
              ) : !multiSource && single ? (
                // one lot → a plain qty box (own-only common case)
                <div>
                  <Label htmlFor={`qty-${index}`}>{t("qty")}</Label>
                  <Input
                    id={`qty-${index}`}
                    type="number"
                    step="any"
                    min="0"
                    inputMode="decimal"
                    value={line.allocs[lotKey(single.lotSupplierId, single.marko)] ?? ""}
                    onChange={(e) =>
                      setAlloc(
                        index,
                        lotKey(single.lotSupplierId, single.marko),
                        e.target.value,
                      )
                    }
                    className={lotOver(line, single) ? "border-red-400" : ""}
                  />
                  <p
                    className={`mt-1 text-xs ${
                      lotOver(line, single) ? "text-red-600" : "text-muted"
                    }`}
                  >
                    {single.qty} {capLabel}
                  </p>
                </div>
              ) : (
                // multiple lots → a qty box per source, with a total
                <div className="space-y-1.5">
                  <Label>{t("sources")}</Label>
                  {options.map((lot, li) => {
                    const key = lotKey(lot.lotSupplierId, lot.marko);
                    const over = lotOver(line, lot);
                    return (
                      <div key={li} className="flex items-center gap-2">
                        <div className="flex-1 text-xs">
                          <span className="font-medium">
                            {lot.supplierName ?? t("own")}
                          </span>
                          {lot.marko && (
                            <span className="text-blue-600"> [{lot.marko}]</span>
                          )}
                          <span className="text-muted">
                            {" "}
                            · {lot.qty} {capLabel}
                          </span>
                        </div>
                        <Input
                          type="number"
                          step="any"
                          min="0"
                          inputMode="decimal"
                          aria-label={lot.supplierName ?? t("own")}
                          className={`w-24 ${over ? "border-red-400" : ""}`}
                          value={line.allocs[key] ?? ""}
                          onChange={(e) => setAlloc(index, key, e.target.value)}
                        />
                      </div>
                    );
                  })}
                  <div className="flex justify-between border-t border-border pt-1 text-xs">
                    <span className="text-muted">{tc("total")}</span>
                    <span className="font-semibold">{total}</span>
                  </div>
                </div>
              )}

              {/* Borrow: the supplier's mark for this new lot. */}
              {type === "borrow" && (
                <div>
                  <Label htmlFor={`marko-${index}`}>{t("marko")}</Label>
                  <Input
                    id={`marko-${index}`}
                    value={line.marko}
                    onChange={(e) => setLine(index, { marko: e.target.value })}
                    placeholder={t("markoBorrowHint")}
                  />
                </div>
              )}
            </Card>
          );
        })}
        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={() => setLines((prev) => [...prev, blankLine()])}
        >
          <Icon name="plus" className="h-4 w-4" />
          {t("addLine")}
        </Button>
      </div>

      <Card className="space-y-3">
        {!hidden.has("notes") && (
          <div>
            <Label htmlFor="notes">{tc("notes")}</Label>
            <Input
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        )}
        {/* security deposit collected when material starts moving */}
        {fns.deposits && (type === "issue" || type === "borrow") && (
          <div>
            <Label htmlFor="deposit">{t("deposit")}</Label>
            <Input
              id="deposit"
              type="number"
              step="any"
              min="0"
              inputMode="decimal"
              placeholder="₹"
              value={depositAmount}
              onChange={(e) => setDepositAmount(e.target.value)}
            />
          </div>
        )}
        {fns.customFields &&
          customFields.map((field) => (
          <CustomFieldControl
            key={field.key}
            field={field}
            value={
              field.type === "checkbox"
                ? cfValues[field.key] === true
                : typeof cfValues[field.key] === "string"
                  ? (cfValues[field.key] as string)
                  : ""
            }
            onChange={(v) =>
              setCfValues((prev) => ({ ...prev, [field.key]: v }))
            }
          />
        ))}
      </Card>

      {/* extra fees (loading, petrol, damage, lost …) */}
      {fns.charges && chargeTypes.length > 0 && (
        <Card className="space-y-3">
          <h2 className="text-sm font-semibold">{t("charges")}</h2>
          {charges.map((charge, ci) => {
            const ctype = chargeTypes.find((c) => c.id === charge.chargeTypeId);
            const lineItems = [
              ...new Set(lines.map((l) => l.itemId).filter(Boolean)),
            ];
            return (
              <div key={ci} className="space-y-2 rounded-app border border-border p-2">
                <div className="flex items-center gap-2">
                  <Select
                    aria-label={t("chargeType")}
                    className="flex-1"
                    value={charge.chargeTypeId}
                    onChange={(e) => {
                      const next = chargeTypes.find(
                        (c) => c.id === e.target.value,
                      );
                      setCharges((prev) =>
                        prev.map((c, i) =>
                          i === ci
                            ? {
                                ...c,
                                chargeTypeId: e.target.value,
                                amount:
                                  c.amount ||
                                  (next?.default_amount != null
                                    ? String(next.default_amount)
                                    : ""),
                                itemId:
                                  next?.level === "line" ? c.itemId : "",
                              }
                            : c,
                        ),
                      );
                    }}
                  >
                    <option value="">{t("chargeType")}</option>
                    {chargeTypes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </Select>
                  <Input
                    type="number"
                    step="any"
                    min="0"
                    inputMode="decimal"
                    aria-label={t("amount")}
                    className="w-28"
                    placeholder="₹"
                    value={charge.amount}
                    onChange={(e) =>
                      setCharges((prev) =>
                        prev.map((c, i) =>
                          i === ci ? { ...c, amount: e.target.value } : c,
                        ),
                      )
                    }
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setCharges((prev) => prev.filter((_, i) => i !== ci))
                    }
                    className="flex min-h-9 min-w-9 items-center justify-center rounded-app text-muted hover:text-red-600"
                    aria-label={tc("delete")}
                  >
                    ✕
                  </button>
                </div>
                {ctype?.level === "line" && (
                  <div className="flex items-center gap-2">
                    <Select
                      aria-label={t("chargeFor")}
                      className="flex-1"
                      value={charge.itemId}
                      onChange={(e) =>
                        setCharges((prev) =>
                          prev.map((c, i) =>
                            i === ci ? { ...c, itemId: e.target.value } : c,
                          ),
                        )
                      }
                    >
                      <option value="">{t("chargeFor")}</option>
                      {lineItems.map((id) => (
                        <option key={id} value={id}>
                          {itemById.get(id)?.name ?? "?"}
                        </option>
                      ))}
                    </Select>
                    {ctype.affects_stock && (
                      <Input
                        type="number"
                        step="any"
                        min="0"
                        inputMode="decimal"
                        aria-label={t("qty")}
                        className="w-28"
                        placeholder={t("qty")}
                        value={charge.qty}
                        onChange={(e) =>
                          setCharges((prev) =>
                            prev.map((c, i) =>
                              i === ci ? { ...c, qty: e.target.value } : c,
                            ),
                          )
                        }
                      />
                    )}
                  </div>
                )}
              </div>
            );
          })}
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={() =>
              setCharges((prev) => [
                ...prev,
                { chargeTypeId: "", amount: "", qty: "", itemId: "" },
              ])
            }
          >
            <Icon name="plus" className="h-4 w-4" />
            {t("addCharge")}
          </Button>
        </Card>
      )}

      {stockError && <StockErrorBanner err={stockError} />}
      {state?.error && state.error !== "stock" && (
        <p className="text-sm text-red-600">{tc("error")}</p>
      )}

      {/* summary + submit stay in reach while the form grows */}
      <div className="sticky bottom-16 z-10 md:bottom-4">
        <Card className="flex items-center justify-between gap-3 shadow-lg">
          <div className="text-xs text-muted">
            <div>
              {t("qty")}:{" "}
              <span className="text-sm font-bold text-foreground">
                {lines.reduce((s, l) => s + lineTotal(l), 0)}
              </span>
            </div>
            {rateApplies && (
              <div>
                {t("amount")}:{" "}
                <span className="text-sm font-bold text-foreground">
                  ₹
                  {lines
                    .reduce(
                      (s, l) => s + lineTotal(l) * (Number(l.rate) || 0),
                      0,
                    )
                    .toLocaleString("en-IN")}
                </span>
                <span className="text-[10px]"> /{t("perDayShort")}</span>
              </div>
            )}
          </div>
          <Button
            type="button"
            className="flex-1"
            disabled={pending || !partyId || !hasAnyQty || hasLineErrors}
            onClick={submit}
          >
            {pending ? tc("loading") : t("create")}
          </Button>
        </Card>
      </div>
    </div>
  );
}
