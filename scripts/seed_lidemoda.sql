-- ============================================================================
-- Seed Data para Lidemoda - Inventario Inteligente (Supabase PostgreSQL)
-- Fecha: día actual de la base de datos
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. USUARIOS Y PERFILES (auth.users + auth.identities + public.perfiles)
-- Required session setting: seed.auth_password (set it outside this file).
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_seed_password text := current_setting('seed.auth_password', true);
  v_pass text;
  v_users record;
  v_id uuid;
BEGIN
  IF v_seed_password IS NULL OR length(v_seed_password) < 6 THEN
    RAISE EXCEPTION 'seed.auth_password must be provided through the session environment';
  END IF;
  v_pass := extensions.crypt(v_seed_password, extensions.gen_salt('bf'));
  FOR v_users IN
    SELECT * FROM (VALUES
      ('admin.lidemoda@gmail.com', 'Administrador General', 'admin', NULL::bigint),
      ('encargada.comercio@gmail.com', 'Patricia Morales', 'encargada', 1::bigint),
      ('cajera.montenegro@gmail.com', 'Valeria Mendoza', 'cajera', 2::bigint),
      ('vendedora.ceja@gmail.com', 'Silvia Flores', 'vendedora', 3::bigint),
      ('almacen.central@gmail.com', 'Carlos Quispe', 'almacen', 1::bigint),
      ('marketing.lidemoda@gmail.com', 'Equipo Marketing', 'marketing', NULL::bigint),
      ('supervisora.regional@gmail.com', 'Supervisora Regional', 'admin', NULL::bigint)
    ) AS t(email, nombre, rol, sucursal_id)
  LOOP
    SELECT id INTO v_id FROM auth.users WHERE email = v_users.email;
    IF v_id IS NULL THEN
      v_id := gen_random_uuid();
      INSERT INTO auth.users (
        instance_id, id, aud, role, email, encrypted_password,
        email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
        created_at, updated_at, is_sso_user, is_anonymous,
        confirmation_token, recovery_token, email_change_token_new, email_change,
        phone_change, phone_change_token, email_change_token_current, reauthentication_token
      ) VALUES (
        '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated',
        v_users.email, v_pass, now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        jsonb_build_object('sub', v_id::text, 'email', v_users.email, 'nombre', v_users.nombre),
        now(), now(), false, false,
        '', '', '', '', '', '', '', ''
      );

      INSERT INTO auth.identities (
        id, user_id, identity_data, provider, provider_id,
        last_sign_in_at, created_at, updated_at
      ) VALUES (
        gen_random_uuid(), v_id,
        jsonb_build_object('sub', v_id::text, 'email', v_users.email, 'email_verified', true, 'phone_verified', false),
        'email', v_id::text, now(), now(), now()
      );
    ELSE
      UPDATE auth.users
      SET encrypted_password = v_pass,
          email_confirmed_at = now(),
          raw_user_meta_data = jsonb_build_object('sub', v_id::text, 'email', v_users.email, 'nombre', v_users.nombre),
          updated_at = now()
      WHERE id = v_id;
    END IF;

    INSERT INTO public.perfiles (id, email, nombre, rol, sucursal_id, created_at, updated_at)
    VALUES (v_id, v_users.email, v_users.nombre, v_users.rol, v_users.sucursal_id, now(), now())
    ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email,
        nombre = EXCLUDED.nombre,
        rol = EXCLUDED.rol,
        sucursal_id = EXCLUDED.sucursal_id,
        updated_at = now();
  END LOOP;
END $$;

