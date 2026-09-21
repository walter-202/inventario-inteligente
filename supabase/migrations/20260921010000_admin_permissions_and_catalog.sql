-- Lidemoda V1 AUTH / SESSION / ROLES / BRANCH rollout (Updated with Admin Analytical Governance)
--
-- This rollout implements:
-- 1. Strict separation of concerns: 'admin' is analytical and user-management only.
--    No operational mutations (sales, stock movements, product catalog creation).
-- 2. Scoped multi-branch operational roles:
--    - 'almacen': catalog creation and central dispatch.
--    - 'encargada': own-branch reception, inventory movements, and sales.
--    - 'cajera' / 'vendedora': own-branch point of sale.
--    - 'reponedora': own-branch inventory read.
--    - 'marketing': aggregate analytics.
-- 3. Row Level Security on all core tables.
-- 4. User profile governance: Only admin can assign roles and branches.

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

-- Ensure subcategoria column exists on productos
ALTER TABLE public.productos ADD COLUMN IF NOT EXISTS subcategoria TEXT;

ALTER TABLE public.perfiles DROP CONSTRAINT IF EXISTS perfiles_rol_check;
ALTER TABLE public.perfiles
  ADD CONSTRAINT perfiles_rol_check
  CHECK (rol = ANY (ARRAY['admin', 'encargada', 'cajera', 'vendedora', 'almacen', 'reponedora', 'marketing']::text[]));

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA private TO authenticated;

-- Helpers for RLS evaluation
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
      AND (p.rol = 'admin' OR p.rol = 'marketing' OR p.sucursal_id IS NOT NULL)
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

  -- Admin cannot execute operational branch mutations unless explicitly included
  IF v_role <> 'admin' AND v_branch IS NULL THEN
    RAISE EXCEPTION 'BRANCH_ASSIGNMENT_REQUIRED' USING ERRCODE = '42501';
  END IF;

  IF v_role <> 'admin' AND NOT p_allow_any_branch AND p_requested_branch IS DISTINCT FROM v_branch THEN
    RAISE EXCEPTION 'BRANCH_NOT_ALLOWED' USING ERRCODE = '42501';
  END IF;
END
$$;

