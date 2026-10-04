# 04 · Estudio de UX/UI — App Android de Topografía (Capacitor + React + TypeScript)

> Objetivo de producto: **simple, ordenada, llena de funcionalidad, muchas cosas con pocos clics y muy bonita**.
> Contexto de uso: campo abierto, sol directo, polvo, guantes, una mano ocupada (mira, jalón, libreta), batería limitada y sin cobertura.
> Fecha del estudio: 2026-10-04. Las fuentes se citan entre corchetes `[n]` y se listan al final.

---

## 0. Resumen ejecutivo

1. **El problema de las apps topográficas actuales no es la falta de funciones, sino el acceso a ellas**: menús por pestañas con decenas de comandos (SurvCE/SurvPC: pestañas *File, Equip, Survey, COGO, Road, BIM* [9]; MAGNET Field: decenas de entradas de configuración [10]), que los fabricantes intentan compensar con "Favoritos" y teclas de función [11] o permitiendo ocultar menús [12]. Nuestra app debe nacer con **pocas puertas y muy anchas**.
2. **Diseñar para el peor caso físico**: objetivos táctiles de **56 dp** por defecto (mínimo absoluto 48 dp [1][2]), contraste **≥ 7:1** (WCAG AAA 1.4.6 [3][4]) en todo dato crítico, modo **Sol** (alto contraste) a un toque.
3. **Entrada de datos como corazón del producto**: teclado numérico propio, gigante, con flujo "lectura → siguiente" sin cerrar teclado, autoguardado por pulsación y deshacer en vez de diálogos de confirmación [13][14].
4. **Feedback inmediato**: semáforo de cierre (verde/ámbar/rojo + icono + texto) calculado en vivo contra la tolerancia (p. ej. `12·√K mm` para nivelación de 3.er orden [15]).
5. **Arquitectura**: barra inferior de **5 destinos** (Inicio · Nivelación · Puntos · Cálculos · Informes) [6], FAB contextual, hojas inferiores para acciones, y **paleta de comandos** global para llegar a cualquier cosa en 2 toques.
6. **Offline-first** real: SQLite local como fuente de verdad, nada se pierde aunque se cierre la app [16][13].

---

## 1. Problemas UX típicos de las apps topográficas existentes

### 1.1 Panorama

| App | Fortalezas reconocidas | Fricciones UX observadas / inferidas |
|---|---|---|
| **Trimble Access** | Muy completa; módulos especializados (Carreteras, Túneles, Minas) con interfaz guiada [7]; Point Manager y "Revisar trabajo" [7]. | Profundidad de menús: Trimble ofrece **Favoritos** y **asignación de teclas de función** precisamente para "saltarse" la navegación [11][17]. Pensada para controladoras con teclado físico (T10x, TSC) [18]; en un teléfono pierde atajos. |
| **Topcon/Sokkia MAGNET Field** | Interfaz tipo "apps" personalizable; se pueden **ocultar o renombrar** menús confusos [12]. | La propia necesidad de ocultar/renombrar admite sobrecarga y terminología poco clara. Listas largas de configuración (capas, códigos, alarmas, prompts, informes…) [10]. |
| **Carlson SurvCE / SurvPC** | Muy respetada por usuarios; GUI consistente [9][19]. | Navegación por pestañas + rejilla de botones de comando [9][20]; mucha densidad de iconos pequeños; curva de aprendizaje; confusión sobre módulos [21]. |
| **MicroSurvey FieldGenius** | La nueva versión fue **reconstruida desde cero para táctil** con "botones grandes y gestos intuitivos" [22]. | Confirma la tendencia: la versión *Legacy* (Windows CE) arrastraba UI de stylus [23]. |
| **Libretas de nivelación genéricas** (apps Play Store, hojas Excel) | Simples, baratas. | Tablas minúsculas tipo hoja de cálculo, teclado del sistema (QWERTY con números en segunda capa), sin validación en vivo, sin cierre automático, exportación pobre. |

### 1.2 Patrones de problema recurrentes

1. **Menús profundos (4–6 niveles)**: *Menú → Medir → Nivelación → Configurar estilo → Tolerancias*. Cada nivel es un toque con guantes y una oportunidad de perderse. Los fabricantes lo parchean con favoritos y teclas físicas [11][17], no lo resuelven.
2. **Densidad de escritorio en pantalla de 6"**: rejillas de 12–20 iconos de 32 px sin etiqueta. Material exige etiqueta en cada destino de navegación precisamente para evitar iconos ambiguos [6].
3. **Legibilidad bajo el sol**: grises medios sobre blanco, colores saturados que "se queman" con alta luminancia; se recomiendan contrastes ≥ 7:1 y tonos desaturados/terrosos en exterior [5][24].
4. **Uso con guantes**: objetivos de 32–40 px, controles pegados, deslizadores finos. En contexto industrial se recomienda escalar botones a **60–72 px con 16 px de separación** y subir el texto a **16–18 px** [5].
5. **Teclado del sistema para lecturas**: obliga a cambiar de capa para el punto decimal, tapa la mitad de la tabla y se cierra al pulsar "Siguiente".
6. **Validación tardía**: el error de cierre se descubre en la oficina. Los programas de oficina (TBC) importan GSI/DiNi y procesan con un *Level Editor* [25][26]: ese "ciclo largo" es exactamente lo que una app de campo debe acortar.
7. **Diálogos de confirmación en cadena** ("¿Seguro?") en lugar de deshacer; NN/g recomienda reservar la confirmación a acciones graves e irreversibles y ofrecer *undo* siempre que sea posible [13].
8. **Pérdida de datos** por cierre de app, batería o falta de cobertura; los usuarios de campo abren la app en ráfagas cortas e interrumpidas [14].

---

## 2. Principios de diseño para la app de campo

### 2.1 Tamaños táctiles

| Elemento | Mínimo | **Recomendado en campo** | Notas |
|---|---|---|---|
| Objetivo táctil genérico | 48×48 dp (≈9 mm) [1][2] | **56×56 dp** | Material: 7–10 mm físicos [1]. |
| Tecla del teclado numérico | 56 dp alto | **64–72 dp alto**, ancho = 1/4 pantalla | Rango 60–72 px para guantes [5]. |
| Fila de tabla de libreta (editable) | 48 dp | **56 dp** | Toda la fila es objetivo táctil. |
| Botón primario / CTA | 48 dp | **56 dp alto, ancho completo** | |
| FAB | 56 dp [2] | **56 dp** (extendido con etiqueta) | |
| Separación entre objetivos | 8 dp [1] | **12–16 dp** | 16 px con guantes [5]. |
| Iconos | 24 dp | 24 dp dentro de un área de 56 dp | |

Regla: *nada interactivo por debajo de 48 dp, nunca*. Implementación en CSS: `min-height: 56px; min-width: 56px` y área táctil ampliada con `::after { inset: -8px }` para iconos.

### 2.2 Contraste y modos visuales

