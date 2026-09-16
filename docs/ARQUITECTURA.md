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

**Decisión clave:** la app móvil **no llama directamente a los proveedores de IA**. Las claves de API no deben viajar en el cliente. Todo lo que sea consumo de IA pasa por una Edge Function de Supabase, que además es el lugar natural para registrar consumo de tokens y aplicar el patrón de *fallback* entre proveedores.

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
│   └── _layout.tsx              # Provider de Tema (PaperProvider) y Auth
│
├── features/                    # Vertical Slices (Lógica de negocio encapsulada)
│   ├── dashboard/               # Métricas, KPIs, gráfico semanal y alertas de inventario
│   │   ├── components/          # KpiGrid, SalesWeeklyChart, PredictiveAlertCard, LowStockList
│   │   ├── hooks/               # useDashboardMetrics()
│   │   └── api/                 # getDashboardKpis(), getWeeklySales()
│   ├── productos/               # Catálogo, alta, edición y filtros
│   │   ├── components/          # ProductCard, ProductForm, BarcodeScannerView
│   │   ├── hooks/               # useProductos(), useRegistrarProducto()
│   │   └── api/                 # fetchProductos(), createProducto()
│   ├── inventario/              # Stock multi-sucursal y movimientos
│   │   ├── components/          # StockBranchList, DispatchForm, ReceiveConfirmationModal
│   │   ├── hooks/               # useStockMultiSucursal(), useDespachoMercaderia()
│   │   └── api/                 # fetchStockConsolidado(), createDespacho()
│   ├── ventas/                  # POS, armado de ticket y cobro transaccional
│   │   ├── components/          # SaleCart, PaymentSelector, SaleSummaryModal
│   │   ├── hooks/               # useVentas(), useProcesarVenta()
│   │   └── api/                 # rpcRegistrarVenta()
│   └── asistente-ia/            # Asistencia por voz y consultas en lenguaje natural
│       ├── components/          # VoiceRecordDrawer, ConfirmationModal, AssistantBar, SuggestionChips
│       ├── hooks/               # useVoiceCommand(), useAssistantQuery()
│       └── api/                 # interpretVoiceWithIA(), queryAssistantNL()
│
└── shared/                      # Componentes reutilizables y utilidades comunes
    ├── components/              # AppHeader, ScreenContainer, StatusBadge, ActionPill
    ├── theme/                   # Tokens oficiales de diseño (Colores, Tipografía, Radios)
    ├── lib/                     # supabase.ts (cliente Supabase único inicializado)
    └── hooks/                   # useAuth(), useActiveBranch()
```

#### Reglas de diseño de código frontend:
1. **Rutas delgadas (Thin Routes):** Las pantallas en `app/` son meros ensambladores; importan el contenedor del feature correspondiente (ej: `app/(tabs)/index.tsx` únicamente monta `<DashboardContainer />`).
2. **Container-Presentational Pattern:** Los componentes visuales no ejecutan llamadas directas a APIs ni consultas a base de datos; reciben datos y callbacks a través de sus props o hooks de feature.
3. **Aislamiento de Supabase:** Ningún componente JSX interactúa directamente con `supabase.from()`. Toda interacción vive en la subcarpeta `api/` de cada feature y se expone mediante hooks basados en TanStack Query.
4. **Validación Zod en frontera:** Toda respuesta de IA (voz/asistente) y todo formulario se valida con un esquema Zod antes de mutar estado o impactar base de datos.

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
- **Edge Functions como API Gateway de IA:** Las claves de Groq y Gemini viven exclusivamente en las variables de entorno de Supabase. La app móvil invoca la Edge Function `ai-service`, la cual registra tokens, aplica el prompt del sistema y devuelve respuestas limpias en JSON.

---

## 7. Convenciones de Desarrollo

- **Ramas Git:** `feat/HU-01-login-sucursales`, `feat/HU-02-catalogo`, etc.
- **Commits:** Conventional Commits (`feat:`, `fix:`, `refactor:`, `docs:`).
- **Tablas SQL:** En español, singular y snake_case (`sucursal`, `producto`, `inventario`, `movimiento`, `venta`, `venta_detalle`, `perfil_usuario`).

