import { useNavigate } from "react-router-dom";
import { useTranslations } from "@/i18n";
import { useToast } from "@/components/toast";
import { supabase } from "@/lib/supabase";
import { useQuery } from "@/lib/use-query";
import { getFormFields } from "@/lib/custom-fields";
import { genMarko } from "@/lib/marko";
import { useTenantSession } from "@/session";
import { createItem } from "@/lib/actions/items";
import { PageHeader } from "@/components/ui";
import { ItemForm } from "./item-form";

export default function NewItemPage() {
  const t = useTranslations("items");
  const tc = useTranslations("common");
  const toast = useToast();
  const { tenant, firm } = useTenantSession();
  const navigate = useNavigate();
  // owned stock defaults to the firm's (or business's) own mark
  const markoSource = firm?.name ?? tenant.name;

  const { data: cfDefs } = useQuery(
    () => getFormFields(supabase, "item", tenant.id),
    [tenant.id],
  );

  const onSubmit = async (formData: FormData) => {
    // items always stamp the current firm (own-lot seed must match
    // challan firm_id — see lot_stock invariant)
    const err = await createItem(
      { tenantId: tenant.id, firmId: firm?.id ?? null, markoSource },
      formData,
    );
    if (!err) {
      toast(tc("saved"));
      void navigate("/items");
    }
    return err;
  };

  return (
    <div className="mx-auto max-w-md">
      <PageHeader title={t("new")} />
      <ItemForm
        onSubmit={onSubmit}
        defaultMarko={genMarko(markoSource)}
        customFields={cfDefs ?? []}
      />
    </div>
  );
}