- **Normativa**: WCAG 1.4.3 (AA) pide 4.5:1; **1.4.6 (AAA) pide 7:1** para texto normal y 4.5:1 para texto grande [3][4]. 7:1 permite leer sin ayudas a usuarios con visión ≈20/80 [4] — una buena aproximación al "ojo bajo el sol con gafas oscuras".
- **Nuestra regla**: todo texto de **datos** (lecturas, cotas, desniveles, cierres) ≥ **7:1** en los tres temas. Texto secundario ≥ 7:1 en claro (gris `#475569` = 7.58:1). Bordes de componentes interactivos ≥ 3:1 (WCAG 1.4.11).
- **Tres temas** (+1 variante):
  - **Claro** (por defecto de día).
  - **Oscuro** (noche, túneles, ahorro en OLED). Fondo gris-azulado muy oscuro, no negro puro, y colores desaturados (tono ≈200) como recomienda Material [27].
  - **Sol / Alto contraste**: blanco puro, negro puro, bordes de 2 px, sin sombras ni transparencias, tipografía un peso más gruesa, colores de estado oscuros y profundos (≥ 8.5:1).
  - **Alto contraste nocturno** (opcional): negro puro con acentos luminosos.
- **Acceso al modo Sol**: icono ☀ fijo en la barra superior → 1 toque. Opción "automático" con el sensor de luz (vía plugin nativo) cuando esté disponible.
- **Nunca solo color**: cada estado lleva **icono + texto + color** (daltonismo ~8 % de hombres; y el sol borra matices).

### 2.3 Tipografía para leer en campo

- Cuerpo mínimo **16 px**, datos de libreta **18–20 px**, lectura en edición **32–40 px** [5].
- **Números tabulares** obligatorios en tablas: `font-variant-numeric: tabular-nums` (preferible a `font-feature-settings: "tnum"`) [28][29]; Inter incluye `tnum` [28].
- Fuente **mono** para lecturas de mira y códigos de punto (distingue `0/O`, `1/l`).

### 2.4 Teclado numérico custom (la pieza más importante)

```
┌──────────────────────────────────────────┐
│  Lectura ATRÁS  ·  Est. 3  ·  PR-2        │
│                         1.4 8 7  m       │ ← 40px mono, cursor grande
│  ±  Δ vs. anterior: +0.002 ✔              │
├──────────┬──────────┬──────────┬─────────┤
│    7     │    8     │    9     │   ⌫     │
├──────────┼──────────┼──────────┼─────────┤
│    4     │    5     │    6     │  ATRÁS  │ ← cambia tipo de lectura
├──────────┼──────────┼──────────┼─────────┤
│    1     │    2     │    3     │  INTER  │
├──────────┼──────────┼──────────┼─────────┤
│    0     │    .     │   ±/✕    │ ADELANTE│
├──────────┴──────────┴──────────┴─────────┤
│  ↶ Deshacer        │   SIGUIENTE  ⏎  ▶   │ ← 64dp, ancho, color marca
└──────────────────────────────────────────┘
```

- Teclas 64–72 dp, separación 8 dp, `.` siempre visible (nada de capas).
- **"Siguiente" no cierra el teclado**: guarda, avanza al siguiente campo lógico (Atrás → Adelante → nueva estación) y hace vibración corta (Capacitor Haptics).
- **Máscara de unidades**: el usuario puede teclear `1487` y la app interpreta `1.487 m` si la preferencia "lecturas en mm" está activa (un toque menos por lectura, cientos por jornada).
- **Validación en vivo** antes de aceptar: rango de mira (0–4 m / 0–5 m), salto inusual respecto a la lectura anterior, distancia atrás/adelante desequilibrada → aviso ámbar *no bloqueante*.
- Atajos: mantener pulsado `SIGUIENTE` = "repetir lectura" (doble lectura/BF-FB); deslizar a la izquierda sobre la lectura = borrar.
- Teclado en la parte baja (zona del pulgar), la tabla visible encima mostrando siempre las **3 últimas filas**.

### 2.5 Entrada rápida tipo "siguiente lectura"

- Máquina de estados por método (geométrica simple, BF-FB, radiaciones intermedias). La app **sabe qué toca a continuación** y lo pre-selecciona.
- Nombres de punto autoincrementales (`P-12 → P-13`), con plantilla editable.
- Distancias opcionales: si el nivel no da distancia, el campo se salta.

### 2.6 Deshacer, autoguardado y offline-first

- **Autoguardado por pulsación** (cada "Siguiente" es una transacción en SQLite). Sin botón "Guardar". NN/g: guardar estado generosamente porque las sesiones móviles son cortas e interrumpidas [14].
- **Deshacer** con *snackbar* 6–8 s tras cualquier borrado o edición ("Lectura borrada · DESHACER") en lugar de diálogos [13][30]. Pila de deshacer de 50 pasos por libreta, y **historial de versiones** de la libreta (auto-save + undo + versiones = sistema de "perdón" completo [30]).
- Confirmación modal **solo** para: borrar proyecto completo, sobrescribir un archivo importado. (Recomendación NN/g [13].)
- **Offline-first**: SQLite como fuente de verdad (recomendado para datos estructurados y offline en Capacitor [16][31]); `@capacitor/preferences` solo para ajustes [16]. Indicador discreto "Guardado ✓ hace 2 s" en la barra superior.

### 2.7 Feedback inmediato: semáforo de cierre

- Tolerancia configurable por proyecto: `T = k·√K` (mm, K en km). Valores típicos: 3.er orden `k = 12 mm` [15]; plantillas para 1.er/2.º orden y "obra" (p. ej. 20–30 mm√K) editables.
- Estados:
  - **Cumple** (verde, icono ✔ `CircleCheck`): `|e| ≤ 0.8·T`.
  - **Al límite** (ámbar, icono ⚠ `TriangleAlert`): `0.8·T < |e| ≤ T`.
  - **No cumple** (rojo, icono ✕ `CircleX`): `|e| > T`.
- Se muestra **en vivo** en una barra fija ("Cierre parcial: Σatrás − Σadelante vs. cota conocida") y en grande al terminar, con medidor horizontal *e / T*.
- Comprobaciones aritméticas automáticas (Σatrás − Σadelante = Cota final − Cota inicial) con el mismo semáforo.

### 2.8 Otros principios

- **Una mano / zona del pulgar**: acciones primarias abajo; la barra superior solo muestra contexto y modo Sol.
- **Haptics** al aceptar lectura (corto) y al detectar error (doble).
- **Pantalla siempre encendida** durante la libreta (Keep Awake).
- **Divulgación progresiva**: ajustes avanzados (refracción, curvatura, corrección de mira) detrás de "Más opciones" en una hoja inferior, nunca en el flujo principal.
- **Vocabulario del topógrafo español**: Atrás/Adelante/Intermedia, Cota, Desnivel, Cierre, Compensación, PR/BM, Estación.

---

## 3. Arquitectura de información

### 3.1 Barra de navegación inferior (5 destinos)

