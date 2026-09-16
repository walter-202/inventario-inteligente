-- Explicit deployment SQL, not a generated migration.
-- The Supabase CLI is unavailable in this workspace, so do not invent a
-- migration timestamp/name. Apply this file once with the Supabase connector
-- or SQL editor, then record it in the project's migration workflow.
-- Only the SECURITY DEFINER search_path setting is changed; signatures,
-- bodies, grants, and function behavior remain untouched.

BEGIN;

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

COMMIT;
