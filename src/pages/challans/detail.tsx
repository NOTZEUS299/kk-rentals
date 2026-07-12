import { useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useLocale, useTranslations } from "@/i18n";
import { fmtDate, fmtMoney } from "@/lib/format";
import { downloadNodeAsJpeg, fileSlug } from "@/lib/jpeg";
import { supabase } from "@/lib/supabase";
import { useQuery } from "@/lib/use-query";
import type { ChallanType } from "@/lib/types";
import { Card, EmptyState, ListSkeleton, PageHeader } from "@/components/ui";
import { Icon } from "@/components/icons";
import { useToast } from "@/components/toast";
import { ReceiptTemplate } from "@/components/receipt-template";
import { CHALLAN_BADGE } from "@/lib/challan-badge";

interface LineRow {
  id: string;
  qty: number;
  rate: number | null;
  marko: string | null;
  items: { name: string; unit: string } | null;
  item_variants: { name: string } | null;
  lot_supplier: { name: string } | null;
}

interface ChallanRow {
  id: string;
  type: ChallanType;
  challan_no: string | null;
  challan_date: string;
  notes: string | null;
  vehicle_no: string | null;
  custom_fields: Record<string, unknown> | null;
  parties: { id: string; name: string; phone: string | null } | null;
  drivers: { name: string } | null;
}

interface ChargeRow {
  id: string;
  amount: number;
  qty: number | null;
  notes: string | null;
  challan_line_id: string | null;
  charge_types: { name: string } | null;
}

async function loadChallan(id: string) {
  const [{ data: challan }, { data: lines }, { data: charges }] =
    await Promise.all([
      supabase
        .from("rental_challans")
        .select(
          "id, type, challan_no, challan_date, notes, vehicle_no, custom_fields, parties:rental_parties(id, name, phone), drivers:rental_drivers(name)",
        )
        .eq("id", id)
        .is("deleted_at", null)
        .maybeSingle(),
      supabase
        .from("rental_challan_lines")
        .select(
          "id, qty, rate, marko, items:rental_items(name, unit), item_variants:rental_item_variants(name), lot_supplier:rental_parties!challan_lines_lot_supplier_id_fkey(name)",
        )
        .eq("challan_id", id)
        .is("deleted_at", null),
      supabase
        .from("rental_challan_charges")
        .select("id, amount, qty, notes, challan_line_id, charge_types:rental_charge_types(name)")
        .eq("challan_id", id)
        .is("deleted_at", null),
    ]);
  const { data: deposits } = await supabase
    .from("rental_deposits")
    .select("id, amount, status")
    .eq("challan_id", id)
    .is("deleted_at", null);
  return {
    challan: challan as unknown as ChallanRow | null,
    lines: (lines as unknown as LineRow[]) ?? [],
    charges: (charges as unknown as ChargeRow[]) ?? [],
    deposits:
      (deposits as { id: string; amount: number; status: string }[]) ?? [],
  };
}

