-- ============================================================================
-- SINCRONIZACIÓN DE CREDENCIALES DE IA CON SUPABASE VAULT & RLS
-- ============================================================================
-- Permite a cada usuario guardar sus API keys encriptadas en Supabase Vault
-- y sincronizarlas de forma transparente entre múltiples dispositivos.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.user_ai_profiles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  preferred_mode text DEFAULT 'auto' NOT NULL,
  custom_models jsonb DEFAULT '{}'::jsonb NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE public.user_ai_profiles ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'user_ai_profiles' AND policyname = 'user_ai_profiles_owner_all'
  ) THEN
    CREATE POLICY user_ai_profiles_owner_all ON public.user_ai_profiles
      FOR ALL
      TO authenticated
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- RPC: Guardar secreto encriptado en Supabase Vault
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.save_user_ai_secret(
  p_provider text,
  p_api_key text,
  p_custom_model text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_secret_name text;
  v_existing_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  v_secret_name := 'ai_key_' || v_user_id::text || '_' || p_provider;

  SELECT id INTO v_existing_id FROM vault.secrets WHERE name = v_secret_name;
  IF v_existing_id IS NOT NULL THEN
    PERFORM vault.update_secret(v_existing_id, p_api_key, v_secret_name, 'User AI key');
  ELSE
    PERFORM vault.create_secret(p_api_key, v_secret_name, 'User AI key');
  END IF;

  IF p_custom_model IS NOT NULL AND trim(p_custom_model) <> '' THEN
    INSERT INTO public.user_ai_profiles (user_id, custom_models, updated_at)
    VALUES (
      v_user_id,
      jsonb_build_object(p_provider, trim(p_custom_model)),
      now()
    )
    ON CONFLICT (user_id) DO UPDATE SET
      custom_models = public.user_ai_profiles.custom_models || jsonb_build_object(p_provider, trim(p_custom_model)),
      updated_at = now();
  END IF;
END;
$$;

-- ----------------------------------------------------------------------------
-- RPC: Recuperar todos los secretos desencriptados del usuario autenticado
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_user_ai_secrets()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_keys jsonb := '{}'::jsonb;
  v_rec record;
  v_prefs record;
  v_prefix text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  v_prefix := 'ai_key_' || v_user_id::text || '_';

  FOR v_rec IN
    SELECT replace(name, v_prefix, '') AS provider, decrypted_secret AS api_key
    FROM vault.decrypted_secrets
    WHERE name LIKE v_prefix || '%'
  LOOP
    v_keys := jsonb_set(v_keys, ARRAY[v_rec.provider], to_jsonb(v_rec.api_key));
  END LOOP;

  SELECT preferred_mode, custom_models
  INTO v_prefs
  FROM public.user_ai_profiles
  WHERE user_id = v_user_id;

  RETURN jsonb_build_object(
    'keys', v_keys,
    'preferred_mode', coalesce(v_prefs.preferred_mode, 'auto'),
    'custom_models', coalesce(v_prefs.custom_models, '{}'::jsonb)
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- RPC: Eliminar un secreto del usuario autenticado
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.delete_user_ai_secret(
  p_provider text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_secret_name text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  v_secret_name := 'ai_key_' || v_user_id::text || '_' || p_provider;
  DELETE FROM vault.secrets WHERE name = v_secret_name;

  UPDATE public.user_ai_profiles
  SET custom_models = custom_models - p_provider,
      updated_at = now()
  WHERE user_id = v_user_id;
END;
$$;

-- ----------------------------------------------------------------------------
-- RPC: Guardar modo preferido
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.save_user_ai_preferences(
  p_preferred_mode text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  INSERT INTO public.user_ai_profiles (user_id, preferred_mode, updated_at)
  VALUES (v_user_id, p_preferred_mode, now())
  ON CONFLICT (user_id) DO UPDATE SET
    preferred_mode = p_preferred_mode,
    updated_at = now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_user_ai_secret(text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_ai_secrets() TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_user_ai_secret(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_user_ai_preferences(text) TO authenticated;
