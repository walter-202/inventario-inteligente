# Plantilla Maestra IS-01

## Informe Formal de Ingeniería de Software

**Propósito:** documentar de forma profesional el levantamiento, definición, diseño, avance y validación de un proyecto de software para presentación a cliente, universidad, dirección o equipo técnico.

La plantilla debe servir tanto para:

* proyectos que comienzan desde cero;
* proyectos que ya tienen desarrollo;
* presentación de una V1/MVP;
* informes de avance;
* cierre de una versión;
* especificaciones de requisitos;
* documentación académica de Ingeniería de Software.

---

# 1. Configuración general del documento

| Elemento         | Estándar                                        |
| ---------------- | ----------------------------------------------- |
| Tamaño           | Carta o A4 según institución                    |
| Márgenes         | 2.5 cm aproximadamente                          |
| Fuente principal | Aptos o Calibri                                 |
| Texto            | 10.5–11 pt                                      |
| Título principal | 20–24 pt                                        |
| H1               | 16–18 pt                                        |
| H2               | 13–14 pt                                        |
| H3               | 11–12 pt                                        |
| Interlineado     | 1.15                                            |
| Alineación       | Justificada para cuerpo                         |
| Numeración       | Jerárquica: 1, 1.1, 1.1.1                       |
| Figuras          | Centradas y numeradas                           |
| Tablas           | Numeradas y tituladas                           |
| Colores          | Azul/gris oscuro + un color secundario discreto |
| Pie de página    | Proyecto · versión · página                     |
| Encabezado       | Nombre abreviado del sistema                    |
| Idioma           | Formal, técnico y comprensible                  |
| Diagramas        | UML cuando corresponda                          |

No conviene saturarlo con colores. El documento debe parecer **ingeniería**, no una presentación comercial.

---

# 2. Portada

Formato base:

> **[UNIVERSIDAD / EMPRESA / ORGANIZACIÓN]**
>
> **INFORME DE INGENIERÍA DE SOFTWARE**
>
> **[Nombre oficial del proyecto]**
>
> **[Tipo de documento o versión]**
>
> Primera versión funcional V1.0 / MVP / Informe de avance / Especificación de requisitos
>
> Cliente: [Nombre]
> Equipo: [Integrantes]
> Docente / Responsable: [Nombre]
> Fecha: [Fecha]
> Ciudad: [Ciudad]

Puede incluir una imagen conceptual discreta relacionada con el proyecto.

---

# 3. Control del documento

Esta sección debe ir inmediatamente después de la portada.

## 3.1 Información general

| Campo       | Contenido                         |
| ----------- | --------------------------------- |
| Proyecto    | [Nombre]                          |
| Código      | [PROY-001]                        |
| Documento   | Informe de Ingeniería de Software |
| Versión     | 1.0                               |
| Estado      | Borrador / Revisión / Aprobado    |
| Fecha       | dd/mm/aaaa                        |
| Responsable | [Nombre]                          |
| Cliente     | [Cliente]                         |

## 3.2 Control de versiones

| Versión | Fecha | Responsable | Descripción del cambio |
| ------- | ----- | ----------- | ---------------------- |
| 0.1     |       |             | Documento inicial      |
| 0.2     |       |             | Ajustes de requisitos  |
| 1.0     |       |             | Versión aprobada       |

Esto es especialmente útil cuando el informe se actualiza a medida que avanza el proyecto.

---

# 4. Índice

Debe utilizarse un **índice automático de Word**, basado en Heading 1, Heading 2 y Heading 3.

También pueden existir, para documentos extensos:

**Índice de figuras**

**Índice de tablas**

---

# 5. Resumen ejecutivo

Máximo aproximadamente una página.

Debe responder:

**¿Qué es el proyecto?**

**¿Qué problema resuelve?**

**¿Quién lo utilizará?**

**¿Qué contempla la versión documentada?**

**¿Cuál es el estado general?**

No debe reemplazar el resto del informe.

Es un resumen ejecutivo, no una versión reducida del documento.

---

# 6. Identificación del proyecto

## 6.1 Nombre del sistema

**Nombre:** [Nombre]

**Versión:** [V1.0]

**Tipo:** Web / móvil / escritorio / API / híbrido.

## 6.2 Descripción general

Explicación desarrollada de qué hace la solución.

## 6.3 Público objetivo

Usuarios principales y contexto en el que utilizarán el sistema.

## 6.4 Stakeholders

| Stakeholder    | Rol         | Interés                  |
| -------------- | ----------- | ------------------------ |
| Cliente        | Propietario | Cumplimiento del alcance |
| Usuario final  | Operador    | Usabilidad               |
| Administrador  | Gestión     | Control                  |
| Equipo técnico | Desarrollo  | Implementación           |

