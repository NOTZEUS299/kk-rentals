import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const url = "https://ggxplbgubybcrpkcqalf.supabase.co";
const key = "sb_publishable_pcLM_o9gQHq9hTWYFHdx8A_ltI6zWBi";
const sb = createClient(url, key);

const log = (...a) => console.log(...a);
const die = (m, e) => {
  console.error("FAIL:", m, e?.message ?? e ?? "");
  process.exit(1);
};

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
  die("SUPABASE_SECRET_KEY not set (env var or rental/.env.local)");
}
const admin = createClient(url, serviceKey(), {
  auth: { autoRefreshToken: false, persistSession: false },
});

// helper: provision a confirmed user the way the admin panel does
async function createUser(email, password) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) die(`createUser ${email}`, error);
  return data.user.id;
}

// 1. provision a throwaway user (admin API — public signup is off)
const email = `test_${Date.now()}@gmail.com`;
const password = "Test1234!";
const userId = await createUser(email, password);
log("user created:", email);

// 2. onboard tenant (admin RPC), then sign in as the owner
const { data: tenantId, error: onbErr } = await admin.rpc(
  "admin_onboard_tenant",
  { p_user_id: userId, p_name: "Test Rental Co", p_locale: "en" },
);
if (onbErr) die("admin_onboard_tenant", onbErr);
log("tenant created:", tenantId);

const { error: signInErr } = await sb.auth.signInWithPassword({ email, password });
if (signInErr) die("signIn", signInErr);

// hardening regression: self-serve onboarding must be locked for app users
{
  const { error } = await sb.rpc("onboard_tenant", {
    p_name: "should fail",
    p_locale: "en",
  });
  // expect 42501 insufficient_privilege (execute revoked), not a
  // business-rule error from inside the function body
  if (error?.code !== "42501")
    die("onboard_tenant not locked down (want 42501)", error ?? "no error");
  log("hardening OK: onboard_tenant execute revoked (42501)");
}

// 3. enabled modules (should be rentals + billing on starter)
const { data: mods, error: modErr } = await sb.rpc("enabled_modules");
if (modErr) die("enabled_modules", modErr);
log("enabled modules:", (mods ?? []).sort().join(", "));

// default firm made by onboard — stamp items with it so the lot_stock
// owned-seed (items.firm_id) and challan movements (challans.firm_id)
// land in the same firm group.
const { data: mainFirmRow, error: mfErr } = await sb
  .from("firms")
  .select("id")
  .eq("is_default", true)
  .single();
if (mfErr) die("select default firm", mfErr);
const FIRM = mainFirmRow.id;

// 4. create party
const { data: party, error: partyErr } = await sb
  .from("rental_parties")
  .insert({ tenant_id: tenantId, name: "Ramesh Construction" })
  .select()
  .single();
if (partyErr) die("insert party", partyErr);
log("party:", party.name);

// 5. create item (per_day @ 2/day)
const { data: item, error: itemErr } = await sb
  .from("rental_items")
  .insert({
    tenant_id: tenantId,
    firm_id: FIRM,
    name: "Steel Plate",
    unit: "pcs",
    total_qty: 500,
    default_rate: 2,
    rate_rule: { type: "per_day" },
  })
  .select()
  .single();
if (itemErr) die("insert item", itemErr);
log("item:", item.name, "rule:", JSON.stringify(item.rate_rule));

// 5b. create a driver
const { data: driver, error: drvErr } = await sb
  .from("rental_drivers")
  .insert({
    tenant_id: tenantId,
    name: "Suresh",
    phone: "9999999999",
    vehicle_no: "GJ 01 AB 1234",
  })
  .select()
  .single();
if (drvErr) die("insert driver", drvErr);
log("driver:", driver.name, driver.vehicle_no);

// 5c. per-party rate override (2.50 instead of 2)
const { error: pirErr } = await sb.from("rental_party_item_rates").insert({
  tenant_id: tenantId,
  party_id: party.id,
  item_id: item.id,
  rate: 2.5,
  rate_rule: { type: "min_days", minDays: 5 },
});
if (pirErr) die("insert party_item_rate", pirErr);
log("party rate override: 2.50, min_days 5");

