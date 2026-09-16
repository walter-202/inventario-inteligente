# Sistema Inteligente de Gestión de Inventario


## 1. Identificación del problema

Lidemoda es una cadena de cinco sucursales dedicada a la comercialización de accesorios, artículos de belleza, regalos, productos para el hogar y novedades. La empresa maneja aproximadamente más de 2.000 ítems o referencias, considerando diferentes categorías, modelos, diseños, colores y presentaciones.**falta de un registro y control adecuado de la mercadería**. Actualmente no existe un sistema centralizado que permita conocer con exactitud las cantidades disponibles, los productos que ingresan y los productos que se venden en las diferentes sucursales.
La recepción de mercadería se realiza principalmente mediante el conteo de cajas recibidas. Posteriormente, las cajas son distribuidas a las sucursales sin realizar un conteo detallado de los productos en el momento de su llegada. Esta situación dificulta conocer exactamente qué productos llegaron, cuáles fueron distribuidos y qué cantidades están disponibles.
El control de las existencias se realiza principalmente mediante las encargadas de cada sucursal y no mediante un sistema actualizado. Esto dificulta conocer rápidamente la disponibilidad de un producto en otra sucursal o determinar cuándo es necesario solicitar una reposición.
Asimismo, las ventas son registradas actualmente en un cuaderno, dificultando la consulta de ventas por producto, el análisis de rotación y la relación entre las ventas y el inventario disponible.
Por lo tanto, el problema central se define como:
**Lidemoda presenta dificultades para controlar y consultar de manera centralizada y actualizada la información de sus productos, inventario y ventas, debido al uso de procedimientos manuales y a la falta de integración entre sus sucursales.**

## 2. Antecedentes

Actualmente, Lidemoda utiliza diferentes mecanismos manuales para administrar su mercadería.
En la recepción de productos se realiza un conteo general de las cajas que llegan al depósito, pero no existe un registro completo por producto, código, cantidad y sucursal de destino.
Los productos se identifican principalmente mediante su organización física y características visuales como diseño, presentación o categoría. No existe un sistema de identificación individual mediante códigos que permita diferenciar rápidamente productos similares.
Las ventas son registradas manualmente en un cuaderno, mientras que las compras y productos recibidos de proveedores se registran mediante tablas de Excel. Estos mecanismos no se encuentran completamente integrados con la distribución, el inventario y las ventas.
Estos antecedentes evidencian la necesidad de mejorar el registro, consulta y control de la información relacionada con la mercadería.

## 3. Contexto organizacional y Actores del sistema

Lidemoda cuenta con **cinco sucursales** ubicadas en La Paz y El Alto (además del almacén/depósito central).
El sistema propuesto estará orientado al personal que participa activamente en el flujo de mercadería, atención y ventas:
**Recepción de mercadería → Registro → Distribución → Inventario por sucursal → Venta → Actualización de stock → Consulta y análisis.**

### Actores formales del sistema (IS-01 §14)

| Código | Actor | Rol / Perfil | Responsabilidades clave en el sistema |
| :--- | :--- | :--- | :--- |
| **ACT-01** | Asesora de venta | Atención en mostrador de tienda | Consulta inmediata de disponibilidad inter-sucursal (HU-01), venta asistida por voz (HU-03) y consultas al asistente inteligente (HU-04). |
| **ACT-02** | Cajera | Operadora del punto de venta en tienda | Registro rápido de ventas con escáner de código de barras (HU-02), cobro en mostrador y cierre de ventas de turno. |
| **ACT-03** | Reponedora | Personal de piso y stock en sucursal | Verificación física de existencias en tienda y reporte de productos con bajo stock. |
| **ACT-04** | Personal de almacén | Operadores del depósito central (3 personas) | Recepción de mercadería entrante (conteo de cajas y desglose por producto) y despacho de traslados a sucursales (HU-05). |
| **ACT-05** | Encargada de sucursal | Responsable de tienda | Confirmación física de recepción de mercadería despachada (HU-05) y supervisión de ventas de la sucursal. |
| **ACT-06** | Administrador / Gerencia | Dirección de Lidemoda | Acceso global a inventarios consolidados de las 5 sucursales, gestión de usuarios y métricas generales. |**

## 4. Justificación

La implementación del sistema se justifica por la necesidad de mejorar el control de los productos y facilitar el acceso a información actualizada sobre el inventario y las ventas.
De acuerdo con la entrevista, uno de los principales problemas de Lidemoda es la falta de un registro y control adecuado de la mercadería, situación que genera dificultades en la administración del inventario, reposición de productos y seguimiento de posibles pérdidas.
Además, la recepción y organización de los contenedores representa una actividad que genera una importante pérdida de tiempo debido a la revisión de listas extensas para identificar productos y consultar precios.
Por esta razón, se propone desarrollar un sistema que centralice la información y simplifique las actividades de registro y consulta.
**Solución tecnológica propuesta**
Como parte del diseño de la solución, se propone incorporar **inteligencia artificial** para facilitar la interacción con el sistema mediante:
**Registro por voz:** el usuario podrá indicar de manera natural una operación, como producto y cantidad.
**Identificación mediante cámara: el sistema podrá utilizar la cámara del dispositivo para apoyar la identificación de productos. Esta función se plantea como parte de la propuesta tecnológica general del proyecto, pero queda fuera del alcance de la primera versión (ver sección 9).**
**Asistente inteligente:** permitirá realizar consultas sobre productos, inventario y ventas mediante lenguaje natural.
Estas funciones no se presentan como necesidades expresadas literalmente por la empresa durante la entrevista, sino como una propuesta tecnológica del proyecto para resolver las necesidades identificadas. Para la primera versión (MVP) se priorizan el registro por voz y el asistente inteligente; la identificación mediante cámara se incorporará en una versión posterior, una vez validado el flujo básico de voz y consulta.
De esta manera, el proyecto busca diferenciarse de un sistema tradicional de inventario mediante una interacción más sencilla y el uso de inteligencia artificial para apoyar las operaciones y consultas.

