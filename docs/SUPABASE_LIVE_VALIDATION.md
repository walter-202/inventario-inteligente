# Supabase live validation

These checks target only `https://ynfqpwmzhsmkhltyugow.supabase.co`. The Node smoke test uses the read-only TypeScript API functions already used by the Expo client and never imports or calls mutation functions. It loads `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` from the process environment or local `.env` without printing either value.

## Live execution evidence — 2026-09-16

Primary execution against project `ynfqpwmzhsmkhltyugow` completed successfully:

- Applied migration version `20260916113855`, name `harden_registrar_rpc_search_path`, through `apply_migration`.
- The committed snapshot is `supabase/migrations/20260916113855_harden_registrar_rpc_search_path.sql`. This is an **incremental migration over the existing manually provisioned database**, not a fresh-project bootstrap.
- The transactional SQL smoke ran as `anon`: product fixture creation, entry, exit, transfer, sale total `25.00`, duplicate-line overstock `P0001`/`stock insuficiente`, and rollback all passed.
- Before/after row fingerprints for `public.productos`, `public.inventarios`, `public.ventas`, `public.ventas_detalles`, and `public.movimientos` were identical. The recorded original count tuple `6/5/12/1/1` was preserved; the read smoke independently observed 6 products, 5 branches, 12 inventory rows, and 1 sale.
- `get_advisors` reported no remaining `search_path` warnings after the migration. This is not a production-security sign-off: remaining findings include five `anon`-callable and five `authenticated`-callable `SECURITY DEFINER` functions, no login in the existing client, and permissive policies. Those findings are outside this bounded change.
- PostgreSQL sequences may advance even though the transactional fixture rows were rolled back.

## Read-only frontend API smoke test

```powershell
npm run smoke:live
```

Before any request, the command verifies that the configured key is either a legacy JWT carrying `role: "anon"` or an `sb_publishable_...` key; service-role and secret keys are rejected. It validates branch rows, catalog pagination metadata (and page 2 when it exists), search, exact code lookup, selected-branch inventory, all-branch stock, global/branch dashboard metrics, global/branch sales reads, and runtime return contracts. Its output contains the key type, counts, and contract booleans only.

## Transactional RPC smoke test

Run `scripts/supabase-live-transaction-smoke.sql` through the Supabase SQL connector/editor with a connection that can `SET ROLE anon`. The script:

- creates one uniquely coded disposable product through `public.registrar_producto_con_stock`;
- uses the first two `public.sucursales` rows;
- exercises entry, exit, transfer, sale, returned JSON contracts, and stock deltas;
- verifies that a duplicate-line overstock sale (two quantity-1 lines against stock 1) raises SQLSTATE `P0001` with `stock insuficiente`, leaves stock unchanged, and leaves fixture-specific sale/detail/movement IDs and counts unchanged; and
- always ends with `ROLLBACK`, so no product, inventory, movement, or sale rows remain. PostgreSQL sequences can still advance after rollback.

The SQL smoke emits one JSON summary row immediately before `ROLLBACK`; it contains only contracts and fixture counts, not identifiers or business rows.

## SECURITY DEFINER search path deployment

The local Supabase CLI was not available (`supabase --version` could not resolve a command), so the primary applied the change through `apply_migration` and the exact deployed statements are now captured in `supabase/migrations/20260916113855_harden_registrar_rpc_search_path.sql`. `scripts/supabase-search-path-deployment.sql` remains the documented five-statement reference for connector/editor use. Pass its statements to `apply_migration` (which owns the transaction) or run them as one SQL-editor batch; the reference file intentionally has no `BEGIN`/`COMMIT`. Both files contain only `ALTER FUNCTION ... SET search_path = ''` statements with the exact existing signatures; neither replaces function bodies or changes grants.

## Local verification

```powershell
npm test
npx tsc --noEmit
```

On 2026-09-16, `npm run smoke:live`, `npx tsc --noEmit`, `npm test` (13/13), and `git diff --check` passed after deployment.
