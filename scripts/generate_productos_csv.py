import openpyxl
import csv
import re
from pathlib import Path

# Mapping of subcategories found in Excel to official Lidemoda categories
# (belleza, accesorios, hogar, regalos, novedades)
CATEGORY_MAPPING = {
    'maquillaje': 'belleza',
    'preparación de maquillaje': 'belleza',
    'cuidado facial': 'belleza',
    'cuidado personal': 'belleza',
    'cuidado corporal': 'belleza',
    'perfumería': 'belleza',
    'accesorios de maquillaje': 'belleza',
    'decoración facial': 'belleza',
    'bisutería': 'accesorios',
    'bisuteria': 'accesorios',
    'cabello': 'accesorios',
    'bolsos': 'accesorios',
    'accesorios': 'accesorios',
    'ropa': 'accesorios',
    'tazas': 'hogar',
    'vasos': 'hogar',
    'botellas': 'hogar',
    'termos': 'hogar',
    'decoración': 'hogar',
    'detalles': 'regalos',
    'general': 'novedades',
    'novedades': 'novedades'
}

PREFIX_BY_CATEGORY = {
    'belleza': 'BEL',
    'accesorios': 'ACC',
    'hogar': 'HOG',
    'regalos': 'REG',
    'novedades': 'NOV'
}

# Representative price tiers (in Bolivianos - BOB) based on product type
DEFAULT_PRICES = {
    'perfumería': 120.00,
    'bolsos': 85.00,
    'ropa': 65.00,
    'termos': 55.00,
    'botellas': 45.00,
    'tazas': 35.00,
    'maquillaje': 35.00,
    'cuidado facial': 40.00,
    'cuidado personal': 25.00,
    'cuidado corporal': 30.00,
    'bisutería': 20.00,
    'cabello': 15.00,
    'detalles': 45.00,
    'accesorios de maquillaje': 25.00,
    'decoración': 40.00,
    'general': 30.00
}

def clean_text(text: str) -> str:
    if not text:
        return ""
    # Normalize multiple spaces
    text = re.sub(r'\s+', ' ', str(text).strip())
    # Capitalize proper name
    return text.capitalize()

def format_title_name(name: str) -> str:
    cleaned = clean_text(name)
    # Capitalize each significant word
    words = cleaned.split(' ')
    capitalized = []
    lowercase_words = {'de', 'en', 'para', 'con', 'y', 'a', 'la', 'el', 'los', 'las', 'del'}
    for idx, w in enumerate(words):
        if idx > 0 and w.lower() in lowercase_words:
            capitalized.append(w.lower())
        else:
            capitalized.append(w.capitalize())
    return ' '.join(capitalized)

