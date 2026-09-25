-- Multi-branch assignment for operational profiles.
-- Keeps perfiles.sucursal_id as the primary/default branch while allowing
-- additional branches through perfil_sucursales.

CREATE TABLE IF NOT EXISTS public.perfil_sucursales (
  perfil_id uuid NOT NULL REFERENCES public.perfiles (id) ON DELETE CASCADE,
  sucursal_id bigint NOT NULL REFERENCES public.sucursales (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  PRIMARY KEY (perfil_id, sucursal_id)
);

CREATE INDEX IF NOT EXISTS perfil_sucursales_sucursal_id_idx
  ON public.perfil_sucursales (sucursal_id);

INSERT INTO public.perfil_sucursales (perfil_id, sucursal_id)
SELECT p.id, p.sucursal_id
FROM public.perfiles AS p
WHERE p.sucursal_id IS NOT NULL
ON CONFLICT (perfil_id, sucursal_id) DO NOTHING;

ALTER TABLE public.perfil_sucursales ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS perfil_sucursales_select_self_or_admin ON public.perfil_sucursales;
CREATE POLICY perfil_sucursales_select_self_or_admin ON public.perfil_sucursales
  FOR SELECT TO authenticated
  USING (perfil_id = (SELECT auth.uid()) OR private.actor_is_admin());

GRANT SELECT ON public.perfil_sucursales TO authenticated;

CREATE OR REPLACE FUNCTION private.actor_has_branch(p_branch bigint)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    private.actor_is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.perfil_sucursales AS ps
      WHERE ps.perfil_id = (SELECT auth.uid())
        AND ps.sucursal_id = p_branch
    )
    OR (
      NOT EXISTS (
        SELECT 1
        FROM public.perfil_sucursales AS ps
        WHERE ps.perfil_id = (SELECT auth.uid())
      )
      AND p_branch IS NOT DISTINCT FROM (
        SELECT p.sucursal_id
        FROM public.perfiles AS p
        WHERE p.id = (SELECT auth.uid())
      )
    );
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
      AND (
        p.rol = 'admin'
        OR p.rol = 'marketing'
        OR p.sucursal_id IS NOT NULL
        OR EXISTS (
          SELECT 1
          FROM public.perfil_sucursales AS ps
          WHERE ps.perfil_id = p.id
        )
      )
  );
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

  IF v_role <> 'admin' AND v_branch IS NULL AND NOT EXISTS (
    SELECT 1
    FROM public.perfil_sucursales AS ps
    WHERE ps.perfil_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'BRANCH_ASSIGNMENT_REQUIRED' USING ERRCODE = '42501';
  END IF;

  IF v_role <> 'admin' AND NOT p_allow_any_branch AND p_requested_branch IS NOT NULL THEN
    IF NOT (SELECT private.actor_has_branch(p_requested_branch)) THEN
      RAISE EXCEPTION 'BRANCH_NOT_ALLOWED' USING ERRCODE = '42501';
    END IF;
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION private.sync_perfil_sucursales(
  p_user_id uuid,
  p_rol text,
  p_sucursal_ids bigint[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  DELETE FROM public.perfil_sucursales
  WHERE perfil_id = p_user_id;

  IF p_rol IN ('admin', 'marketing')
     OR p_sucursal_ids IS NULL
     OR array_length(p_sucursal_ids, 1) IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.perfil_sucursales (perfil_id, sucursal_id)
  SELECT DISTINCT p_user_id, branch_id
  FROM unnest(p_sucursal_ids) AS branch_id
  WHERE branch_id IS NOT NULL;
END;
$$;

CREATE OR REPLACE FUNCTION private.resolve_profile_branch_ids(
  p_rol text,
  p_sucursal_id bigint,
  p_sucursal_ids bigint[]
)
RETURNS bigint[]
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  v_ids bigint[];
BEGIN
  IF p_rol IN ('admin', 'marketing') THEN
    RETURN NULL;
  END IF;

  IF p_sucursal_ids IS NOT NULL AND array_length(p_sucursal_ids, 1) IS NOT NULL THEN
    v_ids := ARRAY(
      SELECT DISTINCT branch_id
      FROM unnest(p_sucursal_ids) AS branch_id
      WHERE branch_id IS NOT NULL
      ORDER BY branch_id
    );
  ELSIF p_sucursal_id IS NOT NULL THEN
    v_ids := ARRAY[p_sucursal_id];
  ELSE
    v_ids := NULL;
  END IF;

  IF v_ids IS NULL OR array_length(v_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'BRANCH_ASSIGNMENT_REQUIRED' USING ERRCODE = '22023';
  END IF;

  RETURN v_ids;
END;
$$;

CREATE OR REPLACE FUNCTION private.admin_actualizar_perfil(
  p_user_id uuid,
  p_rol text,
  p_sucursal_id bigint,
  p_sucursal_ids bigint[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_branch_ids bigint[];
  v_primary_branch bigint;
BEGIN
  IF NOT (SELECT private.actor_is_admin()) THEN
    RAISE EXCEPTION 'ONLY_ADMIN_ALLOWED' USING ERRCODE = '42501';
  END IF;

  IF p_rol NOT IN ('admin', 'encargada', 'cajera', 'vendedora', 'almacen', 'reponedora', 'marketing') THEN
    RAISE EXCEPTION 'INVALID_ROLE' USING ERRCODE = '22023';
  END IF;

  IF p_rol IN ('admin', 'marketing') THEN
    v_primary_branch := NULL;
    v_branch_ids := NULL;
  ELSE
    v_branch_ids := private.resolve_profile_branch_ids(p_rol, p_sucursal_id, p_sucursal_ids);
    v_primary_branch := COALESCE(p_sucursal_id, v_branch_ids[1]);
  END IF;

  UPDATE public.perfiles
  SET rol = p_rol,
      sucursal_id = v_primary_branch,
      updated_at = timezone('utc'::text, now())
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'USER_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  PERFORM private.sync_perfil_sucursales(p_user_id, p_rol, v_branch_ids);

  RETURN jsonb_build_object(
    'success', true,
    'user_id', p_user_id,
    'rol', p_rol,
    'sucursal_id', v_primary_branch,
    'sucursal_ids', COALESCE(v_branch_ids, ARRAY[]::bigint[])
  );
END;
$$;

CREATE OR REPLACE FUNCTION private.admin_crear_perfil(
  p_id uuid,
  p_email text,
  p_nombre text,
  p_rol text,
  p_sucursal_id bigint,
  p_sucursal_ids bigint[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_branch_ids bigint[];
  v_primary_branch bigint;
BEGIN
  IF NOT (SELECT private.actor_is_admin()) THEN
    RAISE EXCEPTION 'ONLY_ADMIN_ALLOWED' USING ERRCODE = '42501';
  END IF;

  IF p_rol NOT IN ('admin', 'encargada', 'cajera', 'vendedora', 'almacen', 'reponedora', 'marketing') THEN
    RAISE EXCEPTION 'INVALID_ROLE' USING ERRCODE = '22023';
  END IF;

  IF p_rol IN ('admin', 'marketing') THEN
    v_primary_branch := NULL;
    v_branch_ids := NULL;
  ELSE
    v_branch_ids := private.resolve_profile_branch_ids(p_rol, p_sucursal_id, p_sucursal_ids);
    v_primary_branch := COALESCE(p_sucursal_id, v_branch_ids[1]);
  END IF;

  INSERT INTO public.perfiles (id, email, nombre, rol, sucursal_id, created_at, updated_at)
  VALUES (
    p_id,
    p_email,
    p_nombre,
    p_rol,
    v_primary_branch,
    timezone('utc'::text, now()),
    timezone('utc'::text, now())
  )
  ON CONFLICT (id) DO UPDATE
  SET email = EXCLUDED.email,
      nombre = EXCLUDED.nombre,
      rol = EXCLUDED.rol,
      sucursal_id = EXCLUDED.sucursal_id,
      updated_at = timezone('utc'::text, now());

  PERFORM private.sync_perfil_sucursales(p_id, p_rol, v_branch_ids);

  RETURN jsonb_build_object(
    'success', true,
    'id', p_id,
    'rol', p_rol,
    'sucursal_id', v_primary_branch,
    'sucursal_ids', COALESCE(v_branch_ids, ARRAY[]::bigint[])
  );
END;
$$;

CREATE OR REPLACE FUNCTION private.admin_crear_usuario(
  p_email text,
  p_password text,
  p_nombre text,
  p_rol text,
  p_sucursal_id bigint,
  p_sucursal_ids bigint[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid;
  v_pass text;
  v_email_clean text;
  v_nombre_clean text;
  v_branch_ids bigint[];
  v_primary_branch bigint;
BEGIN
  IF NOT (SELECT private.actor_is_admin()) THEN
    RAISE EXCEPTION 'ONLY_ADMIN_ALLOWED' USING ERRCODE = '42501';
  END IF;

  v_email_clean := lower(trim(p_email));
  v_nombre_clean := trim(p_nombre);

  IF v_email_clean = '' OR position('@' in v_email_clean) = 0 THEN
    RAISE EXCEPTION 'INVALID_EMAIL' USING ERRCODE = '22023';
  END IF;

  IF length(p_password) < 6 THEN
    RAISE EXCEPTION 'PASSWORD_TOO_SHORT' USING ERRCODE = '22023';
  END IF;

  IF p_rol NOT IN ('admin', 'encargada', 'cajera', 'vendedora', 'almacen', 'reponedora', 'marketing') THEN
    RAISE EXCEPTION 'INVALID_ROLE' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (SELECT 1 FROM auth.users WHERE email = v_email_clean) THEN
    RAISE EXCEPTION 'EMAIL_ALREADY_EXISTS' USING ERRCODE = '23505';
  END IF;

  IF p_rol IN ('admin', 'marketing') THEN
    v_primary_branch := NULL;
    v_branch_ids := NULL;
  ELSE
    v_branch_ids := private.resolve_profile_branch_ids(p_rol, p_sucursal_id, p_sucursal_ids);
    v_primary_branch := COALESCE(p_sucursal_id, v_branch_ids[1]);
  END IF;

  v_pass := extensions.crypt(p_password, extensions.gen_salt('bf'));
  v_uid := gen_random_uuid();

  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, is_sso_user, is_anonymous,
    confirmation_token, recovery_token, email_change_token_new, email_change,
    phone_change, phone_change_token, email_change_token_current, reauthentication_token
  ) VALUES (
    '00000000-0000-0000-0000-000000000000', v_uid, 'authenticated', 'authenticated',
    v_email_clean, v_pass, timezone('utc'::text, now()),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('sub', v_uid::text, 'email', v_email_clean, 'nombre', v_nombre_clean),
    timezone('utc'::text, now()), timezone('utc'::text, now()), false, false,
    '', '', '', '', '', '', '', ''
  );

  INSERT INTO auth.identities (
    id, user_id, identity_data, provider, provider_id,
    last_sign_in_at, created_at, updated_at
  ) VALUES (
    gen_random_uuid(), v_uid,
    jsonb_build_object('sub', v_uid::text, 'email', v_email_clean, 'email_verified', true, 'phone_verified', false),
    'email', v_uid::text, timezone('utc'::text, now()), timezone('utc'::text, now()), timezone('utc'::text, now())
  );

  INSERT INTO public.perfiles (id, email, nombre, rol, sucursal_id, created_at, updated_at)
  VALUES (
    v_uid,
    v_email_clean,
    v_nombre_clean,
    p_rol,
    v_primary_branch,
    timezone('utc'::text, now()),
    timezone('utc'::text, now())
  );

  PERFORM private.sync_perfil_sucursales(v_uid, p_rol, v_branch_ids);

  RETURN jsonb_build_object(
    'success', true,
    'id', v_uid,
    'email', v_email_clean,
    'nombre', v_nombre_clean,
    'rol', p_rol,
    'sucursal_id', v_primary_branch,
    'sucursal_ids', COALESCE(v_branch_ids, ARRAY[]::bigint[])
  );
END;
$$;

DROP FUNCTION IF EXISTS public.admin_actualizar_perfil(uuid, text, bigint);
CREATE OR REPLACE FUNCTION public.admin_actualizar_perfil(
  p_user_id uuid,
  p_rol text,
  p_sucursal_id bigint,
  p_sucursal_ids bigint[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT private.admin_actualizar_perfil($1, $2, $3, $4);
$$;

DROP FUNCTION IF EXISTS public.admin_crear_perfil(uuid, text, text, text, bigint);
CREATE OR REPLACE FUNCTION public.admin_crear_perfil(
  p_id uuid,
  p_email text,
  p_nombre text,
  p_rol text,
  p_sucursal_id bigint,
  p_sucursal_ids bigint[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT private.admin_crear_perfil($1, $2, $3, $4, $5, $6);
$$;

DROP FUNCTION IF EXISTS public.admin_crear_usuario(text, text, text, text, bigint);
CREATE OR REPLACE FUNCTION public.admin_crear_usuario(
  p_email text,
  p_password text,
  p_nombre text,
  p_rol text,
  p_sucursal_id bigint,
  p_sucursal_ids bigint[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT private.admin_crear_usuario($1, $2, $3, $4, $5, $6);
$$;

REVOKE ALL ON FUNCTION private.actor_has_branch(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.actor_has_branch(bigint) TO authenticated;

REVOKE ALL ON FUNCTION private.sync_perfil_sucursales(uuid, text, bigint[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.resolve_profile_branch_ids(text, bigint, bigint[]) FROM PUBLIC, anon;

DROP POLICY IF EXISTS movimientos_select_scoped ON public.movimientos;
CREATE POLICY movimientos_select_scoped ON public.movimientos
  FOR SELECT TO authenticated
  USING (
    private.actor_is_admin()
    OR (
      private.actor_role() IN ('encargada', 'almacen', 'cajera', 'vendedora', 'reponedora')
      AND (
        private.actor_has_branch(sucursal_id)
        OR private.actor_has_branch(sucursal_destino_id)
      )
    )
  );

DROP POLICY IF EXISTS ventas_select_scoped ON public.ventas;
CREATE POLICY ventas_select_scoped ON public.ventas
  FOR SELECT TO authenticated
  USING (
    private.actor_is_admin()
    OR (
      private.actor_role() IN ('encargada', 'cajera', 'vendedora')
      AND private.actor_has_branch(sucursal_id)
    )
  );

DROP POLICY IF EXISTS ventas_detalles_select_scoped ON public.ventas_detalles;
CREATE POLICY ventas_detalles_select_scoped ON public.ventas_detalles
  FOR SELECT TO authenticated
  USING (
    private.actor_is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.ventas AS v
      WHERE v.id = venta_id
        AND private.actor_role() IN ('encargada', 'cajera', 'vendedora')
        AND private.actor_has_branch(v.sucursal_id)
    )
  );

DROP POLICY IF EXISTS mermas_select_scoped ON public.mermas;
CREATE POLICY mermas_select_scoped ON public.mermas
  FOR SELECT TO authenticated
  USING (
    private.actor_is_admin()
    OR private.actor_has_branch(sucursal_id)
  );

DROP POLICY IF EXISTS mermas_insert_scoped ON public.mermas;
CREATE POLICY mermas_insert_scoped ON public.mermas
  FOR INSERT TO authenticated
  WITH CHECK (
    private.actor_role() IN ('encargada', 'almacen')
    AND private.actor_has_branch(sucursal_id)
  );

DROP POLICY IF EXISTS ordenes_despacho_select_scoped ON public.ordenes_despacho;
CREATE POLICY ordenes_despacho_select_scoped ON public.ordenes_despacho
  FOR SELECT TO authenticated
  USING (
    private.actor_is_admin()
    OR private.actor_has_branch(origen_id)
    OR private.actor_has_branch(destino_id)
  );

DROP POLICY IF EXISTS ordenes_despacho_insert_scoped ON public.ordenes_despacho;
CREATE POLICY ordenes_despacho_insert_scoped ON public.ordenes_despacho
  FOR INSERT TO authenticated
  WITH CHECK (
    private.actor_role() = 'almacen'
  );

DROP POLICY IF EXISTS ordenes_despacho_update_scoped ON public.ordenes_despacho;
CREATE POLICY ordenes_despacho_update_scoped ON public.ordenes_despacho
  FOR UPDATE TO authenticated
  USING (
    private.actor_role() IN ('encargada', 'almacen')
    AND private.actor_has_branch(destino_id)
  )
  WITH CHECK (
    private.actor_role() IN ('encargada', 'almacen')
    AND private.actor_has_branch(destino_id)
  );

REVOKE ALL ON FUNCTION public.admin_actualizar_perfil(uuid, text, bigint, bigint[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_crear_perfil(uuid, text, text, text, bigint, bigint[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_crear_usuario(text, text, text, text, bigint, bigint[]) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.admin_actualizar_perfil(uuid, text, bigint, bigint[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_crear_perfil(uuid, text, text, text, bigint, bigint[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_crear_usuario(text, text, text, text, bigint, bigint[]) TO authenticated;