-- Operational mutations: ADMIN IS EXCLUDED. Only operational roles can execute.

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
    -- Only warehouse operators can register new products in the central catalog
    PERFORM private.require_actor(ARRAY['almacen']::text[], p_sucursal_id, false);
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
    PERFORM private.require_actor(ARRAY['encargada', 'almacen']::text[], p_sucursal_id, false);
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
    PERFORM private.require_actor(ARRAY['encargada', 'almacen']::text[], p_sucursal_id, false);
    IF p_cantidad <= 0 THEN RAISE EXCEPTION 'La cantidad debe ser mayor a 0'; END IF;
    SELECT nombre INTO v_producto_nombre FROM public.productos WHERE id = p_producto_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Producto no encontrado'; END IF;
    SELECT nombre INTO v_sucursal_nombre FROM public.sucursales WHERE id = p_sucursal_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Sucursal no encontrada'; END IF;
    SELECT cantidad INTO v_stock_actual FROM public.inventarios WHERE producto_id = p_producto_id AND sucursal_id = p_sucursal_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'El producto no tiene inventario registrado en la sucursal seleccionada.'; END IF;
    IF v_stock_actual < p_cantidad THEN RAISE EXCEPTION 'Stock insuficiente. Disponible: %, Solicitado: %', v_stock_actual, p_cantidad; END IF;
    UPDATE public.inventarios SET cantidad = cantidad - p_cantidad, updated_at = timezone('utc'::text, now()) WHERE producto_id = p_producto_id AND sucursal_id = p_sucursal_id;
    INSERT INTO public.movimientos (producto_id, sucursal_id, tipo, cantidad, observacion)
    VALUES (p_producto_id, p_sucursal_id, 'salida', p_cantidad, p_observacion)
    RETURNING id INTO v_movimiento_id;
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
    PERFORM private.require_actor(ARRAY['almacen', 'encargada']::text[], p_sucursal_origen_id, false);
    IF p_cantidad <= 0 THEN RAISE EXCEPTION 'La cantidad debe ser mayor a 0'; END IF;
    IF p_sucursal_origen_id = p_sucursal_destino_id THEN RAISE EXCEPTION 'La sucursal destino no puede ser igual a la sucursal origen'; END IF;
    SELECT nombre INTO v_producto_nombre FROM public.productos WHERE id = p_producto_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Producto no encontrado'; END IF;
    SELECT nombre INTO v_origen_nombre FROM public.sucursales WHERE id = p_sucursal_origen_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Sucursal origen no encontrada'; END IF;
    SELECT nombre INTO v_destino_nombre FROM public.sucursales WHERE id = p_sucursal_destino_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Sucursal destino no encontrada'; END IF;
    SELECT cantidad INTO v_stock_origen FROM public.inventarios WHERE producto_id = p_producto_id AND sucursal_id = p_sucursal_origen_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'El producto no tiene inventario en la sucursal origen.'; END IF;
    IF v_stock_origen < p_cantidad THEN RAISE EXCEPTION 'Stock insuficiente en la sucursal origen. Disponible: %, Solicitado: %', v_stock_origen, p_cantidad; END IF;
    UPDATE public.inventarios SET cantidad = cantidad - p_cantidad, updated_at = timezone('utc'::text, now()) WHERE producto_id = p_producto_id AND sucursal_id = p_sucursal_origen_id;
    INSERT INTO public.inventarios (producto_id, sucursal_id, cantidad, updated_at)
    VALUES (p_producto_id, p_sucursal_destino_id, p_cantidad, timezone('utc'::text, now()))
    ON CONFLICT (producto_id, sucursal_id)
    DO UPDATE SET cantidad = public.inventarios.cantidad + EXCLUDED.cantidad, updated_at = timezone('utc'::text, now());
    INSERT INTO public.movimientos (producto_id, sucursal_id, sucursal_destino_id, tipo, cantidad, observacion)
    VALUES (p_producto_id, p_sucursal_origen_id, p_sucursal_destino_id, 'transferencia', p_cantidad, p_observacion)
    RETURNING id INTO v_movimiento_id;
    RETURN jsonb_build_object('id', v_movimiento_id, 'producto_id', p_producto_id, 'producto_nombre', v_producto_nombre, 'sucursal_origen_id', p_sucursal_origen_id, 'sucursal_origen_nombre', v_origen_nombre, 'sucursal_destino_id', p_sucursal_destino_id, 'sucursal_destino_nombre', v_destino_nombre, 'tipo', 'transferencia', 'cantidad', p_cantidad, 'observacion', p_observacion);
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
    -- Only store staff (encargada, cajera, vendedora) can register sales
    PERFORM private.require_actor(ARRAY['encargada', 'cajera', 'vendedora']::text[], p_sucursal_id, false);
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

