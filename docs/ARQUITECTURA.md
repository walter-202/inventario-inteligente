# Contexto técnico del proyecto — Sistema Inteligente de Gestión de Inventario (Lidemoda)

> Este documento existe para dar contexto completo a cualquier agente de desarrollo (humano o IA) que trabaje en el proyecto. Antes de generar código, el agente debe conocer el problema, la arquitectura, los patrones y las convenciones descritas aquí.

## 1. Resumen del problema y alcance

Lidemoda opera 5 sucursales (accesorios, belleza, regalos, hogar) sin un sistema centralizado de inventario. Hoy el registro es manual (cuadernos/planillas por sucursal), lo que impide saber disponibilidad entre sucursales, genera pérdidas no detectadas y no deja tiempo al personal para atender clientes mientras registra ventas.

**Alcance del MVP (Must Have, según MoSCoW del informe):**

| RF | Nombre / Funcionalidad | Alcance técnico en Iteración 1 (MVP v1) |
|---|---|---|
| **RF-01** | Registro de productos | Alta en catálogo con código único (SKU/barra), nombre, categoría y precio |
| **RF-02** | Edición de productos | Actualización de datos básicos de productos existentes |
| **RF-03** | Búsqueda y filtros | Búsqueda por texto (nombre, código o categoría) en catálogo |
| **RF-04** | Lectura óptica de código de barras/QR | Escaneo nativo con cámara móvil (`expo-camera`), sin consumo de IA |
| **RF-05** | Recepción en almacén | Ingreso de mercadería por cajas con desglose por producto y cantidad |
| **RF-06** | Despacho a sucursales | Creación de órdenes de salida desde almacén a cualquiera de las 5 sucursales |
| **RF-07** | Confirmación en sucursal | Recepción física en sucursal validando contra la orden de despacho |
| **RF-10** | Consulta de stock local | Existencias en tiempo real de la sucursal activa |
| **RF-11** | Consulta inter-sucursal | Stock disponible en las otras 4 sucursales de La Paz y El Alto |
| **RF-13** | Ticket de venta (POS) | Selección de productos, cantidades y cálculo del total a cobrar |
| **RF-14** | Descuento transaccional | Descuento atómico e inmediato en PostgreSQL (RPC) impidiendo sobreventa |
| **RF-15** | Registro de pago | Selección de método de pago (efectivo, QR simple o transferencia) |
| **RF-16** | Resumen de ventas | Consulta de ventas efectuadas en la jornada/turno por sucursal |
| **RF-18** | Dictado por voz on-device | Captura de audio local con `expo-speech-recognition` (sin enviar audio crudo) |
| **RF-19** | Interpretación de voz con IA | Edge Function (Groq/Llama) que extrae producto y cantidad en JSON |
| **RF-20** | Confirmación de venta por voz | Pantalla obligatoria de confirmación previa antes de asentar la venta |
| **RF-21** | Asistente inteligente (Stock) | Consultas en lenguaje natural sobre disponibilidad entre sucursales |
| **RF-22** | Asistente inteligente (Ventas) | Consultas en lenguaje natural sobre resumen de ventas del turno |
| **RF-23** | Autenticación de usuarios | Login seguro con asignación de sucursal base o almacén |
| **RF-24** | Control de acceso por roles | Permisos según rol (asesora, cajera, reponedora, almacén, marketing, admin) |

> 📌 **Nota sobre cámara y visiones futuras:**
> - **RF-04 (v1 - MVP):** Escáner de código de barras/QR nativo con la cámara (sin IA).
> - **RF-25 (v2 - Próxima iteración):** Reconocimiento visual de productos sin código vía Gemini Flash Multimodal.
> - **Won't Have (excluidos):** Facturación electrónica SIAT, contabilidad avanzada de arqueos de caja e integraciones con ERPs externos.
> - Alcance validado **no incluye modo offline** (las 5 sucursales operan centralizadas con conexión a Supabase).

## 2. Arquitectura general

```
┌─────────────────────────────┐
│   App móvil (React Native   │
│   + Expo) — cliente único   │
│   para las 5 sucursales     │
└──────────────┬──────────────┘
               │ Supabase JS Client (REST/Realtime, autenticado)
               ▼
┌─────────────────────────────┐
│   Supabase                  │
│   - PostgreSQL (datos)      │
│   - Auth (roles)            │
│   - Row Level Security      │
│   - Realtime (stock live)   │
│   - Edge Functions (lógica  │
│     server-side sensible)   │
└──────────────┬──────────────┘
               │ Edge Function actúa como puente hacia IA
               ▼
┌─────────────────────────────┐
│   Capa de proveedores IA    │
│   (adaptador intercambiable)│
│   - Groq   → voz/texto, NL  │
│   - Gemini Flash → visión   │
│   - Cerebras → carga/tests  │
└─────────────────────────────┘
```