## 5. Técnicas de levantamiento utilizadas

Para obtener información sobre la situación actual de Lidemoda se utilizó principalmente la técnica de **entrevista**.
La entrevista permitió recopilar información sobre:
Actividad principal de la empresa.
Tipos de productos comercializados.
Cantidad aproximada de referencias.
Personal y funciones.
Proceso de recepción de mercadería.
Distribución hacia las sucursales.
Control de inventario.
Identificación de productos.
Registro de ventas.
Métodos de pago.
Reposición de productos.
Registro de compras.
Problemas actuales.
Necesidades de mejora.
La entrevista permitió identificar que Lidemoda necesita un método de control sencillo e intuitivo que facilite conocer cantidades disponibles, identificar productos y consultar mercadería entre sucursales.

## 6. Resultados de las entrevistas

A partir de la entrevista se obtuvieron las siguientes necesidades:

| Nº | Necesidad identificada | Evidencia obtenida |
| --- | --- | --- |
| N-01 | Controlar las cantidades disponibles. | El control actual depende principalmente de las encargadas de cada sucursal. |
| N-02 | Registrar detalladamente la mercadería recibida. | No existe un registro completo por producto, código, cantidad y sucursal. |
| N-03 | Identificar los productos de manera más organizada. | Actualmente se utilizan características visuales y organización física. |
| N-04 | Consultar disponibilidad entre sucursales. | Es difícil conocer rápidamente si un producto está disponible en otra tienda. |
| N-05 | Mejorar el proceso de recepción. | La recepción y organización de mercadería genera pérdida de tiempo. |
| N-06 | Relacionar ventas con inventario. | Las ventas se registran en un cuaderno y no están integradas con el inventario. |
| N-07 | Facilitar la reposición. | Se realizan conteos para identificar productos próximos a agotarse. |
| N-08 | Centralizar la información. | No existe un sistema centralizado para las cinco sucursales. |
| N-09 | Contar con información actualizada. | Los procedimientos manuales dificultan conocer las cantidades reales. |
| N-10 | Contar con un sistema sencillo e intuitivo. | Esta fue identificada como una de las principales necesidades de la empresa. |


La entrevista también permitió identificar que los productos de maquillaje y cosmética presentan una necesidad de reposición frecuente debido a su consumo y rotación.

## 7. Reglas de negocio (IS-01 §15)

Las siguientes reglas de negocio norman el comportamiento operativo del sistema y deben respetarse estrictamente a nivel de software y base de datos:

| Código | Regla de negocio | Descripción formal |
| :--- | :--- | :--- |
| **RN-01** | **Bloqueo transaccional contra sobreventa** | Una venta únicamente podrá confirmarse si la cantidad solicitada es menor o igual al stock disponible en la sucursal activa. Queda estrictamente prohibido el stock negativo en la base de datos. |
| **RN-02** | **Asignación de sucursal por sesión** | Toda consulta rápida de existencias y registro de venta opera por defecto sobre la sucursal física a la que el usuario autenticado está vinculado en su turno de trabajo. |
| **RN-03** | **Confirmación obligatoria en operaciones por voz** | Ninguna operación interpretada mediante inteligencia artificial (voz) impactará la base de datos sin una previsualización previa y confirmación humana obligatoria en pantalla (salvaguarda RNF-05). |
| **RN-04** | **Trazabilidad de transferencias en dos pasos** | Todo traslado de mercadería entre el almacén y una sucursal requiere dos fases formales: estado `En tránsito` (al despachar desde almacén) y estado `Recibido` (al confirmarse físicamente en tienda). El stock en la sucursal solo se incrementa tras la confirmación de recepción. |
| **RN-05** | **Exclusión de IA en cálculos deterministas** | Las operaciones aritméticas (totales a cobrar, descuentos de stock, conteo de existencias) deben resolverse mediante lógica determinista en PostgreSQL; los modelos de IA se limitan a procesamiento de lenguaje natural. |
| **RN-06** | **Restricción de contexto para el asistente IA** | El asistente inteligente responde consultas sobre resúmenes de datos previamente agregados; no procesa escrituras directas ni expone costos de importación de contenedores. |

## 8. Requisitos funcionales

Los requisitos se derivan directamente de las necesidades identificadas en el levantamiento (N-01 a N-10) y del contexto organizacional de Lidemoda (5 sucursales, ~2.000 referencias y roles de personal). Se estructuran por módulos funcionales y se clasifican por versión de entrega en el Product Backlog.

### Módulo A: Gestión de Catálogo y Productos (N-02, N-03)
| Código | Requisito funcional | Versión |
| --- | --- | --- |
| RF-01 | El sistema deberá permitir el registro de productos en el catálogo central con: nombre, código único (SKU/barra), categoría (accesorios, belleza, regalos, hogar, novedades), precio de venta y descripción. | v1 (Iteración 1) |
| RF-02 | El sistema deberá permitir la edición y actualización de la información básica de los productos (precios, descripciones y categorías). | v1 (Iteración 1) |
| RF-03 | El sistema deberá permitir la búsqueda y filtrado de productos en el catálogo por nombre, código o categoría. | v1 (Iteración 1) |
| RF-04 | El sistema deberá permitir la identificación rápida de productos mediante lectura óptica de código de barras/QR utilizando la cámara del dispositivo móvil de forma nativa (sin consumo de IA). | v1 (Iteración 1) |

