import { Link } from "react-router-dom";
import { useTranslations } from "@/i18n";
import { supabase } from "@/lib/supabase";
import { useQuery } from "@/lib/use-query";
import type { Driver } from "@/lib/types";
import { Card, EmptyState, ListSkeleton, PageHeader } from "@/components/ui";
import { Icon } from "@/components/icons";

async function loadDrivers(): Promise<Driver[]> {
  const { data } = await supabase
    .from("rental_drivers")
    .select("*")
    .is("deleted_at", null)
    .order("name");
  return (data as Driver[]) ?? [];
}

export default function DriversPage() {
  const t = useTranslations("drivers");
  const tc = useTranslations("common");
  const { data: drivers, loading } = useQuery(loadDrivers, []);

  return (
    <div>
      <PageHeader
        title={t("title")}
        action={
          <Link
            to="/drivers/new"
            className="flex min-h-10 items-center gap-1 rounded-app bg-primary px-3 text-sm font-medium text-primary-foreground"
          >
            <Icon name="plus" className="h-4 w-4" />
            {t("new")}
          </Link>
        }
      />
      {loading ? (
        <ListSkeleton />
      ) : (drivers ?? []).length === 0 ? (
        <EmptyState message={tc("noData")} />
      ) : (
        <div className="space-y-2">
          {(drivers ?? []).map((driver) => (
            <Link key={driver.id} to={`/drivers/${driver.id}`} className="block">
              <Card interactive className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium">{driver.name}</div>
                  <div className="text-xs text-muted">
                    {[driver.phone, driver.vehicle_no]
                      .filter(Boolean)
                      .join(" · ")}
                  </div>
                </div>
                <Icon name="truck" className="h-5 w-5 text-muted" />
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