**Decisión normativa de seguridad:** la app móvil **debe** invocar una Edge Function para que las claves de proveedores IA nunca viajen al cliente. La Edge Function es el gateway autorizado para autenticación del proveedor, prompts y validación de respuestas.

**Brecha de implementación actual:** el contrato heredado conserva una llamada directa a Gemini con `EXPO_PUBLIC_GEMINI_API_KEY` y un fallback heurístico local. Esta refactorización no inventa una Edge Function ni cambia ese contrato; la exposición de la clave queda registrada como una brecha de seguridad prioritaria que debe cerrarse en una iteración backend.

## 3. Stack tecnológico

| Capa | Tecnología | Motivo |
|---|---|---|
| **App móvil** | React Native + Expo SDK 57 (dev client) | Soporte nativo para cámara, voz y rendimiento óptimo en Android/iOS |
| **UI Toolkit & Theme** | `react-native-paper` (MD3) + `lucide-react-native` | ThemeProvider listo para Expo SDK 57, cero boilerplate, componentes accesibles (Cards, Chips, Badges, Modales, Inputs) |
| **Tipografía** | `Hanken Grotesk` (textos) + `JetBrains Mono` (datos/código) | Identidad visual moderna y legibilidad técnica para precios, SKU y métricas |
| **Backend / datos** | Supabase (PostgreSQL + Auth + RLS + Realtime + Edge Functions) | Conexión directa vía MCP, SQL relacional, RLS multi-sucursal y funciones RPC |
| **Escaneo de código** | `expo-camera` (CameraView) | Escaneo óptico de barras y QR en tiempo real, nativo, sin consumo de IA |
| **Voz → texto** | `expo-speech-recognition` (on-device) | Reconocimiento de voz local gratuito, sin latencia de red ni envío de audio crudo |
| **Interpretación IA (Voz/NL)** | Groq (Llama-3.3-70b / Llama-3.1-8b) | Extracción ultrarrápida (<500ms) de producto/cantidad en JSON |
| **Visión multimodal (v2)** | Gemini Flash 1.5 | Visión artificial para reconocimiento de producto sin código de barras |
| **Manejo de estado y datos** | TanStack Query v5 | Cache automático, revalidación en segundo plano y estados de carga |
| **Validación de esquemas** | Zod | Validación tipada compartida en cliente y Edge Functions |

---

## 4. Patrones de arquitectura de código

### 4.1 Frontend (Feature-Driven Architecture & Clean Layers)

Para erradicar archivos monolíticos y separar responsabilidades, el frontend organiza el código por **dominios de negocio (Features)** en lugar de agrupar por tipo de archivo técnico:

```text
mobile/src/
├── app/                         # Capa de Enrutamiento (Expo Router) — rutas delgadas
│   ├── (tabs)/                  # Layout de pestañas inferiores (Bottom Navigation)
│   │   ├── index.tsx            # Pantalla de Inicio / Dashboard
│   │   ├── productos.tsx        # Catálogo central
│   │   ├── inventario.tsx       # Stock multi-sucursal y transferencias
│   │   ├── ventas.tsx           # Punto de Venta (POS) y cobro
│   │   ├── mas.tsx              # Configuración y perfil
│   │   └── _layout.tsx          # Configuración del Tab Bar
│   ├── escanear.tsx             # Modal / Vista dedicada de escaneo de cámara
│   ├── registrar-producto.tsx   # Modal de alta de producto
│   ├── registro-voz.tsx         # Modal de registro por voz
│   ├── movimientos.tsx          # Ruta compatible de movimientos
│   ├── nueva-venta.tsx          # Ruta compatible del POS
│   └── _layout.tsx              # SafeAreaProvider, QueryClientProvider y PaperProvider
│
├── features/                    # Vertical Slices (Lógica de negocio encapsulada)
│   ├── dashboard/               # Métricas, KPIs, gráfico semanal y alertas de inventario
│   │   ├── components/          # KpiGrid, SalesWeeklyChart, LowStockList
│   │   ├── hooks/               # useDashboardMetrics()
│   │   └── api/                 # obtenerDashboardMetrics() — ventas/inventarios reales
│   ├── productos/               # Catálogo, alta, edición y filtros
│   │   ├── components/          # ProductCard, ProductForm, BarcodeScannerView
│   │   ├── hooks/               # useProductos(), useRegistrarProducto()
│   │   └── api/                 # obtenerProductos(), registrarProducto(), buscarProductoPorCodigo()
│   ├── inventario/              # Stock multi-sucursal y movimientos
│   │   ├── components/          # InventarioCard, StockBranchList, TransferModal
│   │   ├── hooks/               # useStockMultiSucursal(), useMovimientos()
│   │   └── api/                 # obtenerInventario(), registrarEntrada/Salida/Transferencia()
│   ├── ventas/                  # POS, armado de ticket y cobro transaccional
│   │   ├── components/          # SaleCart, PaymentSelector, SaleSummaryModal
│   │   ├── hooks/               # useVentas(), useProcesarVenta()
│   │   └── api/                 # obtenerVentas(), registrarVenta()
│   └── asistente-ia/            # Asistencia por voz y consultas en lenguaje natural
│       ├── components/          # RegistroVozDrawer, ConfirmationModal, SuggestionChips
│       ├── hooks/               # useVoiceCommand()
│       ├── api/                 # interpretarTextoVoz(), interpretarVoz()
│       └── screens/             # RegistroVozScreen, VoiceCommandView
│
└── shared/                      # Componentes reutilizables y utilidades comunes
    ├── components/              # AppHeader, ScreenContainer, StatusBadge
    ├── theme/                   # Tokens oficiales de diseño (Colores, Tipografía, Radios)
    ├── lib/                     # supabase.ts, queryClient.ts, pagination.ts, utils.ts
    ├── api/                     # sucursalesApi.ts (acceso compartido a sucursales)
    ├── hooks/                   # useSucursales()
    ├── types/                   # database.types.ts (generado), domain.ts
    └── screens/                 # MasScreen.tsx
```

