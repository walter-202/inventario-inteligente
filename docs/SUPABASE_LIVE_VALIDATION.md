# Supabase live validation

These checks target only `https://ynfqpwmzhsmkhltyugow.supabase.co`. The Node smoke test uses the read-only TypeScript API functions already used by the Expo client and never imports or calls mutation functions. It loads `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` from the process environment or local `.env` without printing either value.

## Read-only frontend API smoke test

```powershell
npm run smoke:live
```

The command validates branch rows, catalog pagination metadata (and page 2 when it exists), search, exact code lookup, selected-branch inventory, all-branch stock, global/branch dashboard metrics, global/branch sales reads, and runtime return contracts. Its output contains counts and contract booleans only.

## Transactional RPC smoke test

Run `scripts/supabase-live-transaction-smoke.sql` through the Supabase SQL connector/editor with a connection that can `SET ROLE anon`. The script:

- creates one uniquely coded disposable product through `public.registrar_producto_con_stock`;
- uses the first two `public.sucursales` rows;
- exercises entry, exit, transfer, sale, returned JSON contracts, and stock deltas;
- verifies that an overstock sale raises SQLSTATE `P0001` and leaves stock unchanged; and
- always ends with `ROLLBACK`, so no product, inventory, movement, or sale rows remain. PostgreSQL sequences can still advance after rollback.

## SECURITY DEFINER search path deployment

The local Supabase CLI was not available (`supabase --version` could not resolve a command), so no migration filename was invented. `scripts/supabase-search-path-deployment.sql` is explicit deployment SQL for the five existing functions. Apply it through the connector/editor, then register it using the repository's normal migration workflow. It contains only `ALTER FUNCTION ... SET search_path = ''` statements with the exact existing signatures; it does not replace function bodies or change grants.

## Local verification

```powershell
npm test
npx tsc --noEmit
```
