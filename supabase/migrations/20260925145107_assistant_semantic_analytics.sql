-- Search and analytics primitives for the assistant.
-- All catalog reads are permission checked; analytics run as the caller and
-- therefore continue to honor the existing row-level security policies.

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;
GRANT USAGE ON SCHEMA extensions TO authenticated;

ALTER TABLE public.productos
  ADD COLUMN IF NOT EXISTS assistant_search_text text
  GENERATED ALWAYS AS (
    translate(
      lower(
        btrim(
          coalesce(nombre, '') || ' ' ||
          coalesce(codigo, '') || ' ' ||
          coalesce(codigo_barra, '') || ' ' ||
          coalesce(categoria, '') || ' ' ||
          coalesce(subcategoria, '')
        )
      ),
      'áéíóúüñ',
      'aeiouun'
    )
  ) STORED,
  ADD COLUMN IF NOT EXISTS assistant_search_document tsvector
  GENERATED ALWAYS AS (
    to_tsvector(
      'simple'::regconfig,
      translate(
        lower(
          btrim(
            coalesce(nombre, '') || ' ' ||
            coalesce(codigo, '') || ' ' ||
            coalesce(codigo_barra, '') || ' ' ||
            coalesce(categoria, '') || ' ' ||
            coalesce(subcategoria, '')
          )
        ),
        'áéíóúüñ',
        'aeiouun'
      )
    )
  ) STORED;

CREATE INDEX IF NOT EXISTS productos_assistant_search_document_idx
  ON public.productos USING gin (assistant_search_document);