---

# 7. Identificación del problema

Esta sección debe ser narrativa y desarrollada.

Formato recomendado:

## 7.1 Situación actual

¿Cómo se realiza actualmente el proceso?

## 7.2 Problemas identificados

Describir causas, no solo síntomas.

## 7.3 Consecuencias

Impacto sobre usuarios, procesos, costos, tiempo, seguridad, calidad de información, etc.

## 7.4 Necesidad identificada

Qué debería resolver una solución tecnológica.

No escribir solamente:

> “No existe un sistema.”

Debe explicarse **por qué la situación actual representa un problema**.

---

# 8. Antecedentes

Puede contener:

* funcionamiento anterior;
* herramientas actuales;
* entrevistas anteriores;
* soluciones existentes;
* intentos previos;
* procesos manuales;
* software utilizado actualmente;
* evolución de la necesidad.

En proyectos existentes también debe aparecer:

## 8.1 Antecedentes técnicos

Arquitectura inicial, tecnologías utilizadas y decisiones anteriores relevantes.

---

# 9. Justificación

Debe explicar el valor de desarrollar el sistema.

Puede analizar:

**Operativo:** mejora del proceso.

**Técnico:** centralización, automatización, seguridad.

**Económico:** reducción de costos o tiempo.

**Social:** mejora para usuarios/comunidad.

**Estratégico:** escalabilidad o nuevas posibilidades.

---

# 10. Objetivos

## 10.1 Objetivo general

Formato:

> Desarrollar/implementar/diseñar [sistema] que permita [resultado principal] para [usuarios/contexto].

## 10.2 Objetivos específicos

Preferiblemente entre 4 y 8.

Ejemplo:

> Centralizar la información de...
>
> Permitir...
>
> Registrar...
>
> Garantizar...
>
> Proporcionar...

---

# 11. Alcance

Una sección esencial.

## 11.1 Alcance funcional

Qué incluirá la versión.

## 11.2 Alcance técnico

Plataformas, integraciones, infraestructura, dispositivos, etc.

## 11.3 Alcance organizacional

Quiénes utilizarán el sistema.

## 11.4 Fuera de alcance

Debe diferenciarse de funciones futuras.

| Elemento  | Estado           |
| --------- | ---------------- |
| Función A | Incluida V1      |
| Función B | V1.1             |
| Función C | V2               |
| Función D | Fuera de alcance |

---

# 12. Técnicas de levantamiento

Aplicable especialmente a proyectos nuevos o académicos.

Puede incluir:

* entrevistas;
* observación;
* revisión documental;
* cuestionarios;
* talleres;
* análisis de procesos;
* prototipado.

Por cada técnica:

### Técnica

**Objetivo**

**Participantes**

**Procedimiento**

**Resultado obtenido**

---

# 13. Resultados del levantamiento

Aquí se documenta lo descubierto.

Ejemplo de estructura:

## 13.1 Necesidades principales

## 13.2 Prioridades

## 13.3 Restricciones

## 13.4 Hallazgos

## 13.5 Reglas de negocio

---

# 14. Actores del sistema

| Código | Actor         | Descripción          | Responsabilidades             |
| ------ | ------------- | -------------------- | ----------------------------- |
| ACT-01 | Visitante     | Usuario sin sesión   | Consultar información pública |
| ACT-02 | Usuario       | Usuario autenticado  | Utilizar funciones privadas   |
| ACT-03 | Administrador | Usuario privilegiado | Administrar sistema           |

Luego puede incorporarse un **diagrama general de actores/casos de uso**, pero este no reemplaza los diagramas individuales.

---

# 15. Reglas de negocio

Conviene separarlas de los RF.

Formato estándar:

### RN-01 — [Nombre]

**Descripción:**
[Regla]

**Origen:**
[Cliente / legislación / proceso]

**Aplica a:**
[CU / HU / módulo]

**Ejemplo:**
[Ejemplo práctico]

Ejemplo:

> **RN-04 — Publicación de rutas**
>
> Una ruta únicamente podrá aparecer en el catálogo público cuando su estado sea `published`.

---

# 16. Requisitos funcionales

Cada requisito debe tener un identificador único.

## Formato RF resumido

| ID    | Módulo | Requisito         | Prioridad | Estado   |
| ----- | ------ | ----------------- | --------- | -------- |
| RF-01 | Acceso | Registrar usuario | MUST      | Aprobado |

## Formato RF detallado

### RF-XX — [Nombre]