### Módulo B: Recepción, Distribución y Movimientos de Mercadería (N-01, N-02, N-05, N-08)
| Código | Requisito funcional | Versión |
| --- | --- | --- |
| RF-05 | El sistema deberá permitir registrar la recepción de mercadería entrante en el almacén/depósito central, detallando cajas recibidas y desglose de cantidades por producto. | v1 (Iteración 1) |
| RF-06 | El sistema deberá permitir generar órdenes de despacho y distribución de mercadería desde el almacén central hacia cualquiera de las 5 sucursales. | v1 (Iteración 1) |
| RF-07 | El sistema deberá permitir registrar la confirmación de recepción en la sucursal de destino, verificando las cantidades físicas recibidas contra la orden de despacho. | v1 (Iteración 1) |
| RF-08 | El sistema deberá permitir registrar transferencias directas de productos entre sucursales para rebalanceo de mercadería. | v2 (Iteración posterior) |
| RF-09 | El sistema deberá permitir registrar salidas de inventario por mermas, productos dañados o roturas en tienda con su respectiva justificación. | v2 (Iteración posterior) |

### Módulo C: Control de Inventario y Disponibilidad Multi-Sucursal (N-01, N-04, N-08, N-09)
| Código | Requisito funcional | Versión |
| --- | --- | --- |
| RF-10 | El sistema deberá permitir consultar en tiempo real las existencias disponibles de cada producto en la sucursal activa del usuario. | v1 (Iteración 1) |
| RF-11 | El sistema deberá permitir la consulta inter-sucursal de disponibilidad de productos en cualquiera de las otras 4 sucursales de la cadena en La Paz y El Alto. | v1 (Iteración 1) |
| RF-12 | El sistema deberá registrar y mostrar el historial de movimientos de inventario por producto y sucursal (kardex operativo de entradas, salidas y ventas). | v2 (Iteración posterior) |

### Módulo D: Registro de Ventas y Punto de Venta (N-06, N-09)
| Código | Requisito funcional | Versión |
| --- | --- | --- |
| RF-13 | El sistema deberá permitir crear órdenes/tickets de venta, agregando productos por catálogo o código, indicando cantidades y calculando el total de la compra. | v1 (Iteración 1) |
| RF-14 | El sistema deberá ejecutar el descuento transaccional e inmediato de stock en la sucursal donde se realiza la venta, impidiendo ventas de productos sin stock suficiente. | v1 (Iteración 1) |
| RF-15 | El sistema deberá permitir registrar el método de pago utilizado en la venta (efectivo, código QR simple o transferencia bancaria). | v1 (Iteración 1) |
| RF-16 | El sistema deberá permitir consultar el listado y resumen de ventas efectuadas en la jornada/turno de trabajo por sucursal. | v1 (Iteración 1) |
| RF-17 | El sistema deberá permitir la anulación justificada de ventas registradas por error, reintegrando automáticamente el stock a la sucursal correspondiente. | v2 (Iteración posterior) |

### Módulo E: Asistencia por Inteligencia Artificial — Voz y Lenguaje Natural (N-10, Propuesta de Innovación)
| Código | Requisito funcional | Versión |
| --- | --- | --- |
| RF-18 | El sistema deberá capturar dictados por voz directamente en el dispositivo móvil mediante reconocimiento de voz en el dispositivo (on-device STT). | v1 (Iteración 1) |
| RF-19 | El sistema deberá interpretar mediante un modelo de lenguaje (IA) el comando de voz del usuario para extraer automáticamente el producto y la cantidad a vender. | v1 (Iteración 1) |
| RF-20 | El sistema deberá mostrar una pantalla de previsualización y confirmación obligatoria al usuario antes de asentar cualquier venta u operación dictada por voz. | v1 (Iteración 1) |
| RF-21 | El sistema deberá contar con un asistente inteligente para responder consultas en lenguaje natural sobre disponibilidad y ubicación de stock en las sucursales. | v1 (Iteración 1) |
| RF-22 | El sistema deberá permitir consultar mediante lenguaje natural el resumen de ventas y artículos más vendidos en el turno/día en la sucursal. | v1 (Iteración 1) |

### Módulo F: Autenticación, Roles y Seguridad Organizacional (Sección 3: Contexto Organizacional, RNF-03)
| Código | Requisito funcional | Versión |
| --- | --- | --- |
| RF-23 | El sistema deberá autenticar usuarios de manera segura, vinculando cada cuenta a una sucursal base o al almacén central. | v1 (Iteración 1) |
| RF-24 | El sistema deberá restringir accesos y acciones según el rol del colaborador (Asesora de venta, Cajera, Reponedora, Almacén, Marketing, Administrador). | v1 (Iteración 1) |

### Módulo G: Visión Artificial y Analítica Predictiva (Innovación para Iteraciones Posteriores)
| Código | Requisito funcional | Versión |
| --- | --- | --- |
| RF-25 | El sistema deberá permitir identificar productos sin código de barras legible mediante visión artificial multimodal (Gemini Flash) a partir de una fotografía capturada con la cámara del móvil. | v2 (Iteración posterior) |
| RF-26 | El sistema deberá analizar el comportamiento de inventario y ventas para clasificar productos de alta rotación (especialmente maquillaje/cosmética) y baja rotación. | v2 (Iteración posterior) |
| RF-27 | El sistema deberá generar alertas preventivas de reposición cuando el stock de un producto en sucursal alcance el umbral mínimo configurado. | v2 (Iteración posterior) |
| RF-28 | El sistema deberá permitir al equipo de marketing realizar consultas en lenguaje natural sobre tendencias de rotación de productos por sucursal. | v2 (Iteración posterior) |

---

**Matriz de Trazabilidad: Necesidades vs Requisitos**