Material 3: 3–5 destinos, icono + etiqueta de 1–2 palabras obligatoria, posiciones fijas, FAB por encima de la barra [6][32].

| # | Destino | Icono lucide | Qué contiene |
|---|---|---|---|
| 1 | **Inicio** | `house` | Proyecto activo, "continuar donde lo dejé", KPIs del día, acciones rápidas, proyectos recientes, selector de proyecto. |
| 2 | **Nivelación** | `ruler` (o `move-vertical`) | Lista de libretas del proyecto + libreta activa (entrada), cierres, compensación, importación de nivel digital. |
| 3 | **Puntos** | `map-pin` | Tabla/planta de puntos (X, Y, Z, código), importar CSV/TXT, levantamiento, perfil longitudinal. |
| 4 | **Cálculos** | `calculator` | Herramientas: cota de un punto, desnivel, pendiente, distancia/azimut, interpolación, volumen corte/relleno, conversiones. |
| 5 | **Informes** | `file-text` | Informes generados, plantillas, exportar PDF/CSV/DXF, compartir. |

Ajustes, proyectos (gestión completa), unidades y ayuda → **avatar/engranaje en la barra superior de Inicio**, no ocupan pestaña.

Tablet / horizontal: la misma estructura pasa a **navigation rail** lateral [33].

### 3.2 Patrones de acción

- **FAB contextual** (extendido con etiqueta, 56 dp):
  - Inicio → "Nueva nivelación" (mantener pulsado → speed-dial: Nueva nivelación · Importar archivo · Nuevo punto · Calcular cota).
  - Nivelación → "Nueva libreta".
  - Puntos → "Añadir punto".
  - Cálculos → oculto (las herramientas son tarjetas).
  - Informes → "Nuevo informe".
- **Bottom sheets** para todo lo secundario: opciones de una fila, filtros, exportación, detalle de punto, tolerancias. Altura parcial (≈50 %) arrastrable a completa; el contexto sigue visible. Siempre con asa de arrastre y botón ✕ de 48 dp.
- **Paleta de comandos / búsqueda global**: icono 🔍 en la barra superior (y gesto: deslizar hacia abajo en Inicio). Busca **acciones** ("exportar pdf", "cota", "tolerancia"), **puntos** ("PR-2"), **libretas** y **proyectos**. Resultados agrupados, con las 5 acciones más usadas preseleccionadas → cualquier función a ≤ 2 toques + tecleo.
- **Chips de filtro** horizontales sobre listas (Todas · Abiertas · Cerradas ✔ · Fuera de tolerancia ✕).
- **Segmented control** para cambiar vista dentro de una pantalla (Tabla | Perfil | Resumen).
- **Snackbar** con DESHACER para acciones reversibles.

### 3.3 Mapa del sitio

```
Inicio
 ├─ Proyecto activo ▸ (hoja: cambiar proyecto / nuevo proyecto)
 ├─ Continuar libreta "Eje 1 – ida"
 ├─ Acciones rápidas: [Nueva nivelación] [Importar nivel] [Calcular cota] [Exportar PDF]
 ├─ KPIs: libretas · cierres OK · puntos · último informe
 └─ Ajustes (barra superior): unidades, tolerancias, tema, plantillas, copia de seguridad
Nivelación
 ├─ Lista de libretas (chips de estado)
 ├─ Libreta ▸ [Tabla | Perfil | Resumen]
 │    ├─ Entrada con teclado custom
 │    ├─ Cierre y compensación
 │    └─ Hoja: tolerancia, método, mira, exportar
 └─ Importar archivo de nivel digital (GSI, DiNi .dat, CSV) [25][26][34]
Puntos
 ├─ [Lista | Planta | Perfil]
 ├─ Detalle de punto (hoja)
 └─ Importar/Exportar CSV
Cálculos
 ├─ Cota de un punto · Desnivel · Pendiente · Distancia/Azimut
 ├─ Interpolación · Corte/Relleno · Conversión de unidades
 └─ Historial de cálculos
Informes
 ├─ Lista de informes generados
 ├─ Nuevo informe (plantilla) ▸ Vista previa ▸ PDF / Compartir
 └─ Plantillas y logotipo
```

---

## 4. Flujos clave de pocos clics

Convención: **T = toque**. No se cuentan las lecturas tecleadas.

### 4.1 Nueva nivelación en 3 toques

1. **T1** — FAB "Nueva nivelación" (Inicio o Nivelación).
2. **T2** — Hoja inferior pre-rellenada: nombre automático (`Nivelación 2026-10-04 #3`), método = último usado, tolerancia = la del proyecto, PR de partida = último PR usado o lista de PR del proyecto (chips). El usuario toca el **PR de partida** (chip).
3. **T3** — "Empezar" → se abre la libreta con el teclado ya activo en *Atrás · Est. 1*.

Si el PR no existe: el chip "+ PR nuevo" abre el teclado para escribir la cota → sigue siendo 3 toques + tecleo.

### 4.2 Importar archivo del nivel digital y obtener informe en 2 toques

Formatos objetivo: Leica **GSI** (GSI-8/16, texto ASCII) [25][34][35], Trimble **DiNi .dat (M5)** [26], CSV genérico.

1. **T1** — Acción rápida "Importar nivel" → selector de archivos del sistema (o "Abrir con…" / compartir desde el gestor de archivos: **0 toques en la app**, entra directo al paso 2).
2. El archivo se analiza automáticamente: detección de formato, estaciones, PR, cálculo de desniveles, cierre y semáforo. Pantalla de resultado con resumen y vista previa.
3. **T2** — "Generar informe PDF" → se crea con la plantilla por defecto y se abre la hoja de compartir del sistema.

Detalles: si hay ambigüedades (cota del PR inicial desconocida), se piden en una tarjeta en línea, no en un diálogo; la importación se registra con un **deshacer**.

### 4.3 Calcular la cota de un punto

- Desde Cálculos → tarjeta "Cota de un punto" (**T1**) → formulario de 2 campos con teclado custom: *Cota PR* (pre-rellenada con el PR activo), *Lectura atrás*, *Lectura al punto*. Resultado en vivo mientras se teclea: `Cota = Cota PR + Atrás − Adelante` y `Altura instrumental`.
- **T2** opcional: "Guardar como punto" → se añade a Puntos con nombre automático.
- Atajo desde cualquier sitio: paleta de comandos → "cota".

### 4.4 Exportar PDF

- Desde una libreta cerrada: botón de la barra inferior de la libreta **"PDF"** (**T1**) → se genera con la plantilla por defecto y abre "Compartir" (**T2**).
- Desde Informes: FAB "Nuevo informe" → elegir libreta(s) (chips) → "Generar".
- Contenido mínimo del PDF: cabecera con proyecto, fecha, operador, equipo; tabla de libreta (números tabulares); comprobación aritmética; cierre vs. tolerancia con semáforo (icono + texto, imprimible en B/N); perfil longitudinal; firma.

### 4.5 Tabla de conteo

