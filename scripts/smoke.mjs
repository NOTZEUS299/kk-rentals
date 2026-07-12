// SPA data-layer smoke: seeds a tenant via supabase-js, then runs the
// exact queries + mutations every SPA page performs (same select
// strings, FK aliases, RPCs) as a signed-in browser client would.
// The SPA has no server rendering, so this replaces the old cookie-
// forging HTTP smoke. Run: node scripts/smoke.mjs
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const REF = "ggxplbgubybcrpkcqalf";
const url = `https://${REF}.supabase.co`;
const key = "sb_publishable_pcLM_o9gQHq9hTWYFHdx8A_ltI6zWBi";
const sb = createClient(url, key);

// public signup is disabled (tenants are onboarded from the admin
// panel), so seeding needs the secret key: env var or rental/.env.local
function serviceKey() {
  if (process.env.SUPABASE_SECRET_KEY) return process.env.SUPABASE_SECRET_KEY;
  try {
    const env = readFileSync(
      new URL("../.env.local", import.meta.url),
      "utf8",
    );
    const m = env.match(/^SUPABASE_SECRET_KEY=(.+)$/m);
    if (m?.[1]?.trim()) return m[1].trim();
  } catch {}
  console.error(
    "FAIL: SUPABASE_SECRET_KEY not set (env var or rental/.env.local)",
  );
  process.exit(1);
}
const admin = createClient(url, serviceKey(), {
  auth: { autoRefreshToken: false, persistSession: false },
});

const log = (...a) => console.log(...a);
const failures = [];
const flag = (m) => {
  failures.push(m);
  console.error("  BUG:", m);
};
const die = (m, e) => {
  console.error("FAIL:", m, e?.message ?? e ?? "");
  process.exit(1);
};
const ok = (name, error) => {
  if (error) flag(`${name}: ${error.message}`);
  else log("  ok:", name);
};

// ---- seed ----
const email = `spa_${Date.now()}@gmail.com`;
const password = "Test1234!";
const { data: created, error: createErr } = await admin.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
});
if (createErr) die("createUser", createErr);
log("user:", email);

const { data: tenantId, error: onbErr } = await admin.rpc(
  "admin_onboard_tenant",
  { p_user_id: created.user.id, p_name: "SPA Smoke Co", p_locale: "en" },
);
if (onbErr) die("admin_onboard_tenant", onbErr);

const { error: signInErr } = await sb.auth.signInWithPassword({ email, password });
if (signInErr) die("signIn", signInErr);

const { data: firmRow } = await sb.from("firms").select("id").eq("is_default", true).single();
const FIRM = firmRow.id;

const { data: cust } = await sb
  .from("rental_parties")
  .insert({ tenant_id: tenantId, name: "SPA Customer", kind: "customer" })
  .select()
  .single();
const { data: supp } = await sb
  .from("rental_parties")
  .insert({ tenant_id: tenantId, name: "SPA Supplier", kind: "supplier" })
  .select()
  .single();
const { data: item } = await sb
  .from("rental_items")
  .insert({
    tenant_id: tenantId,
    firm_id: FIRM,
    name: "SPA Plate",
    unit: "pcs",
    total_qty: 100,
    default_rate: 2,
    rate_rule: { type: "per_day" },
    marko: "SP",
  })
  .select()
  .single();
const { data: driver } = await sb
  .from("rental_drivers")
  .insert({ tenant_id: tenantId, name: "SPA Driver", phone: "9999999999" })
  .select()
  .single();
log("seeded tenant:", tenantId);

// ---- session load (session.tsx) ----
{
  const { data: u } = await sb.auth.getUser();
  const { data: profile, error } = await sb
    .from("profiles").select("*").eq("id", u.user.id).maybeSingle();
  ok("session: profile", error);
  const [{ error: e1 }, { error: e2 }, { error: e3 }] = await Promise.all([
    sb.from("tenants").select("*").eq("id", profile.tenant_id).maybeSingle(),
    sb.from("firms").select("*").eq("tenant_id", profile.tenant_id).is("deleted_at", null).order("name"),
    sb.rpc("enabled_modules"),
  ]);
  ok("session: tenant", e1);
  ok("session: firms", e2);
  ok("session: enabled_modules", e3);
}

