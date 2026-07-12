import { useLocale, useTranslations } from "@/i18n";
import { fmtDate, fmtMoney } from "@/lib/format";
import type { ChallanType } from "@/lib/types";
import { firmsActive, useTenantSession } from "@/session";

export interface ReceiptLine {
  id: string;
  qty: number;
  rate: number | null;
  marko: string | null;
  items: { name: string; unit: string } | null;
  item_variants: { name: string } | null;
}

export interface ReceiptChallan {
  type: ChallanType;
  challan_no: string | null;
  challan_date: string;
  notes: string | null;
  vehicle_no: string | null;
  parties: { name: string; phone: string | null } | null;
  drivers: { name: string } | null;
}

export interface ReceiptCharge {
  id: string;
  amount: number;
  charge_types: { name: string } | null;
}

export interface ReceiptDeposit {
  id: string;
  amount: number;
  status: string;
}

/**
 * Off-screen challan receipt for JPEG capture. Fixed 800px width,
 * text letterhead (matches the print output — no artwork), neutral
 * ink so the capture prints cleanly.
 */
export function ReceiptTemplate({
  challan,
  lines,
  charges,
  deposits,
}: {
  challan: ReceiptChallan;
  lines: ReceiptLine[];
  charges: ReceiptCharge[];
  deposits: ReceiptDeposit[];
}) {
  const locale = useLocale();
  const t = useTranslations("challans");
  const tc = useTranslations("common");
  const { tenant, firm } = useTenantSession();
  const letterhead = firmsActive(tenant) ? (firm?.name ?? tenant.name) : tenant.name;
  const totalQty = lines.reduce((sum, l) => sum + Number(l.qty), 0);
  const totalCharges = charges.reduce((s, c) => s + Number(c.amount), 0);

  return (
    <div className="w-[800px] bg-white p-10 text-gray-900">
      {/* letterhead */}
      <div className="border-b-2 border-gray-800 pb-4 text-center">
        <div className="text-2xl font-bold">{letterhead}</div>
      </div>

      {/* challan meta */}
      <div className="mt-5 flex justify-between text-sm">
        <div>
          <div className="text-lg font-bold">{challan.parties?.name}</div>
          {challan.parties?.phone && (
            <div className="text-gray-600">{challan.parties.phone}</div>
          )}
        </div>
        <div className="text-right">
          <div className="font-bold">
            {challan.challan_no} · {t(challan.type)}
          </div>
          <div className="text-gray-600">
            {fmtDate(challan.challan_date, locale)}
          </div>
          {challan.drivers?.name && (
            <div className="text-gray-600">
              {t("driver")}: {challan.drivers.name}
            </div>
          )}
          {challan.vehicle_no && (
            <div className="text-gray-600">
              {t("vehicle")}: {challan.vehicle_no}
            </div>
          )}
        </div>
      </div>

      {/* lines */}
      <table className="mt-6 w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-gray-400 text-left">
            <th className="py-2 pr-2">{t("lines")}</th>
            <th className="py-2 pr-2">{t("marko")}</th>
            <th className="py-2 pr-2 text-right">{t("qty")}</th>
            <th className="py-2 text-right">{t("rate")}</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.id} className="border-b border-gray-200">
              <td className="py-2 pr-2 font-medium">
                {l.items?.name ?? "—"}
                {l.item_variants?.name && (
                  <span className="text-gray-500"> · {l.item_variants.name}</span>
                )}
              </td>
              <td className="py-2 pr-2">{l.marko ?? ""}</td>
              <td className="py-2 pr-2 text-right">
                {l.qty} {l.items?.unit ?? ""}
              </td>
              <td className="py-2 text-right">
                {l.rate != null ? fmtMoney(l.rate) : ""}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="font-bold">
            <td className="py-2" colSpan={2}>
              {tc("total")}
            </td>
            <td className="py-2 pr-2 text-right">{totalQty}</td>
            <td />
          </tr>
        </tfoot>
      </table>

      {/* charges */}
      {charges.length > 0 && (
        <div className="mt-4 text-sm">
          <div className="mb-1 font-bold">{t("charges")}</div>
          {charges.map((c) => (
            <div key={c.id} className="flex justify-between border-b border-gray-200 py-1">
              <span>{c.charge_types?.name ?? "—"}</span>
              <span>{fmtMoney(Number(c.amount))}</span>
            </div>
          ))}
          <div className="flex justify-between py-1 font-bold">
            <span>{tc("total")}</span>
            <span>{fmtMoney(totalCharges)}</span>
          </div>
        </div>
      )}

      {/* deposits */}
      {deposits.map((d) => (
        <div key={d.id} className="mt-2 flex justify-between text-sm">
          <span className="font-bold">{t("deposit")}</span>
          <span>
            {fmtMoney(Number(d.amount))} ({d.status})
          </span>
        </div>
      ))}

      {challan.notes && (
        <div className="mt-4 text-sm text-gray-600">{challan.notes}</div>
      )}
    </div>
  );
}