CREATE INDEX IF NOT EXISTS productos_assistant_search_trgm_idx
  ON public.productos USING gin (assistant_search_text extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS productos_assistant_codigo_exact_idx
  ON public.productos (upper(btrim(codigo)));
CREATE INDEX IF NOT EXISTS productos_assistant_barcode_exact_idx
  ON public.productos (upper(btrim(codigo_barra)))
  WHERE codigo_barra IS NOT NULL;
CREATE INDEX IF NOT EXISTS ventas_assistant_completed_date_branch_idx
  ON public.ventas (fecha, sucursal_id) WHERE estado = 'completada';
CREATE INDEX IF NOT EXISTS ventas_detalles_assistant_venta_producto_idx
  ON public.ventas_detalles (venta_id, producto_id);
CREATE INDEX IF NOT EXISTS inventarios_assistant_branch_product_idx
  ON public.inventarios (sucursal_id, producto_id);

CREATE OR REPLACE FUNCTION public.assistant_search_products(
  p_query text,
  p_match_count integer DEFAULT 10
)
RETURNS TABLE (
  id bigint,
  nombre text,
  codigo text,
  codigo_barra text,
  categoria text,
  subcategoria text,
  precio numeric,
  cantidad integer,
  stock_minimo integer,
  lexical_score real,
  exact_match boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
SET statement_timeout = '5s'
SET pg_trgm.similarity_threshold = '0.05'
SET pg_trgm.word_similarity_threshold = '0.4'
AS $$
DECLARE
  v_role text := private.actor_role();
  v_query text := translate(lower(btrim(coalesce(p_query, ''))), 'áéíóúüñ', 'aeiouun');
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF v_role NOT IN ('admin', 'encargada', 'cajera', 'vendedora', 'almacen', 'reponedora') THEN
    RAISE EXCEPTION 'ROLE_NOT_ALLOWED' USING ERRCODE = '42501';
  END IF;
  IF v_query = '' OR length(v_query) > 256 OR p_match_count IS NULL OR p_match_count < 1 OR p_match_count > 20 THEN
    RAISE EXCEPTION 'INVALID_SEARCH' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  WITH candidate_ids AS (
    SELECT p.id
    FROM public.productos AS p
    WHERE upper(btrim(p.codigo)) = upper(btrim(p_query))
       OR (p.codigo_barra IS NOT NULL AND upper(btrim(p.codigo_barra)) = upper(btrim(p_query)))

    UNION

    SELECT p.id
    FROM public.productos AS p
    WHERE p.assistant_search_document @@ plainto_tsquery('simple'::regconfig, v_query)

    UNION

    SELECT p.id
    FROM public.productos AS p
    WHERE p.assistant_search_text OPERATOR(extensions.%) v_query

    UNION

    SELECT p.id
    FROM public.productos AS p
    WHERE v_query OPERATOR(extensions.<%) p.assistant_search_text
  ), scored AS (
    SELECT
      p.id,
      p.nombre,
      p.codigo,
      p.codigo_barra,
      p.categoria,
      p.subcategoria,
      p.precio,
      p.cantidad,
      p.stock_minimo,
      greatest(
        extensions.similarity(p.assistant_search_text, v_query),
        extensions.word_similarity(v_query, p.assistant_search_text),
        ts_rank_cd(p.assistant_search_document, plainto_tsquery('simple'::regconfig, v_query))
      )::real AS lexical_score,
      upper(btrim(p.codigo)) = upper(btrim(p_query))
        OR (p.codigo_barra IS NOT NULL AND upper(btrim(p.codigo_barra)) = upper(btrim(p_query))) AS exact_match
    FROM public.productos AS p
    JOIN candidate_ids AS candidates ON candidates.id = p.id
  )
  SELECT
    scored.id,
    scored.nombre,
    scored.codigo,
    scored.codigo_barra,
    scored.categoria,
    scored.subcategoria,
    scored.precio,
    scored.cantidad,
    scored.stock_minimo,
    scored.lexical_score,
    scored.exact_match
  FROM scored
  WHERE scored.exact_match OR scored.lexical_score >= 0.05
  ORDER BY scored.exact_match DESC, scored.lexical_score DESC, scored.id
  LIMIT p_match_count;
END;
$$;

REVOKE ALL ON FUNCTION public.assistant_search_products(text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assistant_search_products(text, integer) TO authenticated;
CREATE OR REPLACE FUNCTION public.assistant_analyze_sales(
  p_from date,
  p_to date,
  p_group_by text,
  p_branch_id bigint DEFAULT NULL,
  p_limit integer DEFAULT 10,
  p_compare_from date DEFAULT NULL,
  p_compare_to date DEFAULT NULL,
  p_category_filter text DEFAULT NULL,
  p_product_query text DEFAULT NULL,
  p_payment_method text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
SET statement_timeout = '8s'
SET pg_trgm.similarity_threshold = '0.12'
AS $$
DECLARE
  v_role text := private.actor_role();
  v_product_query text := translate(lower(btrim(coalesce(p_product_query, ''))), 'áéíóúüñ', 'aeiouun');
  v_summary jsonb;
  v_previous_summary jsonb := NULL;
  v_rows jsonb := '[]'::jsonb;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF v_role NOT IN ('admin', 'encargada', 'cajera', 'vendedora') THEN
    RAISE EXCEPTION 'ROLE_NOT_ALLOWED' USING ERRCODE = '42501';
  END IF;
  IF p_branch_id IS NULL AND v_role <> 'admin' THEN
    RAISE EXCEPTION 'BRANCH_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF p_branch_id IS NOT NULL AND NOT (SELECT private.actor_has_branch(p_branch_id)) THEN
    RAISE EXCEPTION 'BRANCH_NOT_ALLOWED' USING ERRCODE = '42501';
  END IF;
  IF p_from IS NULL OR p_to IS NULL OR p_to < p_from OR p_to - p_from > 364 THEN
    RAISE EXCEPTION 'INVALID_DATE_RANGE' USING ERRCODE = '22023';
  END IF;
  IF p_group_by IS NULL OR p_group_by NOT IN ('dia', 'producto', 'categoria', 'metodo_pago', 'sucursal') THEN
    RAISE EXCEPTION 'INVALID_GROUP_BY' USING ERRCODE = '22023';
  END IF;
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 20 THEN
    RAISE EXCEPTION 'INVALID_LIMIT' USING ERRCODE = '22023';
  END IF;
  IF length(btrim(coalesce(p_category_filter, ''))) > 100
     OR length(btrim(coalesce(p_product_query, ''))) > 100
     OR length(btrim(coalesce(p_payment_method, ''))) > 40 THEN
    RAISE EXCEPTION 'INVALID_FILTER' USING ERRCODE = '22023';
  END IF;

  IF p_category_filter IS NOT NULL OR p_product_query IS NOT NULL THEN
    SELECT jsonb_build_object(
      'revenue', coalesce(sum(d.precio * d.cantidad), 0),
      'transactions', count(DISTINCT v.id),
      'units', coalesce(sum(d.cantidad), 0),
      'average_ticket', coalesce(sum(d.precio * d.cantidad) / greatest(count(DISTINCT v.id), 1), 0)
    ) INTO v_summary
    FROM public.ventas AS v
    JOIN public.ventas_detalles AS d ON d.venta_id = v.id
    JOIN public.productos AS p ON p.id = d.producto_id
    WHERE v.estado = 'completada'
      AND v.fecha >= (p_from::timestamp AT TIME ZONE 'America/La_Paz')
      AND v.fecha < ((p_to + 1)::timestamp AT TIME ZONE 'America/La_Paz')
      AND (p_branch_id IS NULL OR v.sucursal_id = p_branch_id)
      AND (p_payment_method IS NULL OR v.metodo_pago = p_payment_method)
      AND (p_category_filter IS NULL OR translate(lower(p.categoria), 'áéíóúüñ', 'aeiouun') = translate(lower(btrim(p_category_filter)), 'áéíóúüñ', 'aeiouun'))
      AND (p_product_query IS NULL OR p.assistant_search_document @@ plainto_tsquery('simple'::regconfig, v_product_query) OR p.assistant_search_text OPERATOR(extensions.%) v_product_query);
  ELSE
    SELECT jsonb_build_object(
      'revenue', coalesce(sum(v.total), 0),
      'transactions', count(*),
      'units', coalesce((
        SELECT sum(d.cantidad)
        FROM public.ventas_detalles AS d
        JOIN public.ventas AS vd ON vd.id = d.venta_id
        WHERE vd.estado = 'completada'
          AND vd.fecha >= (p_from::timestamp AT TIME ZONE 'America/La_Paz')
          AND vd.fecha < ((p_to + 1)::timestamp AT TIME ZONE 'America/La_Paz')
          AND (p_branch_id IS NULL OR vd.sucursal_id = p_branch_id)
          AND (p_payment_method IS NULL OR vd.metodo_pago = p_payment_method)
      ), 0),
      'average_ticket', coalesce(avg(v.total), 0)
    ) INTO v_summary
    FROM public.ventas AS v
    WHERE v.estado = 'completada'
      AND v.fecha >= (p_from::timestamp AT TIME ZONE 'America/La_Paz')
      AND v.fecha < ((p_to + 1)::timestamp AT TIME ZONE 'America/La_Paz')
      AND (p_branch_id IS NULL OR v.sucursal_id = p_branch_id)
      AND (p_payment_method IS NULL OR v.metodo_pago = p_payment_method);
  END IF;

  IF p_compare_from IS NOT NULL OR p_compare_to IS NOT NULL THEN
    IF p_compare_from IS NULL OR p_compare_to IS NULL
       OR p_compare_to < p_compare_from OR p_compare_to - p_compare_from > 364 THEN
      RAISE EXCEPTION 'INVALID_COMPARE_RANGE' USING ERRCODE = '22023';
    END IF;
    IF p_category_filter IS NOT NULL OR p_product_query IS NOT NULL THEN
      SELECT jsonb_build_object(
        'revenue', coalesce(sum(d.precio * d.cantidad), 0),
        'transactions', count(DISTINCT v.id),
        'average_ticket', coalesce(sum(d.precio * d.cantidad) / greatest(count(DISTINCT v.id), 1), 0)
      ) INTO v_previous_summary
      FROM public.ventas AS v
      JOIN public.ventas_detalles AS d ON d.venta_id = v.id
      JOIN public.productos AS p ON p.id = d.producto_id
      WHERE v.estado = 'completada'
        AND v.fecha >= (p_compare_from::timestamp AT TIME ZONE 'America/La_Paz')
        AND v.fecha < ((p_compare_to + 1)::timestamp AT TIME ZONE 'America/La_Paz')
        AND (p_branch_id IS NULL OR v.sucursal_id = p_branch_id)
        AND (p_payment_method IS NULL OR v.metodo_pago = p_payment_method)
        AND (p_category_filter IS NULL OR translate(lower(p.categoria), 'áéíóúüñ', 'aeiouun') = translate(lower(btrim(p_category_filter)), 'áéíóúüñ', 'aeiouun'))
        AND (p_product_query IS NULL OR p.assistant_search_document @@ plainto_tsquery('simple'::regconfig, v_product_query) OR p.assistant_search_text OPERATOR(extensions.%) v_product_query);
    ELSE
      SELECT jsonb_build_object(
        'revenue', coalesce(sum(v.total), 0),
        'transactions', count(*),
        'average_ticket', coalesce(avg(v.total), 0)
      ) INTO v_previous_summary
      FROM public.ventas AS v
      WHERE v.estado = 'completada'
        AND v.fecha >= (p_compare_from::timestamp AT TIME ZONE 'America/La_Paz')
        AND v.fecha < ((p_compare_to + 1)::timestamp AT TIME ZONE 'America/La_Paz')
        AND (p_branch_id IS NULL OR v.sucursal_id = p_branch_id)
        AND (p_payment_method IS NULL OR v.metodo_pago = p_payment_method);
    END IF;
  END IF;

  IF p_group_by IN ('dia', 'metodo_pago', 'sucursal') THEN
    SELECT coalesce(jsonb_agg(
      jsonb_build_object(
        'key', grouped.group_key,
        'revenue', grouped.revenue,
        'transactions', grouped.transactions,
        'units', grouped.units,
        'average_ticket', grouped.average_ticket
      ) ORDER BY grouped.revenue DESC, grouped.group_key
    ), '[]'::jsonb) INTO v_rows
    FROM (
      SELECT
        CASE p_group_by
          WHEN 'dia' THEN to_char(v.fecha AT TIME ZONE 'America/La_Paz', 'YYYY-MM-DD')
          WHEN 'metodo_pago' THEN v.metodo_pago
          ELSE s.nombre
        END AS group_key,
        sum(CASE
          WHEN p_category_filter IS NOT NULL OR p_product_query IS NOT NULL THEN lines.detail_revenue
          ELSE v.total
        END) AS revenue,
        count(*) AS transactions,
        coalesce(sum(lines.units), 0) AS units,
        coalesce(avg(CASE
          WHEN p_category_filter IS NOT NULL OR p_product_query IS NOT NULL THEN lines.detail_revenue
          ELSE v.total
        END), 0) AS average_ticket
      FROM public.ventas AS v
      JOIN public.sucursales AS s ON s.id = v.sucursal_id
      LEFT JOIN LATERAL (
        SELECT sum(d.precio * d.cantidad) AS detail_revenue, sum(d.cantidad) AS units
        FROM public.ventas_detalles AS d
        JOIN public.productos AS p ON p.id = d.producto_id
        WHERE d.venta_id = v.id
          AND (p_category_filter IS NULL OR translate(lower(p.categoria), 'áéíóúüñ', 'aeiouun') = translate(lower(btrim(p_category_filter)), 'áéíóúüñ', 'aeiouun'))
          AND (p_product_query IS NULL OR p.assistant_search_document @@ plainto_tsquery('simple'::regconfig, v_product_query) OR p.assistant_search_text OPERATOR(extensions.%) v_product_query)
      ) AS lines ON true
      WHERE v.estado = 'completada'
        AND v.fecha >= (p_from::timestamp AT TIME ZONE 'America/La_Paz')
        AND v.fecha < ((p_to + 1)::timestamp AT TIME ZONE 'America/La_Paz')
        AND (p_branch_id IS NULL OR v.sucursal_id = p_branch_id)
        AND (p_payment_method IS NULL OR v.metodo_pago = p_payment_method)
        AND ((p_category_filter IS NULL AND p_product_query IS NULL) OR lines.detail_revenue IS NOT NULL)
      GROUP BY 1
      ORDER BY sum(CASE
        WHEN p_category_filter IS NOT NULL OR p_product_query IS NOT NULL THEN lines.detail_revenue
        ELSE v.total
      END) DESC
      LIMIT p_limit
    ) AS grouped;
  ELSE
    SELECT coalesce(jsonb_agg(
      jsonb_build_object(
        'key', grouped.group_key,
        'revenue', grouped.revenue,
        'transactions', grouped.transactions,
        'units', grouped.units,
        'average_ticket', grouped.average_ticket
      ) ORDER BY grouped.revenue DESC, grouped.group_key
    ), '[]'::jsonb) INTO v_rows
    FROM (
      SELECT
        CASE p_group_by WHEN 'producto' THEN p.nombre ELSE p.categoria END AS group_key,
        sum(d.precio * d.cantidad) AS revenue,
        count(DISTINCT v.id) AS transactions,
        sum(d.cantidad) AS units,
        sum(d.precio * d.cantidad) / greatest(count(DISTINCT v.id), 1) AS average_ticket
      FROM public.ventas AS v
      JOIN public.ventas_detalles AS d ON d.venta_id = v.id
      JOIN public.productos AS p ON p.id = d.producto_id
      WHERE v.estado = 'completada'
        AND v.fecha >= (p_from::timestamp AT TIME ZONE 'America/La_Paz')
        AND v.fecha < ((p_to + 1)::timestamp AT TIME ZONE 'America/La_Paz')
        AND (p_branch_id IS NULL OR v.sucursal_id = p_branch_id)
        AND (p_payment_method IS NULL OR v.metodo_pago = p_payment_method)
        AND (p_category_filter IS NULL OR translate(lower(p.categoria), 'áéíóúüñ', 'aeiouun') = translate(lower(btrim(p_category_filter)), 'áéíóúüñ', 'aeiouun'))
        AND (p_product_query IS NULL OR p.assistant_search_document @@ plainto_tsquery('simple'::regconfig, v_product_query) OR p.assistant_search_text OPERATOR(extensions.%) v_product_query)
      GROUP BY 1
      ORDER BY sum(d.precio * d.cantidad) DESC
      LIMIT p_limit
    ) AS grouped;
  END IF;

  RETURN jsonb_build_object(
    'dataset', 'sales',
    'from', p_from,
    'to', p_to,
    'group_by', p_group_by,
    'summary', v_summary,
    'previous_from', p_compare_from,
    'previous_to', p_compare_to,
    'previous_summary', v_previous_summary,
    'category_filter', p_category_filter,
    'product_query', p_product_query,
    'payment_method', p_payment_method,
    'rows', v_rows
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.assistant_analyze_inventory(
  p_group_by text,
  p_branch_id bigint DEFAULT NULL,
  p_limit integer DEFAULT 10,
  p_only_below_minimum boolean DEFAULT false,
  p_category_filter text DEFAULT NULL,
  p_product_query text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
SET statement_timeout = '8s'
SET pg_trgm.similarity_threshold = '0.12'
AS $$
DECLARE
  v_role text := private.actor_role();
  v_product_query text := translate(lower(btrim(coalesce(p_product_query, ''))), 'áéíóúüñ', 'aeiouun');
  v_summary jsonb;
  v_rows jsonb;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF v_role NOT IN ('admin', 'encargada', 'cajera', 'vendedora', 'almacen', 'reponedora') THEN
    RAISE EXCEPTION 'ROLE_NOT_ALLOWED' USING ERRCODE = '42501';
  END IF;
  IF p_branch_id IS NULL AND v_role <> 'admin' THEN
    RAISE EXCEPTION 'BRANCH_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF p_branch_id IS NOT NULL AND NOT (SELECT private.actor_has_branch(p_branch_id)) THEN
    RAISE EXCEPTION 'BRANCH_NOT_ALLOWED' USING ERRCODE = '42501';
  END IF;
  IF p_group_by IS NULL OR p_group_by NOT IN ('producto', 'categoria', 'sucursal') THEN
    RAISE EXCEPTION 'INVALID_GROUP_BY' USING ERRCODE = '22023';
  END IF;
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 20 THEN
    RAISE EXCEPTION 'INVALID_LIMIT' USING ERRCODE = '22023';
  END IF;
  IF length(btrim(coalesce(p_category_filter, ''))) > 100
     OR length(btrim(coalesce(p_product_query, ''))) > 100 THEN
    RAISE EXCEPTION 'INVALID_FILTER' USING ERRCODE = '22023';
  END IF;

  SELECT jsonb_build_object(
    'stock_units', coalesce(sum(i.cantidad), 0),
    'estimated_value', coalesce(sum(i.cantidad * p.precio), 0),
    'products', count(DISTINCT p.id) FILTER (WHERE i.cantidad > 0),
    'below_minimum', count(*) FILTER (WHERE i.cantidad <= p.stock_minimo)
  ) INTO v_summary
  FROM public.inventarios AS i
  JOIN public.productos AS p ON p.id = i.producto_id
  WHERE (p_branch_id IS NULL OR i.sucursal_id = p_branch_id)
    AND (p_category_filter IS NULL OR translate(lower(p.categoria), 'áéíóúüñ', 'aeiouun') = translate(lower(btrim(p_category_filter)), 'áéíóúüñ', 'aeiouun'))
    AND (p_product_query IS NULL OR p.assistant_search_document @@ plainto_tsquery('simple'::regconfig, v_product_query) OR p.assistant_search_text OPERATOR(extensions.%) v_product_query)
    AND (NOT p_only_below_minimum OR i.cantidad <= p.stock_minimo);

  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'key', grouped.group_key,
      'products', grouped.products,
      'stock_units', grouped.stock_units,
      'estimated_value', grouped.estimated_value,
      'below_minimum', grouped.below_minimum
    ) ORDER BY grouped.estimated_value DESC, grouped.group_key
  ), '[]'::jsonb) INTO v_rows
  FROM (
    SELECT
      CASE p_group_by
        WHEN 'producto' THEN p.nombre
        WHEN 'categoria' THEN p.categoria
        ELSE s.nombre
      END AS group_key,
      count(DISTINCT p.id) FILTER (WHERE i.cantidad > 0) AS products,
      sum(i.cantidad) AS stock_units,
      sum(i.cantidad * p.precio) AS estimated_value,
      count(*) FILTER (WHERE i.cantidad <= p.stock_minimo) AS below_minimum
    FROM public.inventarios AS i
    JOIN public.productos AS p ON p.id = i.producto_id
    JOIN public.sucursales AS s ON s.id = i.sucursal_id
    WHERE (p_branch_id IS NULL OR i.sucursal_id = p_branch_id)
      AND (p_category_filter IS NULL OR translate(lower(p.categoria), 'áéíóúüñ', 'aeiouun') = translate(lower(btrim(p_category_filter)), 'áéíóúüñ', 'aeiouun'))
      AND (p_product_query IS NULL OR p.assistant_search_document @@ plainto_tsquery('simple'::regconfig, v_product_query) OR p.assistant_search_text OPERATOR(extensions.%) v_product_query)
      AND (NOT p_only_below_minimum OR i.cantidad <= p.stock_minimo)
    GROUP BY 1
    ORDER BY sum(i.cantidad * p.precio) DESC
    LIMIT p_limit
  ) AS grouped;

  RETURN jsonb_build_object(
    'dataset', 'inventory',
    'group_by', p_group_by,
    'branch_id', p_branch_id,
    'only_below_minimum', p_only_below_minimum,
    'category_filter', p_category_filter,
    'product_query', p_product_query,
    'summary', v_summary,
    'rows', v_rows
  );
END;
$$;

REVOKE ALL ON FUNCTION public.assistant_analyze_sales(date, date, text, bigint, integer, date, date, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assistant_analyze_sales(date, date, text, bigint, integer, date, date, text, text, text) TO authenticated;
REVOKE ALL ON FUNCTION public.assistant_analyze_inventory(text, bigint, integer, boolean, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assistant_analyze_inventory(text, bigint, integer, boolean, text, text) TO authenticated;
