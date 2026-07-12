import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslations } from "@/i18n";
import { useToast } from "@/components/toast";
import { supabase } from "@/lib/supabase";
import { useQuery } from "@/lib/use-query";
import { getFormFields } from "@/lib/custom-fields";
import { useTenantSession } from "@/session";
import { createParty } from "@/lib/actions/parties";
import { CustomFieldInputs } from "@/components/custom-fields";
import { Button, Card, Input, Label, PageHeader, Select } from "@/components/ui";

export default function NewPartyPage() {
  const t = useTranslations("parties");
  const tc = useTranslations("common");
  const toast = useToast();
  const { tenant, features } = useTenantSession();
  const hidden = new Set(features.hiddenFields.party);
  const navigate = useNavigate();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: cfDefs } = useQuery(
    () => getFormFields(supabase, "party", tenant.id),
    [tenant.id],
  );

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setPending(true);
    setError(null);
    const err = await createParty(tenant.id, new FormData(e.currentTarget));
    setPending(false);
    if (err) setError(err);
    else {
      toast(tc("saved"));
      void navigate("/parties");
    }
  };

  return (
    <div className="mx-auto max-w-md">
      <PageHeader title={t("new")} />
      <Card>
        <form onSubmit={(e) => void onSubmit(e)} className="space-y-4">
          <div>
            <Label htmlFor="name">{t("name")}</Label>
            <Input id="name" name="name" required />
          </div>
          {!hidden.has("kind") && (
            <div>
              <Label htmlFor="kind">{t("kind")}</Label>
              <Select id="kind" name="kind" defaultValue="customer">
                <option value="customer">{t("kindCustomer")}</option>
                <option value="supplier">{t("kindSupplier")}</option>
                <option value="both">{t("kindBoth")}</option>
              </Select>
            </div>
          )}
          {!hidden.has("phone") && (
            <div>
              <Label htmlFor="phone">{t("phone")}</Label>
              <Input id="phone" name="phone" type="tel" />
            </div>
          )}
          {!hidden.has("address") && (
            <div>
              <Label htmlFor="address">{t("address")}</Label>
              <Input id="address" name="address" />
            </div>
          )}
          {!hidden.has("notes") && (
            <div>
              <Label htmlFor="notes">{tc("notes")}</Label>
              <Input id="notes" name="notes" />
            </div>
          )}
          {features.functions.customFields && (
            <CustomFieldInputs fields={cfDefs ?? []} />
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? tc("loading") : tc("save")}
          </Button>
        </form>
      </Card>
    </div>
  );
}