// ---- create challans (challan-form -> createChallan) ----
const mkChallan = async (name, args) => {
  const { data, error } = await sb.rpc("create_challan", args);
  if (error) die(name, error);
  log("  ok:", name, data);
  return data;
};
await mkChallan("challan: issue", {
  p_party: cust.id, p_type: "issue", p_date: null, p_notes: "", p_driver: driver.id, p_vehicle: "GJ01",
  p_lines: [{ itemId: item.id, variantId: null, qty: 10, rate: 2, marko: "SP", lotSupplierId: null }],
});
await mkChallan("challan: borrow", {
  p_party: supp.id, p_type: "borrow", p_date: null, p_notes: "", p_driver: null, p_vehicle: "",
  p_lines: [{ itemId: item.id, variantId: null, qty: 5, rate: 1, marko: "SUP", lotSupplierId: null }],
});
const chId = await mkChallan("challan: return", {
  p_party: cust.id, p_type: "return", p_date: null, p_notes: "", p_driver: null, p_vehicle: "",
  p_lines: [{ itemId: item.id, variantId: null, qty: 4, rate: null, marko: "SP", lotSupplierId: null }],
});

// custom-fields follow-up write (createChallan tail)
{
  const { error } = await sb.from("rental_challans").update({ custom_fields: {} }).eq("id", chId);
  ok("challan: custom_fields update", error);
}

// ---- page queries ----
// dashboard.tsx
{
  const [{ error: e1 }, { error: e2 }, { error: e3 }, { error: e4 }] = await Promise.all([
    sb.from("rental_parties").select("id", { count: "exact", head: true }).is("deleted_at", null),
    sb.from("rental_items").select("id", { count: "exact", head: true }).is("deleted_at", null),
    sb.from("rental_outstanding_lines").select("item_id, qty_out"),
    sb.from("rental_challans")
      .select("id, type, challan_no, challan_date, parties:rental_parties(name)")
      .is("deleted_at", null).order("created_at", { ascending: false }).limit(5),
  ]);
  ok("dashboard: parties count", e1);
  ok("dashboard: items count", e2);
  ok("dashboard: outstanding_lines", e3);
  ok("dashboard: recent challans", e4);
}

// parties/list.tsx (or-ilike search)
{
  const { error } = await sb.from("rental_parties").select("*").is("deleted_at", null)
    .or("name.ilike.%SPA%,phone.ilike.%SPA%").order("name");
  ok("parties: search", error);
}

// items/list.tsx views
{
  const results = await Promise.all([
    sb.from("rental_outstanding_lines").select("item_id, qty_out"),
    sb.from("rental_borrowed_lines").select("item_id, qty_borrowed"),
    sb.from("rental_borrowed_marko").select("party_id, item_id, marko, qty"),
    sb.from("rental_outstanding_marko").select("item_id, marko, qty_out"),
    sb.from("rental_item_variants").select("item_id, total_qty").is("deleted_at", null),
  ]);
  const names = ["outstanding_lines", "borrowed_lines", "borrowed_marko", "outstanding_marko", "item_variants"];
  results.forEach((r, i) => ok(`items: ${names[i]}`, r.error));
}

// challans/list.tsx nested select
{
  const { error } = await sb.from("rental_challans")
    .select("id, type, challan_no, challan_date, vehicle_no, custom_fields, parties:rental_parties(name), drivers:rental_drivers(name), challan_lines:rental_challan_lines(qty, marko)")
    .is("deleted_at", null).order("challan_date", { ascending: false }).limit(100);
  ok("challans: list select", error);
}

