import { useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslations } from "@/i18n";
import { useToast } from "@/components/toast";
import { supabase } from "@/lib/supabase";
import { useQuery } from "@/lib/use-query";
import { getFormFields, type CustomFieldDef } from "@/lib/custom-fields";
import { fmtMoney } from "@/lib/format";
import type { Item, Party, PartyItemRate, RateRule } from "@/lib/types";
import { firmsActive, useTenantSession } from "@/session";
import {
  deleteParty,
  deletePartyRate,
  updateParty,
  upsertPartyRate,
} from "@/lib/actions/parties";
import { CustomFieldInputs } from "@/components/custom-fields";
import { RateRuleFields } from "@/components/rate-rule-fields";
import {
  Button,
  Card,
  ConfirmButton,
  EmptyState,
  Input,
  Label,
  ListSkeleton,
  PageHeader,
  Select,
} from "@/components/ui";

function useRuleSummary() {
  const ti = useTranslations("items");
  return (rule: RateRule | null): string => {
    if (!rule) return ti("ruleInherit");
    switch (rule.type) {
      case "per_day":
        return ti("perDay");
      case "per_month":
        return `${ti("perMonth")} (${rule.daysPerMonth ?? 30})`;
      case "min_days":
        return `${ti("minDays")} (${rule.minDays})`;
      case "custom":
        return rule.formula;
    }
  };
}

interface PageData {
  party: Party | null;
  items: Item[];
  rates: PartyItemRate[];
  cfDefs: CustomFieldDef[];
}

async function loadParty(tenantId: string, id: string): Promise<PageData> {
  const [cfDefs, { data: party }, { data: items }, { data: rates }] =
    await Promise.all([
      getFormFields(supabase, "party", tenantId),
      supabase
        .from("rental_parties")
        .select("*")
        .eq("id", id)
        .is("deleted_at", null)
        .maybeSingle<Party>(),
      supabase.from("rental_items").select("*").is("deleted_at", null).order("name"),
      supabase
        .from("rental_party_item_rates")
        .select("*")
        .eq("party_id", id)
        .is("deleted_at", null),
    ]);
  return {
    party: party ?? null,
    items: (items as Item[]) ?? [],
    rates: (rates as PartyItemRate[]) ?? [],
    cfDefs,
  };
}