| Tarea | Apps típicas (estimado) | Objetivo |
|---|---|---|
| Nueva nivelación | 6–9 toques (menú → trabajo → estilo → configurar → medir) | **3** |
| Importar nivel digital + informe | Requiere software de oficina (TBC Level Editor [25][26]) | **2** |
| Calcular cota | 4–6 | **1–2** |
| Exportar PDF | 5–8 | **2** |

---

## 5. Sistema de diseño

### 5.1 Marca

- **Color de marca: ámbar topográfico** (evoca miras, jalones, chalecos y señalización). Secundario: **verde azulado (teal)** para información/neutral-positivo.
- En claro el ámbar se usa en tono **700** (`#B45309`) para que el texto blanco sobre él cumpla y el ámbar no "brille"; en oscuro se usa **400** (`#FBBF24`) con texto oscuro, siguiendo la recomendación de desaturar/aclarar en dark [27].

### 5.2 Tokens de color (contrastes calculados con la fórmula WCAG)

#### Tema claro (`[data-theme="light"]`)

| Token | Hex | Uso | Contraste |
|---|---|---|---|
| `--bg` | `#F8FAFC` | Fondo de app | — |
| `--surface` | `#FFFFFF` | Tarjetas, hojas | — |
| `--surface-2` | `#F1F5F9` | Filas alternas, campos | — |
| `--text` | `#0F172A` | Texto principal y datos | 17.1:1 sobre `--bg` |
| `--text-2` | `#334155` | Texto secundario | 9.9:1 |
| `--text-muted` | `#475569` | Etiquetas, ayudas | 7.6:1 sobre blanco |
| `--border` | `#CBD5E1` | Divisores decorativos | — |
| `--border-strong` | `#64748B` | Bordes de inputs/controles | 4.8:1 (≥3:1 UI) |
| `--brand` | `#B45309` | FAB, botón primario, pestaña activa | blanco encima 5.0:1 (texto ≥ 16 px bold) |
| `--brand-text` | `#92400E` | Enlaces y texto de marca | 7.1:1 |
| `--brand-container` | `#FFF7ED` | Fondo de chip/selección | texto `#7C2D12` 9.4:1 |
| `--on-brand` | `#FFFFFF` | Texto sobre marca | — |
| `--accent` (teal) | `#0F766E` | Info secundaria, enlaces de datos | 5.5:1 |
| `--ok` | `#166534` | Cumple (texto/icono) | 7.1:1 |
| `--ok-bg` | `#DCFCE7` | Fondo de badge "cumple" (texto `#14532D` 8.3:1) | |
| `--warn` | `#7C4A03` | Al límite | 7.4:1 |
| `--warn-bg` | `#FEF9C3` | Fondo de aviso (texto `#713F12` 8.1:1) | |
| `--err` | `#991B1B` | No cumple / error | 8.3:1 |
| `--err-bg` | `#FEE2E2` | Fondo de error (texto `#7F1D1D` 8.2:1) | |
| `--info` | `#0C4A6E` | Información | 9.5:1 |

#### Tema oscuro (`[data-theme="dark"]`)

| Token | Hex | Contraste |
|---|---|---|
| `--bg` | `#0B1220` | — |
| `--surface` | `#111A2B` | — |
| `--surface-2` | `#1A2438` | — |
| `--text` | `#F1F5F9` | 17.1:1 sobre `--bg` |
| `--text-2` | `#CBD5E1` | 12.6:1 |
| `--text-muted` | `#94A3B8` | 6.8:1 (solo etiquetas, no datos) |
| `--border` | `#334155` | decorativo |
| `--border-strong` | `#64748B` | 3.7:1 |
| `--brand` | `#FBBF24` | 10.4:1 sobre surface |
| `--on-brand` | `#0B1220` | 11.2:1 sobre `--brand` |
| `--brand-container` | `#3A2A0A` | texto `#FDE68A` |
| `--accent` | `#5EEAD4` | — |
| `--ok` | `#4ADE80` | 10.0:1 |
| `--warn` | `#FACC15` | 11.4:1 |
| `--err` | `#FCA5A5` | 9.2:1 |
| `--info` | `#7DD3FC` | 10.4:1 |
| badges `*-bg` | `ok #052E16` · `warn #422006` · `err #450A0A` | con el color de estado encima |

Nota: se evita el negro puro (Material recomienda gris muy oscuro tipo `#121212`; aquí un azul pizarra equivalente para dar carácter) [27].

#### Tema Sol / alto contraste (`[data-theme="sun"]`)

| Token | Hex | Contraste |
|---|---|---|
| `--bg` / `--surface` | `#FFFFFF` | — |
| `--text`, `--text-2`, `--border`, `--border-strong` | `#000000` | 21:1 |
| `--text-muted` | `#1F2937` | > 14:1 |
| `--brand` | `#7C2D12` (texto blanco encima) | 9.4:1 |
| `--ok` | `#14532D` | 9.1:1 |
| `--warn` | `#713F12` | 8.7:1 |
| `--err` | `#7F1D1D` | 10.0:1 |
| `--info` | `#0C4A6E` | 9.5:1 |
| Reglas | bordes 2 px, sin sombras, sin transparencias, `font-weight` +100, estado siempre con relleno sólido e icono | |

#### Variante alto contraste nocturno (`[data-theme="sun-dark"]`, opcional)

`--bg #000000` · `--text #FFFFFF` (21:1) · `--brand #FFB000` (11.5:1) · `--ok #7CFC9A` (16.3:1) · `--warn #FFE066` (16.1:1) · `--err #FF8A8A` (9.3:1) · `--info #67E8F9` (14.5:1).

#### Colores de datos (corte/relleno y series)

| Token | Claro | Oscuro | Origen |
|---|---|---|---|
| `--data-cut` (corte / desmonte) | `#0072B2` | `#56B4E9` | Okabe-Ito azul [36][37] |
| `--data-fill` (relleno / terraplén) | `#D55E00` | `#E69F00` | Okabe-Ito bermellón/naranja [36] |
| `--data-terrain` (terreno) | `#475569` | `#94A3B8` | neutro |
| `--data-design` (rasante) | `#0F172A` discontinua | `#F1F5F9` discontinua | |
| `--data-series-3` | `#009E73` | `#009E73` | Okabe-Ito verde azulado |
| `--data-series-4` | `#CC79A7` | `#CC79A7` | Okabe-Ito púrpura |

Azul/naranja es la pareja binaria más segura para todos los tipos de daltonismo [37]. Se añaden **tramas** (rayado para relleno, punteado para corte) para impresión B/N y modo Sol.

#### Implementación CSS (extracto)