// challans/detail.tsx FK alias
{
  const { data, error } = await sb.from("rental_challan_lines")
    .select("id, qty, rate, marko, items:rental_items(name, unit), item_variants:rental_item_variants(name), lot_supplier:rental_parties!challan_lines_lot_supplier_id_fkey(name)")
    .eq("challan_id", chId).is("deleted_at", null);
  ok("challans: detail FK alias", error);
  if (!error && !data.length) flag("challans: detail returned no lines");
}

// challans/new.tsx lot queries
{
  const [{ error: e1 }, { error: e2 }] = await Promise.all([
    sb.from("rental_lot_stock")
      .select("item_id, variant_id, lot_supplier_id, marko, in_hand, borrowed_net").gt("in_hand", 0),
    sb.from("rental_lot_customer_stock")
      .select("party_id, item_id, variant_id, lot_supplier_id, marko, qty_out").gt("qty_out", 0),
  ]);
  ok("challans/new: lot_stock", e1);
  ok("challans/new: lot_customer_stock", e2);
}

// form_definitions (custom-fields getFormFields)
{
  const { error } = await sb.from("form_definitions")
    .select("fields").eq("tenant_id", tenantId).eq("entity", "challan").maybeSingle();
  ok("custom-fields: form_definitions", error);
}

// billing/ledger.tsx + payment insert (actions/payments)
{
  const { data: u } = await sb.auth.getUser();
  const { error } = await sb.from("rental_payments").insert({
    tenant_id: tenantId, firm_id: FIRM, party_id: cust.id, type: "receipt",
    amount: 100, method: "cash", payment_date: new Date().toISOString().slice(0, 10),
    notes: null, custom_fields: {}, created_by: u.user.id,
  });
  ok("payments: insert", error);
  const { error: e2 } = await sb.from("rental_challans").select("*, challan_lines:rental_challan_lines(*)")
    .eq("party_id", cust.id).is("deleted_at", null).order("challan_date");
  ok("ledger: challans+lines", e2);
}

// charges (charge_types seeded by onboard_tenant v3; challan_charges insert)
{
  const { data: cts, error } = await sb
    .from("rental_charge_types").select("*").eq("is_active", true)
    .is("deleted_at", null).order("sort");
  ok("charges: charge_types read", error);
  if (!error && (cts?.length ?? 0) < 6)
    flag(`charges: expected 6 seeded types, got ${cts?.length ?? 0}`);
  const loading = (cts ?? []).find((c) => c.key === "loading");
  const lost = (cts ?? []).find((c) => c.key === "lost");
  if (!loading || !lost) flag("charges: built-ins missing");
  else {
    const { data: line } = await sb.from("rental_challan_lines")
      .select("id").eq("challan_id", chId).limit(1).single();
    const { error: e1 } = await sb.from("rental_challan_charges").insert([
      { tenant_id: tenantId, challan_id: chId, charge_type_id: loading.id, amount: 150, qty: null, notes: null },
      { tenant_id: tenantId, challan_id: chId, challan_line_id: line.id, charge_type_id: lost.id, amount: 60, qty: 3, notes: null },
    ]);
    ok("charges: challan_charges insert", e1);
    // detail-page join
    const { data: chg, error: e2 } = await sb.from("rental_challan_charges")
      .select("id, amount, qty, notes, challan_line_id, charge_types:rental_charge_types(name)")
      .eq("challan_id", chId).is("deleted_at", null);
    ok("charges: detail join", e2);
    if (!e2 && chg.length !== 2) flag(`charges: expected 2 rows, got ${chg.length}`);
    // ledger join (embedded filter)
    const { data: lchg, error: e3 } = await sb.from("rental_challan_charges")
      .select("amount, challans:rental_challans!inner(party_id, type, firm_id)")
      .eq("challans.party_id", cust.id).is("deleted_at", null);
    ok("charges: ledger join", e3);
    if (!e3) {
      const total = lchg.reduce((s, r) => s + Number(r.amount), 0);
      if (total !== 210) flag(`charges: ledger total expected 210, got ${total}`);
      else log("  ok: charges: ledger total 210");
    }
  }
}

