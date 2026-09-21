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