-- ----------------------------------------------------------------------------
-- 2. CATÁLOGO DE PRODUCTOS DE MODA (20 productos)
-- ----------------------------------------------------------------------------
INSERT INTO public.productos (nombre, codigo, categoria, precio, cantidad, created_at, updated_at)
VALUES
  ('Jean Mom Fit Clásico Azul', 'JEA-001', 'Pantalones', 180.00, 45, now(), now()),
  ('Chompa Lana Alpaca Cuello V', 'CHO-002', 'Chompas', 220.00, 30, now(), now()),
  ('Blusa Seda Manga Larga Blanca', 'BLU-003', 'Blusas', 140.00, 35, now(), now()),
  ('Vestido Casual Floral Primavera', 'VES-004', 'Vestidos', 260.00, 20, now(), now()),
  ('Polera Básica Algodón Negra', 'POL-005', 'Poleras', 85.00, 80, now(), now()),
  ('Chaqueta Cuero Sintético Biker', 'CHA-006', 'Chaquetas', 350.00, 15, now(), now()),
  ('Jean Cargo Tiro Alto Beige', 'JEA-007', 'Pantalones', 195.00, 35, now(), now()),
  ('Pantalón Palazzo Lino Arena', 'JEA-008', 'Pantalones', 165.00, 28, now(), now()),
  ('Cárdigan Largo Trenzado Mostaza', 'CHO-009', 'Chompas', 210.00, 22, now(), now()),
  ('Buzo Oversize Hoodie Grafito', 'CHO-010', 'Chompas', 175.00, 40, now(), now()),
  ('Camisa Popelina Rayas Celeste', 'BLU-011', 'Blusas', 155.00, 32, now(), now()),
  ('Blusa Lino Botones Perla', 'BLU-012', 'Blusas', 130.00, 25, now(), now()),
  ('Vestido Maxi Gala Escote V', 'VES-013', 'Vestidos', 320.00, 12, now(), now()),
  ('Vestido Camisero Denim Liviano', 'VES-014', 'Vestidos', 240.00, 18, now(), now()),
  ('Polera Gráfica Vintage Rock', 'POL-015', 'Poleras', 95.00, 50, now(), now()),
  ('Polera Cuello Tortuga Blanca', 'POL-016', 'Poleras', 90.00, 45, now(), now()),
  ('Blazer Sastre Slim fit Marino', 'CHA-017', 'Chaquetas', 380.00, 14, now(), now()),
  ('Parka Acolchada Capucha Invierno', 'CHA-018', 'Chaquetas', 420.00, 10, now(), now()),
  ('Cartera Tote Bag Cuero Negro', 'ACC-019', 'Accesorios', 190.00, 25, now(), now()),
  ('Cinturón Cuero Hebilla Dorada', 'ACC-020', 'Accesorios', 65.00, 60, now(), now())
ON CONFLICT (codigo) DO UPDATE
SET nombre = EXCLUDED.nombre,
    categoria = EXCLUDED.categoria,
    precio = EXCLUDED.precio,
    cantidad = EXCLUDED.cantidad,
    updated_at = now();

-- ----------------------------------------------------------------------------
-- 3. STOCK POR SUCURSAL (public.inventarios)
-- Distribución realista entre las 5 sucursales oficiales
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_prod record;
  v_suc record;
  v_cant integer;
BEGIN
  FOR v_prod IN SELECT id, codigo FROM public.productos LOOP
    FOR v_suc IN SELECT id FROM public.sucursales ORDER BY id LOOP
      -- Lógica de stock por sucursal:
      -- Sucursal 1 (Comercio / Central): stock alto (15 - 35)
      -- Sucursal 2 (Montenegro): stock medio (8 - 20)
      -- Sucursal 3 (Ceja): stock variado con algunos en stock crítico (2 - 4) para probar alertas
      -- Sucursal 4 (Satélite): stock medio (5 - 15)
      -- Sucursal 5 (Rio Seco): stock medio (4 - 12)
      IF v_suc.id = 1 THEN
        v_cant := 20 + ((v_prod.id * 3) % 15);
      ELSIF v_suc.id = 2 THEN
        v_cant := 10 + ((v_prod.id * 5) % 12);
      ELSIF v_suc.id = 3 THEN
        -- Productos pares con poco stock (para disparar alertas de bajo stock)
        IF v_prod.id % 4 = 0 THEN
          v_cant := 3;
        ELSE
          v_cant := 12 + ((v_prod.id * 2) % 8);
        END IF;
      ELSIF v_suc.id = 4 THEN
        v_cant := 6 + ((v_prod.id * 4) % 10);
      ELSE
        v_cant := 5 + ((v_prod.id * 7) % 9);
      END IF;

      INSERT INTO public.inventarios (producto_id, sucursal_id, cantidad, created_at, updated_at)
      VALUES (v_prod.id, v_suc.id, v_cant, now(), now())
      ON CONFLICT (producto_id, sucursal_id) DO UPDATE
      SET cantidad = EXCLUDED.cantidad,
          updated_at = now();
    END LOOP;
  END LOOP;