// deposits (challan-form deposit + ledger add/resolve)
{
  const { data: u } = await sb.auth.getUser();
  const { data: dep, error: e1 } = await sb.from("rental_deposits").insert({
    tenant_id: tenantId, firm_id: FIRM, party_id: cust.id, challan_id: chId,
    amount: 500, method: "cash", created_by: u.user.id,
  }).select().single();
  ok("deposits: insert (challan-linked)", e1);
  const { error: e2 } = await sb.from("rental_deposits").insert({
    tenant_id: tenantId, firm_id: FIRM, party_id: cust.id,
    amount: 1000, method: "bank", created_by: u.user.id,
  });
  ok("deposits: insert (standing)", e2);
  if (dep) {
    const { error: e3 } = await sb.from("rental_deposits")
      .update({ status: "adjusted", resolved_date: new Date().toISOString().slice(0, 10) })
      .eq("id", dep.id).eq("status", "held");
    ok("deposits: resolve (adjust)", e3);
  }
  const { data: list, error: e4 } = await sb.from("rental_deposits").select("*")
    .eq("party_id", cust.id).is("deleted_at", null)
    .order("received_date", { ascending: false });
  ok("deposits: ledger read", e4);
  if (!e4) {
    const held = list.filter((d) => d.status === "held")
      .reduce((s, d) => s + Number(d.amount), 0);
    if (held !== 1000) flag(`deposits: held expected 1000, got ${held}`);
    else log("  ok: deposits: held total 1000");
  }
}

// stock entries (adjust_stock RPC + history + lost write-off)
{
  // add 50 @ ₹5
  const { error: e1 } = await sb.rpc("adjust_stock", {
    p_item: item.id, p_variant: null, p_delta: 50, p_kind: "add",
    p_unit_price: 5, p_notes: "smoke purchase", p_charge: null,
  });
  ok("stock: adjust_stock add", e1);
  // remove 10
  const { error: e2 } = await sb.rpc("adjust_stock", {
    p_item: item.id, p_variant: null, p_delta: -10, p_kind: "remove",
  });
  ok("stock: adjust_stock remove", e2);
  // counter moved: 100 + 50 - 10 = 140
  const { data: it } = await sb.from("rental_items").select("total_qty").eq("id", item.id).single();
  if (Number(it.total_qty) !== 140) flag(`stock: total_qty expected 140, got ${it.total_qty}`);
  else log("  ok: stock: counter 140");
  // negative guard
  const { error: e3 } = await sb.rpc("adjust_stock", {
    p_item: item.id, p_variant: null, p_delta: -100000, p_kind: "remove",
  });
  if (!e3 || !e3.message.startsWith("STOCK_NEGATIVE")) flag("stock: negative guard missing");
  else log("  ok: stock: negative guard");
  // lost write-off linked to a charge
  const { data: lostType } = await sb.from("rental_charge_types").select("id").eq("key", "lost").single();
  const { data: line } = await sb.from("rental_challan_lines").select("id, item_id, variant_id").eq("challan_id", chId).limit(1).single();
  const { data: lostCharge, error: e4 } = await sb.from("rental_challan_charges").insert({
    tenant_id: tenantId, challan_id: chId, challan_line_id: line.id,
    charge_type_id: lostType.id, amount: 40, qty: 2,
  }).select("id").single();
  ok("stock: lost charge insert", e4);
  const { error: e5 } = await sb.rpc("adjust_stock", {
    p_item: line.item_id, p_variant: line.variant_id, p_delta: -2,
    p_kind: "writeoff", p_unit_price: null, p_notes: "Lost", p_charge: lostCharge.id,
  });
  ok("stock: writeoff w/ charge link", e5);
  // history read (edit-page query)
  const { data: hist, error: e6 } = await sb.from("rental_stock_entries").select("*")
    .eq("item_id", item.id).is("deleted_at", null)
    .order("created_at", { ascending: false }).limit(20);
  ok("stock: history read", e6);
  if (!e6 && hist.length < 3) flag(`stock: expected >=3 entries, got ${hist.length}`);
}