export default function ChallanDetailPage() {
  const { id = "" } = useParams();
  const locale = useLocale();
  const t = useTranslations("challans");
  const tc = useTranslations("common");
  const toast = useToast();
  const receiptRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);

  const { data, loading } = useQuery(() => loadChallan(id), [id]);

  if (loading || !data) return <ListSkeleton />;
  if (!data.challan) return <EmptyState message={tc("noData")} />;
  const challan = data.challan;
  const party = challan.parties;
  const driver = challan.drivers;
  const totalQty = data.lines.reduce((sum, l) => sum + Number(l.qty), 0);
  const customEntries = Object.entries(challan.custom_fields ?? {}).filter(
    ([, v]) => v !== null && v !== "" && v !== false,
  );

  // WhatsApp share: plain-text challan summary, prefilled to the
  // party's number when we have one
  const shareText = [
    `${challan.challan_no ?? ""} · ${t(challan.type)}`,
    `${party?.name ?? ""} · ${fmtDate(challan.challan_date, locale)}`,
    "",
    ...data.lines.map(
      (l) =>
        `${l.items?.name ?? "?"}${l.item_variants?.name ? ` (${l.item_variants.name})` : ""} × ${l.qty} ${l.items?.unit ?? ""}${l.marko ? ` [${l.marko}]` : ""}`,
    ),
    `${tc("total")}: ${totalQty}`,
    ...(data.charges.length > 0
      ? [
          "",
          ...data.charges.map(
            (c) =>
              `${c.charge_types?.name ?? ""}: ${fmtMoney(Number(c.amount))}`,
          ),
        ]
      : []),
    ...data.deposits.map(
      (d) => `${t("deposit")}: ${fmtMoney(Number(d.amount))} (${d.status})`,
    ),
  ].join("\n");
  const waDigits = (party?.phone ?? "").replace(/\D/g, "");
  const waHref = `https://wa.me/${
    waDigits.length === 10 ? `91${waDigits}` : waDigits
  }?text=${encodeURIComponent(shareText)}`;

  const onDownload = async () => {
    if (!receiptRef.current || downloading) return;
    setDownloading(true);
    try {
      await downloadNodeAsJpeg(
        receiptRef.current,
        fileSlug(
          `${challan.challan_no ?? "challan"}_${party?.name ?? ""}_${challan.challan_date}`,
        ),
      );
    } catch {
      toast(tc("downloadFailed"), "error");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title={challan.challan_no ?? t("title")}
        action={
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-medium ${CHALLAN_BADGE[challan.type] ?? CHALLAN_BADGE.issue}`}
          >
            {t(challan.type)}
          </span>
        }
      />

      {/* actions: print a hard copy / send on WhatsApp */}
      <div className="flex gap-2 print:hidden">
        <button
          type="button"
          onClick={() => window.print()}
          className="flex min-h-10 flex-1 items-center justify-center gap-2 rounded-app border border-border bg-card text-sm font-medium hover:bg-background"
        >
          🖨 {t("print")}
        </button>
        <button
          type="button"
          onClick={() => void onDownload()}
          disabled={downloading}
          className="flex min-h-10 flex-1 items-center justify-center gap-2 rounded-app border border-border bg-card text-sm font-medium hover:bg-background disabled:opacity-50"
        >
          <Icon name="download" className="h-4 w-4" />
          {downloading ? tc("loading") : t("downloadJpeg")}
        </button>
        <a
          href={waHref}
          target="_blank"
          rel="noreferrer"
          className="flex min-h-10 flex-1 items-center justify-center gap-2 rounded-app border border-emerald-600 text-sm font-medium text-emerald-700 hover:bg-emerald-50"
        >
          {t("shareWhatsApp")}
        </a>
      </div>

      {/* off-screen receipt for JPEG capture */}
      <div
        className="fixed left-[-10000px] top-0 print:hidden"
        aria-hidden
      >
        <div ref={receiptRef}>
          <ReceiptTemplate
            challan={challan}
            lines={data.lines}
            charges={data.charges}
            deposits={data.deposits}
          />
        </div>
      </div>

      <Card className="space-y-1 text-sm">
        <div className="flex justify-between">
          <span className="text-muted">{t("party")}</span>
          {party ? (
            <Link
              to={`/parties/${party.id}`}
              className="font-medium text-primary"
            >
              {party.name}
            </Link>
          ) : (
            <span>—</span>
          )}
        </div>
        <div className="flex justify-between">
          <span className="text-muted">{tc("date")}</span>
          <span>{fmtDate(challan.challan_date, locale)}</span>
        </div>
        {driver?.name && (
          <div className="flex justify-between">
            <span className="text-muted">{t("driver")}</span>
            <span>{driver.name}</span>
          </div>
        )}
        {challan.vehicle_no && (
          <div className="flex justify-between">
            <span className="text-muted">{t("vehicle")}</span>
            <span>{challan.vehicle_no}</span>
          </div>
        )}
        {challan.notes && (
          <div className="flex justify-between gap-4">
            <span className="text-muted">{tc("notes")}</span>
            <span className="text-right">{challan.notes}</span>
          </div>
        )}
        {customEntries.map(([k, v]) => (
          <div key={k} className="flex justify-between">
            <span className="text-muted">{k}</span>
            <span>{v === true ? "✓" : String(v)}</span>
          </div>
        ))}
        {data.deposits.map((d) => (
          <div key={d.id} className="flex justify-between">
            <span className="text-muted">{t("deposit")}</span>
            <span>
              {fmtMoney(Number(d.amount))}
              <span className="ml-1 text-xs text-muted">({d.status})</span>
            </span>
          </div>
        ))}
      </Card>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-muted">{t("lines")}</h2>
        <div className="space-y-2">
          {data.lines.map((line) => (
            <Card key={line.id} className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium">
                  {line.items?.name ?? "—"}
                  {line.item_variants?.name && (
                    <span className="text-muted"> · {line.item_variants.name}</span>
                  )}
                </div>
                <div className="text-xs text-muted">
                  {line.rate != null && <>{fmtMoney(line.rate)} · </>}
                  {line.lot_supplier?.name ?? t("own")}
                  {line.marko && (
                    <span className="font-medium text-foreground">
                      {" "}
                      [{line.marko}]
                    </span>
                  )}
                </div>
              </div>
              <div className="text-sm font-bold">
                {line.qty} {line.items?.unit ?? ""}
              </div>
            </Card>
          ))}
        </div>
        <div className="mt-2 flex justify-between px-1 text-sm font-semibold">
          <span>{tc("total")}</span>
          <span>{totalQty}</span>
        </div>
      </section>

      {data.charges.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-muted">
            {t("charges")}
          </h2>
          <div className="space-y-2">
            {data.charges.map((charge) => {
              const line = data.lines.find(
                (l) => l.id === charge.challan_line_id,
              );
              return (
                <Card key={charge.id} className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium">
                      {charge.charge_types?.name ?? "—"}
                      {line?.items?.name && (
                        <span className="text-muted"> · {line.items.name}</span>
                      )}
                    </div>
                    {(charge.qty != null || charge.notes) && (
                      <div className="text-xs text-muted">
                        {charge.qty != null && <>{t("qty")}: {charge.qty}</>}
                        {charge.qty != null && charge.notes && " · "}
                        {charge.notes}
                      </div>
                    )}
                  </div>
                  <div className="text-sm font-semibold">
                    {fmtMoney(Number(charge.amount))}
                  </div>
                </Card>
              );
            })}
          </div>
          <div className="mt-2 flex justify-between px-1 text-sm font-semibold">
            <span>{tc("total")}</span>
            <span>
              {fmtMoney(
                data.charges.reduce((s, c) => s + Number(c.amount), 0),
              )}
            </span>
          </div>
        </section>
      )}

      <Link
        to="/challans"
        className="inline-flex min-h-11 items-center text-sm font-medium text-primary print:hidden"
      >
        ← {tc("back")}
      </Link>
    </div>
  );
}