```css
:root, [data-theme="light"] {
  --bg:#F8FAFC; --surface:#FFFFFF; --surface-2:#F1F5F9;
  --text:#0F172A; --text-2:#334155; --text-muted:#475569;
  --border:#CBD5E1; --border-strong:#64748B;
  --brand:#B45309; --brand-text:#92400E; --brand-container:#FFF7ED; --on-brand:#FFFFFF;
  --accent:#0F766E;
  --ok:#166534; --ok-bg:#DCFCE7; --warn:#7C4A03; --warn-bg:#FEF9C3;
  --err:#991B1B; --err-bg:#FEE2E2; --info:#0C4A6E;
  --data-cut:#0072B2; --data-fill:#D55E00;
}
[data-theme="dark"] {
  --bg:#0B1220; --surface:#111A2B; --surface-2:#1A2438;
  --text:#F1F5F9; --text-2:#CBD5E1; --text-muted:#94A3B8;
  --border:#334155; --border-strong:#64748B;
  --brand:#FBBF24; --brand-text:#FBBF24; --brand-container:#3A2A0A; --on-brand:#0B1220;
  --accent:#5EEAD4;
  --ok:#4ADE80; --ok-bg:#052E16; --warn:#FACC15; --warn-bg:#422006;
  --err:#FCA5A5; --err-bg:#450A0A; --info:#7DD3FC;
  --data-cut:#56B4E9; --data-fill:#E69F00;
}
[data-theme="sun"] {
  --bg:#FFFFFF; --surface:#FFFFFF; --surface-2:#FFFFFF;
  --text:#000000; --text-2:#000000; --text-muted:#1F2937;
  --border:#000000; --border-strong:#000000; --border-width:2px;
  --brand:#7C2D12; --brand-text:#7C2D12; --brand-container:#FFFFFF; --on-brand:#FFFFFF;
  --ok:#14532D; --warn:#713F12; --err:#7F1D1D; --info:#0C4A6E;
  --shadow-1:none; --shadow-2:none; --shadow-3:none;
}
@media (prefers-color-scheme: dark) { :root:not([data-theme]) { /* = dark */ } }
```

### 5.3 Tipografía

| Rol | Familia | Tamaño / interlineado | Peso | Uso |
|---|---|---|---|---|
| Display | Inter | 32 / 40 | 700 | Cota/cierre destacado |
| Título 1 | Inter | 24 / 32 | 700 | Título de pantalla |
| Título 2 | Inter | 20 / 28 | 600 | Cabecera de tarjeta/sección |
| Cuerpo | Inter | 16 / 24 | 400 | Texto general (mínimo absoluto) |
| Cuerpo fuerte | Inter | 16 / 24 | 600 | Botones, etiquetas activas |
| Etiqueta | Inter | 14 / 20 | 500 | Etiquetas de campo, nav (≥ 12 nunca) |
| Dato tabla | Inter `tabular-nums` | 18 / 24 | 500 | Celdas numéricas, alineadas a la derecha |
| Lectura en edición | JetBrains Mono (o Roboto Mono) | 40 / 48 | 600 | Display del teclado |
| Código/ID | JetBrains Mono | 16 / 24 | 500 | `PR-2`, `P-13` |

- Inter con `font-variant-numeric: tabular-nums` en todas las tablas y KPIs [28][29]; `ss01`/`cv11` opcionales para distinguir `1`/`l`.
- Empaquetar las fuentes **en la app** (no Google Fonts en runtime: offline-first).
- Respetar el escalado de fuente del sistema hasta 130 % sin romper la tabla (la tabla pasa a 2 líneas por fila).

### 5.4 Espaciado, radios y elevaciones

- **Escala base 4**: `4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 48 · 64`. Margen lateral de pantalla 16; separación entre tarjetas 12; padding interno de tarjeta 16; separación entre objetivos táctiles ≥ 12.
- **Radios**: `--r-sm 8px` (chips, inputs) · `--r-md 12px` (tarjetas, botones) · `--r-lg 20px` (bottom sheets, arriba) · `--r-full 999px` (FAB extendido, badges).
- **Elevaciones** (claro): `--shadow-1: 0 1px 2px rgba(15,23,42,.08)` (tarjeta) · `--shadow-2: 0 4px 12px rgba(15,23,42,.12)` (barra inferior, FAB) · `--shadow-3: 0 12px 32px rgba(15,23,42,.18)` (bottom sheet, diálogo). En oscuro la elevación se expresa con superficies más claras (`#111A2B → #1A2438 → #24304A`), como en Material dark [27]. En Sol: sin sombras, borde de 2 px.
- **Movimiento**: 150 ms (feedback), 250 ms (hojas), `prefers-reduced-motion` respetado.

### 5.5 Iconografía (lucide-react)

Trazo 2 px (2.25 en modo Sol), tamaño 24, siempre con etiqueta en navegación.

| Concepto | Icono |
|---|---|
| Inicio / Nivelación / Puntos / Cálculos / Informes | `house` · `ruler` · `map-pin` · `calculator` · `file-text` |
| Nueva / añadir | `plus` |
| Importar / exportar / compartir | `file-up` · `file-down` · `share-2` |
| PDF | `file-text` + badge "PDF" |
| Cumple / al límite / no cumple | `circle-check` · `triangle-alert` · `circle-x` |
| Deshacer / rehacer | `undo-2` · `redo-2` |
| Modo Sol / oscuro | `sun` · `moon` |
| Búsqueda / comandos | `search` · `command` |
| Perfil / planta | `chart-line` (o `chart-spline`) · `map` |
| PR / punto de referencia | `flag` / `triangle` |
| Estación | `crosshair` |
| Guardado / offline | `cloud-check` · `cloud-off` (sólo informativo) |
| Ajustes | `settings` |

### 5.6 Estados

| Estado | Color | Icono | Texto | Badge |
|---|---|---|---|---|
| **Cumple** | `--ok` | `circle-check` | "Cumple · 4.1 / 13.7 mm" | fondo `--ok-bg` |
| **Al límite / advertencia** | `--warn` | `triangle-alert` | "Al límite · 12.9 / 13.7 mm" | fondo `--warn-bg` |
| **No cumple / error** | `--err` | `circle-x` | "No cumple · 18.2 / 13.7 mm" | fondo `--err-bg` |
| **Info / en curso** | `--info` | `info` | "Libreta abierta · 6 estaciones" | |
| **Deshabilitado** | `--text-muted` 60 % | — | | |
| **Foco** | anillo 3 px `--brand` + 2 px offset | | | |

### 5.7 Componentes

1. **Tarjeta KPI**: 2 columnas en móvil. Etiqueta (14/500 `--text-muted`) · valor (32/700 tabular) · unidad (16) · delta/estado (badge). Toda la tarjeta es tocable (lleva al detalle).
   ```
   ┌───────────────────┐
   │ Cierre            │
   │ −4.1 mm  ✔ Cumple │
   │ Tol. ±13.7 mm     │
   └───────────────────┘
   ```
