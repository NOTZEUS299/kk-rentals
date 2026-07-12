import { useLocale, useTranslations } from "@/i18n";
import { fmtDate, fmtMoney } from "@/lib/format";
import type { ChallanType } from "@/lib/types";
import { firmsActive, useTenantSession } from "@/session";

export interface StatementSummary {
  rent: number;
  charges: number;
  paid: number;
  balance: number;
}

export interface StatementChunk {
  itemName: string;
  qty: number;
  from: string;
  days: number;
  rate: number;
  amount: number;
}

export interface StatementChallan {
  id: string;
  type: ChallanType;
  challan_no: string | null;
  challan_date: string;
  summary: string;
}

/**
 * Off-screen party ledger statement for JPEG capture. Mirrors the
 * printed statement: letterhead, totals, open rent chunks, challans.
 */
export function StatementTemplate({
  partyName,
  partyPhone,
  asOf,
  customer,
  supplier,
  openRows,
  challans,
}: {
  partyName: string;
  partyPhone: string | null;
  asOf: string;
  customer: StatementSummary | null;
  supplier: StatementSummary | null;
  openRows: StatementChunk[];
  challans: StatementChallan[];
}) {
  const locale = useLocale();
  const t = useTranslations("billing");
  const tch = useTranslations("challans");
  const { tenant, firm } = useTenantSession();
  const letterhead = firmsActive(tenant) ? (firm?.name ?? tenant.name) : tenant.name;

  const summaryBlock = (label: string, s: StatementSummary, paidLabel: string, balLabel: string) => (
    <div className="mt-4 grid grid-cols-4 gap-2 text-center text-sm">
      <div className="rounded border border-gray-300 p-2">
        <div className="font-bold">{fmtMoney(s.rent)}</div>
        <div className="text-xs text-gray-600">{label}</div>
      </div>
      <div className="rounded border border-gray-300 p-2">
        <div className="font-bold">{fmtMoney(s.charges)}</div>
        <div className="text-xs text-gray-600">{t("charges")}</div>
      </div>
      <div className="rounded border border-gray-300 p-2">
        <div className="font-bold">{fmtMoney(s.paid)}</div>
        <div className="text-xs text-gray-600">{paidLabel}</div>
      </div>
      <div className="rounded border border-gray-300 p-2">
        <div className="font-bold">{fmtMoney(s.balance)}</div>
        <div className="text-xs text-gray-600">{balLabel}</div>
      </div>
    </div>
  );

  return (
    <div className="w-[800px] bg-white p-10 text-gray-900">
      <div className="border-b-2 border-gray-800 pb-4 text-center">
        <div className="text-2xl font-bold">{letterhead}</div>
      </div>

      <div className="mt-5 flex justify-between text-sm">
        <div>
          <div className="text-lg font-bold">{partyName}</div>
          {partyPhone && <div className="text-gray-600">{partyPhone}</div>}
        </div>
        <div className="text-right">
          <div className="font-bold">{t("ledger")}</div>
          <div className="text-gray-600">{fmtDate(asOf, locale)}</div>
        </div>
      </div>

      {customer && summaryBlock(t("rent"), customer, t("received"), t("balance"))}
      {supplier && summaryBlock(t("payable"), supplier, t("paidOut"), t("toPay"))}

      {openRows.length > 0 && (
        <table className="mt-6 w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-gray-400 text-left">
              <th className="py-2 pr-2">{t("outstanding")}</th>
              <th className="py-2 pr-2 text-right">{tch("qty")}</th>
              <th className="py-2 pr-2">{t("from")}</th>
              <th className="py-2 pr-2 text-right">{t("days")}</th>
              <th className="py-2 pr-2 text-right">{tch("rate")}</th>
              <th className="py-2 text-right">{t("amount")}</th>
            </tr>
          </thead>
          <tbody>
            {openRows.map((r, i) => (
              <tr key={i} className="border-b border-gray-200">
                <td className="py-1.5 pr-2 font-medium">{r.itemName}</td>
                <td className="py-1.5 pr-2 text-right">{r.qty}</td>
                <td className="py-1.5 pr-2">{fmtDate(r.from, locale)}</td>
                <td className="py-1.5 pr-2 text-right">{r.days}</td>
                <td className="py-1.5 pr-2 text-right">{fmtMoney(r.rate)}</td>
                <td className="py-1.5 text-right font-medium">
                  {fmtMoney(r.amount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {challans.length > 0 && (
        <div className="mt-6 text-sm">
          <div className="mb-1 border-b border-gray-400 py-1 font-bold">
            {tch("title")}
          </div>
          {challans.map((ch) => (
            <div key={ch.id} className="flex justify-between border-b border-gray-200 py-1.5">
              <span>
                <span className="font-medium">{ch.challan_no}</span>
                <span className="text-gray-600"> · {tch(ch.type)}</span>
              </span>
              <span className="text-gray-600">
                {fmtDate(ch.challan_date, locale)} · {ch.summary}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