def main():
    base_dir = Path(__file__).resolve().parent.parent
    xlsx_path = base_dir / 'docs' / 'productos.xlsx'
    csv_path = base_dir / 'docs' / 'productos.csv'
    sql_path = base_dir / 'scripts' / 'seed_productos_reales.sql'

    print(f"Loading workbook from {xlsx_path}...")
    wb = openpyxl.load_workbook(xlsx_path)
    sheet = wb.active

    col_pairs = [(2, 3), (5, 6), (8, 9), (11, 12)]
    extracted_items = []

    for r in range(4, sheet.max_row + 1):
        for p_col, c_col in col_pairs:
            p_val = sheet.cell(row=r, column=p_col + 1).value
            c_val = sheet.cell(row=r, column=c_col + 1).value
            if p_val and str(p_val).strip() and str(p_val).strip().lower() != 'producto':
                raw_name = str(p_val).strip()
                raw_subcat = str(c_val).strip() if c_val else 'General'
                extracted_items.append((raw_name, raw_subcat))

    print(f"Extracted {len(extracted_items)} raw items from Excel.")

    # Counters for SKU generation
    counters = {prefix: 1 for prefix in PREFIX_BY_CATEGORY.values()}
    normalized_products = []

    for raw_name, raw_subcat in extracted_items:
        nombre = format_title_name(raw_name)
        subcategoria = clean_text(raw_subcat)
        if not subcategoria or subcategoria.lower() == 'general':
            # Try to infer from name if possible
            if 'agenda' in nombre.lower():
                subcategoria = 'Agendas'
            elif 'peluche' in nombre.lower():
                subcategoria = 'Detalles'
            elif 'pantufla' in nombre.lower():
                subcategoria = 'Detalles'
            elif 'almohada' in nombre.lower():
                subcategoria = 'Detalles'
            else:
                subcategoria = 'General'

        categoria = CATEGORY_MAPPING.get(subcategoria.lower(), 'novedades')
        prefix = PREFIX_BY_CATEGORY[categoria]
        codigo = f"{prefix}-{counters[prefix]:03d}"
        counters[prefix] += 1

        precio = DEFAULT_PRICES.get(subcategoria.lower(), 30.00)
        stock_minimo = 5

        normalized_products.append({
            'codigo': codigo,
            'nombre': nombre,
            'categoria': categoria,
            'subcategoria': subcategoria,
            'precio': precio,
            'stock_minimo': stock_minimo
        })

    # Write to CSV (UTF-8 with BOM for Excel compatibility)
    print(f"Writing CSV to {csv_path}...")
    with open(csv_path, 'w', newline='', encoding='utf-8-sig') as f:
        writer = csv.DictWriter(f, fieldnames=['codigo', 'nombre', 'categoria', 'subcategoria', 'precio', 'stock_minimo'])
        writer.writeheader()
        for p in normalized_products:
            writer.writerow(p)

    print(f"Successfully generated {csv_path} with {len(normalized_products)} products.")

    # Write SQL Seed script
    print(f"Writing SQL seed to {sql_path}...")
    sql_lines = [
        "-- ============================================================================",
        "-- Catálogo Real Lidemoda (104 productos de docs/productos.xlsx)",
        "-- Categorías: belleza, accesorios, hogar, regalos, novedades",
        "-- ============================================================================",
        "",
        "-- 1. Asegurar columna subcategoria en public.productos",
        "ALTER TABLE public.productos ADD COLUMN IF NOT EXISTS subcategoria TEXT;",
        "",
        "-- 2. Inserción de productos (idempotente por código SKU)",
        "INSERT INTO public.productos (codigo, nombre, categoria, subcategoria, precio, cantidad, stock_minimo, created_at, updated_at)",
        "VALUES"
    ]

    val_clauses = []
    for p in normalized_products:
        esc_nombre = p['nombre'].replace("'", "''")
        esc_subcat = p['subcategoria'].replace("'", "''")
        val_clauses.append(
            f"  ('{p['codigo']}', '{esc_nombre}', '{p['categoria']}', '{esc_subcat}', {p['precio']:.2f}, 50, {p['stock_minimo']}, now(), now())"
        )

    sql_lines.append(",\n".join(val_clauses))
    sql_lines.extend([
        "ON CONFLICT (codigo) DO UPDATE",
        "SET nombre = EXCLUDED.nombre,",
        "    categoria = EXCLUDED.categoria,",
        "    subcategoria = EXCLUDED.subcategoria,",
        "    precio = EXCLUDED.precio,",
        "    stock_minimo = EXCLUDED.stock_minimo,",
        "    updated_at = now();",
        "",
        "-- 3. Distribución inicial de inventario en las 5 sucursales",
        "DO $$",
        "DECLARE",
        "  v_prod record;",
        "  v_suc record;",
        "  v_cant integer;",
        "BEGIN",
        "  FOR v_prod IN SELECT id, categoria, codigo FROM public.productos LOOP",
        "    FOR v_suc IN SELECT id FROM public.sucursales ORDER BY id LOOP",
        "      -- Lógica de stock realista entre sucursales:",
        "      -- Sucursal 1 (Comercio / Central): stock alto (15 - 30)",
        "      -- Sucursal 2 (Montenegro): stock medio (8 - 20)",
        "      -- Sucursal 3 (Ceja): stock variado con algunos críticos (2 - 4) para probar alertas",
        "      -- Sucursal 4 (Satélite): stock medio (5 - 15)",
        "      -- Sucursal 5 (Rio Seco): stock medio (4 - 12)",
        "      IF v_suc.id = 1 THEN",
        "        v_cant := 15 + ((v_prod.id * 3) % 15);",
        "      ELSIF v_suc.id = 2 THEN",
        "        v_cant := 10 + ((v_prod.id * 5) % 11);",
        "      ELSIF v_suc.id = 3 THEN",
        "        IF v_prod.id % 5 = 0 THEN",
        "          v_cant := 3; -- Alerta crítica",
        "        ELSE",
        "          v_cant := 8 + ((v_prod.id * 2) % 10);",
        "        END IF;",
        "      ELSIF v_suc.id = 4 THEN",
        "        v_cant := 6 + ((v_prod.id * 4) % 9);",
        "      ELSE",
        "        v_cant := 5 + ((v_prod.id * 7) % 8);",
        "      END IF;",
        "",
        "      INSERT INTO public.inventarios (producto_id, sucursal_id, cantidad, created_at, updated_at)",
        "      VALUES (v_prod.id, v_suc.id, v_cant, now(), now())",
        "      ON CONFLICT (producto_id, sucursal_id) DO UPDATE",
        "      SET cantidad = EXCLUDED.cantidad,",
        "          updated_at = now();",
        "    END LOOP;",
        "  END LOOP;",
        "END $$;",
        ""
    ])

    with open(sql_path, 'w', encoding='utf-8') as f:
        f.write("\n".join(sql_lines))

    print(f"Successfully generated {sql_path}.")

if __name__ == '__main__':
    main()