2. **Tabla de libreta**: cabecera fija; columnas `Pto · Atrás · Inter. · Adelante · Desnivel · Cota`; números a la derecha, tabulares; fila activa con borde izquierdo 4 px `--brand` y fondo `--brand-container`; fila con aviso con borde `--warn`; filas de 56 dp; deslizar fila → Editar/Borrar (con deshacer). En pantallas estrechas, columnas secundarias (distancias) se ocultan y van a la hoja de detalle.
3. **Chips**: 40 dp visibles + área táctil 48; filtro (seleccionables con check), entrada (PR, puntos), sugerencia (acciones rápidas).
4. **Segmented control**: 2–4 segmentos, 48 dp alto, ancho completo; segmento activo `--brand` sólido con texto `--on-brand`.
5. **Botones**: Primario (relleno `--brand`, 56 dp), Secundario (borde `--border-strong`), Texto (para "Más opciones"), Peligro (texto `--err`; relleno solo en confirmación final).
6. **Campo numérico**: abre siempre el teclado custom; muestra unidad a la derecha; error debajo con icono.
7. **Barra de cierre fija** (en libreta): `Σ Atrás · Σ Adelante · Cierre parcial · semáforo`.
8. **Snackbar con DESHACER**, **Bottom sheet**, **Paleta de comandos** (lista con secciones "Acciones", "Puntos", "Libretas").
9. **Indicador de guardado**: "Guardado ✓" (texto muted) junto al título.
10. **Estado vacío** ilustrado con un CTA único ("Crea tu primera nivelación").

---

## 6. Visualización de datos topográficos

Principios generales: ejes con unidades, números tabulares, **exageración vertical declarada** ("Esc. V ×10"), leyenda directa sobre las líneas (no cajas de leyenda), gestos pinch/pan con botones +/− de 48 dp como alternativa, tooltip al tocar (no al pasar), y versión imprimible en B/N con tramas. Librería sugerida: SVG propio con D3-scale o uPlot/Recharts (ligeros, funcionan offline).

### 6.1 Perfil longitudinal

- Eje X: distancia al origen (PK 0+000), eje Y: cota. Terreno = línea sólida `--data-terrain` 2 px; rasante/proyecto = línea discontinua `--data-design`.
- Área entre ambas: **corte** `--data-cut` 30 % opacidad + punteado; **relleno** `--data-fill` 30 % + rayado diagonal.
- Puntos de estación/PR marcados con iconos (PR = triángulo relleno), etiquetas de cota cada N puntos para no saturar.
- Banda inferior tipo guitarra (PK · cota terreno · cota rasante · corte/relleno) desplazable con el gráfico.

### 6.2 Planta de puntos

- Dispersión X/Y con aspecto 1:1 obligatorio; norte arriba con flecha; escala gráfica.
- Color por **código** (Okabe-Ito categórico, máx. 6 + "otros" gris) y forma por tipo (PR ▲, estación ✚, punto ●) para no depender del color.
- Etiquetas de nombre que aparecen al hacer zoom; selección de punto → bottom sheet con detalle y "Calcular cota / Usar como PR".
- Opcional: rampa de color secuencial por cota (de `#E0F2FE` a `#0C4A6E`) con leyenda continua.

### 6.3 Gráfico de cierre

- **Medidor horizontal** (bullet chart): eje de 0 a 1.5·T; zonas de fondo verde (≤0.8 T), ámbar (0.8–1 T), roja (>T) en tonos claros; marcador negro del error real; texto "−4.1 mm de ±13.7 mm (30 %)".
- **Error acumulado por estación** (línea) contra la envolvente ±k·√K (banda gris) — muestra *dónde* se fue el error.
- En itinerarios ida/vuelta: barras divergentes por tramo (ida − vuelta), azul/naranja.

### 6.4 Corte / relleno accesibles

- Pareja **azul (corte) / bermellón-naranja (relleno)** de Okabe-Ito [36][37], nunca rojo/verde.
- Siempre con trama + etiqueta textual ("Corte 125.4 m³") y signo (+/−) documentado en la leyenda.
- Paleta divergente para mapas de diferencias: `#0072B2 → #F8FAFC → #D55E00` con el blanco en 0.

---

## 7. Wireframes (ASCII) de las 6 pantallas principales

### 7.1 Inicio

```
┌──────────────────────────────────────────┐
│ ◉ Autovía A-4 · Tramo 2     ☀  🔍  ⚙     │ ← proyecto activo (toca → hoja)
│ Guardado ✓                               │
├──────────────────────────────────────────┤
│ ┌──────────────────────────────────────┐ │
│ │ ▶ CONTINUAR                          │ │
│ │ Nivelación Eje 1 – ida               │ │
│ │ Est. 7 · PR-2 → PR-5 · hace 12 min   │ │
│ └──────────────────────────────────────┘ │
│                                          │
│ Acciones rápidas                         │
│ ┌────────┐┌────────┐┌────────┐┌────────┐ │
│ │  ＋    ││  ⤒    ││  ⌗    ││  PDF   │ │
│ │ Nueva  ││Importar││ Cota   ││Exportar│ │
│ │ nivel. ││ nivel  ││ punto  ││        │ │
│ └────────┘└────────┘└────────┘└────────┘ │
│                                          │
│ Hoy                                      │
│ ┌─────────────────┐┌─────────────────┐   │
│ │ Libretas        ││ Cierres         │   │
│ │ 3               ││ 2 ✔   1 ⚠       │   │
│ └─────────────────┘└─────────────────┘   │
│ ┌─────────────────┐┌─────────────────┐   │
│ │ Puntos          ││ Último informe  │   │
│ │ 148             ││ 09:42 · PDF     │   │
│ └─────────────────┘└─────────────────┘   │
│                                          │
│ Recientes                                │
│ ● Eje 1 – vuelta        ✔ −3.2 mm    ›   │
│ ● Drenaje ODT-4         ⚠ 11.8 mm    ›   │
│                          ┌────────────┐  │
│                          │ ＋ Nueva    │  │ ← FAB extendido
│                          └────────────┘  │
├──────────────────────────────────────────┤
│  ⌂       ═        ⦿        ▦       ▤     │
│ Inicio Nivelación Puntos Cálculos Informes│
└──────────────────────────────────────────┘
```

### 7.2 Libreta de nivelación (entrada)

```
┌──────────────────────────────────────────┐
│ ←  Eje 1 – ida          ↶  ☀  ⋮          │
│ [ Tabla | Perfil | Resumen ]             │
├──────────────────────────────────────────┤
│ Pto    Atrás  Adel.  Desn.    Cota       │
│ PR-2   1.523         —      102.350      │
│ E1            0.987 +0.536  102.886      │
│ E1     1.412                             │
│▌E2           [1.487]               ⚠     │ ← fila activa
├──────────────────────────────────────────┤
│ ΣA 2.935  ΣAd 2.474  Parcial +0.461  ✔   │ ← barra de cierre fija
├──────────────────────────────────────────┤
│ ADELANTE · Est. 2 · E2       1.487 m     │
│ ⚠ Salto de 0.50 m respecto a la anterior │
├──────────┬──────────┬──────────┬─────────┤
│    7     │    8     │    9     │   ⌫     │
│    4     │    5     │    6     │ ATRÁS   │
│    1     │    2     │    3     │ INTER   │
│    0     │    .     │   ±      │ ADEL. ● │
├──────────┴──────────┴──────────┴─────────┤
│  ↶ Deshacer      │    SIGUIENTE  ▶       │
└──────────────────────────────────────────┘
   (la barra inferior se oculta mientras el teclado está activo)
```