#### Reglas de diseño de código frontend:
1. **Rutas delgadas (Thin Routes):** Las pantallas en `app/` son meros ensambladores; importan el contenedor del feature correspondiente (ej: `app/(tabs)/index.tsx` únicamente monta `<DashboardContainer />`).
2. **Container-Presentational Pattern:** Los componentes visuales no ejecutan llamadas directas a APIs ni consultas a base de datos; reciben datos y callbacks a través de sus props o hooks de feature.
3. **Aislamiento de Supabase:** Ningún componente JSX interactúa directamente con `supabase.from()`. Toda interacción vive en la subcarpeta `api/` de cada feature y se expone mediante hooks basados en TanStack Query.
4. **Validación Zod en frontera:** Toda respuesta de IA (voz/asistente) y todo formulario se valida con un esquema Zod antes de mutar estado o impactar base de datos.
5. **Datos reales:** El dashboard solo agrega filas de `ventas` e `inventarios`; los días sin ventas se muestran como cero derivado, nunca como datos de demostración.
6. **Límite de seguridad IA:** Las claves de proveedores no deben existir en el bundle móvil; el diseño normativo exige una Edge Function gateway. La integración Gemini directa actual es una brecha explícita, no la regla arquitectónica.

---

## 5. Sistema de Diseño y Reglas Visuales (Lidemoda Design System)

La interfaz se estandariza bajo la guía visual del dashboard operativo (Imagen 1 y 2):

### 5.1 Paleta cromática oficial

```ts
export const LidemodaPalette = {
  // Primario: Acción principal, marca, selecciones y acentos
  primary: '#2563EB',        // Royal Electric Blue
  primaryDark: '#1D4ED8',
  primarySoft: '#EFF6FF',
  primaryBorder: '#DBEAFE',

  // Secundario: Acciones secundarias, IA y badges suaves
  secondary: '#6366F1',      // Indigo / Blurple
  secondarySoft: '#EEF2FF',
  secondaryDark: '#4F46E5',

  // Terciario: Novedades, métricas y acentos alternativos
  tertiary: '#06B6D4',       // Cyan / Teal
  tertiarySoft: '#ECFEFF',

  // Neutros: Canvas, superficies y textos
  neutral900: '#0F172A',     // Texto principal / Títulos
  neutral700: '#334155',     // Texto secundario
  neutral500: '#64748B',     // Subtítulos y placeholders
  neutral300: '#CBD5E1',     // Bordes suaves
  neutral200: '#E2E8F0',     // Divisores y bordes de tarjeta
  neutral100: '#F1F5F9',     // Contenedores secundarios y chips apagados
  background: '#F8FAFC',     // Fondo general de la aplicación (Canvas)
  surface: '#FFFFFF',        // Superficie de tarjetas puras

  // Semánticos / Estado
  danger: '#DC2626',         // Stock crítico / Errores
  dangerSoft: '#FEE2E2',     // Badge "Crítico" / "Atención inmediata"
  warning: '#D97706',        // Stock bajo
  warningSoft: '#FEF3C7',    // Badge "Bajo"
  success: '#10B981',        // Óptimo / Confirmado
  successSoft: '#D1FAE5',    // Badge "94% óptimo"
};
```

