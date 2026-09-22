-- ============================================================================
-- Migration: 20260921020000_admin_crear_usuario.sql
-- Function to allow General Administrator to create new collaborators directly
-- ============================================================================

CREATE OR REPLACE FUNCTION private.admin_crear_usuario(
  p_email text,
  p_password text,
  p_nombre text,
  p_rol text,
  p_sucursal_id bigint
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
BEGIN
  -- 1. Security check: Only Admin can create users
  IF NOT (SELECT private.actor_is_admin()) THEN
    RAISE EXCEPTION 'ONLY_ADMIN_ALLOWED' USING ERRCODE = '42501';
  END IF;

  v_email_clean := lower(trim(p_email));
  v_nombre_clean := trim(p_nombre);

  -- 2. Basic validations
  IF v_email_clean = '' OR position('@' in v_email_clean) = 0 THEN
    RAISE EXCEPTION 'INVALID_EMAIL' USING ERRCODE = '22023';
  END IF;

  IF length(p_password) < 6 THEN
    RAISE EXCEPTION 'PASSWORD_TOO_SHORT' USING ERRCODE = '22023';
  END IF;

  -- 3. Validate role
  IF p_rol NOT IN ('admin', 'encargada', 'cajera', 'vendedora', 'almacen', 'reponedora', 'marketing') THEN
    RAISE EXCEPTION 'INVALID_ROLE' USING ERRCODE = '22023';
  END IF;

  -- 4. Check if email already exists in auth.users
  IF EXISTS (SELECT 1 FROM auth.users WHERE email = v_email_clean) THEN
    RAISE EXCEPTION 'EMAIL_ALREADY_EXISTS' USING ERRCODE = '23505';
  END IF;

  -- 5. Hash password and generate UID
  v_pass := extensions.crypt(p_password, extensions.gen_salt('bf'));
  v_uid := gen_random_uuid();

  -- 6. Insert into auth.users (email_confirmed_at set to now so login is immediate)
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

  -- 7. Insert identity for email provider
  INSERT INTO auth.identities (
    id, user_id, identity_data, provider, provider_id,
    last_sign_in_at, created_at, updated_at
  ) VALUES (
    gen_random_uuid(), v_uid,
    jsonb_build_object('sub', v_uid::text, 'email', v_email_clean, 'email_verified', true, 'phone_verified', false),
    'email', v_uid::text, timezone('utc'::text, now()), timezone('utc'::text, now()), timezone('utc'::text, now())
  );

  -- 8. Insert or update public.perfiles
  INSERT INTO public.perfiles (id, email, nombre, rol, sucursal_id, created_at, updated_at)
  VALUES (
    v_uid,
    v_email_clean,
    v_nombre_clean,
    p_rol,
    CASE WHEN p_rol = 'admin' THEN NULL ELSE p_sucursal_id END,
    timezone('utc'::text, now()),
    timezone('utc'::text, now())
  );

  RETURN jsonb_build_object(
    'success', true,
    'id', v_uid,
    'email', v_email_clean,
    'nombre', v_nombre_clean,
    'rol', p_rol,
    'sucursal_id', CASE WHEN p_rol = 'admin' THEN NULL ELSE p_sucursal_id END
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_crear_usuario(
  p_email text,
  p_password text,
  p_nombre text,
  p_rol text,
  p_sucursal_id bigint
)
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT private.admin_crear_usuario($1, $2, $3, $4, $5);
$$;

REVOKE ALL ON FUNCTION private.admin_crear_usuario(text, text, text, text, bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.admin_crear_usuario(text, text, text, text, bigint) TO authenticated;

REVOKE ALL ON FUNCTION public.admin_crear_usuario(text, text, text, text, bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_crear_usuario(text, text, text, text, bigint) TO authenticated;