| Campo                  | Definición                                     |
| ---------------------- | ---------------------------------------------- |
| ID                     | RF-XX                                          |
| Nombre                 |                                                |
| Descripción            |                                                |
| Actor                  |                                                |
| Prioridad              | MUST / SHOULD / COULD                          |
| Fuente                 | Cliente / HU / entrevista                      |
| Caso de uso            | CU-XX                                          |
| Criterio de validación |                                                |
| Estado                 | Propuesto / Aprobado / Implementado / Validado |

### Regla de redacción

Un RF debe utilizar verbos claros:

> El sistema deberá permitir...

> El sistema deberá mostrar...

> El sistema deberá registrar...

> El sistema deberá validar...

Evitar:

> “El sistema será moderno.”

Eso corresponde a RNF/usabilidad.

---

# 17. Requisitos no funcionales

## Formato RNF

### RNF-XX — [Nombre]

| Campo                | Contenido                                             |
| -------------------- | ----------------------------------------------------- |
| ID                   | RNF-XX                                                |
| Categoría            | Seguridad / Rendimiento / Usabilidad / Disponibilidad |
| Descripción          |                                                       |
| Métrica / condición  |                                                       |
| Prioridad            | MUST / SHOULD / COULD                                 |
| Método de validación |                                                       |
| Estado               |                                                       |

Ejemplo:

### RNF-01 — Operación offline

**Categoría:** Disponibilidad

**Requisito:**

> Las funcionalidades previamente preparadas para uso offline deberán permanecer disponibles sin conectividad permanente.

**Validación:**

> Ejecutar el flujo con el dispositivo en modo avión.

---

# 18. Priorización

Por defecto puede utilizarse **MoSCoW**.

| Prioridad | Definición                             |
| --------- | -------------------------------------- |
| MUST      | Obligatorio para liberar la versión    |
| SHOULD    | Importante, pero no bloquea la versión |
| COULD     | Deseable                               |
| WON'T     | Fuera de la versión actual             |

Luego:

## 18.1 MUST

RF...

## 18.2 SHOULD

RF...

## 18.3 COULD

RF...

## 18.4 Postergados

RF...

---

# 19. Historias de usuario

Esta sección **no debe resumirse en una sola tabla** cuando el proyecto exige documentación formal.

Cada HU debe conservar:

### HU-XX — [Nombre]

**Rol:**
[Actor]

**Como:**
[Tipo de usuario]

**Quiero:**
[Funcionalidad]

**Para:**
[Beneficio]

### Criterios de aceptación

1. ...
2. ...
3. ...
4. ...

### Requisitos relacionados

RF-XX, RF-XX...

### Casos de uso relacionados

CU-XX...

### Reglas de negocio relacionadas

RN-XX...

### Tareas de implementación

Cuando el proyecto ya tenga avances:

| ID | Tarea                  | Área     | Estado     |
| -- | ---------------------- | -------- | ---------- |
| T1 | Crear interfaz         | Frontend | Finalizado |
| T2 | Implementar validación | Backend  | Finalizado |

### Evidencia

* captura;
* prueba;
* pantalla;
* endpoint;
* commit;
* etc.

---

# 20. Matriz de trazabilidad

Uno de los componentes más importantes.

Formato recomendado:

| HU    | RF    | CU    | RN    | Módulo   | Evidencia / prueba |
| ----- | ----- | ----- | ----- | -------- | ------------------ |
| HU-01 | RF-01 | CU-01 | RN-01 | Usuarios | PR-01              |
| HU-02 | RF-02 | CU-02 | —     | Auth     | PR-02              |

Para proyectos complejos puede ampliarse:

| Requisito | HU | CU | Componente | Tabla | API | Prueba |
| --------- | -- | -- | ---------- | ----- | --- | ------ |

Esto proporciona **trazabilidad vertical**:

> Necesidad → requisito → historia → caso de uso → implementación → prueba.

---

# 21. Casos de uso

Cada caso de uso tiene dos componentes:

**A. Especificación textual**

**B. Diagrama UML individual**

Nunca debe existir solamente un diagrama gigante como sustituto.

---

# 22. Formato maestro de especificación de Caso de Uso

### CU-XX — [Nombre]

| Campo                   | Contenido |
| ----------------------- | --------- |
| Código                  | CU-XX     |
| Nombre                  |           |
| Actor principal         |           |
| Actores secundarios     |           |
| Objetivo                |           |
| Requisitos relacionados | RF-XX     |
| Historias relacionadas  | HU-XX     |
| Precondiciones          |           |
| Disparador              |           |
| Postcondición           |           |

### Flujo principal

1. Actor...
2. Sistema...
3. Actor...
4. Sistema...

### Flujos alternativos