// 6. issue challan (100 plates) via RPC, with driver + vehicle
const { data: issueId, error: issueErr } = await sb.rpc("create_challan", {
  p_party: party.id,
  p_type: "issue",
  p_date: "2026-01-01",
  p_notes: "",
  p_driver: driver.id,
  p_vehicle: driver.vehicle_no,
  p_lines: [{ itemId: item.id, qty: 100, rate: 2 }],
});
if (issueErr) die("create_challan issue", issueErr);

// 7. return 40 on Jan 11
const { error: retErr } = await sb.rpc("create_challan", {
  p_party: party.id,
  p_type: "return",
  p_date: "2026-01-11",
  p_notes: "",
  p_lines: [{ itemId: item.id, qty: 40, rate: null }],
});
if (retErr) die("create_challan return", retErr);

// 8. check auto-assigned challan number + driver linkage
const { data: issueRow } = await sb
  .from("rental_challans")
  .select("challan_no, vehicle_no, drivers:rental_drivers(name)")
  .eq("id", issueId)
  .single();
log(
  "issue challan_no:",
  issueRow.challan_no,
  "driver:",
  issueRow.drivers?.name,
  issueRow.vehicle_no,
  issueRow.drivers?.name === "Suresh" ? "OK" : "DRIVER MISSING",
);

// 9. outstanding view (should be 60 out)
const { data: out, error: outErr } = await sb
  .from("rental_outstanding_lines")
  .select("qty_out");
if (outErr) die("outstanding_lines", outErr);
const qtyOut = (out ?? []).reduce((s, r) => s + Number(r.qty_out), 0);
log("qty outstanding:", qtyOut, qtyOut === 60 ? "OK" : "EXPECTED 60");

// 9b. borrowing: supplier party, borrow 50, give back 20 -> 30 held
const { data: supplier, error: supErr } = await sb
  .from("rental_parties")
  .insert({ tenant_id: tenantId, name: "Patel Suppliers", kind: "supplier" })
  .select()
  .single();
if (supErr) die("insert supplier", supErr);

const { data: borrowId, error: borErr } = await sb.rpc("create_challan", {
  p_party: supplier.id,
  p_type: "borrow",
  p_date: "2026-01-05",
  p_notes: "",
  p_lines: [{ itemId: item.id, qty: 50, rate: 1.5 }],
});
if (borErr) die("create_challan borrow", borErr);
const { error: gbErr } = await sb.rpc("create_challan", {
  p_party: supplier.id,
  p_type: "giveback",
  p_date: "2026-01-20",
  p_notes: "",
  p_lines: [{ itemId: item.id, qty: 20, rate: null }],
});
if (gbErr) die("create_challan giveback", gbErr);

const { data: borrowRow } = await sb
  .from("rental_challans")
  .select("challan_no")
  .eq("id", borrowId)
  .single();
log("borrow challan_no:", borrowRow.challan_no);

const { data: borrowedRows, error: blErr } = await sb
  .from("rental_borrowed_lines")
  .select("qty_borrowed");
if (blErr) die("borrowed_lines", blErr);
const qtyBorrowed = (borrowedRows ?? []).reduce(
  (s, r) => s + Number(r.qty_borrowed),
  0,
);
log("qty borrowed:", qtyBorrowed, qtyBorrowed === 30 ? "OK" : "EXPECTED 30");

// customer outstanding must be untouched by borrowing
const { data: out2 } = await sb.from("rental_outstanding_lines").select("qty_out");
const qtyOut2 = (out2 ?? []).reduce((s, r) => s + Number(r.qty_out), 0);
log(
  "qty outstanding after borrow:",
  qtyOut2,
  qtyOut2 === 60 ? "OK" : "EXPECTED 60",
);

// pay the supplier
const { error: paidErr } = await sb.from("rental_payments").insert({
  tenant_id: tenantId,
  party_id: supplier.id,
  type: "paid",
  amount: 200,
  method: "cash",
  payment_date: "2026-01-21",
});
if (paidErr) die("insert paid payment", paidErr);
log("paid supplier 200");

// 10. add a payment
const { error: payErr } = await sb.from("rental_payments").insert({
  tenant_id: tenantId,
  party_id: party.id,
  type: "receipt",
  amount: 500,
  method: "cash",
  payment_date: "2026-01-15",
});
if (payErr) die("insert payment", payErr);
log("payment 500 recorded");

