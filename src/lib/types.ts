export type RateRule =
  | { type: "per_day" }
  | { type: "per_month"; daysPerMonth?: number }
  | { type: "min_days"; minDays: number }
  | { type: "custom"; formula: string };

/** off = single firm; A = bill per firm; B = inventory per firm; C = both */
export type FirmMode = "off" | "A" | "B" | "C";

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  locale: string;
  theme: Record<string, string>;
  settings: {
    billing?: { countReturnDay?: boolean };
  };
  /** UI composition (dashboard widgets, density…) — see lib/ui-settings.ts */
  ui_settings: Record<string, unknown>;
  /** admin-managed feature matrix — see lib/features.ts */
  features: Record<string, unknown>;
  /** admin-managed app/module/submodule access — see lib/app-access.ts */
  app_access: Record<string, unknown>;
  firm_mode: FirmMode;
}

/** A firm is a sub-entity within a tenant (shares parties/drivers). */
export interface Firm {
  id: string;
  tenant_id: string;
  name: string;
  is_default: boolean;
  deleted_at: string | null;
}

export interface Profile {
  id: string;
  tenant_id: string | null;
  full_name: string | null;
  phone: string | null;
  role: "owner" | "manager" | "staff";
  is_super_admin: boolean;
  locale: string | null;
  current_firm_id: string | null;
}

/** customer = we rent out to them; supplier = we borrow stock from them */
export type PartyKind = "customer" | "supplier" | "both";

export interface Party {
  id: string;
  tenant_id: string;
  name: string;
  kind: PartyKind;
  phone: string | null;
  address: string | null;
  notes: string | null;
  custom_fields?: Record<string, string | number | boolean | null>;
  deleted_at: string | null;
}

export interface Driver {
  id: string;
  tenant_id: string;
  name: string;
  phone: string | null;
  license_no: string | null;
  vehicle_no: string | null;
  notes: string | null;
  custom_fields?: Record<string, string | number | boolean | null>;
  deleted_at: string | null;
}

/** Per-party override; null field falls back to the item's value. */
export interface PartyItemRate {
  id: string;
  tenant_id: string;
  party_id: string;
  item_id: string;
  rate: number | null;
  rate_rule: RateRule | null;
  deleted_at: string | null;
}

export interface Item {
  id: string;
  tenant_id: string;
  firm_id: string | null;
  name: string;
  unit: string;
  total_qty: number;
  default_rate: number;
  rate_rule: RateRule;
  /** physical mark on owned stock (e.g. "OUR") */
  marko: string | null;
  custom_fields?: Record<string, string | number | boolean | null>;
  deleted_at: string | null;
}

/** Optional sub-type of an item (e.g. plate 2ft / 3ft), own stock axis. */
export interface ItemVariant {
  id: string;
  tenant_id: string;
  firm_id: string | null;
  item_id: string;
  name: string;
  total_qty: number;
  default_rate: number | null;
  marko: string | null;
  sort: number;
  deleted_at: string | null;
}

/** issue/return = outward with customers; borrow/giveback = inward from suppliers */
export type ChallanType = "issue" | "return" | "borrow" | "giveback";

export interface Challan {
  id: string;
  tenant_id: string;
  firm_id: string | null;
  party_id: string;
  type: ChallanType;
  challan_no: string | null;
  local_no: string | null;
  challan_date: string;
  notes: string | null;
  driver_id: string | null;
  vehicle_no: string | null;
  custom_fields?: Record<string, string | number | boolean | null>;
  deleted_at: string | null;
}

export interface ChallanLine {
  id: string;
  challan_id: string;
  item_id: string;
  /** which variant of the item, null = base item */
  variant_id: string | null;
  qty: number;
  rate: number | null;
  /** mark on the material for this line (supplier's mark on borrow) */
  marko: string | null;
  /** lot source: the supplier this stock came from; null = own stock */
  lot_supplier_id: string | null;
  deleted_at: string | null;
}

/** Admin-defined fee catalog entry (loading, petrol, damage, lost…). */
export interface ChargeType {
  id: string;
  tenant_id: string;
  /** stable key: built-ins or a tenant-specific slug */
  key: string;
  name: string;
  /** where the charge attaches: whole challan or a single line */
  level: "challan" | "line";
  default_amount: number | null;
  /** lost items also reduce stock (write-off via stock entries) */
  affects_stock: boolean;
  is_active: boolean;
  sort: number;
  deleted_at: string | null;
}

/** A fee recorded on a challan (or one of its lines). */
export interface ChallanCharge {
  id: string;
  tenant_id: string;
  challan_id: string;
  challan_line_id: string | null;
  charge_type_id: string;
  amount: number;
  /** optional quantity behind the amount (e.g. 3 plates lost) */
  qty: number | null;
  notes: string | null;
  deleted_at: string | null;
}

/** A numbered document series (e.g. rental book vs sale book). */
export interface BillBook {
  id: string;
  tenant_id: string;
  firm_id: string | null;
  name: string;
  /** short code stamped into the number, e.g. 'RB' -> RB/26-27/12 */
  prefix: string;
  is_default: boolean;
  is_active: boolean;
  sort: number;
  deleted_at: string | null;
}

/** One audited change to owned stock (purchase, correction, write-off). */
export interface StockEntry {
  id: string;
  tenant_id: string;
  firm_id: string | null;
  item_id: string;
  variant_id: string | null;
  kind: "add" | "remove" | "correction" | "writeoff" | "initial";
  /** signed change to owned qty */
  qty_delta: number;
  /** purchase price per unit for 'add' entries */
  unit_price: number | null;
  notes: string | null;
  charge_id: string | null;
  created_at: string;
  deleted_at: string | null;
}

/** Security deposit held from a party (standing, per challan or per item). */
export interface Deposit {
  id: string;
  tenant_id: string;
  firm_id: string | null;
  party_id: string;
  challan_id: string | null;
  item_id: string | null;
  amount: number;
  status: "held" | "refunded" | "adjusted";
  received_date: string;
  resolved_date: string | null;
  method: "cash" | "upi" | "bank" | "cheque" | "other";
  notes: string | null;
  deleted_at: string | null;
}

export interface Payment {
  id: string;
  tenant_id: string;
  party_id: string;
  type: "receipt" | "refund" | "paid";
  amount: number;
  method: "cash" | "upi" | "bank" | "cheque" | "other";
  payment_date: string;
  notes: string | null;
  custom_fields?: Record<string, string | number | boolean | null>;
  deleted_at: string | null;
}