export default function EditPartyPage() {
  const { id = "" } = useParams();
  const t = useTranslations("parties");
  const tc = useTranslations("common");
  const toast = useToast();
  const ruleSummary = useRuleSummary();
  const { tenant, firm, features } = useTenantSession();
  const hidden = new Set(features.hiddenFields.party);
  const navigate = useNavigate();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data, loading, reload } = useQuery(
    () => loadParty(tenant.id, id),
    [tenant.id, id],
  );

  if (loading || !data) return <ListSkeleton />;
  if (!data.party) return <EmptyState message={tc("noData")} />;
  const { party, items, rates, cfDefs } = data;
  const itemMap = new Map(items.map((i) => [i.id, i]));

  const onUpdate = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setPending(true);
    setError(null);
    const err = await updateParty(tenant.id, party.id, new FormData(e.currentTarget));
    setPending(false);
    if (err) setError(err);
    else {
      toast(tc("saved"));
      void navigate("/parties");
    }
  };

  const onDelete = async () => {
    setPending(true);
    const err = await deleteParty(party.id);
    setPending(false);
    if (err) setError(err);
    else {
      toast(tc("saved"));
      void navigate("/parties");
    }
  };

  const onDeleteRate = async (rateId: string) => {
    const err = await deletePartyRate(rateId);
    if (err) setError(err);
    else reload();
  };

  return (
    <div className="mx-auto max-w-md space-y-4">
      <PageHeader title={t("editTitle")} />
      <Card>
        <form onSubmit={(e) => void onUpdate(e)} className="space-y-4">
          <div>
            <Label htmlFor="name">{t("name")}</Label>
            <Input id="name" name="name" defaultValue={party.name} required />
          </div>
          {!hidden.has("kind") && (
            <div>
              <Label htmlFor="kind">{t("kind")}</Label>
              <Select id="kind" name="kind" defaultValue={party.kind ?? "customer"}>
                <option value="customer">{t("kindCustomer")}</option>
                <option value="supplier">{t("kindSupplier")}</option>
                <option value="both">{t("kindBoth")}</option>
              </Select>
            </div>
          )}
          {!hidden.has("phone") && (
            <div>
              <Label htmlFor="phone">{t("phone")}</Label>
              <Input id="phone" name="phone" type="tel" defaultValue={party.phone ?? ""} />
            </div>
          )}
          {!hidden.has("address") && (
            <div>
              <Label htmlFor="address">{t("address")}</Label>
              <Input id="address" name="address" defaultValue={party.address ?? ""} />
            </div>
          )}
          {!hidden.has("notes") && (
            <div>
              <Label htmlFor="notes">{tc("notes")}</Label>
              <Input id="notes" name="notes" defaultValue={party.notes ?? ""} />
            </div>
          )}
          {features.functions.customFields && (
            <CustomFieldInputs fields={cfDefs} values={party.custom_fields} />
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? tc("loading") : tc("save")}
          </Button>
        </form>
      </Card>

      {/* per-party rate overrides */}
      <section>
        <h2 className="mb-2 text-sm font-semibold text-muted">
          {t("specialRates")}
        </h2>
        {rates.length > 0 && (
          <div className="mb-3 space-y-2">
            {rates.map((rate) => (
              <Card key={rate.id} className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium">
                    {itemMap.get(rate.item_id)?.name ?? "?"}
                  </div>
                  <div className="text-xs text-muted">
                    {rate.rate !== null
                      ? fmtMoney(Number(rate.rate))
                      : t("rateInherit")}{" "}
                    · {ruleSummary(rate.rate_rule)}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void onDeleteRate(rate.id)}
                  className="flex min-h-9 min-w-9 items-center justify-center rounded-app text-muted hover:text-red-600"
                  aria-label={tc("delete")}
                >
                  ✕
                </button>
              </Card>
            ))}
          </div>
        )}
        <PartyRateForm
          partyId={party.id}
          items={items}
          tenantId={tenant.id}
          firmId={firmsActive(tenant) ? (firm?.id ?? null) : null}
          onSaved={reload}
        />
      </section>

      <ConfirmButton
        label={tc("delete")}
        confirmLabel={tc("confirmDelete")}
        className="w-full"
        disabled={pending}
        onConfirm={() => void onDelete()}
      />
    </div>
  );
}

function PartyRateForm({
  partyId,
  items,
  tenantId,
  firmId,
  onSaved,
}: {
  partyId: string;
  items: Item[];
  tenantId: string;
  firmId: string | null;
  onSaved: () => void;
}) {
  const t = useTranslations("parties");
  const ti = useTranslations("items");
  const tc = useTranslations("common");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    setPending(true);
    setError(null);
    const err = await upsertPartyRate({
      tenantId,
      firmId,
      partyId,
      formData: new FormData(form),
    });
    setPending(false);
    if (err) setError(err);
    else {
      form.reset();
      onSaved();
    }
  };

  return (
    <Card>
      <form onSubmit={(e) => void onSubmit(e)} className="space-y-4">
        <div>
          <Label htmlFor="itemId">{t("rateItem")}</Label>
          <Select id="itemId" name="itemId" required defaultValue="">
            <option value="" disabled>
              {t("selectItem")}
            </option>
            {items.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="rate">{ti("rate")}</Label>
          <Input
            id="rate"
            name="rate"
            type="number"
            step="any"
            min="0"
            inputMode="decimal"
            placeholder={t("rateInherit")}
          />
          <p className="mt-1 text-xs text-muted">{t("rateHint")}</p>
        </div>
        <RateRuleFields allowInherit />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? tc("loading") : t("addRate")}
        </Button>
      </form>
    </Card>
  );
}