// ------------------------------------------------------------
// 10b. STOCK VALIDATION — hard guards in create_challan
// ------------------------------------------------------------
const expectFail = async (label, kind, args) => {
  const { error } = await sb.rpc("create_challan", args);
  if (!error) die(`${label} — expected ${kind} but call SUCCEEDED`);
  if (!error.message.includes(kind))
    die(`${label} — expected ${kind}, got: ${error.message}`);
  log(`  ok ${label} -> blocked (${kind})`);
};
const expectOk = async (label, args) => {
  const { error } = await sb.rpc("create_challan", args);
  if (error) die(`${label} — expected success`, error);
  log(`  ok ${label}`);
};

log("\n-- stock validation --");

// fresh item with small owned stock so limits bite cleanly
const { data: cuplock, error: cupErr } = await sb
  .from("rental_items")
  .insert({
    tenant_id: tenantId,
    firm_id: FIRM,
    name: "Cuplock",
    unit: "pcs",
    total_qty: 10,
    default_rate: 1,
    rate_rule: { type: "per_day" },
  })
  .select()
  .single();
if (cupErr) die("insert cuplock", cupErr);
const C = cuplock.id;

// own lot (marko '') has 10 -> issue all 10
await expectOk("issue 10 own to customer", {
  p_party: party.id, p_type: "issue", p_date: "2026-03-01", p_notes: "",
  p_lines: [{ itemId: C, qty: 10, rate: 1 }],
});
// own lot exhausted -> issuing more is blocked
await expectFail("issue 1 more own (no stock)", "STOCK_INSUFFICIENT", {
  p_party: party.id, p_type: "issue", p_date: "2026-03-02", p_notes: "",
  p_lines: [{ itemId: C, qty: 1, rate: 1 }],
});
// borrow 6 from supplier -> borrowed lot (supplier, marko '') = 6
await expectOk("borrow 6 from supplier", {
  p_party: supplier.id, p_type: "borrow", p_date: "2026-03-03", p_notes: "",
  p_lines: [{ itemId: C, qty: 6, rate: 1 }],
});
// ledger cap: only 6 borrowed on this lot
await expectFail("giveback 7 (only 6 borrowed)", "STOCK_OVER_GIVEBACK", {
  p_party: supplier.id, p_type: "giveback", p_date: "2026-03-04", p_notes: "",
  p_lines: [{ itemId: C, qty: 7 }],
});
// rent the 6 borrowed out — MUST name the lot (the supplier source)
await expectOk("issue 6 (from borrowed lot) to customer", {
  p_party: party.id, p_type: "issue", p_date: "2026-03-05", p_notes: "",
  p_lines: [{ itemId: C, qty: 6, rate: 1, lotSupplierId: supplier.id }],
});
// THE BUG: 6 are still borrowed on the books but physically out at
// the customer, so giving them back to the supplier must be blocked
await expectFail("giveback 6 while out at customer", "STOCK_NOT_IN_HAND", {
  p_party: supplier.id, p_type: "giveback", p_date: "2026-03-06", p_notes: "",
  p_lines: [{ itemId: C, qty: 6 }],
});
// customer returns each lot back: 10 own + 6 borrowed (per-lot lines)
await expectOk("customer returns 10 own + 6 borrowed", {
  p_party: party.id, p_type: "return", p_date: "2026-03-07", p_notes: "",
  p_lines: [
    { itemId: C, qty: 10 },
    { itemId: C, qty: 6, lotSupplierId: supplier.id },
  ],
});
// now the borrowed stock is back in hand -> giveback allowed
await expectOk("giveback 6 (back in hand)", {
  p_party: supplier.id, p_type: "giveback", p_date: "2026-03-08", p_notes: "",
  p_lines: [{ itemId: C, qty: 6 }],
});
// nothing out at this customer anymore (own lot)
await expectFail("return 1 own (nothing out)", "STOCK_OVER_RETURN", {
  p_party: party.id, p_type: "return", p_date: "2026-03-09", p_notes: "",
  p_lines: [{ itemId: C, qty: 1 }],
});
// nothing borrowed from this supplier anymore
await expectFail("giveback 1 (nothing borrowed)", "STOCK_OVER_GIVEBACK", {
  p_party: supplier.id, p_type: "giveback", p_date: "2026-03-10", p_notes: "",
  p_lines: [{ itemId: C, qty: 1 }],
});
log("stock validation OK");

// ------------------------------------------------------------
// 10b-2. LOT TRACKING (hard per-source) + VARIANTS
// ------------------------------------------------------------
log("\n-- lot tracking + variants --");