-- Administrative user management: ONLY ADMIN ALLOWED
CREATE OR REPLACE FUNCTION private.admin_actualizar_perfil(
  p_user_id uuid,
  p_rol text,
  p_sucursal_id bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT (SELECT private.actor_is_admin()) THEN
    RAISE EXCEPTION 'ONLY_ADMIN_ALLOWED' USING ERRCODE = '42501';
  END IF;

  IF p_rol NOT IN ('admin', 'encargada', 'cajera', 'vendedora', 'almacen', 'reponedora', 'marketing') THEN
    RAISE EXCEPTION 'INVALID_ROLE' USING ERRCODE = '22023';
  END IF;

  UPDATE public.perfiles
  SET rol = p_rol,
      sucursal_id = p_sucursal_id,
      updated_at = timezone('utc'::text, now())
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'USER_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  RETURN jsonb_build_object('success', true, 'user_id', p_user_id, 'rol', p_rol, 'sucursal_id', p_sucursal_id);
END;
$$;

CREATE OR REPLACE FUNCTION private.admin_crear_perfil(
  p_id uuid,
  p_email text,
  p_nombre text,
  p_rol text,
  p_sucursal_id bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT (SELECT private.actor_is_admin()) THEN
    RAISE EXCEPTION 'ONLY_ADMIN_ALLOWED' USING ERRCODE = '42501';
  END IF;

  IF p_rol NOT IN ('admin', 'encargada', 'cajera', 'vendedora', 'almacen', 'reponedora', 'marketing') THEN
    RAISE EXCEPTION 'INVALID_ROLE' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.perfiles (id, email, nombre, rol, sucursal_id, created_at, updated_at)
  VALUES (p_id, p_email, p_nombre, p_rol, p_sucursal_id, timezone('utc'::text, now()), timezone('utc'::text, now()))
  ON CONFLICT (id) DO UPDATE
  SET email = EXCLUDED.email,
      nombre = EXCLUDED.nombre,
      rol = EXCLUDED.rol,
      sucursal_id = EXCLUDED.sucursal_id,
      updated_at = timezone('utc'::text, now());

  RETURN jsonb_build_object('success', true, 'id', p_id, 'rol', p_rol, 'sucursal_id', p_sucursal_id);
END;
$$;

-- Public wrappers
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

CREATE OR REPLACE FUNCTION public.admin_actualizar_perfil(p_user_id uuid, p_rol text, p_sucursal_id bigint)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = ''
AS $$ SELECT private.admin_actualizar_perfil($1, $2, $3) $$;

CREATE OR REPLACE FUNCTION public.admin_crear_perfil(p_id uuid, p_email text, p_nombre text, p_rol text, p_sucursal_id bigint)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = ''
AS $$ SELECT private.admin_crear_perfil($1, $2, $3, $4, $5) $$;

-- Revoke implicit PUBLIC/anon and grant only authenticated API
REVOKE ALL ON FUNCTION private.actor_role() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.actor_branch() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.actor_is_admin() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.is_provisioned_employee() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.require_actor(text[], bigint, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.admin_actualizar_perfil(uuid, text, bigint) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.admin_crear_perfil(uuid, text, text, text, bigint) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION private.actor_role() TO authenticated;
GRANT EXECUTE ON FUNCTION private.actor_branch() TO authenticated;
GRANT EXECUTE ON FUNCTION private.actor_is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_provisioned_employee() TO authenticated;
GRANT EXECUTE ON FUNCTION private.require_actor(text[], bigint, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION private.admin_actualizar_perfil(uuid, text, bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION private.admin_crear_perfil(uuid, text, text, text, bigint) TO authenticated;

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
REVOKE ALL ON FUNCTION public.admin_actualizar_perfil(uuid, text, bigint) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_crear_perfil(uuid, text, text, text, bigint) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.registrar_producto_con_stock(text, text, text, numeric, integer, bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_movimiento_entrada(bigint, bigint, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_movimiento_salida(bigint, bigint, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_movimiento_transferencia(bigint, bigint, bigint, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_venta(bigint, text, jsonb, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_actualizar_perfil(uuid, text, bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_crear_perfil(uuid, text, text, text, bigint) TO authenticated;

-- Table Grants & RLS
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

-- Clean existing policies
DROP POLICY IF EXISTS perfiles_read_all ON public.perfiles;
DROP POLICY IF EXISTS perfiles_write_own ON public.perfiles;
DROP POLICY IF EXISTS perfiles_select_self_or_admin ON public.perfiles;
DROP POLICY IF EXISTS sucursales_read_all ON public.sucursales;
DROP POLICY IF EXISTS sucursales_select_provisioned ON public.sucursales;
DROP POLICY IF EXISTS productos_read_all ON public.productos;
DROP POLICY IF EXISTS productos_insert_all ON public.productos;
DROP POLICY IF EXISTS productos_update_all ON public.productos;
DROP POLICY IF EXISTS productos_select_provisioned ON public.productos;
DROP POLICY IF EXISTS inventarios_read_all ON public.inventarios;
DROP POLICY IF EXISTS inventarios_insert_all ON public.inventarios;
DROP POLICY IF EXISTS inventarios_update_all ON public.inventarios;
DROP POLICY IF EXISTS inventarios_select_provisioned ON public.inventarios;
DROP POLICY IF EXISTS movimientos_read_all ON public.movimientos;
DROP POLICY IF EXISTS movimientos_insert_all ON public.movimientos;
DROP POLICY IF EXISTS movimientos_select_scoped ON public.movimientos;
DROP POLICY IF EXISTS ventas_read_all ON public.ventas;
DROP POLICY IF EXISTS ventas_insert_all ON public.ventas;
DROP POLICY IF EXISTS ventas_select_scoped ON public.ventas;
DROP POLICY IF EXISTS ventas_detalles_read_all ON public.ventas_detalles;
DROP POLICY IF EXISTS ventas_detalles_insert_all ON public.ventas_detalles;
DROP POLICY IF EXISTS ventas_detalles_select_scoped ON public.ventas_detalles;

-- Perfiles: self-read or admin-read
CREATE POLICY perfiles_select_self_or_admin ON public.perfiles
  FOR SELECT TO authenticated
  USING (id = (SELECT auth.uid()) OR private.actor_is_admin());

-- Catalog and Stores: All provisioned employees can view
CREATE POLICY sucursales_select_provisioned ON public.sucursales
  FOR SELECT TO authenticated
  USING (private.is_provisioned_employee());

CREATE POLICY productos_select_provisioned ON public.productos
  FOR SELECT TO authenticated
  USING (private.is_provisioned_employee());

CREATE POLICY inventarios_select_provisioned ON public.inventarios
  FOR SELECT TO authenticated
  USING (private.is_provisioned_employee());

-- Movements: Admin reads all branches. Store staff reads own branch.
CREATE POLICY movimientos_select_scoped ON public.movimientos
  FOR SELECT TO authenticated
  USING (
    private.actor_is_admin()
    OR (
      private.actor_role() IN ('encargada', 'almacen', 'cajera', 'vendedora', 'reponedora')
      AND (sucursal_id = private.actor_branch() OR sucursal_destino_id = private.actor_branch())
    )
  );

-- Sales: Admin reads all branches. Store staff reads own branch.
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

-- Mermas and Ordenes de despacho policies
ALTER TABLE public.mermas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mermas_select_authenticated ON public.mermas;
DROP POLICY IF EXISTS mermas_insert_authenticated ON public.mermas;
DROP POLICY IF EXISTS mermas_select_scoped ON public.mermas;
DROP POLICY IF EXISTS mermas_insert_scoped ON public.mermas;

CREATE POLICY mermas_select_scoped ON public.mermas
  FOR SELECT TO authenticated
  USING (
    private.actor_is_admin()
    OR sucursal_id = private.actor_branch()
  );

CREATE POLICY mermas_insert_scoped ON public.mermas
  FOR INSERT TO authenticated
  WITH CHECK (
    private.actor_role() IN ('encargada', 'almacen')
    AND sucursal_id = private.actor_branch()
  );

ALTER TABLE public.ordenes_despacho ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Permitir mutacion de ordenes_despacho" ON public.ordenes_despacho;
DROP POLICY IF EXISTS "Permitir lectura de ordenes_despacho" ON public.ordenes_despacho;
DROP POLICY IF EXISTS ordenes_despacho_select_scoped ON public.ordenes_despacho;
DROP POLICY IF EXISTS ordenes_despacho_insert_scoped ON public.ordenes_despacho;
DROP POLICY IF EXISTS ordenes_despacho_update_scoped ON public.ordenes_despacho;

CREATE POLICY ordenes_despacho_select_scoped ON public.ordenes_despacho
  FOR SELECT TO authenticated
  USING (
    private.actor_is_admin()
    OR origen_id = private.actor_branch()
    OR destino_id = private.actor_branch()
  );

CREATE POLICY ordenes_despacho_insert_scoped ON public.ordenes_despacho
  FOR INSERT TO authenticated
  WITH CHECK (
    private.actor_role() = 'almacen'
  );

CREATE POLICY ordenes_despacho_update_scoped ON public.ordenes_despacho
  FOR UPDATE TO authenticated
  USING (
    private.actor_role() IN ('encargada', 'almacen')
    AND destino_id = private.actor_branch()
  )
  WITH CHECK (
    private.actor_role() IN ('encargada', 'almacen')
    AND destino_id = private.actor_branch()
  );


-- SEED REAL CATALOG

-- ============================================================================
-- Catálogo Real Lidemoda (104 productos de docs/productos.xlsx)
-- Categorías: belleza, accesorios, hogar, regalos, novedades
-- ============================================================================

-- 1. Asegurar columna subcategoria en public.productos
ALTER TABLE public.productos ADD COLUMN IF NOT EXISTS subcategoria TEXT;

-- 2. Inserción de productos (idempotente por código SKU)
INSERT INTO public.productos (codigo, nombre, categoria, subcategoria, precio, cantidad, stock_minimo, created_at, updated_at)
VALUES
  ('BEL-001', 'Base Líquida', 'belleza', 'Maquillaje', 35.00, 50, 5, now(), now()),
  ('ACC-001', 'Aretes', 'accesorios', 'Bisutería', 20.00, 50, 5, now(), now()),
  ('HOG-001', 'Taza Messi', 'hogar', 'Tazas', 35.00, 50, 5, now(), now()),
  ('NOV-001', 'Agendas Ahorradoras', 'novedades', 'Agendas', 30.00, 50, 5, now(), now()),
  ('BEL-002', 'Base en Crema', 'belleza', 'Maquillaje', 35.00, 50, 5, now(), now()),
  ('ACC-002', 'Aretes de Aro', 'accesorios', 'Bisutería', 20.00, 50, 5, now(), now()),
  ('HOG-002', 'Taza Ronaldo', 'hogar', 'Tazas', 35.00, 50, 5, now(), now()),
  ('BEL-003', 'Corrector', 'belleza', 'Maquillaje', 35.00, 50, 5, now(), now()),
  ('ACC-003', 'Aretes Colgantes', 'accesorios', 'Bisutería', 20.00, 50, 5, now(), now()),
  ('HOG-003', 'Taza Harry Potter', 'hogar', 'Tazas', 35.00, 50, 5, now(), now()),
  ('BEL-004', 'Polvo Compacto', 'belleza', 'Maquillaje', 35.00, 50, 5, now(), now()),
  ('ACC-004', 'Aretes Pequeños', 'accesorios', 'Bisutería', 20.00, 50, 5, now(), now()),
  ('HOG-004', 'Taza Control de Play', 'hogar', 'Vasos', 30.00, 50, 5, now(), now()),
  ('BEL-005', 'Polvo Suelto', 'belleza', 'Maquillaje', 35.00, 50, 5, now(), now()),
  ('ACC-005', 'Collar', 'accesorios', 'Bisutería', 20.00, 50, 5, now(), now()),
  ('HOG-005', 'Taza Bob Esponja', 'hogar', 'Vasos', 30.00, 50, 5, now(), now()),
  ('BEL-006', 'Rubor', 'belleza', 'Maquillaje', 35.00, 50, 5, now(), now()),
  ('ACC-006', 'Collar con Dije', 'accesorios', 'Bisutería', 20.00, 50, 5, now(), now()),
  ('HOG-006', 'Botella Decorativa', 'hogar', 'Botellas', 45.00, 50, 5, now(), now()),
  ('BEL-007', 'Iluminador', 'belleza', 'Maquillaje', 35.00, 50, 5, now(), now()),
  ('ACC-007', 'Gargantilla', 'accesorios', 'Bisutería', 20.00, 50, 5, now(), now()),
  ('HOG-007', 'Termo Decorativo', 'hogar', 'Termos', 55.00, 50, 5, now(), now()),
  ('BEL-008', 'Contorno', 'belleza', 'Maquillaje', 35.00, 50, 5, now(), now()),
  ('ACC-008', 'Pulsera', 'accesorios', 'Bisutería', 20.00, 50, 5, now(), now()),
  ('HOG-008', 'Marco para Fotos', 'hogar', 'Decoración', 40.00, 50, 5, now(), now()),
  ('BEL-009', 'Paleta de Sombras', 'belleza', 'Maquillaje', 35.00, 50, 5, now(), now()),
  ('ACC-009', 'Pulseras', 'accesorios', 'Bisuteria', 30.00, 50, 5, now(), now()),
  ('HOG-009', 'Portarretrato', 'hogar', 'Decoración', 40.00, 50, 5, now(), now()),
  ('BEL-010', 'Sombra Individual', 'belleza', 'Maquillaje', 35.00, 50, 5, now(), now()),
  ('ACC-010', 'Broche', 'accesorios', 'Bisutería', 20.00, 50, 5, now(), now()),
  ('HOG-010', 'Espejo Decorativo', 'hogar', 'Decoración', 40.00, 50, 5, now(), now()),
  ('BEL-011', 'Delineador Líquido', 'belleza', 'Maquillaje', 35.00, 50, 5, now(), now()),
  ('ACC-011', 'Vincha', 'accesorios', 'Cabello', 15.00, 50, 5, now(), now()),
  ('REG-001', 'Llavero de Regalo', 'regalos', 'Detalles', 45.00, 50, 5, now(), now()),
  ('BEL-012', 'Delineador en Lápiz', 'belleza', 'Maquillaje', 35.00, 50, 5, now(), now()),
  ('ACC-012', 'Vincha Acolchada', 'accesorios', 'Cabello', 15.00, 50, 5, now(), now()),
  ('REG-002', 'Llavero de Peluche', 'regalos', 'Detalles', 45.00, 50, 5, now(), now()),
  ('BEL-013', 'Máscara de Pestañas', 'belleza', 'Maquillaje', 35.00, 50, 5, now(), now()),
  ('ACC-013', 'Ganchos para Cabello', 'accesorios', 'Cabello', 15.00, 50, 5, now(), now()),
  ('REG-003', 'Peluche Stich', 'regalos', 'Detalles', 45.00, 50, 5, now(), now()),
  ('BEL-014', 'Pestañas Postizas', 'belleza', 'Maquillaje', 35.00, 50, 5, now(), now()),
  ('ACC-014', 'Ganchos Decorativos', 'accesorios', 'Cabello', 15.00, 50, 5, now(), now()),
  ('REG-004', 'Peluche Mushu', 'regalos', 'Detalles', 45.00, 50, 5, now(), now()),
  ('BEL-015', 'Adhesivo para Pestañas', 'belleza', 'Maquillaje', 35.00, 50, 5, now(), now()),
  ('ACC-015', 'Colitas para Cabello', 'accesorios', 'Cabello', 15.00, 50, 5, now(), now()),
  ('REG-005', 'Almohada de Gato', 'regalos', 'Detalles', 45.00, 50, 5, now(), now()),
  ('BEL-016', 'Labial', 'belleza', 'Maquillaje', 35.00, 50, 5, now(), now()),
  ('ACC-016', 'Elásticos para Cabello', 'accesorios', 'Cabello', 15.00, 50, 5, now(), now()),
  ('REG-006', 'Peluche Snopy', 'regalos', 'Detalles', 45.00, 50, 5, now(), now()),
  ('BEL-017', 'Labial Líquido', 'belleza', 'Maquillaje', 35.00, 50, 5, now(), now()),
  ('ACC-017', 'Moños para Cabello', 'accesorios', 'Cabello', 15.00, 50, 5, now(), now()),
  ('REG-007', 'Peluche Lotso', 'regalos', 'Detalles', 45.00, 50, 5, now(), now()),
  ('BEL-018', 'Labial Mate', 'belleza', 'Maquillaje', 35.00, 50, 5, now(), now()),
  ('ACC-018', 'Diademas', 'accesorios', 'Cabello', 15.00, 50, 5, now(), now()),
  ('REG-008', 'Pantuflas Stich', 'regalos', 'Detalles', 45.00, 50, 5, now(), now()),
  ('BEL-019', 'Brillo Labial', 'belleza', 'Maquillaje', 35.00, 50, 5, now(), now()),
  ('ACC-019', 'Pasadores para Cabello', 'accesorios', 'Cabello', 15.00, 50, 5, now(), now()),
  ('REG-009', 'Pantuflas Conejito', 'regalos', 'Detalles', 45.00, 50, 5, now(), now()),
  ('BEL-020', 'Tinta para Labios', 'belleza', 'Maquillaje', 35.00, 50, 5, now(), now()),
  ('ACC-020', 'Pinza para Cabello', 'accesorios', 'Cabello', 15.00, 50, 5, now(), now()),
  ('BEL-021', 'Lápiz Labial', 'belleza', 'Maquillaje', 35.00, 50, 5, now(), now()),
  ('ACC-021', 'Broche para Cabello', 'accesorios', 'Cabello', 15.00, 50, 5, now(), now()),
  ('BEL-022', 'Lápiz para Cejas', 'belleza', 'Maquillaje', 35.00, 50, 5, now(), now()),
  ('ACC-022', 'Cartera', 'accesorios', 'Bolsos', 85.00, 50, 5, now(), now()),
  ('BEL-023', 'Gel para Cejas', 'belleza', 'Maquillaje', 35.00, 50, 5, now(), now()),
  ('ACC-023', 'Cartera Pequeña', 'accesorios', 'Bolsos', 85.00, 50, 5, now(), now()),
  ('BEL-024', 'Sombras para Cejas', 'belleza', 'Maquillaje', 35.00, 50, 5, now(), now()),
  ('ACC-024', 'Cartera de Mano', 'accesorios', 'Bolsos', 85.00, 50, 5, now(), now()),
  ('BEL-025', 'Primer Facial', 'belleza', 'Preparación de maquillaje', 30.00, 50, 5, now(), now()),
  ('ACC-025', 'Bolso', 'accesorios', 'Bolsos', 85.00, 50, 5, now(), now()),
  ('BEL-026', 'Fijador de Maquillaje', 'belleza', 'Preparación de maquillaje', 30.00, 50, 5, now(), now()),
  ('ACC-026', 'Mochila', 'accesorios', 'Bolsos', 85.00, 50, 5, now(), now()),
  ('BEL-027', 'Desmaquillante', 'belleza', 'Cuidado facial', 40.00, 50, 5, now(), now()),
  ('ACC-027', 'Canguro', 'accesorios', 'Bolsos', 85.00, 50, 5, now(), now()),
  ('BEL-028', 'Agua Micelar', 'belleza', 'Cuidado facial', 40.00, 50, 5, now(), now()),
  ('ACC-028', 'Billetera', 'accesorios', 'Bolsos', 85.00, 50, 5, now(), now()),
  ('BEL-029', 'Limpiador Facial', 'belleza', 'Cuidado facial', 40.00, 50, 5, now(), now()),
  ('ACC-029', 'Monedero', 'accesorios', 'Bolsos', 85.00, 50, 5, now(), now()),
  ('BEL-030', 'Exfoliante Facial', 'belleza', 'Cuidado facial', 40.00, 50, 5, now(), now()),
  ('ACC-030', 'Llavero', 'accesorios', 'Accesorios', 30.00, 50, 5, now(), now()),
  ('BEL-031', 'Mascarilla Facial', 'belleza', 'Cuidado facial', 40.00, 50, 5, now(), now()),
  ('ACC-031', 'Llavero Capibara', 'accesorios', 'Accesorios', 30.00, 50, 5, now(), now()),
  ('BEL-032', 'Crema Facial', 'belleza', 'Cuidado facial', 40.00, 50, 5, now(), now()),
  ('ACC-032', 'Llavero de Peluche', 'accesorios', 'Accesorios', 30.00, 50, 5, now(), now()),
  ('BEL-033', 'Sérum Facial', 'belleza', 'Cuidado facial', 40.00, 50, 5, now(), now()),
  ('ACC-033', 'Ponchos', 'accesorios', 'Ropa', 65.00, 50, 5, now(), now()),
  ('BEL-034', 'Protector Solar', 'belleza', 'Cuidado facial', 40.00, 50, 5, now(), now()),
  ('NOV-002', 'Brillo con Llaveros', 'novedades', 'General', 30.00, 50, 5, now(), now()),
  ('BEL-035', 'Bálsamo Labial', 'belleza', 'Cuidado personal', 25.00, 50, 5, now(), now()),
  ('BEL-036', 'Crema Corporal', 'belleza', 'Cuidado corporal', 30.00, 50, 5, now(), now()),
  ('BEL-037', 'Loción Corporal', 'belleza', 'Cuidado corporal', 30.00, 50, 5, now(), now()),
  ('BEL-038', 'Perfume', 'belleza', 'Perfumería', 120.00, 50, 5, now(), now()),
  ('BEL-039', 'Colonia', 'belleza', 'Perfumería', 120.00, 50, 5, now(), now()),
  ('BEL-040', 'Body Splash', 'belleza', 'Perfumería', 120.00, 50, 5, now(), now()),
  ('BEL-041', 'Desodorante', 'belleza', 'Perfumería', 120.00, 50, 5, now(), now()),
  ('BEL-042', 'Esponja de Maquillaje', 'belleza', 'Accesorios de maquillaje', 25.00, 50, 5, now(), now()),
  ('BEL-043', 'Brocha para Base', 'belleza', 'Accesorios de maquillaje', 25.00, 50, 5, now(), now()),
  ('BEL-044', 'Brocha para Rubor', 'belleza', 'Accesorios de maquillaje', 25.00, 50, 5, now(), now()),
  ('BEL-045', 'Brocha para Sombras', 'belleza', 'Accesorios de maquillaje', 25.00, 50, 5, now(), now()),
  ('BEL-046', 'Set de Brochas', 'belleza', 'Accesorios de maquillaje', 25.00, 50, 5, now(), now()),
  ('BEL-047', 'Rizador de Pestañas', 'belleza', 'Accesorios de maquillaje', 25.00, 50, 5, now(), now()),
  ('BEL-048', 'Pinza para Cejas', 'belleza', 'Accesorios de maquillaje', 25.00, 50, 5, now(), now()),
  ('BEL-049', 'Espejo de Maquillaje', 'belleza', 'Accesorios de maquillaje', 25.00, 50, 5, now(), now()),
  ('BEL-050', 'Gemas para Rostro', 'belleza', 'Decoración facial', 30.00, 50, 5, now(), now())
ON CONFLICT (codigo) DO UPDATE
SET nombre = EXCLUDED.nombre,
    categoria = EXCLUDED.categoria,
    subcategoria = EXCLUDED.subcategoria,
    precio = EXCLUDED.precio,
    stock_minimo = EXCLUDED.stock_minimo,
    updated_at = now();

-- 3. Distribución inicial de inventario en las 5 sucursales
DO $$
DECLARE
  v_prod record;
  v_suc record;
  v_cant integer;
BEGIN
  FOR v_prod IN SELECT id, categoria, codigo FROM public.productos LOOP
    FOR v_suc IN SELECT id FROM public.sucursales ORDER BY id LOOP
      -- Lógica de stock realista entre sucursales:
      -- Sucursal 1 (Comercio / Central): stock alto (15 - 30)
      -- Sucursal 2 (Montenegro): stock medio (8 - 20)
      -- Sucursal 3 (Ceja): stock variado con algunos críticos (2 - 4) para probar alertas
      -- Sucursal 4 (Satélite): stock medio (5 - 15)
      -- Sucursal 5 (Rio Seco): stock medio (4 - 12)
      IF v_suc.id = 1 THEN
        v_cant := 15 + ((v_prod.id * 3) % 15);
      ELSIF v_suc.id = 2 THEN
        v_cant := 10 + ((v_prod.id * 5) % 11);
      ELSIF v_suc.id = 3 THEN
        IF v_prod.id % 5 = 0 THEN
          v_cant := 3; -- Alerta crítica
        ELSE
          v_cant := 8 + ((v_prod.id * 2) % 10);
        END IF;
      ELSIF v_suc.id = 4 THEN
        v_cant := 6 + ((v_prod.id * 4) % 9);
      ELSE
        v_cant := 5 + ((v_prod.id * 7) % 8);
      END IF;

      INSERT INTO public.inventarios (producto_id, sucursal_id, cantidad, created_at, updated_at)
      VALUES (v_prod.id, v_suc.id, v_cant, now(), now())
      ON CONFLICT (producto_id, sucursal_id) DO UPDATE
      SET cantidad = EXCLUDED.cantidad,
          updated_at = now();
    END LOOP;
  END LOOP;
END $$;
