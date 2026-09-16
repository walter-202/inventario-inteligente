-- Lidemoda V1 AUTH / SESSION / ROLES / BRANCH rollout
--
-- This is a deployment-ready review artifact for the existing Supabase
-- project. It is intentionally NOT a fresh-project bootstrap and must not be
-- run until the first administrator profile has been provisioned. The first
-- DO block aborts the whole batch before any policy/function change when no
-- admin exists, preventing an accidental lockout.
--
-- Apply through the Supabase SQL editor / reviewed migration runner only after
-- scripts/auth-v1-rls-test.sql passes in a disposable database or transaction.
-- Do not put a password, service key, or user secret in this file.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM auth.users AS u
    JOIN public.perfiles AS p ON p.id = u.id
    WHERE p.rol = 'admin'
  ) THEN
    RAISE EXCEPTION 'AUTH_V1_PREFLIGHT_ABORT: provision at least one admin profile before applying this rollout';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.perfiles
    WHERE rol NOT IN ('admin', 'encargada', 'cajera', 'vendedora', 'almacen', 'reponedora', 'marketing')
  ) THEN
    RAISE EXCEPTION 'AUTH_V1_PREFLIGHT_ABORT: perfiles contains an unsupported role';
  END IF;
END
$$;

-- The existing product uses vendedora for the documented asesora de venta.
-- The two additional documented roles are introduced without changing rows.
ALTER TABLE public.perfiles DROP CONSTRAINT IF EXISTS perfiles_rol_check;
ALTER TABLE public.perfiles
  ADD CONSTRAINT perfiles_rol_check
  CHECK (rol = ANY (ARRAY['admin', 'encargada', 'cajera', 'vendedora', 'almacen', 'reponedora', 'marketing']::text[]));

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA private TO authenticated;

-- These helpers are not exposed through the public Data API. They read the
-- server-owned profile row and never trust user_metadata/app claims for auth.
CREATE OR REPLACE FUNCTION private.actor_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p.rol
  FROM public.perfiles AS p
  WHERE p.id = (SELECT auth.uid())
$$;

CREATE OR REPLACE FUNCTION private.actor_branch()
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p.sucursal_id
  FROM public.perfiles AS p
  WHERE p.id = (SELECT auth.uid())
$$;

CREATE OR REPLACE FUNCTION private.actor_is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.perfiles AS p
    WHERE p.id = (SELECT auth.uid())
      AND p.rol = 'admin'
  )
$$;

CREATE OR REPLACE FUNCTION private.is_provisioned_employee()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.perfiles AS p
    WHERE p.id = (SELECT auth.uid())
      AND p.rol <> 'marketing'
      AND (p.rol = 'admin' OR p.sucursal_id IS NOT NULL)
  )
$$;