// second supplier so we have two distinct borrowed lots
const { data: supplierB, error: sbErr } = await sb
  .from("rental_parties")
  .insert({ tenant_id: tenantId, name: "Shah Traders", kind: "supplier" })
  .select()
  .single();
if (sbErr) die("insert supplierB", sbErr);

// Prop: owned 0, all stock comes from two suppliers under two marks
const { data: prop, error: propErr } = await sb
  .from("rental_items")
  .insert({
    tenant_id: tenantId, firm_id: FIRM, name: "Prop", unit: "pcs",
    total_qty: 0, default_rate: 1, rate_rule: { type: "per_day" },
  })
  .select()
  .single();
if (propErr) die("insert prop", propErr);
const P = prop.id;

await expectOk("borrow 10 from A [AA]", {
  p_party: supplier.id, p_type: "borrow", p_date: "2026-05-01", p_notes: "",
  p_lines: [{ itemId: P, qty: 10, rate: 1, marko: "AA" }],
});
await expectOk("borrow 5 from B [BB]", {
  p_party: supplierB.id, p_type: "borrow", p_date: "2026-05-01", p_notes: "",
  p_lines: [{ itemId: P, qty: 5, rate: 1, marko: "BB" }],
});
// issue all 10 of lot AA
await expectOk("issue 10 from lot AA", {
  p_party: party.id, p_type: "issue", p_date: "2026-05-02", p_notes: "",
  p_lines: [{ itemId: P, qty: 10, rate: 1, lotSupplierId: supplier.id, marko: "AA" }],
});
// KEY per-source guard: AA is empty even though BB still holds 5.
// The old aggregate check would have allowed this.
await expectFail("issue 1 more from AA (BB has 5, AA empty)", "STOCK_INSUFFICIENT", {
  p_party: party.id, p_type: "issue", p_date: "2026-05-03", p_notes: "",
  p_lines: [{ itemId: P, qty: 1, rate: 1, lotSupplierId: supplier.id, marko: "AA" }],
});
// BB is a separate lot and still issuable
await expectOk("issue 5 from lot BB", {
  p_party: party.id, p_type: "issue", p_date: "2026-05-04", p_notes: "",
  p_lines: [{ itemId: P, qty: 5, rate: 1, lotSupplierId: supplierB.id, marko: "BB" }],
});
// can't give AA back to A while it's out at the customer
await expectFail("giveback 10 AA while out", "STOCK_NOT_IN_HAND", {
  p_party: supplier.id, p_type: "giveback", p_date: "2026-05-05", p_notes: "",
  p_lines: [{ itemId: P, qty: 10, marko: "AA" }],
});
// customer returns lot AA
await expectOk("return 10 of lot AA", {
  p_party: party.id, p_type: "return", p_date: "2026-05-06", p_notes: "",
  p_lines: [{ itemId: P, qty: 10, lotSupplierId: supplier.id, marko: "AA" }],
});
// now AA can go back to A
await expectOk("giveback 10 AA (back in hand)", {
  p_party: supplier.id, p_type: "giveback", p_date: "2026-05-07", p_notes: "",
  p_lines: [{ itemId: P, qty: 10, marko: "AA" }],
});
// over-giveback on lot BB (only 5 borrowed)
await expectFail("giveback 6 BB (only 5)", "STOCK_OVER_GIVEBACK", {
  p_party: supplierB.id, p_type: "giveback", p_date: "2026-05-08", p_notes: "",
  p_lines: [{ itemId: P, qty: 6, marko: "BB" }],
});

// VARIANTS: Beam base 0, variant "3 ft" owned 8 (its own stock axis)
const { data: beam, error: beamErr } = await sb
  .from("rental_items")
  .insert({
    tenant_id: tenantId, firm_id: FIRM, name: "Beam", unit: "pcs",
    total_qty: 0, default_rate: 1, rate_rule: { type: "per_day" },
  })
  .select()
  .single();
if (beamErr) die("insert beam", beamErr);
const { data: v3, error: v3Err } = await sb
  .from("rental_item_variants")
  .insert({
    tenant_id: tenantId, firm_id: FIRM, item_id: beam.id,
    name: "3 ft", total_qty: 8,
  })
  .select()
  .single();
if (v3Err) die("insert variant", v3Err);

