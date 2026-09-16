# V1 delivery checklist — AUTH / SESSION / ROLES / BRANCH

Updated 2026-09-16. This document records repository evidence only; it does
not claim that the rollout has been deployed to Supabase.

## This increment

| Requirement | Repository evidence | Status |
| --- | --- | --- |
| RF-23 secure email/password authentication | `src/features/auth/api/authApi.ts`, Supabase client session persistence, `src/app/sign-in.tsx` | **Implemented locally; live pending** |
| RF-24 role and branch restrictions | `src/features/auth/lib/permissions.ts`, `useActiveBranch`, protected routes, `scripts/auth-v1-rollout.sql` | **Implemented locally; live pending** |
| Session refresh on native/web | AsyncStorage on native, Supabase browser storage on web, foreground auto-refresh | **Implemented locally; runtime build pending** |
| Missing/unassigned profile handling | Fail-closed `blocked` state with retry/logout; no self-service role assignment | **Implemented locally** |
| Query/cart isolation on user switch/sign-out | QueryClient clear and pending scanner product reset before profile install | **Implemented locally** |
| Database RLS/grants/RPC authorization | Coordinated rollout and rollback-safe fixture test scripts | **Ready for reviewed deployment; not deployed** |

## Role policy recorded by this slice

- `admin`: global read/write.
- `encargada`: own-branch operations and own-branch sales; inter-branch inventory read.
- `cajera` / `vendedora` (the current server value for asesora): own-branch sales; inter-branch inventory read.
- `almacen`: catalog creation and own-branch inventory movements; inter-branch inventory read.
- `reponedora`: inventory/catalog read only; no mutation.
- `marketing`: aggregate-only policy placeholder. Raw sales rows are deliberately
  not granted until an aggregate RPC/view exists.

The UI policy is not a security boundary. The SQL rollout repeats every role and
branch check in guarded server-side functions and RLS policies.

## First-admin provisioning (manual, no password in SQL)

1. In the Supabase Auth dashboard, create or invite the first account. Do not
   put its password in repository files, logs, or SQL scripts.
2. Copy only the generated Auth user UUID and run this trusted SQL as an
   administrator, replacing the parameters before execution:

```sql
-- Replace :user_id, :email, and :name in the SQL editor. Never paste a password.
insert into public.perfiles (id, email, nombre, rol, sucursal_id)
values (:user_id::uuid, :email::text, :name::text, 'admin', null)
on conflict (id) do update
set email = excluded.email,
    nombre = excluded.nombre,
    rol = 'admin',
    sucursal_id = null,
    updated_at = timezone('utc', now());
```

3. Run `scripts/auth-v1-rls-test.sql` in a disposable transaction/database.
4. Review `scripts/auth-v1-rollout.sql`, confirm the preflight sees the admin,
   then apply it through the reviewed Supabase migration path.
5. Provision every additional user by inserting/updating only their server
   profile (`rol` and `sucursal_id`). The client cannot change either field.

## Deployment blockers and remaining V1 work

- The live project currently has zero `auth.users` and zero `perfiles`; the
  rollout preflight must abort until the first admin exists.
- RF-05/06/07 receipt-dispatch-confirmation still needs its dedicated domain
  model and UI; the current `movimientos` RPC is not that two-step workflow.
- RF-09 merma, RF-17 sale cancellation, and aggregate-only marketing analytics
  remain outside this auth increment.
- Live auth/RLS evidence, runtime native build, and an authenticated smoke run
  are intentionally pending. Do not mark V1 deployed from local tests alone.
