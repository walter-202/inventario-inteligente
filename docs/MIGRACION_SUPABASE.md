# Registro de Migración: Laravel a Supabase (PostgreSQL)

**Proyecto:** Lidemoda - Sistema Inteligente de Gestión de Inventario  
**Fecha de Migración:** 16 de Septiembre de 2026  
**Estado:** Migración completada al 100%. Backend Laravel deprecado.

---

## 1. Justificación y Objetivos de la Migración
- **Reducción de Latencia y Despliegue Inmediato:** Eliminación del servidor intermedio Laravel en favor de Supabase BaaS (Backend-as-a-Service) conectado de forma directa a la aplicación Expo React Native.
- **Concurrencia Atómica en Base de Datos:** Las operaciones críticas de stock (`RN-01`, ventas multi-producto, transferencias entre sucursales) se delegan a procedimientos almacenados `PL/pgSQL` con bloqueo pesimista a nivel de fila (`FOR UPDATE`), evitando condiciones de carrera (*race conditions*).
- **Simplificación del Entorno de Desarrollo:** El espacio de trabajo se concentra exclusivamente en `mobile/`, permitiendo abrir la sesión del proyecto de forma directa sin requerir un runtime de PHP/Composer ni PostgreSQL local.

---

## 2. Correspondencia de Esquemas (Schema Mapping)

| Entidad Laravel (`backend/app/Models`) | Tabla Supabase (`public`) | Características y Reglas Aplicadas |
| :--- | :--- | :--- |
| `Sucursal` | `public.sucursales` | Identificador autoincremental, nombre único, dirección y ciudad. 5 sucursales oficiales de Lidemoda sembradas. |
| `Producto` | `public.productos` | Código único de barras/SKU, precio con validación `>= 0`, categoría. Índices B-tree en `codigo` y `categoria`. |
| `Inventario` | `public.inventarios` | Stock granular por sucursal. Constraint única `(producto_id, sucursal_id)`. Restricción `cantidad >= 0`. Índices en ambas claves foráneas. |
| `Movimiento` | `public.movimientos` | Auditoría de movimientos (`entrada`, `salida`, `transferencia`). Soporta `sucursal_destino_id` para traslados entre sucursales. |
| `Venta` | `public.ventas` | Registro de cabecera con método de pago (`efectivo`, `QR`, `tarjeta`, `transferencia`), sucursal, fecha y total acumulado. |
| `VentaDetalle` | `public.ventas_detalles` | Detalle por línea de venta, cálculo de subtotal y precio congelado al momento de la transacción. Cascada al eliminar venta. |
| `User` | `public.perfiles` | Vinculado a `auth.users(id)` con roles (`admin`, `encargada`, `cajera`, `vendedora`, `almacen`) y sucursal asignada. |

---

## 3. Procedimientos Almacenados Atómicos (RPCs)

Todas las transacciones que antes ocurrían en controladores o servicios de Laravel se migraron a funciones `PL/pgSQL` bajo la directiva `SECURITY DEFINER`:

1. **`registrar_venta(p_sucursal_id, p_metodo_pago, p_productos, p_fecha)`**
   - Ejecuta en una única transacción atómica:
     - Bloqueo de fila `FOR UPDATE` en `public.inventarios` para cada producto vendido.
     - Verificación estricta de stock disponible (`RN-01`). Si `stock < cantidad`, aborta la transacción con error explícito.
     - Decremento automático de inventario.
     - Registro de auditoría en `public.movimientos` (`tipo: 'salida'`, `observacion: 'Venta #<id>'`).
     - Creación de registros en `public.ventas_detalles`.
     - Actualización y retorno del total acumulado.
2. **`registrar_movimiento_entrada(p_producto_id, p_sucursal_id, p_cantidad, p_observacion)`**
   - Ejecuta un `INSERT ... ON CONFLICT DO UPDATE` atómico en inventario y registra el movimiento de entrada.
3. **`registrar_movimiento_salida(p_producto_id, p_sucursal_id, p_cantidad, p_observacion)`**
   - Bloquea la fila con `FOR UPDATE`, valida existencia y saldo suficiente, descuenta el stock y asienta la auditoría.
4. **`registrar_movimiento_transferencia(p_producto_id, p_sucursal_origen_id, p_sucursal_destino_id, p_cantidad, p_observacion)`**
   - Bloquea el origen, descuenta el stock origen, incrementa/crea el registro en el destino y genera el movimiento de traslado.
5. **`registrar_producto_con_stock(p_nombre, p_codigo, p_categoria, p_precio, p_cantidad, p_sucursal_id)`**
   - Inserta el producto en catálogo y, si la cantidad inicial es `> 0`, inicializa el stock en la sucursal seleccionada con su movimiento correspondiente.

---

## 4. Migración de Inteligencia Artificial y Voz (`RF-18..22`)
- **En Laravel:** `InterpretacionController.php` llamaba a Gemini REST API.
- **En Mobile/Supabase:** Se implementó `src/services/aiInterpretationService.ts`:
  - Soporte directo para Gemini 2.0 Flash (`EXPO_PUBLIC_GEMINI_API_KEY`).
  - Motor heurístico nativo en español integrado como salvaguarda offline: procesa frases de venta habladas ("Vender 2 chompas", "3 jeans mom fit") garantizando funcionamiento y demostración fluida incluso sin conexión o sin clave de API configurada.

---

## 5. Configuración del Cliente en `mobile/`
- Cliente Supabase: `src/lib/supabase.ts`
- Tipos TypeScript generados automáticamente: `src/types/database.types.ts`
- Adaptador de API: `src/lib/api.ts` (100% desacoplado de Laravel, consumiendo Supabase de forma nativa).
- Variables de entorno: `mobile/.env`
