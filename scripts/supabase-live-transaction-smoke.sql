-- Live transactional smoke test for the mobile RPC contract.
-- Run this file through a SQL connector that can SET ROLE anon.
-- Every write is for one disposable product and the final ROLLBACK is intentional.
-- PostgreSQL sequences may advance despite the rollback; no rows should remain.

BEGIN;
SET LOCAL ROLE anon;
SET LOCAL statement_timeout = '30s';

-- Evidence is local to this transaction and is selected before the final rollback.
-- It contains only contracts and counts, never fixture identifiers or business rows.
CREATE TEMP TABLE live_smoke_evidence (
  ok boolean NOT NULL,
  operation_count integer NOT NULL,
  success_json_contract boolean NOT NULL,
  sale_total_25_contract boolean NOT NULL,
  overstock_error_contract boolean NOT NULL,
  failed_sale_rollback_contract boolean NOT NULL,
  sale_count_before_failure integer NOT NULL,
  detail_count_before_failure integer NOT NULL,
  movement_count_before_failure integer NOT NULL
) ON COMMIT DROP;

DO $$
DECLARE
  branch_origin bigint;
  branch_destination bigint;
  fixture_code text := format('LIVE_SMOKE_%s_%s', pg_backend_pid(), floor(extract(epoch from clock_timestamp()) * 1000000)::bigint);
  product_result jsonb;
  entry_result jsonb;
  exit_result jsonb;
  transfer_result jsonb;
  sale_result jsonb;
  product_id bigint;
  sale_id bigint;
  stock_origin integer;
  stock_destination integer;
  failed_sale_sqlstate text;
  failed_sale_message text;
  fixture_sale_ids_before bigint[];
  fixture_sale_ids_after bigint[];
  fixture_detail_ids_before bigint[];
  fixture_detail_ids_after bigint[];
  fixture_movement_ids_before bigint[];
  fixture_movement_ids_after bigint[];
  fixture_sale_count_before integer;
  fixture_sale_count_after integer;
  fixture_detail_count_before integer;
  fixture_detail_count_after integer;
  fixture_movement_count_before integer;
  fixture_movement_count_after integer;