**FA-01 — [Nombre]**

1. ...
2. ...

### Excepciones

**EX-01 — Error ...**

### Reglas de negocio

RN-...

### Datos involucrados

Entidad A, Entidad B...

### Estado final

Resultado esperado.

---

# 23. Diagramas individuales de casos de uso

Debajo de **cada CU** debe ir su diagrama.

Ejemplo conceptual:

```text
Administrador
     |
     |
     v
( CU-11 Gestionar usuarios )
       /       |       \
      /        |        \
 <<include>> <<include>> <<extend>>
    /          |          \
Consultar   Validar     Bloquear
usuarios    permisos    usuario
```

Un diagrama individual debe representar:

* actor principal;
* actor secundario si aplica;
* límite del sistema;
* caso de uso principal;
* subcasos;
* `<<include>>`;
* `<<extend>>`;
* generalización, cuando realmente corresponda.

No debe reducirse a:

> Usuario → (Registrar usuario)

si el flujo real tiene más comportamiento relevante.

---

# 24. Diagramas de secuencia

Formato:

### DS-01 — CU-XX [Nombre]

Participantes típicos:

```text
Actor
UI
Controlador / Caso de uso
Servicio
Repositorio
Base de datos
Sistema externo
```

Debe representar:

* mensajes;
* respuestas;
* `alt`;
* `opt`;
* `loop`;
* errores relevantes.

Se recomienda elegir CU con interacción temporal significativa.

---

# 25. Diagramas de comunicación

Formato UML de colaboración.

Ejemplo:

```text
Usuario
   |
1: iniciar()
   |
 :UI -------- :Servicio
       1.1 validar()
           |
           +---------- :Repositorio
                       1.1.1 buscar()
```

Deben incluir:

* objetos;
* enlaces;
* mensajes numerados;
* secuencia jerárquica:

  * 1
  * 1.1
  * 1.1.1
  * 1.2

No utilizar líneas temporales verticales; eso corresponde al diagrama de secuencia.

---

# 26. Arquitectura del sistema

Debe incluir dos niveles.

## 26.1 Arquitectura conceptual

Ejemplo:

```text
Presentación
     ↓
Aplicación
     ↓
Dominio
     ↓
Infraestructura
     ↓
Persistencia / APIs externas
```

## 26.2 Arquitectura tecnológica

| Capa    | Tecnología               |
| ------- | ------------------------ |
| Mobile  | React Native / Expo      |
| Web     | React / Next             |
| Backend | Laravel / .NET / Node    |
| DB      | PostgreSQL / Firestore   |
| Auth    | Cognito / Firebase       |
| Infra   | AWS / Hostinger / Vercel |

---

# 27. Modelo de datos

Debe contener:

## 27.1 Descripción del modelo

## 27.2 Entidades / colecciones

Para SQL:

### Tabla: users

| Campo | Tipo | Restricción |
| ----- | ---- | ----------- |
| id    | UUID | PK          |

Para NoSQL:

### Colección: users/{uid}

| Campo | Tipo | Requerido | Regla |
| ----- | ---- | --------- | ----- |

## 27.3 Relaciones

## 27.4 Diagrama

ERD / modelo documental.

---

# 28. Seguridad

Cuando corresponda:

## 28.1 Autenticación

## 28.2 Autorización

## 28.3 Roles

## 28.4 Protección de datos

## 28.5 Validaciones

## 28.6 Auditoría

---

# 29. Integraciones

Una sección por integración.

### INT-01 — [Servicio]

**Propósito**

**Proveedor**

**Protocolo**

REST / SOAP / GraphQL / XML-RPC / VPN / etc.

**Autenticación**

**Datos intercambiados**

**Errores**

**Dependencias**

---

# 30. Diseño UX/UI

## 30.1 Principios de diseño

## 30.2 Flujo de navegación

## 30.3 Mockups

## 30.4 Pantallas implementadas

Cada captura:

> **Figura XX. Pantalla de detalle de ruta.**

Debajo:

> La pantalla permite...

No insertar capturas sin explicación.

---

# 31. Estado de implementación

Esto se activa cuando el proyecto ya tiene avances.

Formato:

| Módulo | Funcionalidad | Estado       | Evidencia |
| ------ | ------------- | ------------ | --------- |
| Auth   | Registro      | Implementado | Captura   |
| Rutas  | Catálogo      | Implementado | Demo      |
| GPS    | Grabación     | Implementado | Prueba    |

Estados recomendados:

**Diseñado**

**En implementación**

**Implementado**

**Validado**

Evitar porcentajes arbitrarios como “85%” salvo que exista una métrica real.

---

