-- Transactional AUTH/RLS fixture tests for scripts/auth-v1-rollout.sql.
-- Run only with a privileged SQL connection in a disposable database or SQL
-- editor transaction. It creates auth.users/profiles and business fixtures,
-- exercises the API as anon/authenticated roles, then always rolls back.
-- No credentials are created and no fixture survives this file.

BEGIN;

SELECT set_config('auth_v1.admin_id', gen_random_uuid()::text, true),
       set_config('auth_v1.employee_id', gen_random_uuid()::text, true),
       set_config('auth_v1.unprovisioned_id', gen_random_uuid()::text, true);

CREATE TEMP TABLE auth_v1_branches (id bigint PRIMARY KEY) ON COMMIT DROP;
INSERT INTO auth_v1_branches (id)
SELECT min(id) FROM public.sucursales
UNION ALL
SELECT max(id) FROM public.sucursales
ON CONFLICT DO NOTHING;
GRANT SELECT ON auth_v1_branches TO PUBLIC;

DO $$
BEGIN
  IF (SELECT count(*) FROM auth_v1_branches) <> 2 THEN
    RAISE EXCEPTION 'AUTH_V1_TEST_ABORT: at least two existing branches are required';
  END IF;
END
$$;

INSERT INTO auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
VALUES
  (current_setting('auth_v1.admin_id')::uuid, 'authenticated', 'authenticated',
   current_setting('auth_v1.admin_id') || '@auth-v1.test', 'fixture-only', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  (current_setting('auth_v1.employee_id')::uuid, 'authenticated', 'authenticated',
   current_setting('auth_v1.employee_id') || '@auth-v1.test', 'fixture-only', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  (current_setting('auth_v1.unprovisioned_id')::uuid, 'authenticated', 'authenticated',
   current_setting('auth_v1.unprovisioned_id') || '@auth-v1.test', 'fixture-only', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

INSERT INTO public.perfiles (id, email, nombre, rol, sucursal_id)
VALUES
  (current_setting('auth_v1.admin_id')::uuid, 'fixture-admin@auth-v1.test', 'Fixture admin', 'admin', NULL),
  (current_setting('auth_v1.employee_id')::uuid, 'fixture-employee@auth-v1.test', 'Fixture employee', 'vendedora', (SELECT id FROM auth_v1_branches ORDER BY id LIMIT 1));

CREATE TEMP TABLE auth_v1_products (id bigint PRIMARY KEY) ON COMMIT DROP;
WITH created AS (
  INSERT INTO public.productos (nombre, codigo, categoria, precio, cantidad)
  VALUES ('Fixture auth V1', 'AUTH-V1-' || current_setting('auth_v1.employee_id'), 'Fixture', 10, 0)
  RETURNING id
)
INSERT INTO auth_v1_products SELECT id FROM created;
GRANT SELECT ON auth_v1_products TO PUBLIC;

INSERT INTO public.inventarios (producto_id, sucursal_id, cantidad)
SELECT p.id, b.id, CASE WHEN row_number() OVER (ORDER BY b.id) = 1 THEN 1 ELSE 3 END
FROM auth_v1_products AS p CROSS JOIN (SELECT id FROM auth_v1_branches ORDER BY id) AS b;

-- Anonymous callers cannot read profiles or invoke mutation RPCs.
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.sub', current_setting('auth_v1.unprovisioned_id'), true);
DO $$
DECLARE
  denied boolean := false;
BEGIN
  BEGIN
    PERFORM count(*) FROM public.perfiles;
  EXCEPTION WHEN insufficient_privilege THEN
    denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'AUTH_V1_TEST_FAIL: anon profile read was not denied'; END IF;
END
$$;
DO $$
DECLARE
  denied boolean := false;
BEGIN
  BEGIN
    PERFORM public.registrar_venta((SELECT id FROM auth_v1_branches ORDER BY id LIMIT 1), 'efectivo', '[]'::jsonb);
  EXCEPTION WHEN insufficient_privilege THEN
    denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'AUTH_V1_TEST_FAIL: anon RPC execute was not denied'; END IF;
END
$$;

-- An authenticated JWT without a server profile is fail-closed.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('auth_v1.unprovisioned_id'), true);
DO $$
DECLARE
  visible integer;
  denied boolean := false;
BEGIN
  SELECT count(*) INTO visible FROM public.perfiles;
  IF visible <> 0 THEN RAISE EXCEPTION 'AUTH_V1_TEST_FAIL: unprovisioned profile became visible'; END IF;
  BEGIN
    PERFORM public.registrar_venta((SELECT id FROM auth_v1_branches ORDER BY id LIMIT 1), 'efectivo', '[]'::jsonb);
  EXCEPTION WHEN insufficient_privilege THEN
    denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'AUTH_V1_TEST_FAIL: unprovisioned mutation was not denied'; END IF;
END
$$;

-- A provisioned employee can read inventory across branches (RF-11), but can
-- sell only in the branch assigned by the server profile.
SELECT set_config('request.jwt.claim.sub', current_setting('auth_v1.employee_id'), true);
DO $$
DECLARE
  visible integer;
  denied boolean := false;
BEGIN
  SELECT count(*) INTO visible FROM public.inventarios;
  IF visible <> 2 THEN RAISE EXCEPTION 'AUTH_V1_TEST_FAIL: inter-branch inventory read was not available'; END IF;
  BEGIN
    PERFORM public.registrar_venta((SELECT id FROM auth_v1_branches ORDER BY id DESC LIMIT 1), 'efectivo', '[]'::jsonb);
  EXCEPTION WHEN insufficient_privilege THEN
    denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'AUTH_V1_TEST_FAIL: cross-branch sale was not denied'; END IF;
END
$$;

-- Direct profile escalation is unavailable; role and branch are server-owned.
DO $$
DECLARE
  denied boolean := false;
BEGIN
  BEGIN
    UPDATE public.perfiles SET rol = 'admin', sucursal_id = NULL
    WHERE id = current_setting('auth_v1.employee_id')::uuid;
  EXCEPTION WHEN insufficient_privilege THEN
    denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'AUTH_V1_TEST_FAIL: profile self-escalation was not denied'; END IF;
END
$$;

-- Duplicate-line overstock must abort the whole sale and preserve low stock.
DO $$
DECLARE
  failed boolean := false;
  remaining integer;
BEGIN
  BEGIN
    PERFORM public.registrar_venta(
      (SELECT id FROM auth_v1_branches ORDER BY id LIMIT 1),
      'efectivo',
      jsonb_build_array(
        jsonb_build_object('producto_id', (SELECT id FROM auth_v1_products), 'cantidad', 1),
        jsonb_build_object('producto_id', (SELECT id FROM auth_v1_products), 'cantidad', 1)
      )
    );
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM ILIKE '%stock insuficiente%' THEN failed := true; ELSE RAISE; END IF;
  END;
  IF NOT failed THEN RAISE EXCEPTION 'AUTH_V1_TEST_FAIL: duplicate-line overstock was accepted'; END IF;
  SELECT cantidad INTO remaining FROM public.inventarios WHERE producto_id = (SELECT id FROM auth_v1_products) AND sucursal_id = (SELECT id FROM auth_v1_branches ORDER BY id LIMIT 1);
  IF remaining <> 1 OR remaining > 5 THEN RAISE EXCEPTION 'AUTH_V1_TEST_FAIL: duplicate-line rollback/low-stock row changed unexpectedly'; END IF;
END
$$;

SELECT jsonb_build_object(
  'anon_denied', true,
  'unprovisioned_denied', true,
  'employee_branch_scope_enforced', true,
  'profile_escalation_denied', true,
  'duplicate_line_atomicity_preserved', true,
  'low_stock_fixture_preserved', true
) AS auth_v1_fixture_summary;

ROLLBACK;
