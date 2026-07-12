import { useState } from "react";
import { Link } from "react-router-dom";
import { useLocale, useTranslations } from "@/i18n";
import { fmtDate, fmtMoney, todayISO } from "@/lib/format";
import { supabase } from "@/lib/supabase";
import { useQuery } from "@/lib/use-query";
import type { ChallanType } from "@/lib/types";
import { firmsActive, useTenantSession } from "@/session";
import { CHALLAN_BADGE } from "@/lib/challan-badge";
import {
  Card,
  EmptyState,
  Input,
  Label,
  ListSkeleton,
  PageHeader,
} from "@/components/ui";

interface DayData {
  payments: {
    id: string;
    type: string;
    amount: number;
    method: string;
    parties: { name: string } | null;
  }[];
  deposits: {
    id: string;
    amount: number;
    status: string;
    method: string;
    parties: { name: string } | null;
  }[];
  challans: {
    id: string;
    type: ChallanType;
    challan_no: string | null;
    parties: { name: string } | null;
  }[];
}

async function loadDay(firmId: string | null, day: string): Promise<DayData> {
  let paymentsQ = supabase
    .from("rental_payments")
    .select("id, type, amount, method, parties:rental_parties(name)")
    .eq("payment_date", day)
    .is("deleted_at", null);
  let depositsQ = supabase
    .from("rental_deposits")
    .select("id, amount, status, method, parties:rental_parties(name)")
    .eq("received_date", day)
    .is("deleted_at", null);
  let challansQ = supabase
    .from("rental_challans")
    .select("id, type, challan_no, parties:rental_parties(name)")
    .eq("challan_date", day)
    .is("deleted_at", null);
  if (firmId) {
    paymentsQ = paymentsQ.eq("firm_id", firmId);
    depositsQ = depositsQ.eq("firm_id", firmId);
    challansQ = challansQ.eq("firm_id", firmId);
  }
  const [{ data: payments }, { data: deposits }, { data: challans }] =
    await Promise.all([paymentsQ, depositsQ, challansQ]);
  return {
    payments: (payments as unknown as DayData["payments"]) ?? [],
    deposits: (deposits as unknown as DayData["deposits"]) ?? [],
    challans: (challans as unknown as DayData["challans"]) ?? [],
  };
}

export default function DayBookPage() {
  const t = useTranslations("reports");
  const tb = useTranslations("billing");
  const tch = useTranslations("challans");
  const tc = useTranslations("common");
  const locale = useLocale();
  const { tenant, firm } = useTenantSession();
  const firmId = firmsActive(tenant) ? (firm?.id ?? null) : null;
  const [day, setDay] = useState(todayISO());

  const { data, loading } = useQuery(() => loadDay(firmId, day), [firmId, day]);

  // cash in = receipts + deposits received; cash out = paid + refunds
  const cashIn =
    (data?.payments ?? [])
      .filter((p) => p.type === "receipt")
      .reduce((s, p) => s + Number(p.amount), 0) +
    (data?.deposits ?? []).reduce((s, d) => s + Number(d.amount), 0);
  const cashOut = (data?.payments ?? [])
    .filter((p) => p.type !== "receipt")
    .reduce((s, p) => s + Number(p.amount), 0);

  return (
    <div>
      <PageHeader title={t("dayBook")} />
      <div className="mb-3">
        <Label htmlFor="day">{tc("date")}</Label>
        <Input
          id="day"
          type="date"
          value={day}
          onChange={(e) => setDay(e.target.value)}
        />
      </div>

      {loading || !data ? (
        <ListSkeleton />
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Card className="text-center">
              <div className="text-lg font-bold text-emerald-700">
                {fmtMoney(cashIn)}
              </div>
              <div className="text-xs text-muted">{t("cashIn")}</div>
            </Card>
            <Card className="text-center">
              <div className="text-lg font-bold text-red-600">
                {fmtMoney(cashOut)}
              </div>
              <div className="text-xs text-muted">{t("cashOut")}</div>
            </Card>
          </div>

          <section>
            <h2 className="mb-2 text-sm font-semibold text-muted">
              {tb("payments")}
            </h2>
            {data.payments.length === 0 && data.deposits.length === 0 ? (
              <EmptyState message={tc("noData")} />
            ) : (
              <div className="space-y-2">
                {data.payments.map((p) => (
                  <Card key={p.id} className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium">
                        {p.parties?.name ?? "—"}
                      </div>
                      <div className="text-xs text-muted">
                        {tb(p.method)}
                        {p.type !== "receipt" && <> · {tb("pmtPaid")}</>}
                      </div>
                    </div>
                    <span
                      className={`text-sm font-bold ${p.type === "receipt" ? "text-emerald-700" : "text-red-600"}`}
                    >
                      {p.type === "receipt" ? "+" : "−"}
                      {fmtMoney(Number(p.amount))}
                    </span>
                  </Card>
                ))}
                {data.deposits.map((d) => (
                  <Card key={d.id} className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium">
                        {d.parties?.name ?? "—"}
                      </div>
                      <div className="text-xs text-muted">
                        {tb("deposits")} · {tb(d.method)}
                      </div>
                    </div>
                    <span className="text-sm font-bold text-emerald-700">
                      +{fmtMoney(Number(d.amount))}
                    </span>
                  </Card>
                ))}
              </div>
            )}
          </section>

          <section>
            <h2 className="mb-2 text-sm font-semibold text-muted">
              {tch("title")}
            </h2>
            {data.challans.length === 0 ? (
              <EmptyState message={tc("noData")} />
            ) : (
              <div className="space-y-2">
                {data.challans.map((ch) => (
                  <Link key={ch.id} to={`/challans/${ch.id}`} className="block">
                    <Card interactive className="flex items-center justify-between">
                      <div>
                        <div className="text-sm font-medium">
                          {ch.parties?.name ?? "—"}
                        </div>
                        <div className="text-xs text-muted">
                          {ch.challan_no} · {fmtDate(day, locale)}
                        </div>
                      </div>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${CHALLAN_BADGE[ch.type]}`}
                      >
                        {tch(ch.type)}
                      </span>
                    </Card>
                  </Link>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