# 32. Estrategia de pruebas

## 32.1 Pruebas unitarias

## 32.2 Integración

## 32.3 E2E

## 32.4 Pruebas de aceptación

## 32.5 Pruebas de campo

## 32.6 Casos de prueba

Formato:

### CP-XX — [Nombre]

| Campo              | Valor       |
| ------------------ | ----------- |
| Requisito          | RF-XX       |
| Caso de uso        | CU-XX       |
| Precondición       |             |
| Entrada            |             |
| Pasos              |             |
| Resultado esperado |             |
| Resultado obtenido |             |
| Estado             | Pass / Fail |

---

# 33. Validación de la versión

Se utiliza para declarar qué significa “V1 completa”.

Formato:

> La versión V1.0 se considera validada cuando pueden demostrarse de extremo a extremo los siguientes escenarios:

Después se enumeran flujos completos.

Ejemplo:

> Registro → autenticación → catálogo → selección → descarga → consulta offline.

Esto es mucho mejor que decir solamente:

> “V1 terminada.”

---

# 34. Decisiones técnicas

Muy recomendable para sistemas medianos o grandes.

Formato:

### ADR-001 — [Decisión]

**Contexto**

**Alternativas**

**Decisión**

**Justificación**

**Consecuencias**

Ejemplo:

> Firestore frente a PostgreSQL.

---

# 35. Riesgos y consideraciones

Para informes internos puede llamarse:

**Riesgos técnicos**

Para clientes:

**Consideraciones para próximas iteraciones**

Formato:

| ID | Consideración | Impacto | Tratamiento |
| -- | ------------- | ------- | ----------- |

Evitar dramatizar.

---

# 36. Próximas iteraciones

Si es informe de avances:

## Versión actual

V1.0.

## Próxima versión

V1.1.

## Futuro

V2.

Puede incluir roadmap, pero **no debe sustituir el alcance formal**.

---

# 37. Conclusiones

Debe explicar:

* qué problema cubre la solución;
* qué alcance se consolidó;
* qué elementos técnicos se definieron;
* qué nivel de validación existe;
* cómo queda preparada la siguiente versión.

No introducir información nueva.

---

# 38. Recomendaciones

Opcional.

Puede contener:

* mejoras técnicas;
* nuevas validaciones;
* evolución del producto;
* mantenimiento;
* documentación;
* seguridad;
* monitoreo.

---

# 39. Anexos

Esta sección debe ser extensible.

Formato maestro:

### Anexo A — Entrevistas

### Anexo B — Historias de usuario completas

### Anexo C — Matriz de requisitos

### Anexo D — Especificaciones de casos de uso

### Anexo E — Diagramas UML

### Anexo F — Modelo de datos

### Anexo G — Arquitectura

### Anexo H — Evidencias de interfaz

### Anexo I — Resultados de pruebas

### Anexo J — API / endpoints

### Anexo K — Backlog

### Anexo L — Actas o aprobaciones

---

# Reglas maestras para reutilizarla

Para que la plantilla mantenga calidad independientemente del proyecto, establecería estas reglas.

| Regla | Aplicación                                                                  |
| ----- | --------------------------------------------------------------------------- |
| R01   | No resumir fuentes técnicas importantes solo para acortar el informe.       |
| R02   | No inventar requisitos ausentes.                                            |
| R03   | Distinguir claramente requisito, decisión técnica y tarea.                  |
| R04   | Cada RF debe poder trazarse.                                                |
| R05   | Cada HU debe conservar criterios de aceptación.                             |
| R06   | Cada CU formal debe tener especificación y diagrama.                        |
| R07   | Los diagramas deben representar el flujo real, no figuras decorativas.      |
| R08   | No declarar “completo” algo sin criterio de validación.                     |
| R09   | Las capturas siempre deben llevar título y explicación.                     |
| R10   | Los anexos complementan el informe; no sustituyen el contenido fundamental. |
| R11   | Adaptar el documento al tipo de audiencia.                                  |
| R12   | Mantener consistencia terminológica en todo el documento.                   |

---

# Tres variantes de la plantilla

La misma Plantilla Maestra debería tener tres modos de aplicación.

### Proyecto desde cero

Se enfatizan:

levantamiento → problema → requisitos → HU → CU → diseño → arquitectura → planificación.

### Proyecto con avances

Se enfatizan:

requisitos vigentes → HU → CU → implementación → arquitectura real → evidencias → pruebas → estado de versión.

### Presentación de versión al cliente

Se enfatizan:

problema → objetivos → alcance → funcionalidades → UX/UI → arquitectura explicada → validación → resultados → anexos técnicos.

