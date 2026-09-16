-- Incremental migration for the existing manually provisioned Supabase database.
-- This is not a fresh-project bootstrap; it only hardens the five existing RPCs.

ALTER FUNCTION public.registrar_producto_con_stock(text, text, text, numeric, integer, bigint)
  SET search_path = '';

ALTER FUNCTION public.registrar_venta(bigint, text, jsonb, timestamptz)
  SET search_path = '';

ALTER FUNCTION public.registrar_movimiento_entrada(bigint, bigint, integer, text)
  SET search_path = '';

ALTER FUNCTION public.registrar_movimiento_salida(bigint, bigint, integer, text)
  SET search_path = '';

ALTER FUNCTION public.registrar_movimiento_transferencia(bigint, bigint, bigint, integer, text)
  SET search_path = '';
