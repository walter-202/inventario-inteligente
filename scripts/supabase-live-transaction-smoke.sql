-- Live transactional smoke test for the mobile RPC contract.
-- Run this file through a SQL connector that can SET ROLE anon.
-- Every write is for one disposable product and the final ROLLBACK is intentional.
-- PostgreSQL sequences may advance despite the rollback; no rows should remain.

BEGIN;
SET LOCAL ROLE anon;
SET LOCAL statement_timeout = '30s';

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
  stock_origin integer;
  stock_destination integer;
  overstock_rejected boolean := false;
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

  IF jsonb_typeof(product_result) <> 'object'
     OR jsonb_typeof(product_result -> 'producto') <> 'object'
     OR NOT (product_result -> 'producto' ? 'id')
     OR product_result #>> '{producto,codigo}' <> fixture_code THEN
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
  IF NOT FOUND OR stock_origin <> 4 THEN
    RAISE EXCEPTION 'Initial fixture stock delta is invalid';
  END IF;

  entry_result := public.registrar_movimiento_entrada(product_id, branch_origin, 2, 'live smoke entry')::jsonb;
  IF jsonb_typeof(entry_result) <> 'object'
     OR NOT (entry_result ? 'id')
     OR (entry_result ->> 'cantidad')::integer <> 2 THEN
    RAISE EXCEPTION 'registrar_movimiento_entrada returned an invalid JSON contract';
  END IF;

  SELECT i.cantidad INTO stock_origin
    FROM public.inventarios AS i
    WHERE i.producto_id = product_id AND i.sucursal_id = branch_origin;
  IF stock_origin <> 6 THEN
    RAISE EXCEPTION 'Entry stock delta is invalid';
  END IF;

  exit_result := public.registrar_movimiento_salida(product_id, branch_origin, 1, 'live smoke exit')::jsonb;
  IF jsonb_typeof(exit_result) <> 'object'
     OR NOT (exit_result ? 'id')
     OR (exit_result ->> 'cantidad')::integer <> 1 THEN
    RAISE EXCEPTION 'registrar_movimiento_salida returned an invalid JSON contract';
  END IF;

  SELECT i.cantidad INTO stock_origin
    FROM public.inventarios AS i
    WHERE i.producto_id = product_id AND i.sucursal_id = branch_origin;
  IF stock_origin <> 5 THEN
    RAISE EXCEPTION 'Exit stock delta is invalid';
  END IF;

  transfer_result := public.registrar_movimiento_transferencia(
    product_id,
    branch_origin,
    branch_destination,
    2,
    'live smoke transfer'
  )::jsonb;
  IF jsonb_typeof(transfer_result) <> 'object'
     OR NOT (transfer_result ? 'id')
     OR (transfer_result ->> 'cantidad')::integer <> 2 THEN
    RAISE EXCEPTION 'registrar_movimiento_transferencia returned an invalid JSON contract';
  END IF;

  SELECT i.cantidad INTO stock_origin
    FROM public.inventarios AS i
    WHERE i.producto_id = product_id AND i.sucursal_id = branch_origin;
  SELECT COALESCE(SUM(i.cantidad), 0)::integer INTO stock_destination
    FROM public.inventarios AS i
    WHERE i.producto_id = product_id AND i.sucursal_id = branch_destination;
  IF stock_origin <> 3 OR stock_destination <> 2 THEN
    RAISE EXCEPTION 'Transfer stock deltas are invalid';
  END IF;

  sale_result := public.registrar_venta(
    branch_origin,
    'efectivo',
    jsonb_build_array(jsonb_build_object('producto_id', product_id, 'cantidad', 2)),
    clock_timestamp()
  )::jsonb;
  IF jsonb_typeof(sale_result) <> 'object'
     OR NOT (sale_result ? 'id')
     OR jsonb_typeof(sale_result -> 'detalles') <> 'array'
     OR jsonb_array_length(sale_result -> 'detalles') <> 1
     OR NOT (sale_result ? 'total')
     OR (sale_result ->> 'total')::numeric <= 0 THEN
    RAISE EXCEPTION 'registrar_venta returned an invalid JSON contract';
  END IF;

  SELECT i.cantidad INTO stock_origin
    FROM public.inventarios AS i
    WHERE i.producto_id = product_id AND i.sucursal_id = branch_origin;
  IF stock_origin <> 1 THEN
    RAISE EXCEPTION 'Sale stock delta is invalid';
  END IF;

  BEGIN
    PERFORM public.registrar_venta(
      branch_origin,
      'efectivo',
      jsonb_build_array(jsonb_build_object('producto_id', product_id, 'cantidad', 2)),
      clock_timestamp()
    );
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLSTATE = 'P0001' THEN
        overstock_rejected := true;
      ELSE
        RAISE;
      END IF;
  END;

  IF NOT overstock_rejected THEN
    RAISE EXCEPTION 'Overstock sale was not rejected';
  END IF;

  SELECT i.cantidad INTO stock_origin
    FROM public.inventarios AS i
    WHERE i.producto_id = product_id AND i.sucursal_id = branch_origin;
  IF stock_origin <> 1 THEN
    RAISE EXCEPTION 'Rejected overstock sale changed stock';
  END IF;

  SELECT COALESCE(SUM(i.cantidad), 0)::integer INTO stock_destination
    FROM public.inventarios AS i
    WHERE i.producto_id = product_id AND i.sucursal_id = branch_destination;
  IF stock_destination <> 2 THEN
    RAISE EXCEPTION 'Rejected overstock sale changed destination stock';
  END IF;
END;
$$;

ROLLBACK;
