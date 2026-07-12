import { useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslations } from "@/i18n";
import { useToast } from "@/components/toast";
import { supabase } from "@/lib/supabase";
import { useQuery } from "@/lib/use-query";
import { getFormFields, type CustomFieldDef } from "@/lib/custom-fields";
import type { Driver } from "@/lib/types";
import { useTenantSession } from "@/session";
import { deleteDriver, updateDriver } from "@/lib/actions/drivers";
import { CustomFieldInputs } from "@/components/custom-fields";
import {
  Button,
  Card,
  ConfirmButton,
  EmptyState,
  Input,
  Label,
  ListSkeleton,
  PageHeader,
} from "@/components/ui";

interface PageData {
  driver: Driver | null;
  cfDefs: CustomFieldDef[];
}

async function loadDriver(tenantId: string, id: string): Promise<PageData> {
  const [cfDefs, { data: driver }] = await Promise.all([
    getFormFields(supabase, "driver", tenantId),
    supabase
      .from("rental_drivers")
      .select("*")
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle<Driver>(),
  ]);
  return { driver: driver ?? null, cfDefs };
}

export default function EditDriverPage() {
  const { id = "" } = useParams();
  const t = useTranslations("drivers");
  const tc = useTranslations("common");
  const toast = useToast();
  const { tenant, features } = useTenantSession();
  const hidden = new Set(features.hiddenFields.driver);
  const navigate = useNavigate();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data, loading } = useQuery(
    () => loadDriver(tenant.id, id),
    [tenant.id, id],
  );

  if (loading || !data) return <ListSkeleton />;
  if (!data.driver) return <EmptyState message={tc("noData")} />;
  const driver = data.driver;

  const onUpdate = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setPending(true);
    setError(null);
    const err = await updateDriver(
      tenant.id,
      driver.id,
      new FormData(e.currentTarget),
    );
    setPending(false);
    if (err) setError(err);
    else {
      toast(tc("saved"));
      void navigate("/drivers");
    }
  };

  const onDelete = async () => {
    setPending(true);
    const err = await deleteDriver(driver.id);
    setPending(false);
    if (err) setError(err);
    else {
      toast(tc("saved"));
      void navigate("/drivers");
    }
  };

  return (
    <div className="mx-auto max-w-md">
      <PageHeader title={t("editTitle")} />
      <Card>
        <form onSubmit={(e) => void onUpdate(e)} className="space-y-4">
          <div>
            <Label htmlFor="name">{t("name")}</Label>
            <Input id="name" name="name" defaultValue={driver.name} required />
          </div>
          {!hidden.has("phone") && (
            <div>
              <Label htmlFor="phone">{t("phone")}</Label>
              <Input
                id="phone"
                name="phone"
                type="tel"
                defaultValue={driver.phone ?? ""}
              />
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            {!hidden.has("license") && (
              <div>
                <Label htmlFor="licenseNo">{t("license")}</Label>
                <Input
                  id="licenseNo"
                  name="licenseNo"
                  defaultValue={driver.license_no ?? ""}
                />
              </div>
            )}
            {!hidden.has("vehicle") && (
              <div>
                <Label htmlFor="vehicleNo">{t("vehicle")}</Label>
                <Input
                  id="vehicleNo"
                  name="vehicleNo"
                  defaultValue={driver.vehicle_no ?? ""}
                />
              </div>
            )}
          </div>
          {!hidden.has("notes") && (
            <div>
              <Label htmlFor="notes">{tc("notes")}</Label>
              <Input id="notes" name="notes" defaultValue={driver.notes ?? ""} />
            </div>
          )}
          {features.functions.customFields && (
            <CustomFieldInputs fields={data.cfDefs} values={driver.custom_fields} />
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? tc("loading") : tc("save")}
          </Button>
        </form>
      </Card>
      <ConfirmButton
        label={tc("delete")}
        confirmLabel={tc("confirmDelete")}
        className="mt-3 w-full"
        disabled={pending}
        onConfirm={() => void onDelete()}
      />
    </div>
  );
}
