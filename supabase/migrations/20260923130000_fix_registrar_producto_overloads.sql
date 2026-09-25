-- Remove ambiguous registrar_producto_con_stock overloads (6-param vs 7-param).
-- PostgREST cannot pick a candidate when multiple signatures match the same payload.

ALTER TABLE public.productos
  ADD COLUMN IF NOT EXISTS codigo_barra TEXT;

DROP FUNCTION IF EXISTS public.registrar_producto_con_stock(text, text, text, numeric, integer, bigint);
DROP FUNCTION IF EXISTS public.registrar_producto_con_stock(text, text, text, numeric, integer, bigint, text);
DROP FUNCTION IF EXISTS public.registrar_producto_con_stock(text, text, text, numeric, integer, bigint, text, text);

DROP FUNCTION IF EXISTS private.registrar_producto_con_stock(text, text, text, numeric, integer, bigint);
DROP FUNCTION IF EXISTS private.registrar_producto_con_stock(text, text, text, numeric, integer, bigint, text);
DROP FUNCTION IF EXISTS private.registrar_producto_con_stock(text, text, text, numeric, integer, bigint, text, text);

CREATE OR REPLACE FUNCTION private.registrar_producto_con_stock(
  p_nombre text,
  p_codigo text,
  p_categoria text,
  p_precio numeric,
  p_cantidad integer,
  p_sucursal_id bigint,
  p_codigo_barra text DEFAULT NULL,
  p_subcategoria text DEFAULT NULL
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
    PERFORM private.require_actor(ARRAY['almacen']::text[], p_sucursal_id, false);
    IF p_cantidad < 0 THEN
        RAISE EXCEPTION 'La cantidad no puede ser negativa';
    END IF;
    SELECT nombre INTO v_sucursal_nombre FROM public.sucursales WHERE id = p_sucursal_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Sucursal con ID % no encontrada', p_sucursal_id;
    END IF;
    INSERT INTO public.productos (nombre, codigo, codigo_barra, categoria, subcategoria, precio, cantidad)
    VALUES (
      p_nombre,
      p_codigo,
      NULLIF(btrim(p_codigo_barra), ''),
      p_categoria,
      NULLIF(btrim(p_subcategoria), ''),
      p_precio,
      p_cantidad
    )
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
        'producto', jsonb_build_object(
          'id', v_producto_id,
          'nombre', p_nombre,
          'codigo', p_codigo,
          'codigo_barra', NULLIF(btrim(p_codigo_barra), ''),
          'categoria', p_categoria,
          'subcategoria', NULLIF(btrim(p_subcategoria), ''),
          'precio', p_precio,
          'cantidad', p_cantidad
        ),
        'sucursal', jsonb_build_object('id', p_sucursal_id, 'nombre', v_sucursal_nombre),
        'cantidad_inicial', p_cantidad,
        'mensaje', 'Producto registrado correctamente. Cantidad inicial asignada a la sucursal ' || v_sucursal_nombre || '.'
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.registrar_producto_con_stock(
  p_nombre text,
  p_codigo text,
  p_categoria text,
  p_precio numeric,
  p_cantidad integer,
  p_sucursal_id bigint,
  p_codigo_barra text DEFAULT NULL,
  p_subcategoria text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT private.registrar_producto_con_stock($1, $2, $3, $4, $5, $6, $7, $8);
$$;

REVOKE ALL ON FUNCTION private.registrar_producto_con_stock(text, text, text, numeric, integer, bigint, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.registrar_producto_con_stock(text, text, text, numeric, integer, bigint, text, text) TO authenticated;

REVOKE ALL ON FUNCTION public.registrar_producto_con_stock(text, text, text, numeric, integer, bigint, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_producto_con_stock(text, text, text, numeric, integer, bigint, text, text) TO authenticated;
