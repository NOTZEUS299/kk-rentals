import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslations } from "@/i18n";
import { useToast } from "@/components/toast";
import { supabase } from "@/lib/supabase";
import { useQuery } from "@/lib/use-query";
import { getFormFields } from "@/lib/custom-fields";
import { useTenantSession } from "@/session";
import { createDriver } from "@/lib/actions/drivers";
import { CustomFieldInputs } from "@/components/custom-fields";
import { Button, Card, Input, Label, PageHeader } from "@/components/ui";

export default function NewDriverPage() {
  const t = useTranslations("drivers");
  const tc = useTranslations("common");
  const toast = useToast();
  const { tenant, features } = useTenantSession();
  const hidden = new Set(features.hiddenFields.driver);
  const navigate = useNavigate();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: cfDefs } = useQuery(
    () => getFormFields(supabase, "driver", tenant.id),
    [tenant.id],
  );

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setPending(true);
    setError(null);
    const err = await createDriver(tenant.id, new FormData(e.currentTarget));
    setPending(false);
    if (err) setError(err);
    else {
      toast(tc("saved"));
      void navigate("/drivers");
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
          {!hidden.has("phone") && (
            <div>
              <Label htmlFor="phone">{t("phone")}</Label>
              <Input id="phone" name="phone" type="tel" />
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            {!hidden.has("license") && (
              <div>
                <Label htmlFor="licenseNo">{t("license")}</Label>
                <Input id="licenseNo" name="licenseNo" />
              </div>
            )}
            {!hidden.has("vehicle") && (
              <div>
                <Label htmlFor="vehicleNo">{t("vehicle")}</Label>
                <Input id="vehicleNo" name="vehicleNo" placeholder="GJ 01 AB 1234" />
              </div>
            )}
          </div>
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