| Necesidad identificada | Requisitos que la solucionan |
| --- | --- |
| N-01: Controlar cantidades | RF-01, RF-02, RF-10, RF-11, RF-14, RF-27 |
| N-02: Registrar mercadería | RF-01, RF-04, RF-05, RF-06, RF-07 |
| N-03: Identificar productos | RF-01, RF-03, RF-04, RF-25 (v2) |
| N-04: Consultar otras sucursales | RF-10, RF-11, RF-21 |
| N-05: Mejorar recepción y distribución | RF-05, RF-06, RF-07, RF-08 |
| N-06: Relacionar ventas e inventario | RF-13, RF-14, RF-16, RF-17, RF-19 |
| N-07: Facilitar reposición | RF-10, RF-11, RF-26, RF-27 |
| N-08: Centralizar información | RF-01, RF-05, RF-06, RF-10, RF-11, RF-14, RF-23 |
| N-09: Información actualizada | RF-10, RF-11, RF-14, RF-16, RF-22 |
| N-10: Sistema sencillo e intuitivo | RF-04, RF-18, RF-19, RF-20, RF-21, RF-22 |

---

## 9. Requisitos no funcionales

| Código | Requisito no funcional | Criterio de aceptación |
| --- | --- | --- |
| RNF-01 | **Usabilidad:** Interfaz móvil sencilla, con flujos de registro de venta en no más de 3 pasos para no entorpecer la atención al cliente. | Tiempo de registro de venta manual < 20 segundos por operación. |
| RNF-02 | **Portabilidad:** La aplicación cliente debe operar de manera nativa y responsiva en dispositivos móviles Android e iOS. | Despliegue funcional en dispositivos móviles del personal. |
| RNF-03 | **Seguridad y Control de Acceso:** La información centralizada debe estar protegida mediante autenticación y Row Level Security (RLS) en base de datos. | Cada rol únicamente accede a los datos y operaciones autorizadas. |
| RNF-04 | **Consistencia Transaccional:** La actualización de stock por venta o transferencia debe ser atómica e inmediata. | Cero riesgo de inconsistencia o sobreventa por concurrencia. |
| RNF-05 | **Precisión de IA y Confirmación Obligatoria:** Toda acción interpretada mediante IA (voz o visión) debe someterse a confirmación humana antes de impactar los datos. | 100% de operaciones dictadas por voz requieren confirmación explícita del usuario. |
| RNF-06 | **Disponibilidad y Latencia:** Las consultas de disponibilidad entre sucursales y la respuesta del asistente no deben superar tiempos tolerables. | Tiempo de respuesta de consulta de stock < 1s; respuesta de IA < 3s. |

---

## 10. Planificación del Product Backlog (Priorización MoSCoW por Iteraciones)

Para garantizar un desarrollo ágil y entregas de valor tangibles, el Product Backlog se estructura en iteraciones priorizadas:

### Iteración 1: MVP v1 (Presentación Funcional al Cliente) — *Must Have*
Esta iteración resuelve el problema central (registro manual y falta de centralización) y valida la propuesta de valor diferencial con IA (voz y asistente):
- **Catálogo y Escaneo Básico:** RF-01, RF-02, RF-03, RF-04 (escáner nativo de barras/QR).
- **Flujo de Mercadería Esencial:** RF-05 (recepción almacén), RF-06 (despacho), RF-07 (confirmación recepción en tienda).
- **Inventario y Disponibilidad:** RF-10 (stock local), RF-11 (consulta entre las 5 sucursales).
- **Punto de Venta Transaccional:** RF-13 (ticket de venta), RF-14 (descuento atómico de stock), RF-15 (método de pago), RF-16 (resumen de ventas del día).
- **Asistencia IA (Voz y Asistente Natural):** RF-18 (dictado local), RF-19 (interpretación de venta por IA), RF-20 (confirmación de venta por voz), RF-21 (consulta de stock en lenguaje natural), RF-22 (consulta de ventas en lenguaje natural).
- **Seguridad:** RF-23 (autenticación), RF-24 (roles de usuario y sucursal).

### Iteración 2: v2 (Consolidación Operativa y Visión Artificial) — *Should Have & Could Have*
- **Transferencias y Mermas:** RF-08 (transferencias directas entre sucursales), RF-09 (registro de roturas/mermas justificadas).
- **Auditoría:** RF-12 (kardex/historial de movimientos de stock), RF-17 (anulación de ventas con reversión).
- **Visión Artificial Multimodal:** RF-25 (reconocimiento de producto sin código mediante foto con Gemini Flash).
- **Analítica de Rotación y Reposición:** RF-26 (análisis de rotación en cosmética/maquillaje), RF-27 (alertas preventivas de bajo stock), RF-28 (consultas de tendencias para marketing).

---

## 11. Requisitos Excluidos del Product Backlog (Won't Have / Futuro Lejano)

Los siguientes requerimientos representan una complejidad técnica, legal o administrativa excesiva para los objetivos del proyecto y quedan formalmente excluidos del Product Backlog actual:

| Código | Funcionalidad / Requisito descartado | Motivo de exclusión |
| --- | --- | --- |
| WH-01 | **Integración con Facturación Electrónica en Línea (SIAT):** Conexión con el Servicio de Impuestos Nacionales de Bolivia para firma digital y emisión fiscal de facturas. | Complejidad regulatoria, normativa y de certificados tributarios que desvía el foco del control de inventario y ventas. Se contemplará en un horizonte futuro si la empresa lo formaliza. |
| WH-02 | **Cierre y Arqueo Contable Avanzado:** Conciliación bancaria automática y cuadre contable multinivel por cajero. | No es necesario para el objetivo de trazabilidad física y control de stock de las tiendas. |
| WH-03 | **Gestión de Compras y Proveedores Internacionales:** Registro de cotizaciones internacionales, órdenes de compra de importación y seguimiento aduanero de contenedores. | La recepción actual se maneja a nivel de recepción de cajas en almacén; la logística internacional excede el alcance del sistema en tienda. |
| WH-04 | **Gestión Avanzada de Clientes y Fidelización (CRM):** Acumulación de puntos, historial crediticio de clientes o campañas automatizadas. | La prioridad en el punto de venta de Lidemoda es la rapidez en el mostrador para asesoras y cajeras. |
| WH-05 | **Integración con ERPs Administrativos Externos:** Sincronización en tiempo real con SAP, Odoo u otros sistemas contables externos. | Inviable e innecesario dado el estado actual de madurez tecnológica de la cadena. |