### 7.3 Resultado / cierre de libreta

```
┌──────────────────────────────────────────┐
│ ←  Eje 1 – ida · Resultado        ⋮      │
│ [ Tabla | Perfil | Resumen● ]            │
├──────────────────────────────────────────┤
│ ┌──────────────────────────────────────┐ │
│ │ ✔ CUMPLE                             │ │
│ │ Cierre  −4.1 mm                      │ │
│ │ Tolerancia ±13.7 mm (12·√1.30 km)    │ │
│ │ 0 ──────■────────┃▒▒▒▒┃░░░░░ 1.5T   │ │ ← bullet chart
│ └──────────────────────────────────────┘ │
│ ┌─────────────────┐┌─────────────────┐   │
│ │ Desnivel total  ││ Longitud        │   │
│ │ +3.412 m        ││ 1.30 km · 14 est│   │
│ └─────────────────┘└─────────────────┘   │
│ Comprobación aritmética   ✔ ΣA−ΣAd = ΔH   │
│ Compensación  [ Proporcional a distancia ▾]│
│                                          │
│ Error acumulado por estación             │
│  +5┤      ·  ·                           │
│   0┼─·──·──────·──·──·───               │
│  −5┤                     ·  ·            │
│    └ E1  E3  E5  E7  E9  E11 E13         │
├──────────────────────────────────────────┤
│ [ Compensar ]          [ PDF ⤓ ]         │ ← 56dp
└──────────────────────────────────────────┘
```

### 7.4 Importar nivel digital → informe

```
┌──────────────────────────────────────────┐
│ ←  Importar nivel                         │
├──────────────────────────────────────────┤
│ 📄 linea_eje1.gsi                         │
│ Formato detectado: Leica GSI-16  ✔        │
│ 28 estaciones · 2 PR · 1.30 km            │
│                                          │
│ ┌──────────────────────────────────────┐ │
│ │ Cota PR-2 (inicial)                  │ │
│ │ [ 102.350 ] m   ← tomada del proyecto│ │
│ └──────────────────────────────────────┘ │
│ ┌──────────────────────────────────────┐ │
│ │ ✔ CUMPLE · cierre −4.1 / ±13.7 mm    │ │
│ └──────────────────────────────────────┘ │
│ Vista previa                              │
│ Pto    Atrás   Adel.   Cota              │
│ PR-2   1.5230          102.3500          │
│ 1001          0.9870   102.8860          │
│ …                                         │
│                                          │
│ Plantilla: [Informe estándar ▾]           │
├──────────────────────────────────────────┤
│ [ Guardar libreta ]  [ GENERAR PDF ▶ ]   │
└──────────────────────────────────────────┘
```

### 7.5 Puntos (lista / planta)

```
┌──────────────────────────────────────────┐
│ Puntos · 148                  🔍  ⤒  ⋮    │
│ [ Lista | Planta● | Perfil ]             │
│ (Todos) (PR) (Estaciones) (Código: BOR)   │ ← chips
├──────────────────────────────────────────┤
│  N ↑                                      │
│        ▲PR-2                              │
│          ●  ●   ●                         │
│              ●    ●   ✚E4                 │
│      ●  ●            ●   ●                │
│                  ▲PR-5        ●           │
│  ├──── 20 m ────┤                [+] [−]  │
├──────────────────────────────────────────┤
│ ▔▔▔▔▔ (bottom sheet al tocar un punto) ▔▔ │
│ P-37 · BOR                                │
│ X 452 318.204  Y 4 476 911.630            │
│ Z 103.218                                 │
│ [ Usar como PR ] [ Calcular cota ] [✎]    │
│                          ┌─────────────┐  │
│                          │ ＋ Punto     │  │
├──────────────────────────────────────────┤
│  ⌂       ═        ⦿●       ▦       ▤     │
└──────────────────────────────────────────┘
```

### 7.6 Cálculos (herramientas) + calculadora de cota

```
┌──────────────────────────────────────────┐
│ Cálculos                         🔍       │
├──────────────────────────────────────────┤
│ ┌─────────────────┐┌─────────────────┐   │
│ │ ⌗ Cota de punto ││ ↕ Desnivel      │   │
│ └─────────────────┘└─────────────────┘   │
│ ┌─────────────────┐┌─────────────────┐   │
│ │ ∠ Pendiente     ││ ⟂ Dist./Azimut  │   │
│ └─────────────────┘└─────────────────┘   │
│ ┌─────────────────┐┌─────────────────┐   │
│ │ ⋯ Interpolación ││ ◧ Corte/Relleno │   │
│ └─────────────────┘└─────────────────┘   │
│ Recientes: Cota P-37 = 103.218 m   ›      │
├══════════════════════════════════════════┤
│ ▔▔▔ Cota de un punto (bottom sheet) ▔▔▔▔ │
│ Cota PR       [ 102.350 ] m  (PR-2 ▾)    │
│ Lectura atrás [   1.523 ] m              │
│ Lectura punto [  0.655▌ ] m              │
│ ───────────────────────────────────────  │
│ Altura instrumental   103.873 m          │
│ COTA DEL PUNTO        103.218 m   ← 32px │
│ [ Copiar ]       [ Guardar como punto ]  │
│ (teclado numérico custom debajo)          │
└──────────────────────────────────────────┘
```

(Pantalla complementaria **Informes**: lista de PDFs con fecha, libretas incluidas, estado de cierre en badge, acciones "Compartir" y "Regenerar"; FAB "Nuevo informe" → chips de libretas → plantilla → Generar.)

---

## 8. Recomendaciones de implementación (React + Capacitor)

- **Tokens** en CSS custom properties (sección 5.2) + `data-theme` en `<html>`; Tailwind opcional mapeando sus colores a las variables.
- **Componentes**: base headless (Radix UI / React Aria) para accesibilidad + estilos propios; `vaul` o similar para bottom sheets; `cmdk` para la paleta de comandos; `lucide-react` para iconos.
- **Plugins Capacitor**: Haptics (feedback), Keep Awake, Filesystem + Share (PDF), App (intents "Abrir con" para .gsi/.dat), SQLite (datos), Preferences (ajustes) [16][31].
- **Teclado custom**: `inputMode="none"` en los campos para que no aparezca el teclado del sistema; gestionar foco propio.
- **Rendimiento**: listas virtualizadas para >500 puntos; gráficos en SVG con decimación.
- **Pruebas de campo**: test de uso con guantes de trabajo, a pleno sol (≥ 50 000 lux) y con el móvil a 40 % de brillo; medir toques por tarea vs. tabla 4.5.

---

## 9. Fuentes