El material no desaparece; simplemente cambia qué se presenta en el cuerpo principal y qué va a anexos.

---

# Convención de identificadores

También conviene estandarizar códigos desde el comienzo.

| Elemento                | Código  |
| ----------------------- | ------- |
| Requisito funcional     | RF-001  |
| Requisito no funcional  | RNF-001 |
| Regla de negocio        | RN-001  |
| Historia de usuario     | HU-001  |
| Caso de uso             | CU-001  |
| Caso de prueba          | CP-001  |
| Actor                   | ACT-001 |
| Integración             | INT-001 |
| Decisión arquitectónica | ADR-001 |
| Riesgo                  | RSK-001 |
| Tarea                   | T-001   |

Para proyectos pequeños pueden mantenerse dos dígitos:

`RF-01`, `HU-01`, `CU-01`.

Para sistemas grandes recomiendo tres:

`RF-001`.

---

# Formato visual recomendado para RF, RNF, HU y CU

Para que todos los proyectos se vean uniformes:

**RF y RNF:** tablas compactas.

**HU:** bloque narrativo + criterios + tareas.

**CU:** tabla de especificación + flujo + diagrama inmediatamente debajo.

**Trazabilidad:** tabla horizontal.

**Arquitectura:** diagramas limpios.

**Evidencias:** imágenes de interfaz con pie de figura.

**Anexos:** cada anexo comienza en nueva página.

Esto produce un informe técnico que puede crecer desde **15 páginas en un proyecto pequeño hasta 80–100 páginas en uno complejo** sin perder estructura.

---

## Nombre que usaría para reutilizarla

Podemos referirnos a ella desde ahora como:

> **Plantilla Maestra IS-01 — Informe Formal de Ingeniería de Software**

Y el flujo para un proyecto futuro sería:

> **IS-01 → sesión inicial de levantamiento → selección de secciones → recopilación de evidencias → redacción → UML → anexos → revisión → DOCX final.**

Ese es el formato que tomaría como base para tus próximos proyectos.
Correcto. En la **Plantilla Maestra IS-01** faltaba dejar formalizados, como secciones obligatorias cuando correspondan, los **diagramas de secuencia** y los **diagramas de comunicación** con una estructura UML correcta. Además, la imagen que pasaste deja claro un punto importante: un diagrama de comunicación no debe parecer una secuencia “acostada” ni un conjunto de cajas simples; debe mostrar una **red de objetos conectados** y los **mensajes numerados sobre los enlaces**.

Desde ahora, agregaría estas secciones a la plantilla maestra.

## 25. Diagramas de secuencia

Esta sección representa **cómo evolucionan las interacciones en el tiempo** dentro de un caso de uso.

Antes de dibujarlos debe existir una pequeña tabla de selección:

| Nº | Tipo      | Caso de uso | Motivo                                      |
| -- | --------- | ----------- | ------------------------------------------- |
| 1  | Secuencia | CU-XX       | Presenta una interacción temporal clara     |
| 2  | Secuencia | CU-XX       | Contiene validaciones y flujos alternativos |
| 3  | Secuencia | CU-XX       | Tiene múltiples participantes               |
| 4  | Secuencia | CU-XX       | Tiene inicio, procesamiento y cierre        |

No significa que siempre tengan que ser cuatro. La cantidad dependerá de lo solicitado en el proyecto o por el docente/cliente.

### 25.1 Formato estándar de un diagrama de secuencia

Los participantes se ordenan normalmente así:

```text
Actor
   │
   │
 :UI:
   │
 :Controlador / Caso de uso:
   │
 :Servicio:
   │
 :Repositorio:
   │
 :Base de datos / API externa:
```

Cada participante tiene una **línea de vida vertical**.

Ejemplo conceptual:

```text
Usuario       :LoginUI      :AuthService      :UserRepository
   |              |              |                 |
   | iniciar()    |              |                 |
   |------------->|              |                 |
   |              | validar()    |                 |
   |              |------------->|                 |
   |              |              | buscarUsuario() |
   |              |              |---------------->|
   |              |              |<----------------|
   |              |<-------------|                 |
   |<-------------|              |                 |
```

### Elementos que debe contener

Según el caso:

* actor;
* objetos o componentes;
* líneas de vida;
* mensajes síncronos;
* mensajes asíncronos si existen;
* retornos;
* barras de activación;
* fragmentos `alt`;
* fragmentos `opt`;
* fragmentos `loop`;
* condiciones de guarda;
* creación/destrucción de objetos cuando sea relevante.

### Ejemplo con `alt`