---

## 12. Historias de Usuario (HU) del MVP v1 (Cobertura Completa de los 20 RFs) (IS-01 §19)

Para garantizar un estándar riguroso de ingeniería de software y cumplir con la entrega funcional del MVP en **12 horas**, los **20 Requisitos Funcionales priorizados para la V1** se desglosan formalmente en **10 Historias de Usuario estructuradas en 5 Épicas**. Cada historia cuenta con criterios de aceptación comprobables bajo el formato `Dado / Cuando / Entonces` y trazabilidad vertical:

---

### Épica 1: Seguridad y Control Organizacional

#### `HU-01` — Inicio de sesión y asignación de sucursal
- **Rol:** Colaboradora de Lidemoda (`ACT-01` a `ACT-06`).
- **Como:** Colaboradora de Lidemoda (Asesora, Cajera, Reponedora, Almacén, Encargada, Administrador).
- **Quiero:** Iniciar sesión con mi correo electrónico y contraseña para que el sistema identifique mi rol y mi sucursal asignada.
- **Para:** Acceder únicamente a las funciones autorizadas para mi puesto y operar directamente sobre el inventario de mi tienda (`RN-02`).
- **Criterios de Aceptación:**
  1. **Dado** un usuario registrado con credenciales válidas, **cuando** presiona "Iniciar Sesión", **entonces** el sistema autentica contra Supabase Auth, carga el token de sesión y fija en el estado global el `rol` y el `sucursal_id` correspondiente.
  2. **Dado** un colaborador asignado a la "Sucursal El Alto", **cuando** ingresa a la aplicación, **entonces** todas las operaciones de consulta rápida y venta toman por defecto dicha sucursal sin requerir selección manual en cada pantalla.
  3. **Dado** un intento de acceso con credenciales inválidas, **cuando** el servicio rechaza la autenticación, **entonces** el sistema presenta un mensaje de error claro y no permite el ingreso a ninguna vista operativa.
- **Trazabilidad:** Resuelve `N-08`, `N-10`. Requisitos cubiertos: `RF-23`, `RF-24`. Regla: `RN-02`.

---

### Épica 2: Catálogo Centralizado de Productos

#### `HU-02` — Registro y actualización de productos en catálogo
- **Rol:** Personal de almacén central (`ACT-04`) o Administrador (`ACT-06`).
- **Como:** Encargado de la administración de mercadería.
- **Quiero:** Registrar nuevos productos con código único (SKU/barra), nombre, categoría, precio y descripción, o editar información existente.
- **Para:** Mantener un catálogo unificado, evitar duplicidad y asegurar que las 5 sucursales compartan la misma información de precios y productos.
- **Criterios de Aceptación:**
  1. **Dado** el formulario de nuevo producto con campos obligatorios completos (código, nombre, categoría, precio), **cuando** se presiona "Guardar Producto", **entonces** se inserta en la base central y queda inmediatamente visible en el catálogo de todas las sucursales.
  2. **Dado** que se intenta registrar un código de barras ya existente en el catálogo, **cuando** se valida el formulario, **entonces** el sistema rechaza la inserción informando que el código ya pertenece a otro producto.
  3. **Dado** un producto registrado, **cuando** un usuario autorizado modifica su precio o descripción y guarda, **entonces** los cambios se actualizan en tiempo real para todas las tiendas.
- **Trazabilidad:** Resuelve `N-02`, `N-03`, `N-08`. Requisitos cubiertos: `RF-01`, `RF-02`.

#### `HU-03` — Búsqueda en catálogo y lectura óptica de código de barras
- **Rol:** Asesora de venta (`ACT-01`) o Cajera (`ACT-02`).
- **Como:** Personal de atención en mostrador.
- **Quiero:** Buscar productos por texto (nombre, código o categoría) o escanear su código físico de barras con la cámara del dispositivo móvil.
- **Para:** Identificar rápidamente cualquier artículo sin errores de tipeo ni demoras en la atención al cliente.
- **Criterios de Aceptación:**
  1. **Dado** que el usuario escribe un término de búsqueda en el catálogo, **cuando** ingresa al menos 2 caracteres, **entonces** el sistema filtra y presenta los productos coincidentes en menos de 500 ms.
  2. **Dado** que el usuario activa el escáner y enfoca la cámara sobre un código de barras o QR físico, **cuando** la cámara lo detecta, **entonces** la librería nativa (`expo-camera`) resuelve el código y abre la ficha del producto en menos de 1 segundo sin consumir servicios de IA.
  3. **Dado** un código escaneado que no existe en la base de datos, **cuando** se procesa la lectura, **entonces** el sistema notifica "Producto no encontrado en catálogo" ofreciendo la opción de reintentar.
- **Trazabilidad:** Resuelve `N-03`, `N-10`. Requisitos cubiertos: `RF-03`, `RF-04`.

---

### Épica 3: Inventario y Logística Multi-Sucursal

#### `HU-04` — Consulta de stock consolidado e inter-sucursal
- **Rol:** Asesora de venta en mostrador (`ACT-01`) o Encargada (`ACT-05`).
- **Como:** Asesora de venta orientando a un cliente en tienda.
- **Quiero:** Consultar las existencias de un producto tanto en mi sucursal como en las otras 4 sucursales de la cadena en La Paz y El Alto.
- **Para:** Confirmar de inmediato si podemos despacharlo en la tienda o indicar al cliente en qué sucursal cercana puede adquirirlo.
- **Criterios de Aceptación:**
  1. **Dado** un producto seleccionado, **cuando** el usuario accede a la vista de inventario, **entonces** el sistema muestra una lista con el stock disponible desglosado por cada una de las 5 sucursales con latencia < 1 segundo.
  2. **Dado** que el stock en una sucursal es igual a cero, **cuando** se despliega la disponibilidad, **entonces** esa tienda se etiqueta visualmente como "Sin existencias" sin afectar la visualización de las tiendas con stock positivo.