1. Material Design — Accessibility (touch targets 48×48 dp, ≈9 mm, separación 8 dp). https://m2.material.io/design/usability/accessibility.html · https://m1.material.io/usability/accessibility.html
2. LogRocket — All accessible touch target sizes; Mobileviewer — Touch target size (FAB 56 dp). https://blog.logrocket.com/ux-design/all-accessible-touch-target-sizes/ · https://www.mobileviewer.io/blog/touch-target-size
3. W3C — WCAG 2.2. https://www.w3.org/TR/WCAG22/
4. W3C — Understanding SC 1.4.6 Contrast (Enhanced). https://www.w3.org/WAI/WCAG20/Understanding/contrast-enhanced · https://accessibility.build/wcag/1-4-6
5. Gapsy Studio — UI/UX Guide to Agriculture App Design (7:1, botones 60–72 px, 16 px de separación, texto 16–18 px, colores desaturados). https://gapsystudio.com/blog/agriculture-app-design/
6. Material Design 3 — Navigation bar guidelines (3–5 destinos, etiquetas, FAB sobre la barra). https://m3.material.io/components/navigation-bar/guidelines
7. Trimble — Trimble Access Field Software / v2024.00. https://geospatial.trimble.com/en/products/software/trimble-access · https://geospatial.trimble.com/en/resources/land-surveying/introducing-trimble-access-software-v2024-00
8. Trimble Access General Survey User Guide 2025.10. https://help.fieldsystems.trimble.com/trimble-access-pdfs/2025.10/en/TA_General_Survey.pdf
9. Carlson — SurvPC Main Menu / User Interface. https://help.carlsonsw.com/en/survpc/main-menu/main-menu.html · https://help.carlsonsw.com/en/survpc/user-interface/user-interface.html
10. Topcon/Sokkia — MAGNET Field Help v3.0. https://us.sokkia.com/sites/default/files/sc_files/downloads/magnet_field_v300_help_manual_en.pdf
11. Trimble Access — Favorite screens and functions. https://help.fieldsystems.trimble.com/trimble-access/latest/en/software-favorites.htm
12. Topcon — Five FAQs about MAGNET Field (ocultar/renombrar menús). https://mytopcon-v1.topconpositioning.com/gb/insights/five-faqs-about-magnet-field
13. Nielsen Norman Group — Confirmation Dialogs Can Prevent User Errors; User Control and Freedom. https://www.nngroup.com/articles/confirmation-dialog/ · https://www.nngroup.com/articles/user-control-and-freedom/
14. Userpilot — Mobile UX design in 2026: the interruption problem (cita NN/g State of UX 2026). https://userpilot.com/blog/mobile-ux-design/
15. MTSU — Differential Leveling (tolerancia 3.er orden 12 mm·√K). https://mtsu.pressbooks.pub/app/uploads/sites/119/2024/07/DIFFERENTIAL-LEVELING.pdf
16. Ionic — Choosing a data storage solution (Preferences vs SQLite). https://ionic.io/blog/choosing-a-data-storage-solution-ionic-storage-capacitor-storage-sqlite-or-ionic-secure-storage · https://capgo.app/blog/capacitor-key-value-storage/
17. Trimble Access — Keypad shortcuts. https://help.fieldsystems.trimble.com/trimble-access/latest/en/software-shortcuts.htm
18. Trimble T10x — Using the programmable keys. https://help.fieldsystems.trimble.com/t10x/using-the-keys-on-the-t10x.htm
19. Carlson — SurvCE and SurvPC. https://www.carlsonsw.com/product/carlson-survce/
20. Carlson — Keyboard Operations. https://help.carlsonsw.com/en/survpc/user-interface/keyboard-operations/keyboard-operations.html
21. RPLS.com — "The ambiguity of Carlson's (SurvPC/CE) website…". https://rpls.com/forums/software-cad-mapping/the-ambiguity-of-carlsons-survpc-ce-website-and-partner-websites-is-proving-to-be-a-little-frustrating/
22. Bench Mark USA — MicroSurvey software (FieldGenius reconstruido para táctil). https://rtkgpssurveyequipment.com/microsurvey/ · https://aaisurvey.com/products/microsurvey-fieldgenius
23. Bench Mark USA — FieldGenius vs FieldGenius Legacy. https://rtkgpssurveyequipment.com/fieldgenius-vs-fieldgenius-legacy/
24. AlterSquare — Mobile-first design for construction management software. https://altersquare.io/mobile-first-design-for-construction-management-software-field-usability-guide/
25. MicroSurvey Helpdesk — Leveling topics (GSI, DiNi, TDEF). https://helpdesk.microsurvey.com/section/107-leveling-topics
26. Trimble Business Center — Import Trimble DiNi Level Files (.dat). https://help.fieldsystems.trimble.com/tbc/4652.htm
27. Google Codelabs — Design a dark theme with Material; Prototypr — Dark theme for Android (#121212, tonos 200). https://codelabs.developers.google.com/codelabs/design-material-darktheme · https://blog.prototypr.io/how-to-design-a-dark-theme-for-your-android-app-3daeb264637
28. rsms/inter — Discusión sobre tabular numbers; FontFYI — Inter guide. https://github.com/rsms/inter/discussions/813 · https://fontfyi.com/blog/inter-font-guide/
29. DEV — Tabular numbers in CSS: font-variant-numeric vs monospace hacks. https://dev.to/alanwest/tabular-numbers-in-css-font-variant-numeric-vs-monospace-hacks-25cn
30. UX Forgiveness: Undo, Confirm & Error Recovery. https://creditunionwebsolutions.com/ux-design/the-forgiveness-principle-in-ux-design-a-practical-framework-for-designing-undo-confirmation-and-error-recovery-patterns-users-can-trust/
31. Capawesome — How to use SQLite in a Capacitor app. https://capawesome.io/blog/how-to-use-sqlite-in-a-capacitor-app/
32. Material Components Android — BottomNavigation docs. https://github.com/material-components/material-components-android/blob/master/docs/components/BottomNavigation.md
33. Material Design 3 — Navigation rail. https://m3.material.io/components/navigation-rail/guidelines
34. Leica Geosystems — Training: How to process level data. https://leica-geosystems.com/-/media/e1114ca40fda4640a2afc19292063ea8.ashx
35. MSLNZ — ls_digital_level (Leica LS15, salida GSI16). https://github.com/MSLNZ/ls_digital_level
36. Sci-Draw — Okabe-Ito colorblind-safe palette (hex). https://sci-draw.com/blog/colorblind-safe-palettes-okabe-ito-reference
37. Datawrapper — What to consider when visualizing data for colorblind readers. https://www.datawrapper.de/blog/colorblindness-part2

> Nota metodológica: las fricciones atribuidas a las apps comerciales se infieren de su documentación oficial (estructura de menús, existencia de favoritos/atajos/ocultación de menús) y de foros profesionales; no se realizó test de usabilidad propio. Los ratios de contraste de la sección 5.2 se calcularon con la fórmula de luminancia relativa de WCAG 2.x.