// bill books (challans/new read; writes are admin-only)
{
  const { error } = await sb.from("rental_bill_books").select("*")
    .eq("is_active", true).is("deleted_at", null).order("sort");
  ok("bill books: read", error);
  // default numbering still works after the create_challan v7 swap
  const { data: ch } = await sb.from("rental_challans").select("challan_no").eq("id", chId).single();
  if (!ch.challan_no) flag("bill books: challan_no missing after v7 swap");
  else log("  ok: bill books: default numbering", ch.challan_no);
}

// feature matrix column (session parseFeatures source)
{
  const { data: trow, error } = await sb.from("tenants")
    .select("features").eq("id", tenantId).single();
  ok("features: column read", error);
  if (!error && typeof trow.features !== "object")
    flag("features: expected jsonb object");
}

// party rates (parties/edit.tsx)
{
  const { error } = await sb.from("rental_party_item_rates").insert({
    tenant_id: tenantId, firm_id: FIRM, party_id: cust.id, item_id: item.id,
    rate: 3, rate_rule: null,
  });
  ok("party rates: insert", error);
}

// variants (items/edit.tsx)
{
  const { error } = await sb.from("rental_item_variants").insert({
    tenant_id: tenantId, firm_id: FIRM, item_id: item.id, name: "3ft", total_qty: 20, sort: 1,
  });
  ok("variants: insert", error);
}

// firm switch (firm-switcher.tsx)
{
  const { data: u } = await sb.auth.getUser();
  const { error } = await sb.from("profiles")
    .update({ current_firm_id: FIRM }).eq("id", u.user.id);
  ok("firm switch: profile update", error);
}

// ---- security regressions (were proven by the old admin-smoke) ----
{
  const { data: u } = await sb.auth.getUser();
  // self privilege escalation must be blocked by guard_profile_privileges
  const { error: e1 } = await sb.from("profiles")
    .update({ is_super_admin: true }).eq("id", u.user.id);
  if (!e1) {
    const { data: p } = await sb.from("profiles")
      .select("is_super_admin").eq("id", u.user.id).single();
    if (p.is_super_admin) flag("SECURITY: self-escalation to super admin succeeded");
    else log("  ok: security: escalation silently ignored");
  } else log("  ok: security: escalation blocked:", e1.message.slice(0, 40));
  // tenant hopping after onboarding must be blocked
  const { error: e2 } = await sb.from("profiles")
    .update({ tenant_id: "00000000-0000-0000-0000-000000000000" })
    .eq("id", u.user.id);
  if (!e2) {
    const { data: p2 } = await sb.from("profiles")
      .select("tenant_id").eq("id", u.user.id).single();
    if (p2.tenant_id !== tenantId) flag("SECURITY: tenant_id change succeeded");
    else log("  ok: security: tenant change silently ignored");
  } else log("  ok: security: tenant change blocked:", e2.message.slice(0, 40));
  // admin-only catalogs must reject tenant writes
  const { error: e3 } = await sb.from("rental_charge_types").insert({
    tenant_id: tenantId, key: "hax", name: "Hax", level: "challan",
  });
  if (!e3) flag("SECURITY: tenant wrote charge_types (admin-only)");
  else log("  ok: security: charge_types write blocked");
  const { error: e4 } = await sb.from("rental_bill_books").insert({
    tenant_id: tenantId, name: "Hax", prefix: "HX",
  });
  if (!e4) flag("SECURITY: tenant wrote bill_books (admin-only)");
  else log("  ok: security: bill_books write blocked");
}

if (failures.length) {
  console.error(`\n${failures.length} failure(s)`);
  process.exit(1);
}
log("\nSPA data-layer smoke: ALL GREEN");