- **Trazabilidad:** Resuelve `N-01`, `N-04`, `N-08`, `N-09`. Requisitos cubiertos: `RF-10`, `RF-11`. Regla: `RN-02`.

#### `HU-05` — Despacho y confirmación de mercadería entre almacén y sucursales
- **Rol:** Personal de almacén central (`ACT-04`) y Encargada de sucursal (`ACT-05`).
- **Como:** Operadores del flujo logístico.
- **Quiero:** Registrar el ingreso por cajas en el depósito central, emitir órdenes de despacho y confirmar la recepción física en la tienda destino.
- **Para:** Eliminar el conteo manual informal y garantizar trazabilidad en dos pasos (`En tránsito` → `Recibido`, `RN-04`).
- **Criterios de Aceptación:**
  1. **Dado** un lote recibido en almacén, **cuando** el operador registra la entrada indicando producto y cantidad, **entonces** el stock del depósito central se incrementa inmediatamente.
  2. **Dado** que almacén despacha mercadería a una sucursal, **cuando** se emite la orden de traslado, **entonces** los productos se descuentan de almacén y quedan registrados en estado `En tránsito` (`RN-04`).
  3. **Dado** que las cajas llegan físicamente a la tienda, **cuando** la encargada confirma la recepción de los productos, **entonces** la orden cambia a estado `Recibido` y el stock se suma al inventario disponible de esa sucursal.
- **Trazabilidad:** Resuelve `N-02`, `N-05`, `N-08`. Requisitos cubiertos: `RF-05`, `RF-06`, `RF-07`. Regla: `RN-04`.

---

### Épica 4: Punto de Venta (POS) y Caja

#### `HU-06` — Registro de venta transaccional en mostrador
- **Rol:** Cajera (`ACT-02`) o Asesora (`ACT-01`).
- **Como:** Cajera cobrando a un cliente en el mostrador.
- **Quiero:** Armar el ticket de venta, registrar el método de pago (efectivo, código QR o transferencia) y procesar el cobro.
- **Para:** Entregar la compra con rapidez y que el stock de mi sucursal se descuente de forma atómica e inmediata sin descuadres.
- **Criterios de Aceptación:**
  1. **Dado** un ticket de venta con productos y cantidades agregadas, **cuando** el usuario selecciona el método de pago y confirma la venta, **entonces** se ejecuta una función transaccional RPC (`registrar_venta`) en PostgreSQL que genera el registro de venta, su detalle y descuenta el stock de la sucursal emisora.
  2. **Dado** un producto con stock insuficiente en la sucursal, **cuando** se intenta procesar la venta, **entonces** la función RPC aborta la transacción, rechaza la operación y notifica "Stock insuficiente", impidiendo stock negativo (`RN-01`).
  3. **Dado** que la venta se completa exitosamente, **cuando** finaliza la transacción, **entonces** la pantalla muestra el resumen con número de venta y total cobrado, limpiando el ticket para la siguiente operación.
- **Trazabilidad:** Resuelve `N-06`, `N-09`. Requisitos cubiertos: `RF-13`, `RF-14`, `RF-15`. Regla: `RN-01`.

#### `HU-07` — Resumen de ventas y balance diario por sucursal
- **Rol:** Cajera (`ACT-02`) o Encargada de sucursal (`ACT-05`).
- **Como:** Responsable de caja al finalizar un turno o jornada.
- **Quiero:** Consultar el listado y monto acumulado de las ventas efectuadas durante el día en mi sucursal.
- **Para:** Cuadrar los ingresos por método de pago (efectivo vs QR/transferencias) y cerrar el turno sin discrepancias.
- **Criterios de Aceptación:**
  1. **Dado** que la cajera accede al módulo de resumen de ventas, **cuando** carga la vista, **entonces** el sistema presenta el total recaudado en el día y el desglose de ventas de la sucursal activa.
  2. **Dado** el listado de ventas del día, **cuando** se selecciona una venta específica, **entonces** se visualiza el detalle de productos vendidos, cantidades, hora y método de pago registrado.
- **Trazabilidad:** Resuelve `N-06`, `N-09`. Requisitos cubiertos: `RF-16`.

---

### Épica 5: Asistencia con Inteligencia Artificial (Core Diferencial)

#### `HU-08` — Registro de venta asistido por voz con confirmación obligatoria (Prioridad Alta)
- **Rol:** Asesora de venta (`ACT-01`) o Cajera (`ACT-02`).
- **Como:** Asesora en el mostrador atendiendo al cliente con las manos ocupadas.
- **Quiero:** Dictar una venta en lenguaje natural (ej. *"Vender dos delineadores negros y un labial mate"*) y previsualizarla antes de confirmarla.
- **Para:** Agilizar la carga de tickets sin perder contacto visual con el cliente y garantizando que ningún error de interpretación impacte la base de datos.
- **Criterios de Aceptación:**
  1. **Dado** que el usuario mantiene presionado el botón de micrófono y dicta la frase, **cuando** suelta el botón, **entonces** el componente on-device transcribe el audio y lo envía a la Edge Function de IA, la cual extrae los nombres de producto y cantidades en formato estructurado JSON.
  2. **Dado** que la IA interpreta la instrucción, **cuando** devuelve el resultado, **entonces** el sistema presenta **obligatoriamente una pantalla modal de confirmación previa** mostrando los productos y cantidades identificadas (`RN-03`, `RNF-05`).
  3. **Dado** que el usuario revisa la previsualización modal, **cuando** detecta que un producto o cantidad es erróneo, **entonces** puede editarlo manualmente en pantalla o cancelar la operación sin que se efectúe ningún descuento en inventario.
  4. **Dado** que el usuario confirma la orden en el modal, **cuando** presiona "Confirmar Venta", **entonces** el sistema transfiere los datos al flujo transaccional de venta estándar (`HU-06`).