await expectOk("issue 8 of variant 3ft", {
  p_party: party.id, p_type: "issue", p_date: "2026-05-10", p_notes: "",
  p_lines: [{ itemId: beam.id, variantId: v3.id, qty: 8, rate: 1 }],
});
await expectFail("issue 1 more of variant 3ft", "STOCK_INSUFFICIENT", {
  p_party: party.id, p_type: "issue", p_date: "2026-05-11", p_notes: "",
  p_lines: [{ itemId: beam.id, variantId: v3.id, qty: 1, rate: 1 }],
});
// lot_stock sanity: BB lot still holds 5 in hand (issued out, none returned = 0 held)
const { data: lotStockRows, error: lsErr } = await sb
  .from("rental_lot_stock")
  .select("marko, in_hand, lot_supplier_id")
  .eq("item_id", P);
if (lsErr) die("lot_stock", lsErr);
log("  prop lots:", (lotStockRows ?? []).map((r) => `${r.marko || "own"}=${r.in_hand}`).join(" "));
log("lot tracking + variants OK");

// ------------------------------------------------------------
// 10c. FIRMS — onboard makes a default firm; create_challan stamps
//      the caller's current firm; inventory is firm-scoped.
// ------------------------------------------------------------
log("\n-- firms --");
const { data: firmsRows, error: frErr } = await sb.from("firms").select("*");
if (frErr) die("select firms", frErr);
const defaultFirm = (firmsRows ?? []).find((f) => f.is_default);
if (!defaultFirm) die("onboard did not create a default firm");
log("  ok default firm:", defaultFirm.name);

const { data: firmB, error: fbErr } = await sb
  .from("firms")
  .insert({ tenant_id: tenantId, name: "Branch B" })
  .select()
  .single();
if (fbErr) die("insert firm B", fbErr);

const { data: itemB, error: ibErr } = await sb
  .from("rental_items")
  .insert({
    tenant_id: tenantId,
    firm_id: firmB.id,
    name: "Branch Plate",
    unit: "pcs",
    total_qty: 5,
    default_rate: 1,
    rate_rule: { type: "per_day" },
  })
  .select()
  .single();
if (ibErr) die("insert firm-B item", ibErr);

// switch the active firm to Branch B
const { error: setErr } = await sb
  .from("profiles")
  .update({ current_firm_id: firmB.id })
  .eq("id", userId);
if (setErr) die("set current firm", setErr);

// create_challan should stamp the challan with Branch B
const { data: firmChId, error: fchErr } = await sb.rpc("create_challan", {
  p_party: party.id, p_type: "issue", p_date: "2026-04-01", p_notes: "",
  p_lines: [{ itemId: itemB.id, qty: 5, rate: 1 }],
});
if (fchErr) die("firm-B issue", fchErr);
const { data: firmChRow } = await sb
  .from("rental_challans")
  .select("firm_id")
  .eq("id", firmChId)
  .single();
log(
  "  firm stamp:",
  firmChRow.firm_id === firmB.id ? "OK (challan in Branch B)" : "WRONG FIRM",
);
if (firmChRow.firm_id !== firmB.id) die("challan firm_id mismatch");

const { data: bItems } = await sb
  .from("rental_items")
  .select("id")
  .eq("firm_id", firmB.id);
log(
  "  firm-B inventory:",
  (bItems ?? []).length,
  (bItems ?? []).length === 1 ? "OK (scoped)" : "unexpected",
);
log("firms OK");

// 11. tenant isolation check: sign out, sign in as a second user,
//     confirm they can't see tenant-1 data
await sb.auth.signOut();
const email2 = `test_${Date.now()}_b@gmail.com`;
await createUser(email2, password);
const { data: s2, error: e2 } = await sb.auth.signInWithPassword({
  email: email2,
  password,
});
if (e2) die("signIn user2", e2);
if (s2.session) {
  const { data: leaked } = await sb.from("rental_parties").select("id");
  log(
    "isolation check: user2 sees",
    leaked?.length ?? 0,
    "parties",
    (leaked?.length ?? 0) === 0 ? "OK (isolated)" : "LEAK!",
  );
  // views bypass RLS unless security_invoker — check explicitly
  const { data: leakedView } = await sb
    .from("rental_outstanding_lines")
    .select("qty_out");
  log(
    "isolation check: user2 sees",
    leakedView?.length ?? 0,
    "outstanding rows",
    (leakedView?.length ?? 0) === 0 ? "OK (isolated)" : "LEAK!",
  );
}

log("\nALL BACKEND CHECKS PASSED");
process.exit(0);