END $$;

-- ----------------------------------------------------------------------------
-- 4. VENTAS RECIENTES Y MOVIMIENTOS HISTÓRICOS (Últimos 7 días)
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_now timestamp with time zone := date_trunc('day', now() AT TIME ZONE current_setting('TIMEZONE'))
    AT TIME ZONE current_setting('TIMEZONE') + interval '12 hours';
  v_venta_id bigint;
  v_p1 bigint;
  v_p2 bigint;
  v_p3 bigint;
  v_p4 bigint;
BEGIN
  -- Tomamos 4 productos representativos
  SELECT id INTO v_p1 FROM public.productos WHERE codigo = 'JEA-001';
  SELECT id INTO v_p2 FROM public.productos WHERE codigo = 'CHO-002';
  SELECT id INTO v_p3 FROM public.productos WHERE codigo = 'BLU-003';
  SELECT id INTO v_p4 FROM public.productos WHERE codigo = 'POL-005';

  -- Venta 1: Hoy - Sucursal 1 (Comercio) - Efectivo (Total: 400.00)
  IF NOT EXISTS (
    SELECT 1 FROM public.ventas
    WHERE sucursal_id = 1
      AND fecha = v_now - interval '2 hours'
      AND metodo_pago = 'efectivo'
      AND total = 400.00
  ) THEN
    INSERT INTO public.ventas (sucursal_id, fecha, metodo_pago, total, created_at, updated_at)
    VALUES (1, v_now - interval '2 hours', 'efectivo', 400.00, now(), now())
    RETURNING id INTO v_venta_id;

    INSERT INTO public.ventas_detalles (venta_id, producto_id, cantidad, precio, created_at, updated_at)
    VALUES
      (v_venta_id, v_p1, 1, 180.00, now(), now()),
      (v_venta_id, v_p2, 1, 220.00, now(), now());

    INSERT INTO public.movimientos (producto_id, sucursal_id, tipo, cantidad, observacion, created_at, updated_at)
    VALUES
      (v_p1, 1, 'salida', 1, concat('Venta #', v_venta_id), now(), now()),
      (v_p2, 1, 'salida', 1, concat('Venta #', v_venta_id), now(), now());
  END IF;

  -- Venta 2: Hoy - Sucursal 2 (Montenegro) - QR (Total: 225.00)
  IF NOT EXISTS (
    SELECT 1 FROM public.ventas
    WHERE sucursal_id = 2
      AND fecha = v_now - interval '4 hours'
      AND metodo_pago = 'QR'
      AND total = 225.00
  ) THEN
    INSERT INTO public.ventas (sucursal_id, fecha, metodo_pago, total, created_at, updated_at)
    VALUES (2, v_now - interval '4 hours', 'QR', 225.00, now(), now())
    RETURNING id INTO v_venta_id;

    INSERT INTO public.ventas_detalles (venta_id, producto_id, cantidad, precio, created_at, updated_at)
    VALUES
      (v_venta_id, v_p3, 1, 140.00, now(), now()),
      (v_venta_id, v_p4, 1, 85.00, now(), now());

    INSERT INTO public.movimientos (producto_id, sucursal_id, tipo, cantidad, observacion, created_at, updated_at)
    VALUES
      (v_p3, 2, 'salida', 1, concat('Venta #', v_venta_id), now(), now()),
      (v_p4, 2, 'salida', 1, concat('Venta #', v_venta_id), now(), now());
  END IF;

  -- Venta 3: Ayer - Sucursal 1 (Comercio) - Tarjeta (Total: 360.00)
  IF NOT EXISTS (
    SELECT 1 FROM public.ventas
    WHERE sucursal_id = 1
      AND fecha = v_now - interval '1 day 3 hours'
      AND metodo_pago = 'tarjeta'
      AND total = 360.00
  ) THEN
    INSERT INTO public.ventas (sucursal_id, fecha, metodo_pago, total, created_at, updated_at)
    VALUES (1, v_now - interval '1 day 3 hours', 'tarjeta', 360.00, now(), now())
    RETURNING id INTO v_venta_id;

    INSERT INTO public.ventas_detalles (venta_id, producto_id, cantidad, precio, created_at, updated_at)
    VALUES (v_venta_id, v_p1, 2, 180.00, now(), now());
  END IF;

  -- Venta 4: Hace 2 días - Sucursal 3 (Ceja) - Efectivo (Total: 170.00)
  IF NOT EXISTS (
    SELECT 1 FROM public.ventas
    WHERE sucursal_id = 3
      AND fecha = v_now - interval '2 days 5 hours'
      AND metodo_pago = 'efectivo'
      AND total = 170.00
  ) THEN
    INSERT INTO public.ventas (sucursal_id, fecha, metodo_pago, total, created_at, updated_at)
    VALUES (3, v_now - interval '2 days 5 hours', 'efectivo', 170.00, now(), now())
    RETURNING id INTO v_venta_id;

    INSERT INTO public.ventas_detalles (venta_id, producto_id, cantidad, precio, created_at, updated_at)
    VALUES (v_venta_id, v_p4, 2, 85.00, now(), now());
  END IF;

  -- Venta 5: Hace 3 días - Sucursal 2 (Montenegro) - Transferencia (Total: 440.00)
  IF NOT EXISTS (
    SELECT 1 FROM public.ventas
    WHERE sucursal_id = 2
      AND fecha = v_now - interval '3 days 4 hours'
      AND metodo_pago = 'transferencia'
      AND total = 440.00
  ) THEN
    INSERT INTO public.ventas (sucursal_id, fecha, metodo_pago, total, created_at, updated_at)
    VALUES (2, v_now - interval '3 days 4 hours', 'transferencia', 440.00, now(), now())
    RETURNING id INTO v_venta_id;

    INSERT INTO public.ventas_detalles (venta_id, producto_id, cantidad, precio, created_at, updated_at)
    VALUES (v_venta_id, v_p2, 2, 220.00, now(), now());
  END IF;

  -- Venta 6: Hace 4 días - Sucursal 1 (Comercio) - QR (Total: 320.00)
  IF NOT EXISTS (
    SELECT 1 FROM public.ventas
    WHERE sucursal_id = 1
      AND fecha = v_now - interval '4 days 2 hours'
      AND metodo_pago = 'QR'
      AND total = 320.00
  ) THEN
    INSERT INTO public.ventas (sucursal_id, fecha, metodo_pago, total, created_at, updated_at)
    VALUES (1, v_now - interval '4 days 2 hours', 'QR', 320.00, now(), now())
    RETURNING id INTO v_venta_id;

    INSERT INTO public.ventas_detalles (venta_id, producto_id, cantidad, precio, created_at, updated_at)
    VALUES
      (v_venta_id, v_p1, 1, 180.00, now(), now()),
      (v_venta_id, v_p3, 1, 140.00, now(), now());
  END IF;

  -- Venta 7: Hace 5 días - Sucursal 4 (Satélite) - Efectivo (Total: 255.00)
  IF NOT EXISTS (
    SELECT 1 FROM public.ventas
    WHERE sucursal_id = 4
      AND fecha = v_now - interval '5 days 6 hours'
      AND metodo_pago = 'efectivo'
      AND total = 255.00
  ) THEN
    INSERT INTO public.ventas (sucursal_id, fecha, metodo_pago, total, created_at, updated_at)
    VALUES (4, v_now - interval '5 days 6 hours', 'efectivo', 255.00, now(), now())
    RETURNING id INTO v_venta_id;

    INSERT INTO public.ventas_detalles (venta_id, producto_id, cantidad, precio, created_at, updated_at)
    VALUES (v_venta_id, v_p4, 3, 85.00, now(), now());
  END IF;

END $$;