```text
Usuario        UI          AuthService       UsuarioRepo
  |             |               |                 |
  | login()     |               |                 |
  |------------>|               |                 |
  |             | validar()     |                 |
  |             |-------------->|                 |
  |             |               | buscar()        |
  |             |               |---------------->|
  |             |               |<----------------|
  |             |               |                 |
  |          alt [credenciales válidas]           |
  |             |<--------------|                 |
  |<------------| sesión iniciada                 |
  |             |                                 |
  |          else [credenciales inválidas]        |
  |             |<--------------|                 |
  |<------------| mostrar error                   |
```

Esto es más correcto que simplemente representar flechas lineales sin contexto.

---

# 26. Diagramas de comunicación

Esta sección debe modelar la **colaboración estructural entre los participantes** de un caso de uso.

Aquí la imagen que proporcionaste es una buena referencia conceptual.

La diferencia fundamental respecto al diagrama de secuencia es:

> En el diagrama de secuencia domina el tiempo vertical.
> En el diagrama de comunicación domina la red de objetos y la numeración de mensajes.

## 26.1 Estructura visual recomendada

Debe existir un marco UML similar a:

```text
┌───────────────────────────────────────────────┐
│ cd Comunicación — CU-XX Nombre del caso      │
│                                               │
│ Actor                                         │
│   O                                           │
│  /|\\                                         │
│  / \\                                         │
│    \\                                          │
│     \\ 1: acción()                            │
│      \\                                        │
│      :UI: -------- :Controlador:              │
│        \\            /                         │
│         \\          /                          │
│        :Entidad: ---- :Repositorio:           │
│                         |                     │
│                         | 2.3: guardar()      │
│                         v                     │
│                      :DB:                     │
└───────────────────────────────────────────────┘
```

La disposición de los objetos puede ser libre, siempre que permita entender claramente la colaboración.

## 26.2 Notación de objetos

No deberían utilizarse simplemente cajas con textos genéricos.

Debe preferirse notación de instancia, por ejemplo:

```text
:LoginUI
:AuthController
:UserService
:UserRepository
usuario:User
:Firestore
```

O, dependiendo del nivel de diseño:

```text
uiDetalleRuta:DetalleRutaView
routeService:RouteService
offlineManager:OfflineManager
storage:LocalStorage
```

El formato elegido debe mantenerse consistente dentro de todo el informe.

---

# 26.3 Enlaces

Los objetos deben estar unidos mediante **enlaces estructurales**.

Ejemplo:

```text
Usuario -------- :UI:
                    |
                    |
                :Servicio:
                 /      \
                /        \
         :Entidad:     :Repositorio:
                          |
                          |
                         :DB:
```

El enlace expresa que los objetos pueden comunicarse.

La flecha del mensaje se coloca **sobre ese enlace**, no se dibuja una estructura completamente diferente para cada mensaje.

---

# 26.4 Numeración de mensajes

Este es uno de los puntos que debemos mejorar respecto a los diagramas anteriores.

La numeración debe expresar el orden y la jerarquía.

Ejemplo:

```text
1: crearContacto()
1.1: abrirFormulario()
1.2: mostrarContacto()

2: guardar()
2.1: guardarContacto()
2.2: persistir()
2.3: insertarContacto()
```

La numeración no es decorativa.

Representa llamadas anidadas.

### Ejemplo jerárquico

Si el Usuario inicia:

```text
1: descargarRuta()
```

La UI llama al servicio:

```text
1.1: obtenerDetalleRuta()
```

El servicio consulta el repositorio:

```text
1.1.1: buscarRuta()
```

Luego:

```text
1.2: calcularTamano()
1.3: solicitarConfirmacion()
```

Tras confirmar:

```text
2: confirmarDescarga()
2.1: descargarMapa()
2.2: descargarTrazado()
2.3: guardarOffline()
```

Esto es mucho más representativo del flujo real.

---

# 26.5 Ejemplo aplicado a Trekkin

Por ejemplo, para:

## CU-04 — Descargar una ruta para consulta offline

Los participantes podrían ser:

```text
Usuario

detalleRutaUI:DetalleRutaView

downloadController:OfflineDownloadController

routeService:RouteService

mapService:MapService

storage:LocalStorage
```

La colaboración podría ser:

```text
Usuario
   |
   | 1: seleccionarDescarga()
   v
:DetalleRutaView
      |
      | 1.1: solicitarTamano()
      v
:OfflineDownloadController
      |
      | 1.1.1: obtenerRuta()
      v
:RouteService

Usuario
   |
   | 2: confirmarDescarga()
   v
:DetalleRutaView
      |
      | 2.1: iniciarDescarga()
      v
:OfflineDownloadController
      /             \
     /               \
2.1.1               2.1.2
descargarMapa()     obtenerDatosRuta()
   |                    |
:MapService         :RouteService
      \\               /
       \\             /
        2.1.3: guardarPaquete()
               |
          :LocalStorage
```

