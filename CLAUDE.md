# rental/ — tenant app (Vite + React SPA)

- Client-only SPA: no server code here. All authorization lives in
  Supabase RLS + RPCs; the browser client (`src/lib/supabase.ts`) is a
  singleton with a localStorage session.
- Data fetching: `useQuery` (src/lib/use-query.ts) inside pages;
  mutations in `src/lib/actions/*` return an error string or null.
- Session/tenant/firm/features come from `useSession()` /
  `useTenantSession()` (src/session.tsx). Respect the feature gates
  (`features.functions/ledgers/hiddenFields`) when adding UI.
- i18n: `useTranslations(ns)` from src/i18n.tsx over src/messages/*.json
  (plain nested strings, no interpolation). Add every new key to en, hi
  AND gu.
- `src/lib/features.ts`, `src/lib/custom-fields.ts`, `src/lib/ui-settings.ts`
  have copies in `admin/src/lib/` — keep them in sync.
- Owned stock qty must ONLY move via the `adjust_stock` RPC
  (see `adjustStock` in src/lib/actions/items.ts), never a direct
  `total_qty` update — the audit trail depends on it.
- Changing a Postgres function's arity: DROP the old signature first
  (CREATE OR REPLACE with different args ADDS an overload).
- Verify: `npx tsc -b`, `npm run lint`, `npm run build`, `npm test`
  (vitest units: billing engine, formula evaluator, features),
  `node scripts/smoke.mjs` (data layer vs live DB),
  `node scripts/e2e.mjs` (backend invariants). Dev server: port 3002.