CREATE OR REPLACE FUNCTION private.require_actor(
  p_allowed_roles text[],
  p_requested_branch bigint,
  p_allow_any_branch boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := (SELECT auth.uid());
  v_role text;
  v_branch bigint;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE = '42501';
  END IF;

  SELECT p.rol, p.sucursal_id
    INTO v_role, v_branch
  FROM public.perfiles AS p
  WHERE p.id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PROFILE_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF NOT (v_role = ANY (p_allowed_roles)) THEN
    RAISE EXCEPTION 'ROLE_NOT_ALLOWED' USING ERRCODE = '42501';
  END IF;
  IF v_role <> 'admin' AND v_branch IS NULL THEN
    RAISE EXCEPTION 'BRANCH_ASSIGNMENT_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF v_role <> 'admin' AND NOT p_allow_any_branch AND p_requested_branch IS DISTINCT FROM v_branch THEN
    RAISE EXCEPTION 'BRANCH_NOT_ALLOWED' USING ERRCODE = '42501';
  END IF;
END
$$;

-- Privileged implementations stay outside the exposed schema. They retain the
-- original transaction bodies and add an authorization check before writes.
CREATE OR REPLACE FUNCTION private.registrar_producto_con_stock(
  p_nombre text,
  p_codigo text,
  p_categoria text,
  p_precio numeric,
  p_cantidad integer,
  p_sucursal_id bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    v_producto_id BIGINT;
    v_sucursal_nombre TEXT;
BEGIN
    PERFORM private.require_actor(ARRAY['admin', 'almacen']::text[], p_sucursal_id, false);
    IF p_cantidad < 0 THEN
        RAISE EXCEPTION 'La cantidad no puede ser negativa';
    END IF;
    SELECT nombre INTO v_sucursal_nombre FROM public.sucursales WHERE id = p_sucursal_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Sucursal con ID % no encontrada', p_sucursal_id;
    END IF;
    INSERT INTO public.productos (nombre, codigo, categoria, precio, cantidad)
    VALUES (p_nombre, p_codigo, p_categoria, p_precio, p_cantidad)
    RETURNING id INTO v_producto_id;
    IF p_cantidad > 0 THEN
        INSERT INTO public.inventarios (producto_id, sucursal_id, cantidad)
        VALUES (v_producto_id, p_sucursal_id, p_cantidad);
        INSERT INTO public.movimientos (producto_id, sucursal_id, tipo, cantidad, observacion)
        VALUES (v_producto_id, p_sucursal_id, 'entrada', p_cantidad, 'Cantidad inicial registrada al crear el producto.');
    ELSE
        INSERT INTO public.inventarios (producto_id, sucursal_id, cantidad)
        VALUES (v_producto_id, p_sucursal_id, 0);
    END IF;
    RETURN jsonb_build_object(
        'producto', jsonb_build_object('id', v_producto_id, 'nombre', p_nombre, 'codigo', p_codigo, 'categoria', p_categoria, 'precio', p_precio, 'cantidad', p_cantidad),
        'sucursal', jsonb_build_object('id', p_sucursal_id, 'nombre', v_sucursal_nombre),
        'cantidad_inicial', p_cantidad,
        'mensaje', 'Producto registrado correctamente. Cantidad inicial asignada a la sucursal ' || v_sucursal_nombre || '.'
    );
END;
$function$;

CREATE OR REPLACE FUNCTION private.registrar_movimiento_entrada(
  p_producto_id bigint,
  p_sucursal_id bigint,
  p_cantidad integer,
  p_observacion text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    v_inventario_id BIGINT;
    v_movimiento_id BIGINT;
    v_nueva_cantidad INT;
    v_producto_nombre TEXT;
    v_sucursal_nombre TEXT;
BEGIN
    PERFORM private.require_actor(ARRAY['admin', 'encargada', 'almacen']::text[], p_sucursal_id, false);
    IF p_cantidad <= 0 THEN RAISE EXCEPTION 'La cantidad debe ser mayor a 0'; END IF;
    SELECT nombre INTO v_producto_nombre FROM public.productos WHERE id = p_producto_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Producto con ID % no encontrado', p_producto_id; END IF;
    SELECT nombre INTO v_sucursal_nombre FROM public.sucursales WHERE id = p_sucursal_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Sucursal con ID % no encontrada', p_sucursal_id; END IF;
    INSERT INTO public.inventarios (producto_id, sucursal_id, cantidad, updated_at)
    VALUES (p_producto_id, p_sucursal_id, p_cantidad, timezone('utc'::text, now()))
    ON CONFLICT (producto_id, sucursal_id)
    DO UPDATE SET cantidad = public.inventarios.cantidad + EXCLUDED.cantidad, updated_at = timezone('utc'::text, now())
    RETURNING id, cantidad INTO v_inventario_id, v_nueva_cantidad;
    INSERT INTO public.movimientos (producto_id, sucursal_id, tipo, cantidad, observacion)
    VALUES (p_producto_id, p_sucursal_id, 'entrada', p_cantidad, p_observacion)
    RETURNING id INTO v_movimiento_id;
    RETURN jsonb_build_object('id', v_movimiento_id, 'producto_id', p_producto_id, 'producto_nombre', v_producto_nombre, 'sucursal_id', p_sucursal_id, 'sucursal_nombre', v_sucursal_nombre, 'tipo', 'entrada', 'cantidad', p_cantidad, 'stock_actual', v_nueva_cantidad, 'observacion', p_observacion);
END;
$function$;

CREATE OR REPLACE FUNCTION private.registrar_movimiento_salida(
  p_producto_id bigint,
  p_sucursal_id bigint,
  p_cantidad integer,
  p_observacion text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    v_stock_actual INT;
    v_movimiento_id BIGINT;
    v_producto_nombre TEXT;
    v_sucursal_nombre TEXT;
BEGIN
    PERFORM private.require_actor(ARRAY['admin', 'encargada', 'almacen']::text[], p_sucursal_id, false);
    IF p_cantidad <= 0 THEN RAISE EXCEPTION 'La cantidad debe ser mayor a 0'; END IF;
    SELECT nombre INTO v_producto_nombre FROM public.productos WHERE id = p_producto_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Producto no encontrado'; END IF;
    SELECT nombre INTO v_sucursal_nombre FROM public.sucursales WHERE id = p_sucursal_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Sucursal no encontrada'; END IF;
    SELECT cantidad INTO v_stock_actual FROM public.inventarios WHERE producto_id = p_producto_id AND sucursal_id = p_sucursal_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'El producto no tiene inventario registrado en la sucursal seleccionada.'; END IF;
    IF v_stock_actual < p_cantidad THEN RAISE EXCEPTION 'Stock insuficiente en la sucursal para el producto ''%''. Disponible: %.', v_producto_nombre, v_stock_actual; END IF;
    UPDATE public.inventarios SET cantidad = cantidad - p_cantidad, updated_at = timezone('utc'::text, now()) WHERE producto_id = p_producto_id AND sucursal_id = p_sucursal_id;
    INSERT INTO public.movimientos (producto_id, sucursal_id, tipo, cantidad, observacion) VALUES (p_producto_id, p_sucursal_id, 'salida', p_cantidad, p_observacion) RETURNING id INTO v_movimiento_id;
    RETURN jsonb_build_object('id', v_movimiento_id, 'producto_id', p_producto_id, 'producto_nombre', v_producto_nombre, 'sucursal_id', p_sucursal_id, 'sucursal_nombre', v_sucursal_nombre, 'tipo', 'salida', 'cantidad', p_cantidad, 'stock_actual', v_stock_actual - p_cantidad, 'observacion', p_observacion);
END;
$function$;

CREATE OR REPLACE FUNCTION private.registrar_movimiento_transferencia(
  p_producto_id bigint,
  p_sucursal_origen_id bigint,
  p_sucursal_destino_id bigint,
  p_cantidad integer,
  p_observacion text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    v_stock_origen INT;
    v_movimiento_id BIGINT;
    v_producto_nombre TEXT;
    v_origen_nombre TEXT;
    v_destino_nombre TEXT;
BEGIN
    PERFORM private.require_actor(ARRAY['admin', 'encargada', 'almacen']::text[], p_sucursal_origen_id, false);
    IF p_cantidad <= 0 THEN RAISE EXCEPTION 'La cantidad debe ser mayor a 0'; END IF;
    IF p_sucursal_origen_id = p_sucursal_destino_id THEN RAISE EXCEPTION 'La sucursal de origen y destino no pueden ser la misma'; END IF;
    SELECT nombre INTO v_producto_nombre FROM public.productos WHERE id = p_producto_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Producto no encontrado'; END IF;
    SELECT nombre INTO v_origen_nombre FROM public.sucursales WHERE id = p_sucursal_origen_id;
    SELECT nombre INTO v_destino_nombre FROM public.sucursales WHERE id = p_sucursal_destino_id;
    IF v_origen_nombre IS NULL OR v_destino_nombre IS NULL THEN RAISE EXCEPTION 'Sucursal no encontrada'; END IF;
    SELECT cantidad INTO v_stock_origen FROM public.inventarios WHERE producto_id = p_producto_id AND sucursal_id = p_sucursal_origen_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'El producto no tiene inventario en la sucursal de origen.'; END IF;
    IF v_stock_origen < p_cantidad THEN RAISE EXCEPTION 'Stock insuficiente en la sucursal de origen para el producto ''%''. Disponible: %.', v_producto_nombre, v_stock_origen; END IF;
    UPDATE public.inventarios SET cantidad = cantidad - p_cantidad, updated_at = timezone('utc'::text, now()) WHERE producto_id = p_producto_id AND sucursal_id = p_sucursal_origen_id;
    INSERT INTO public.inventarios (producto_id, sucursal_id, cantidad, updated_at) VALUES (p_producto_id, p_sucursal_destino_id, p_cantidad, timezone('utc'::text, now())) ON CONFLICT (producto_id, sucursal_id) DO UPDATE SET cantidad = public.inventarios.cantidad + EXCLUDED.cantidad, updated_at = timezone('utc'::text, now());
    INSERT INTO public.movimientos (producto_id, sucursal_id, sucursal_destino_id, tipo, cantidad, observacion) VALUES (p_producto_id, p_sucursal_origen_id, p_sucursal_destino_id, 'transferencia', p_cantidad, p_observacion) RETURNING id INTO v_movimiento_id;
    RETURN jsonb_build_object('id', v_movimiento_id, 'producto_id', p_producto_id, 'producto_nombre', v_producto_nombre, 'sucursal_origen_id', p_sucursal_origen_id, 'sucursal_origen_nombre', v_origen_nombre, 'sucursal_destino_id', p_sucursal_destino_id, 'sucursal_destino_nombre', v_destino_nombre, 'tipo', 'transferencia', 'cantidad', p_cantidad, 'stock_origen_remanente', v_stock_origen - p_cantidad, 'observacion', p_observacion);
END;
$function$;

CREATE OR REPLACE FUNCTION private.registrar_venta(
  p_sucursal_id bigint,
  p_metodo_pago text,
  p_productos jsonb,
  p_fecha timestamptz DEFAULT timezone('utc'::text, now())
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    v_venta_id BIGINT;
    v_item JSONB;
    v_producto_id BIGINT;
    v_cantidad INT;
    v_precio_unitario NUMERIC(10, 2);
    v_subtotal NUMERIC(10, 2);
    v_total NUMERIC(10, 2) := 0.00;
    v_stock_actual INT;
    v_producto_nombre TEXT;
    v_detalles_json JSONB := '[]'::jsonb;
BEGIN
    PERFORM private.require_actor(ARRAY['admin', 'encargada', 'cajera', 'vendedora']::text[], p_sucursal_id, false);
    IF jsonb_array_length(p_productos) = 0 THEN RAISE EXCEPTION 'La venta debe contener al menos un producto'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.sucursales WHERE id = p_sucursal_id) THEN RAISE EXCEPTION 'Sucursal con ID % no válida', p_sucursal_id; END IF;
    INSERT INTO public.ventas (sucursal_id, fecha, metodo_pago, total) VALUES (p_sucursal_id, p_fecha, p_metodo_pago, 0.00) RETURNING id INTO v_venta_id;
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_productos) LOOP
        v_producto_id := (v_item->>'producto_id')::BIGINT;
        v_cantidad := (v_item->>'cantidad')::INT;
        IF v_cantidad <= 0 THEN RAISE EXCEPTION 'La cantidad para el producto ID % debe ser mayor a 0', v_producto_id; END IF;
        SELECT nombre, precio INTO v_producto_nombre, v_precio_unitario FROM public.productos WHERE id = v_producto_id;
        IF NOT FOUND THEN RAISE EXCEPTION 'Producto con ID % no encontrado', v_producto_id; END IF;
        IF v_item ? 'precio' AND (v_item->>'precio')::NUMERIC >= 0 THEN v_precio_unitario := (v_item->>'precio')::NUMERIC; END IF;
        SELECT cantidad INTO v_stock_actual FROM public.inventarios WHERE producto_id = v_producto_id AND sucursal_id = p_sucursal_id FOR UPDATE;
        IF NOT FOUND THEN RAISE EXCEPTION 'El producto ''%'' no tiene inventario en esta sucursal.', v_producto_nombre; END IF;
        IF v_stock_actual < v_cantidad THEN RAISE EXCEPTION 'Stock insuficiente en la sucursal para el producto ''%''. Solicitado: %, Disponible: %.', v_producto_nombre, v_cantidad, v_stock_actual; END IF;
        UPDATE public.inventarios SET cantidad = cantidad - v_cantidad, updated_at = timezone('utc'::text, now()) WHERE producto_id = v_producto_id AND sucursal_id = p_sucursal_id;
        v_subtotal := v_precio_unitario * v_cantidad;
        v_total := v_total + v_subtotal;
        INSERT INTO public.ventas_detalles (venta_id, producto_id, cantidad, precio) VALUES (v_venta_id, v_producto_id, v_cantidad, v_precio_unitario);
        INSERT INTO public.movimientos (producto_id, sucursal_id, tipo, cantidad, observacion) VALUES (v_producto_id, p_sucursal_id, 'salida', v_cantidad, 'Venta #' || v_venta_id);
        v_detalles_json := v_detalles_json || jsonb_build_object('producto_id', v_producto_id, 'nombre', v_producto_nombre, 'cantidad', v_cantidad, 'precio', v_precio_unitario, 'subtotal', v_subtotal);
    END LOOP;
    UPDATE public.ventas SET total = v_total WHERE id = v_venta_id;
    RETURN jsonb_build_object('id', v_venta_id, 'sucursal_id', p_sucursal_id, 'fecha', p_fecha, 'metodo_pago', p_metodo_pago, 'total', v_total, 'detalles', v_detalles_json);
END;
$function$;

-- Public signatures remain stable for the existing Expo client, but only the
-- authenticated role can invoke them. The public functions are invoker
-- wrappers; writes happen only inside guarded private helpers.
CREATE OR REPLACE FUNCTION public.registrar_producto_con_stock(p_nombre text, p_codigo text, p_categoria text, p_precio numeric, p_cantidad integer, p_sucursal_id bigint)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = ''
AS $$ SELECT private.registrar_producto_con_stock($1, $2, $3, $4, $5, $6) $$;
CREATE OR REPLACE FUNCTION public.registrar_movimiento_entrada(p_producto_id bigint, p_sucursal_id bigint, p_cantidad integer, p_observacion text DEFAULT NULL)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = ''
AS $$ SELECT private.registrar_movimiento_entrada($1, $2, $3, $4) $$;
CREATE OR REPLACE FUNCTION public.registrar_movimiento_salida(p_producto_id bigint, p_sucursal_id bigint, p_cantidad integer, p_observacion text DEFAULT NULL)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = ''
AS $$ SELECT private.registrar_movimiento_salida($1, $2, $3, $4) $$;
CREATE OR REPLACE FUNCTION public.registrar_movimiento_transferencia(p_producto_id bigint, p_sucursal_origen_id bigint, p_sucursal_destino_id bigint, p_cantidad integer, p_observacion text DEFAULT NULL)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = ''
AS $$ SELECT private.registrar_movimiento_transferencia($1, $2, $3, $4, $5) $$;
CREATE OR REPLACE FUNCTION public.registrar_venta(p_sucursal_id bigint, p_metodo_pago text, p_productos jsonb, p_fecha timestamptz DEFAULT timezone('utc'::text, now()))
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = ''
AS $$ SELECT private.registrar_venta($1, $2, $3, $4) $$;

-- Remove implicit PUBLIC/anon execution and grant only the authenticated API.
REVOKE ALL ON FUNCTION private.actor_role() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.actor_branch() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.actor_is_admin() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.is_provisioned_employee() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.require_actor(text[], bigint, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.actor_role() TO authenticated;
GRANT EXECUTE ON FUNCTION private.actor_branch() TO authenticated;
GRANT EXECUTE ON FUNCTION private.actor_is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_provisioned_employee() TO authenticated;
GRANT EXECUTE ON FUNCTION private.require_actor(text[], bigint, boolean) TO authenticated;

REVOKE ALL ON FUNCTION private.registrar_producto_con_stock(text, text, text, numeric, integer, bigint) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.registrar_movimiento_entrada(bigint, bigint, integer, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.registrar_movimiento_salida(bigint, bigint, integer, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.registrar_movimiento_transferencia(bigint, bigint, bigint, integer, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.registrar_venta(bigint, text, jsonb, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.registrar_producto_con_stock(text, text, text, numeric, integer, bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION private.registrar_movimiento_entrada(bigint, bigint, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION private.registrar_movimiento_salida(bigint, bigint, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION private.registrar_movimiento_transferencia(bigint, bigint, bigint, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION private.registrar_venta(bigint, text, jsonb, timestamptz) TO authenticated;

REVOKE ALL ON FUNCTION public.registrar_producto_con_stock(text, text, text, numeric, integer, bigint) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.registrar_movimiento_entrada(bigint, bigint, integer, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.registrar_movimiento_salida(bigint, bigint, integer, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.registrar_movimiento_transferencia(bigint, bigint, bigint, integer, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.registrar_venta(bigint, text, jsonb, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_producto_con_stock(text, text, text, numeric, integer, bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_movimiento_entrada(bigint, bigint, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_movimiento_salida(bigint, bigint, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_movimiento_transferencia(bigint, bigint, bigint, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_venta(bigint, text, jsonb, timestamptz) TO authenticated;

-- No direct Data API writes. Authenticated SELECT is still filtered by RLS.
REVOKE ALL ON TABLE public.perfiles, public.sucursales, public.productos, public.inventarios, public.movimientos, public.ventas, public.ventas_detalles FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.perfiles, public.sucursales, public.productos, public.inventarios, public.movimientos, public.ventas, public.ventas_detalles FROM PUBLIC, authenticated;
GRANT SELECT ON TABLE public.perfiles, public.sucursales, public.productos, public.inventarios, public.movimientos, public.ventas, public.ventas_detalles TO authenticated;

ALTER TABLE public.perfiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sucursales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.productos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.movimientos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ventas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ventas_detalles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS perfiles_read_all ON public.perfiles;
DROP POLICY IF EXISTS perfiles_write_own ON public.perfiles;
DROP POLICY IF EXISTS sucursales_read_all ON public.sucursales;
DROP POLICY IF EXISTS productos_read_all ON public.productos;
DROP POLICY IF EXISTS productos_insert_all ON public.productos;
DROP POLICY IF EXISTS productos_update_all ON public.productos;
DROP POLICY IF EXISTS inventarios_read_all ON public.inventarios;
DROP POLICY IF EXISTS inventarios_insert_all ON public.inventarios;
DROP POLICY IF EXISTS inventarios_update_all ON public.inventarios;
DROP POLICY IF EXISTS movimientos_read_all ON public.movimientos;
DROP POLICY IF EXISTS movimientos_insert_all ON public.movimientos;
DROP POLICY IF EXISTS ventas_read_all ON public.ventas;
DROP POLICY IF EXISTS ventas_insert_all ON public.ventas;
DROP POLICY IF EXISTS ventas_detalles_read_all ON public.ventas_detalles;
DROP POLICY IF EXISTS ventas_detalles_insert_all ON public.ventas_detalles;

CREATE POLICY perfiles_select_self_or_admin ON public.perfiles
  FOR SELECT TO authenticated
  USING (id = (SELECT auth.uid()) OR private.actor_is_admin());
CREATE POLICY sucursales_select_provisioned ON public.sucursales
  FOR SELECT TO authenticated
  USING (private.is_provisioned_employee());
CREATE POLICY productos_select_provisioned ON public.productos
  FOR SELECT TO authenticated
  USING (private.is_provisioned_employee());
CREATE POLICY inventarios_select_provisioned ON public.inventarios
  FOR SELECT TO authenticated
  USING (private.is_provisioned_employee());
CREATE POLICY movimientos_select_scoped ON public.movimientos
  FOR SELECT TO authenticated
  USING (
    private.actor_is_admin()
    OR (
      private.actor_role() IN ('encargada', 'almacen', 'cajera', 'vendedora', 'reponedora')
      AND (sucursal_id = private.actor_branch() OR sucursal_destino_id = private.actor_branch())
    )
  );
CREATE POLICY ventas_select_scoped ON public.ventas
  FOR SELECT TO authenticated
  USING (
    private.actor_is_admin()
    OR (
      private.actor_role() IN ('encargada', 'cajera', 'vendedora')
      AND sucursal_id = private.actor_branch()
    )
  );
CREATE POLICY ventas_detalles_select_scoped ON public.ventas_detalles
  FOR SELECT TO authenticated
  USING (
    private.actor_is_admin()
    OR EXISTS (
      SELECT 1 FROM public.ventas AS v
      WHERE v.id = venta_id
        AND private.actor_role() IN ('encargada', 'cajera', 'vendedora')
        AND v.sucursal_id = private.actor_branch()
    )
  );

-- Marketing is deliberately not granted raw ventas/ventas_detalles reads in
-- this first slice. An aggregate-only RPC/view must be added before enabling
-- that role's analytics surface.