- **Trazabilidad:** Resuelve `N-10`. Requisitos cubiertos: `RF-18`, `RF-19`, `RF-20`, `RF-14`. Regla: `RN-03`, `RN-05`.

#### `HU-09` — Asistente inteligente para consulta de stock en lenguaje natural (Prioridad Alta)
- **Rol:** Asesora de venta (`ACT-01`) o Encargada (`ACT-05`).
- **Como:** Colaboradora en sala de venta.
- **Quiero:** Preguntar al asistente inteligente en lenguaje natural sobre la existencia y ubicación de productos (ej. *"¿Dónde queda stock del set de brochas de maquillaje?"*).
- **Para:** Recibir una respuesta directa y precisa sin navegar por tablas ni tablas dinámicas (`RN-06`).
- **Criterios de Aceptación:**
  1. **Dado** que el usuario formula una pregunta sobre disponibilidad mediante texto o voz, **cuando** la consulta se envía a la Edge Function, **entonces** el backend consulta el stock consolidado y el modelo de IA redacta una respuesta concisa indicando las sucursales con unidades disponibles.
  2. **Dado** que el producto consultado está agotado en toda la cadena, **cuando** la IA procesa la respuesta, **entonces** responde expresamente que no existen existencias en ninguna de las 5 sucursales.
  3. **Dado** que el usuario realiza una consulta fuera de tema, **cuando** el asistente responde, **entonces** aclara amablemente que solo puede responder sobre inventarios y ventas de Lidemoda.
- **Trazabilidad:** Resuelve `N-04`, `N-08`, `N-10`. Requisitos cubiertos: `RF-21`. Regla: `RN-05`, `RN-06`.

#### `HU-10` — Asistente inteligente para resumen comercial de ventas (Prioridad Alta)
- **Rol:** Encargada de sucursal (`ACT-05`) o Gerencia (`ACT-06`).
- **Como:** Responsable de tienda o administradora.
- **Quiero:** Preguntar al asistente inteligente *"¿Cuánto se vendió hoy en esta sucursal y qué productos salieron más?"*.
- **Para:** Obtener métricas instantáneas de la jornada comercial sin generar reportes manuales.
- **Criterios de Aceptación:**
  1. **Dado** que la encargada consulta el desempeño del día, **cuando** el asistente procesa la pregunta, **entonces** la Edge Function agrega las ventas de la jornada de esa sucursal y la IA devuelve el total facturado y los artículos más vendidos.
  2. **Dado** que no se han registrado ventas en la jornada, **cuando** se procesa la consulta, **entonces** el asistente informa cordialmente que aún no existen transacciones asentadas en el turno actual.
- **Trazabilidad:** Resuelve `N-06`, `N-09`, `N-10`. Requisitos cubiertos: `RF-22`. Regla: `RN-05`, `RN-06`.

---

## 13. Matriz de Trazabilidad Vertical Completa (20 RFs → 10 HUs) (IS-01 §20)

Esta matriz demuestra el alineamiento 1 a 1 de toda la ingeniería del MVP v1, asegurando que ningún requisito funcional quede desprovisto de especificación de usuario, regla de negocio ni verificación:

| Necesidad Origen | Requisito Funcional (RF) | Nombre del Requisito | Historia de Usuario | Regla de Negocio | Componente Técnico / Vista | Criterio de Verificación |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **N-02, N-08** | `RF-01` | Registro de productos en catálogo | `HU-02` | — | UI `registrar-producto.tsx` / Tabla `producto` | Inserción exitosa con SKU/código único |
| **N-02, N-03** | `RF-02` | Edición y actualización de productos | `HU-02` | — | UI `registrar-producto.tsx` / Tabla `producto` | Actualización de precio/nombre reflejada en catálogo |
| **N-03, N-10** | `RF-03` | Búsqueda y filtrado en catálogo | `HU-03` | — | UI `productos.tsx` | Búsqueda por texto con filtrado en < 500 ms |
| **N-03, N-10** | `RF-04` | Lectura óptica de código de barras/QR | `HU-03` | — | UI `escanear.tsx` (`expo-camera`) | Detección de código nativa en < 1s sin IA |
| **N-02, N-05** | `RF-05` | Recepción de mercadería en almacén | `HU-05` | `RN-04` | UI `movimientos.tsx` / Tabla `movimiento` | Incremento de stock en almacén por cajas recibidas |
| **N-05, N-08** | `RF-06` | Despacho hacia sucursales | `HU-05` | `RN-04` | UI `movimientos.tsx` / Estado `En tránsito` | Descuento en almacén y orden "En tránsito" |
| **N-05, N-09** | `RF-07` | Confirmación de recepción en tienda | `HU-05` | `RN-04` | UI `movimientos.tsx` / Estado `Recibido` | Cambio a "Recibido" e incremento de stock en tienda |
| **N-01, N-09** | `RF-10` | Consulta de stock en sucursal local | `HU-04` | `RN-02` | UI `inventario.tsx` / Tabla `inventario` | Despliegue de existencias de la sucursal activa |
| **N-04, N-08** | `RF-11` | Consulta de stock inter-sucursal | `HU-04` | `RN-02` | UI `inventario.tsx` / Supabase RPC | Desglose de existencias en las 5 tiendas en tiempo real |
| **N-06, N-09** | `RF-13` | Creación de ticket de venta (POS) | `HU-06` | — | UI `nueva-venta.tsx` | Agregación de ítems y cálculo de total de compra |
| **N-01, N-06** | `RF-14` | Descuento atómico transaccional de stock | `HU-06`, `HU-08` | `RN-01` | Supabase RPC `registrar_venta` (PostgreSQL) | Descuento atómico; bloqueo estricto si stock insuficiente |
| **N-06, N-09** | `RF-15` | Registro del método de pago | `HU-06` | — | UI `nueva-venta.tsx` / Tabla `venta` | Asignación de pago (efectivo, QR, transferencia) |
| **N-06, N-09** | `RF-16` | Consulta de resumen de ventas del día | `HU-07` | — | UI `nueva-venta.tsx` / Vista resumen | Total facturado y listado de transacciones de la jornada |
| **N-10** | `RF-18` | Captura de dictado por voz on-device | `HU-08` | — | `expo-speech-recognition` / `registro-voz.tsx` | Transcripción en el móvil sin enviar audio crudo |
| **N-10** | `RF-19` | Interpretación estructurada con IA | `HU-08` | `RN-05` | Supabase Edge Function (Groq/Gemini) | Extracción de productos y cantidades en formato JSON |
| **N-10** | `RF-20` | Confirmación obligatoria de venta por voz | `HU-08` | `RN-03`, `RN-05` | Modal de confirmación en `registro-voz.tsx` | Previsualización y validación manual antes de persistir |
| **N-04, N-10** | `RF-21` | Asistente inteligente (consulta de stock) | `HU-09` | `RN-05`, `RN-06` | Chat Asistente / Edge Function IA | Respuesta en lenguaje natural de tiendas con stock en < 3s |
| **N-06, N-10** | `RF-22` | Asistente inteligente (resumen de ventas) | `HU-10` | `RN-05`, `RN-06` | Chat Asistente / Edge Function IA | Respuesta en lenguaje natural con métricas de ventas del día |
| **N-08** | `RF-23` | Autenticación segura de usuarios | `HU-01` | `RN-02` | Supabase Auth (JWT) / Tabla `perfil_usuario` | Login seguro y vinculación a `sucursal_id` |
| **N-08, N-10** | `RF-24` | Control de acceso basado en roles | `HU-01` | `RN-02` | Row Level Security (RLS) en PostgreSQL | Políticas por rol (`asesora`, `cajera`, `almacen`, `admin`) |

---

## 14. Estado de Implementación, Línea Base y Scope Triaging (12 Horas) (IS-01 §31, §32)

A partir del prototipo desarrollado previamente y auditado en la línea base de la aplicación, el estado de los requisitos y la estrategia de corte para la entrega en **12 horas** se formaliza de la siguiente manera:

### Matriz de Estado de Requisitos (Línea Base vs MVP Final)

| Requisito | Estado Línea Base | Alcance en Timebox (12h) | Tratamiento / Acción de Ingeniería |
| :--- | :--- | :--- | :--- |
| **RF-01** Registrar productos y asignar sucursal | Cumplido | **Incluido** | Mapear catálogo a PostgreSQL de Supabase. |
| **RF-02** Consultar disponibilidad por sucursal | Cumplido | **Incluido (HU-01)** | Vista consolidada multi-sucursal en tiempo real. |
| **RF-03** Registrar entradas, salidas y transferencias | Cumplido | **Incluido (HU-05)** | Consolidar flujo almacén → tienda en dos pasos (`RN-04`). |
| **RF-04** Registrar ventas y actualizar stock | Cumplido | **Incluido (HU-02)** | Asegurar transaccionalidad atómica vía RPC para evitar sobreventa. |
| **RF-05** Identificar productos mediante cámara | Parcial (Código de barras y QR) | **Incluido (HU-02)** | Mantener escaneo nativo con `expo-camera`. Visión IA se difiere a v2. |
| **RF-06** Registrar operaciones mediante voz | Preparado (Frontend listo) | **Incluido (HU-03) — ALTA PRIORIDAD** | Conectar dictado on-device con Edge Function de IA y pantalla de confirmación. |
| **RF-07** Asistente inteligente | Pendiente | **Incluido (HU-04) — ALTA PRIORIDAD** | Implementar Edge Function con prompt estructurado y contexto SQL acotado. |
| **RF-08** Análisis de rotación y agotamiento | Pendiente | **Postergado a v2** | Requiere histórico de ventas; se difiere formalmente sin comprometer el MVP. |
| **RF-09** Alertas y recomendaciones preventivas | Pendiente | **Postergado a v2** | Se difiere formalmente para una segunda iteración analítica. |

### Justificación Técnica del Corte (Scope Triaging)
Con este corte de alcance, el equipo garantiza un **MVP robusto y funcional al 100% en menos de 12 horas**, manteniendo intacto el factor innovador exigido por el proyecto: **la interacción asistida por Voz y el Asistente en lenguaje natural**, sobre una base transaccional sólida en Supabase que erradica por completo los cuadernos manuales en las 5 sucursales de Lidemoda.

---

## 15. Conclusión y Hoja de Ruta

El Product Backlog queda firmemente fundamentado en la realidad de Lidemoda:
1. **En el Sprint Review del MVP v1:** Se presentará el flujo completo operativo: registro/escaneo de producto → recepción y distribución centralizada → consulta de disponibilidad multi-sucursal en tiempo real → venta transaccional en mostrador → operaciones asistidas por voz (RF-18/19/20) y consultas gerenciales/operativas en lenguaje natural (RF-21/22).
2. **En la Iteración v2:** Se incorporará la visión artificial por cámara con Gemini Flash para productos sin etiqueta (RF-25) y la analítica de rotación/reposición (RF-26/27).
3. **Exclusiones claras:** La complejidad del SIAT y contabilidad tributaria queda descartada para salvaguardar la entrega exitosa del proyecto.