Ese es mucho más parecido al concepto de la imagen que pasaste.

---

# 26.6 Qué NO hacer en un diagrama de comunicación

Evitar:

```text
Actor → UI → Service → DB
```

si se dibuja solamente como una cadena horizontal.

Eso parece más:

* flujo;
* secuencia simplificada;
* arquitectura.

También evitar que todos los objetos estén alineados perfectamente como una secuencia.

El valor del diagrama de comunicación está precisamente en mostrar la **estructura de colaboración**.

---

# 27. Relación entre CU, secuencia y comunicación

En la plantilla debería existir una matriz específica:

| CU    | Secuencia | Comunicación | Motivo                                   |
| ----- | --------- | ------------ | ---------------------------------------- |
| CU-01 | Sí        | No           | Flujo temporal lineal                    |
| CU-04 | No        | Sí           | Colaboran UI, almacenamiento y servicios |
| CU-06 | Sí        | No           | Seguimiento temporal de actividad        |
| CU-08 | No        | Sí           | GPS, cámara, registro y UI interactúan   |
| CU-10 | No        | Sí           | Revisión, estado y notificación          |

Esto evita hacer diagramas simplemente “porque sí”.

---

# 28. Criterios para elegir un diagrama de secuencia

Conviene elegir secuencia cuando exista:

* autenticación;
* validación;
* consultas y respuestas;
* flujo temporal;
* múltiples pasos dependientes;
* alternativas;
* errores;
* repetición;
* procesos de inicio/pausa/reanudación/cierre.

Ejemplos buenos:

```text
Registrar cuenta
Iniciar sesión
Realizar una ruta
Procesar pago
Reservar cita
Aprobar solicitud
```

---

# 29. Criterios para elegir un diagrama de comunicación

Conviene usar comunicación cuando importa más:

* quién colabora con quién;
* relaciones entre objetos;
* múltiples componentes;
* persistencia;
* servicios externos;
* dispositivos;
* almacenamiento;
* GPS;
* cámara;
* notificaciones.

Ejemplos:

```text
Descargar ruta offline
Compartir ruta
Grabar ruta con GPS
Subir documento
Procesar archivo
Registrar pago
Enviar notificación
```

---

# 30. Nivel de participantes recomendado

En ambos tipos de diagramas debemos evitar los extremos.

Demasiado simple:

```text
Usuario
Sistema
BD
```

Demasiado bajo nivel:

```text
ReactComponent
hook
ReduxSlice
AxiosInstance
HTTPClient
FirebaseSDK
Promise
JSONParser
...
```

El nivel adecuado para un informe formal sería algo como:

```text
Usuario
Interfaz
Controlador / Caso de uso
Servicio de dominio
Repositorio
Persistencia
Sistema externo
```

Eso comunica arquitectura sin ensuciar UML con detalles innecesarios de implementación.

---

# 31. Estándar visual que añadiría a IS-01

Para mantener uniformidad:

### Secuencia

* fondo claro;
* actor UML;
* participantes en cajas;
* líneas de vida discontinuas;
* mensajes sólidos;
* retornos discontinuos;
* fragmentos `alt / opt / loop`;
* texto entre 9–11 pt;
* máximo aproximado de 5–7 participantes por figura.

### Comunicación

* marco `cd`;
* actor UML;
* objetos como instancias;
* distribución espacial libre;
* enlaces gris/negro;
* mensajes con flechas;
* numeración jerárquica;
* máximo 5–7 objetos principales;
* sin cruzar excesivamente las líneas.

---

## La Plantilla Maestra IS-01 queda entonces corregida

Después de **Casos de Uso**, la estructura será:

```text
22. Especificaciones de casos de uso
23. Diagramas individuales de casos de uso

24. Selección de casos para diagramas dinámicos

25. Diagramas de secuencia
    25.1 DS-01 — CU-XX
    25.2 DS-02 — CU-XX
    ...
    
26. Diagramas de comunicación
    26.1 DC-01 — CU-XX
    26.2 DC-02 — CU-XX
    ...

27. Arquitectura del sistema
28. Modelo de datos
29. Seguridad
30. Integraciones
...
```

Y queda establecido también que **los diagramas de comunicación futuros deben parecerse conceptualmente a la referencia que acabas de pasar**: objetos distribuidos en una red, enlaces entre ellos y mensajes numerados jerárquicamente, en lugar de la versión simplificada que utilicé inicialmente con Trekkin.