### 5.2 Tipografía
- **Titulares y Cuerpo:** `Hanken Grotesk` (Regular 400, Medium 500, SemiBold 600, Bold 700).
- **Datos, Precios, Códigos y SKU:** `JetBrains Mono` (Números de stock `1,284`, montos `Bs. 8,450`, etiquetas técnicas).

### 5.3 Componentes y Patrones UI Estandarizados (Mockup Dashboard)

1. **Header Institucional:**
   - Logo/Nombre de la app ("Inventario Inteligente").
   - Dropdown interactivo de sucursal activa (`Sucursal Central ▾`).
   - Botón de notificaciones con badge de alerta rojo.
   - Avatar de usuario autenticado.
2. **Grilla de KPIs (2x2):**
   - Tarjetas blancas con `borderRadius: 16`, borde suave `#E2E8F0` y elevación sutil.
   - Ícono superior derecho en contenedor suave (`#EFF6FF`, `#FEE2E2`, etc.).
   - Métrica grande en tipografía monoespaciada/negrita (`248`, `1,284`, `Bs. 8,450`, `8 items`).
   - Píldora inferior de variación/estado (`+12 este mes`, `● 94% óptimo`, `↗ +8.2%`, `Atención inmediata`).
3. **Gráfico de Ventas Semanales (7 días):**
   - Barras verticales (L, M, M, J, V, S, D) con color base atenuado (`#E0E7FF`) y barra destacada en `#2563EB`.
   - Tooltip dinámico en píldora oscura/azul para el día pico (`PICO 11.4k`).
   - Barra inferior informativa: *"Toca una barra para detalles: Hoy: Bs. 8,450"*.
4. **Barra de Acciones Rápidas (Quick Actions):**
   - `+ Producto`: Botón píldora relleno primario (`#2563EB`).
   - `Nueva venta`: Botón píldora índigo suave (`#EEF2FF` con texto `#4F46E5`).
   - `Escanear`: Botón píldora con borde (`#FFFFFF` con borde `#E2E8F0` e ícono de código de barras).
5. **Tarjeta de Alerta Predictiva de Inventario (IA):**
   - Borde y fondo con degradado tenue azul/índigo (`#EEF2FF`).
   - Badge distintivo: `Inteligencia del inventario [ 3 sugerencias ]`.
   - Mensaje de recomendación operativa y botón interactivo: `Ver análisis y reabastecer →`.
6. **Lista "Próximos a agotarse":**
   - Miniatura de producto + nombre en negrita + ubicación física (`Sucursal Ceja • Pasillo B`).
   - Badge de estado a la derecha (`5 restantes • Crítico` en rojo, `8 restantes • Bajo` en azul).
7. **Dock Flotante del Asistente Inteligente (IA v2.4):**
   - Barra acoplada sobre la navegación inferior con borde redondeado (`borderRadius: 24`).
   - Input de texto con placeholder: *"Pregunta sobre productos, stock o ventas..."*.
   - Botón de micrófono para dictado por voz + Botón circular de envío (`#2563EB`).
   - Chips rápidos contextuales: `📈 Más vendido hoy`, `📦 Proyección fin de semana`.
8. **Navegación Inferior (Bottom Tabs):**
   - 5 accesos con íconos vectoriales sobrios: `Inicio`, `Productos`, `Inventario`, `Ventas`, `Más`.

---

## 6. Arquitectura del Backend (Supabase)

- **RLS como capa de autorización principal:** Cada rol (`asesora`, `cajera`, `reponedora`, `almacen`, `admin`) tiene políticas SQL explícitas por tabla. El cliente móvil jamás manipula permisos a mano.
- **Transacciones de venta (RPC `registrar_venta`):** Función `plpgsql` que ejecuta el descuento atómico de stock e inserción de venta en un solo bloque `BEGIN ... COMMIT`, bloqueando sobreventas (`RN-01`).
- **Gateway normativo de IA:** Las claves de Groq/Gemini deben vivir exclusivamente en variables de entorno de Supabase y la app móvil debe invocar la Edge Function `ai-service` como gateway.
- **Brecha actual registrada:** El cliente mantiene la integración directa Gemini heredada y su fallback heurístico local. No se cambia el RPC ni se crea una función remota como parte de esta refactorización; migrar la clave al gateway backend es una corrección de seguridad prioritaria.

---

## 7. Convenciones de Desarrollo

- **Ramas Git:** `feat/HU-01-login-sucursales`, `feat/HU-02-catalogo`, etc.
- **Commits:** Conventional Commits (`feat:`, `fix:`, `refactor:`, `docs:`).
- **Tablas SQL:** En español, singular y snake_case (`sucursal`, `producto`, `inventario`, `movimiento`, `venta`, `venta_detalle`, `perfil_usuario`).