BEGIN
  SELECT s.id
    INTO branch_origin
    FROM public.sucursales AS s
    ORDER BY s.id
    LIMIT 1;

  SELECT s.id
    INTO branch_destination
    FROM public.sucursales AS s
    ORDER BY s.id
    OFFSET 1
    LIMIT 1;

  IF branch_origin IS NULL OR branch_destination IS NULL THEN
    RAISE EXCEPTION 'Live smoke requires at least two public.sucursales rows';
  END IF;

  product_result := public.registrar_producto_con_stock(
    format('Live smoke product %s', fixture_code),
    fixture_code,
    'live-smoke',
    12.50,
    4,
    branch_origin
  )::jsonb;

  IF jsonb_typeof(product_result) IS DISTINCT FROM 'object'
     OR jsonb_typeof(product_result -> 'producto') IS DISTINCT FROM 'object'
     OR (product_result -> 'producto' ? 'id') IS DISTINCT FROM true
     OR (product_result #>> '{producto,codigo}') IS DISTINCT FROM fixture_code THEN
    RAISE EXCEPTION 'registrar_producto_con_stock returned an invalid JSON contract';
  END IF;

  product_id := NULLIF(product_result #>> '{producto,id}', '')::bigint;
  IF product_id IS NULL THEN
    RAISE EXCEPTION 'registrar_producto_con_stock did not return producto.id';
  END IF;

  SELECT i.cantidad
    INTO stock_origin
    FROM public.inventarios AS i
    WHERE i.producto_id = product_id
      AND i.sucursal_id = branch_origin;
  IF stock_origin IS DISTINCT FROM 4 THEN
    RAISE EXCEPTION 'Initial fixture stock delta is invalid';
  END IF;

  entry_result := public.registrar_movimiento_entrada(product_id, branch_origin, 2, 'live smoke entry')::jsonb;
  IF jsonb_typeof(entry_result) IS DISTINCT FROM 'object'
     OR (entry_result ? 'id') IS DISTINCT FROM true
     OR NULLIF(entry_result ->> 'cantidad', '')::integer IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION 'registrar_movimiento_entrada returned an invalid JSON contract';
  END IF;

  SELECT i.cantidad INTO stock_origin
    FROM public.inventarios AS i
    WHERE i.producto_id = product_id AND i.sucursal_id = branch_origin;
  IF stock_origin IS DISTINCT FROM 6 THEN
    RAISE EXCEPTION 'Entry stock delta is invalid';
  END IF;

  exit_result := public.registrar_movimiento_salida(product_id, branch_origin, 1, 'live smoke exit')::jsonb;
  IF jsonb_typeof(exit_result) IS DISTINCT FROM 'object'
     OR (exit_result ? 'id') IS DISTINCT FROM true
     OR NULLIF(exit_result ->> 'cantidad', '')::integer IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'registrar_movimiento_salida returned an invalid JSON contract';
  END IF;

  SELECT i.cantidad INTO stock_origin
    FROM public.inventarios AS i
    WHERE i.producto_id = product_id AND i.sucursal_id = branch_origin;
  IF stock_origin IS DISTINCT FROM 5 THEN
    RAISE EXCEPTION 'Exit stock delta is invalid';
  END IF;

  transfer_result := public.registrar_movimiento_transferencia(
    product_id,
    branch_origin,
    branch_destination,
    2,
    'live smoke transfer'
  )::jsonb;
  IF jsonb_typeof(transfer_result) IS DISTINCT FROM 'object'
     OR (transfer_result ? 'id') IS DISTINCT FROM true
     OR NULLIF(transfer_result ->> 'cantidad', '')::integer IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION 'registrar_movimiento_transferencia returned an invalid JSON contract';
  END IF;

  SELECT i.cantidad INTO stock_origin
    FROM public.inventarios AS i
    WHERE i.producto_id = product_id AND i.sucursal_id = branch_origin;
  SELECT COALESCE(SUM(i.cantidad), 0)::integer INTO stock_destination
    FROM public.inventarios AS i
    WHERE i.producto_id = product_id AND i.sucursal_id = branch_destination;
  IF stock_origin IS DISTINCT FROM 3 OR stock_destination IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION 'Transfer stock deltas are invalid';
  END IF;

  sale_result := public.registrar_venta(
    branch_origin,
    'efectivo',
    jsonb_build_array(jsonb_build_object('producto_id', product_id, 'cantidad', 2)),
    clock_timestamp()
  )::jsonb;
  IF jsonb_typeof(sale_result) IS DISTINCT FROM 'object'
     OR (sale_result ? 'id') IS DISTINCT FROM true
     OR jsonb_typeof(sale_result -> 'detalles') IS DISTINCT FROM 'array'
     OR jsonb_array_length(sale_result -> 'detalles') IS DISTINCT FROM 1
     OR (sale_result ? 'total') IS DISTINCT FROM true
     OR NULLIF(sale_result ->> 'total', '')::numeric IS DISTINCT FROM 25.00 THEN
    RAISE EXCEPTION 'registrar_venta returned an invalid JSON contract or total';
  END IF;

  sale_id := NULLIF(sale_result ->> 'id', '')::bigint;
  IF sale_id IS NULL THEN
    RAISE EXCEPTION 'registrar_venta did not return a sale id';
  END IF;

  SELECT i.cantidad INTO stock_origin
    FROM public.inventarios AS i
    WHERE i.producto_id = product_id AND i.sucursal_id = branch_origin;
  IF stock_origin IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'Sale stock delta is invalid';
  END IF;

  -- Snapshot only this disposable product's related sale/detail/movement ids and counts.
  SELECT COALESCE(array_agg(DISTINCT d.venta_id::bigint ORDER BY d.venta_id::bigint), ARRAY[]::bigint[])
    INTO fixture_sale_ids_before
    FROM public.ventas_detalles AS d
    WHERE d.producto_id = product_id;
  fixture_sale_count_before := cardinality(fixture_sale_ids_before);
  IF (sale_id = ANY(fixture_sale_ids_before)) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Successful sale id was not found in the fixture snapshot';
  END IF;

  SELECT COALESCE(array_agg(d.id::bigint ORDER BY d.id::bigint), ARRAY[]::bigint[])
    INTO fixture_detail_ids_before
    FROM public.ventas_detalles AS d
    WHERE d.producto_id = product_id;
  fixture_detail_count_before := cardinality(fixture_detail_ids_before);

  SELECT COALESCE(array_agg(m.id::bigint ORDER BY m.id::bigint), ARRAY[]::bigint[])
    INTO fixture_movement_ids_before
    FROM public.movimientos AS m
    WHERE m.producto_id = product_id;
  fixture_movement_count_before := cardinality(fixture_movement_ids_before);

  -- Duplicate lines force the RPC to process qty 1 twice against stock 1.
  -- The second line must fail, and the first line must be rolled back with it.
  BEGIN
    PERFORM public.registrar_venta(
      branch_origin,
      'efectivo',
      jsonb_build_array(
        jsonb_build_object('producto_id', product_id, 'cantidad', 1),
        jsonb_build_object('producto_id', product_id, 'cantidad', 1)
      ),
      clock_timestamp()
    );
  EXCEPTION
    WHEN OTHERS THEN
      failed_sale_sqlstate := SQLSTATE;
      failed_sale_message := lower(SQLERRM);
  END;

  IF failed_sale_sqlstate IS DISTINCT FROM 'P0001'
     OR COALESCE(failed_sale_message, '') !~ 'stock insuficiente' THEN
    RAISE EXCEPTION 'Duplicate-line overstock sale did not return P0001 with stock insuficiente';
  END IF;

  SELECT i.cantidad INTO stock_origin
    FROM public.inventarios AS i
    WHERE i.producto_id = product_id AND i.sucursal_id = branch_origin;
  SELECT COALESCE(SUM(i.cantidad), 0)::integer INTO stock_destination
    FROM public.inventarios AS i
    WHERE i.producto_id = product_id AND i.sucursal_id = branch_destination;
  IF stock_origin IS DISTINCT FROM 1 OR stock_destination IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION 'Rejected duplicate-line sale changed stock';
  END IF;

  SELECT COALESCE(array_agg(DISTINCT d.venta_id::bigint ORDER BY d.venta_id::bigint), ARRAY[]::bigint[])
    INTO fixture_sale_ids_after
    FROM public.ventas_detalles AS d
    WHERE d.producto_id = product_id;
  fixture_sale_count_after := cardinality(fixture_sale_ids_after);

  SELECT COALESCE(array_agg(d.id::bigint ORDER BY d.id::bigint), ARRAY[]::bigint[])
    INTO fixture_detail_ids_after
    FROM public.ventas_detalles AS d
    WHERE d.producto_id = product_id;
  fixture_detail_count_after := cardinality(fixture_detail_ids_after);

  SELECT COALESCE(array_agg(m.id::bigint ORDER BY m.id::bigint), ARRAY[]::bigint[])
    INTO fixture_movement_ids_after
    FROM public.movimientos AS m
    WHERE m.producto_id = product_id;
  fixture_movement_count_after := cardinality(fixture_movement_ids_after);

  IF fixture_sale_count_after IS DISTINCT FROM fixture_sale_count_before
     OR fixture_sale_ids_after IS DISTINCT FROM fixture_sale_ids_before
     OR fixture_detail_count_after IS DISTINCT FROM fixture_detail_count_before
     OR fixture_detail_ids_after IS DISTINCT FROM fixture_detail_ids_before
     OR fixture_movement_count_after IS DISTINCT FROM fixture_movement_count_before
     OR fixture_movement_ids_after IS DISTINCT FROM fixture_movement_ids_before THEN
    RAISE EXCEPTION 'Rejected duplicate-line sale changed fixture sale/detail/movement rows';
  END IF;

  INSERT INTO pg_temp.live_smoke_evidence (
    ok,
    operation_count,
    success_json_contract,
    sale_total_25_contract,
    overstock_error_contract,
    failed_sale_rollback_contract,
    sale_count_before_failure,
    detail_count_before_failure,
    movement_count_before_failure
  ) VALUES (
    true,
    5,
    true,
    true,
    true,
    true,
    fixture_sale_count_before,
    fixture_detail_count_before,
    fixture_movement_count_before
  );
END;
$$;

SELECT jsonb_build_object(
  'ok', e.ok,
  'role', 'anon',
  'operationCount', e.operation_count,
  'successJsonContract', e.success_json_contract,
  'saleTotal25Contract', e.sale_total_25_contract,
  'overstockErrorContract', e.overstock_error_contract,
  'failedSaleRollbackContract', e.failed_sale_rollback_contract,
  'fixtureCountsBeforeFailure', jsonb_build_object(
    'sales', e.sale_count_before_failure,
    'details', e.detail_count_before_failure,
    'movements', e.movement_count_before_failure
  ),
  'rollback', 'pending'
) AS smoke_summary
FROM pg_temp.live_smoke_evidence AS e;

ROLLBACK;
