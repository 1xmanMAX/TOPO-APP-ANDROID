# App de Topografía — Documento de Diseño

**Fecha:** 2026-08-08
**Estado:** Diseño en progreso — Secciones 1 a 4 aprobadas. Falta Sección 5 (UI/UX, errores, testing).
**Autor:** Max (max.antony.9@gmail.com) — Perú

---

## 1. Resumen

Aplicación de topografía para **campo y gabinete**, cuyo núcleo es el **control de niveles por capas** en pavimentación urbana y veredas: terreno existente → rasante de proyecto → cota teórica de cada capa estructural → corte/relleno por punto → verificación de tolerancias y de drenaje → informe.

Alrededor de ese núcleo se agregan, por fases, levantamiento con curvas de nivel, volúmenes, vías y catastro.

**El MVP en una frase:** importas o nivelas los puntos, defines tus capas y pendientes, y la app te dice punto por punto cuánto cortar o rellenar en cada capa, qué está fuera de tolerancia y dónde no drena — y lo entrega en PDF, Excel y DXF.

---

## 2. Decisiones tomadas

| Tema | Decisión |
|---|---|
| Alcance | Campo **y** gabinete |
| Módulo #1 | Nivelación por capas de pavimento y veredas |
| Equipos de campo | Todos: nivel de ingeniero + mira, estación total, GNSS/RTK, nivel láser |
| Plataformas | Android nativo/extendido (campo) + Web sobre Windows (gabinete) |
| Destino | Uso propio ahora; vender después (núcleo preparado, sin costo hoy) |
| Stack | **Opción A**: núcleo TypeScript compartido + Capacitor (Android) + Web (Windows) |
| 3D | Visualizador hermoso + breaklines + medición esencial. **NO** editor CAD completo |
| Concurrencia | Una sola persona edita un proyecto a la vez |
| Sincronización | Por archivo `.topo` (sin nube en v1) |
| Normativa | Perú: RNE CE.010, RNE CE.040, MTC EG-2013 |
| Orden de entrega | MVP en navegador/Windows → empaquetado Android → versión web pulida |

### 2.1 Restricción técnica decisiva

Las estaciones totales y la mayoría de receptores GNSS usan **Bluetooth Clásico (SPP/RFCOMM)**. El navegador **no puede** hablar SPP — Web Bluetooth solo soporta BLE. Por eso el módulo de campo con equipos exige Android nativo o un contenedor nativo (Capacitor con plugin Kotlin). No es preferencia, es límite de plataforma.

### 2.2 Por qué Opción A (y no Flutter ni Kotlin nativo)

Lo caro de la app no es la interfaz, es el **motor de cálculo topográfico**. Debe escribirse **una sola vez** y estar cubierto por tests.

- **Flutter**: ecosistema Dart sin DXF, sin proj4 serio, sin LandXML, Excel limitado, 3D débil (terminaría embebiendo Three.js igual).
- **Kotlin nativo + web separada**: dos bases de código y el motor duplicado para siempre. Autodestructivo para uso propio.
- **Opción A**: el ecosistema JS ya resuelve ~70% del requisito de formatos, y Three.js es el mejor motor 3D disponible en cualquier stack.

Objetivo de "ligera": **APK < 15 MB**, arranque **< 2 s**. Alcanzable con disciplina de dependencias desde el día uno.

---

## 3. Arquitectura

Principio rector: **el motor de cálculo no sabe que existe una pantalla.** TypeScript puro, sin DOM, sin archivos, sin Bluetooth. Recibe números, devuelve números.

```
topo-app/
├── packages/
│   ├── core/        ← motor puro. CERO dependencias de UI/IO.
│   │   ├── geometry/     puntos, distancias, rumbos, poligonales
│   │   ├── surface/      TIN (Delaunay), interpolación de cota, curvas de nivel
│   │   ├── leveling/     libreta, cierre de circuito, error admisible, compensación
│   │   ├── layers/       rasante de proyecto, espesor por capa, corte/relleno
│   │   ├── grade/        pendientes, verificación de drenaje, depresiones cerradas
│   │   └── volume/       volúmenes por prismas y por secciones
│   │
│   ├── io/          ← formatos. Depende de core, nada más.
│   │   └── csv · dxf · landxml · kml · xlsx · clipboard-tsv
│   │
│   ├── ui/          ← componentes de vista reutilizables
│   │   ├── plan2d/       vista en planta (Canvas 2D)
│   │   ├── viewer3d/     Three.js
│   │   │   ├── scene/      superficie TIN, capas apiladas, sólido corte/relleno
│   │   │   ├── shading/    color por cota / corte-relleno / pendiente,
│   │   │   │               exageración vertical, sol y sombras, cortes de sección
│   │   │   ├── sketch/     breaklines sobre el 3D con snap a punto/arista
│   │   │   ├── measure/    distancia 3D, desnivel, pendiente %, área, cota
│   │   │   └── capture/    captura en alta resolución para informes
│   │   ├── charts/       uPlot: perfil longitudinal, secciones transversales
│   │   └── tables/       tabla editable con pegado desde Excel
│   │
│   ├── app/         ← rutas, estado, persistencia
│   └── report/      ← plantillas de informe → PDF
│
└── platforms/
    ├── android/     ← Capacitor + plugins Kotlin (Bluetooth SPP, GNSS NMEA)
    └── web/         ← build para Windows (navegador; Tauri opcional después)
```

### 3.1 Reglas de dependencia (esto evita que el proyecto se pudra)

- `core` no importa **nada** de los demás. Ni `io`, ni `ui`, ni librerías de navegador.
- `io` puede importar `core`. `ui` puede importar `core`. **Nunca al revés.**
- `app` es el único que junta todo.
- Las plataformas solo aportan **capacidades** (Bluetooth, archivos, GPS) detrás de una interfaz común. La app pide "dame puntos del equipo"; no sabe si vino de Android o de un archivo.

**Consecuencia práctica:** en Windows la app funciona completa **excepto** conexión directa a equipos (ahí importas archivo). En Android funciona completa **incluyendo** equipos. Mismo código.

### 3.2 Librerías previstas

`delaunator` (TIN) · `three` (3D) · `uPlot` (2D) · `proj4js` (sistemas de coordenadas) · `SheetJS` (Excel) · `dxf-parser` / `dxf-writer` (AutoCAD) · `@tmcw/togeojson` (KML).

---

## 4. Modelo de datos

**Principio rector: los datos crudos nunca se sobrescriben; las cotas son siempre derivadas.** Si se corrige un BM, todo el proyecto se recalcula solo.

### 4.1 Proyecto — archivo `.topo` portable (ZIP con JSON)

```
Proyecto
├── meta           nombre, cliente, obra, ubicación, autor, fechas
├── crs            sistema de coordenadas (EPSG, UTM, datum)
├── bms[]          bancos de nivel: id, x, y, cota, tipo (oficial/auxiliar)
├── puntos[]
├── libretas[]     nivelación con nivel de ingeniero (lecturas crudas)
├── lineas[]       breaklines, bordes de vereda, ejes
├── superficies[]  terreno existente, rasante, una por cada capa
├── paqueteCapas
├── variables[]    definidas por el usuario
├── reglas[]       verificaciones
└── vistas         configuración de visualización guardada
```

### 4.2 Punto

```
Punto { id, codigo, x, y, z, origen, precision, timestamp, notas }
```

`origen` = nivel | estacionTotal | gnss | importado | calculado. `precision` en metros.
Permite filtrar ("solo puntos mejores que 2 cm") y auditar el origen de una cota dudosa. Barato de guardar, caro de no tener.

Códigos de punto previstos: BM, TN, EJE, BORDE, VER, PC.

### 4.3 Libreta de nivelación

Modelada tal como se llena en campo:

```
Libreta
├── bmInicial      { puntoId, cota }
├── estaciones[]
│     vistaAtras   { puntoId, lectura }      (+)
│     cotaInstr    ← calculado, nunca escrito
│     intermedias[] { puntoId, lectura }     (cotas del terreno)
│     vistaAdelante { puntoId, lectura }     (−, punto de cambio)
├── bmFinal        (circuito cerrado)
└── cierre         ← calculado: desnivel, error, tolerancia, ¿pasa?, compensación
```

Calcula el **error de cierre** y lo compara con la tolerancia según la clase de nivelación. Si no pasa, avisa **en campo**, cuando todavía se puede repetir.

### 4.4 Paquete de capas — el corazón

```
PaqueteCapas "Pavimento flexible Av. Los Álamos"
└── capas de arriba hacia abajo:
      { "Carpeta asfáltica", espesor 0.05, tolerancia ±0.010 }
      { "Base granular",     espesor 0.20, tolerancia ±0.020 }
      { "Sub-base",          espesor 0.25, tolerancia ±0.020 }
      { "Subrasante",        nivel de referencia }
```

Cada capa **genera su propia superficie** = rasante final − espesores acumulados encima. Cambiar un espesor recalcula todas las superficies, volúmenes e informes al instante.

### 4.5 Rasante de proyecto — tres formas (las tres se dan en obra)

1. **Por pendientes**: cota inicial + pendiente longitudinal + bombeo transversal → la app genera la superficie.
2. **Por cotas de proyecto** dadas en puntos específicos.
3. **Importada** desde LandXML.

### 4.6 Drenaje

Sobre la rasante, `core/grade/` calcula:
- pendiente de cada triángulo → alerta si es **menor que la mínima** (agua estancada)
- **depresiones cerradas** (charcos: zonas sin salida)
- **rutas de flujo** del agua, dibujadas sobre el 3D

### 4.7 Sincronización campo → gabinete (v1)

El archivo `.topo`, transferido por USB, WhatsApp o Drive. Sin nube, sin cuentas, sin servidor que mantener ni pagar. Un solo editor por proyecto a la vez (confirmado con el usuario).

---

## 5. Variables y reglas configurables

Requisito: cada proyecto tiene sus propias variables; deben poder añadirse o quitarse sin tocar código.

### 5.1 Variable

```
Variable {
  clave      "pend_long_min"
  etiqueta   "Pendiente longitudinal mínima"
  tipo       numero | porcentaje | longitud | opcion | booleano | texto
  unidad     "%" | "m" | "mm"
  valor      0.5
  min, max   rango válido (avisa si se sale)
  ambito     proyecto | capa | tramo | punto
  origen     "CE.040" | "definida por usuario"
}
```

Añadir una variable = agregar una fila. Quitarla = borrarla (la app avisa si alguna regla la usa).

### 5.2 Regla de verificación

```
Regla {
  nombre     "Pendiente mínima de drenaje"
  expresion  "pendiente_long >= pend_long_min"
  severidad  error | advertencia
  mensaje    "Progresiva {est}: {pendiente_long}% < mínimo {pend_long_min}%"
}
```

El motor evalúa cada regla sobre todos los puntos, triángulos y tramos.
**El "informe rápido" no es un módulo aparte: es el resultado de las reglas + tablas + gráficas.**

### 5.3 Valores por defecto — CONFIRMADOS EN NORMA

Se precargan citando su fuente:

| Variable | Valor | Fuente |
|---|---|---|
| Bombeo transversal calzada | 2% usual, **mín. 1%** | OS.060 / práctica urbana |
| Pendiente transversal vereda | **1% a 2%** (máx. 2%) | Normativa de veredas y senderos |
| Pendiente longitudinal vereda | **< 4%** | Normativa de veredas y senderos |
| Pendiente longitudinal mínima (drenaje) | **> 0.5%** | Drenaje pluvial urbano |
| Espesor de base granular compactada | diseño **± 10 mm** | MTC EG-2013 |
| Elevación máx. en capa de rodadura | **5 mm** | RNE CE.010 |
| Elevación máx. en parchados | **10 mm** | RNE CE.010 |
| Superficie terminada | sin zonas de acumulación de agua | RNE CE.010 |
| Tolerancia de cierre en nivelación | **T = e·√K** (mm, K en km) | Topografía estándar |
| → coeficiente `e`, nivelación de precisión | **≤ 7 mm** | ídem |
| → coeficiente `e`, tercer orden (ingeniería común) | **12 a 15 mm** | ídem |
| → rango general del coeficiente | 10 a 30 mm | ídem |

### 5.4 Valores por defecto — NO NORMATIVOS (marcados en amarillo en la UI)

Espesor carpeta asfáltica 0.05 m · base 0.20 m · sub-base 0.25 m · ancho de vereda 1.20 m · sardinel 0.15 m · bombeo vereda 2%.

**Regla de la app: nunca presentar un valor de tanteo como si fuera norma.** Es peor que no tener default.

### 5.5 Plantillas

Precargadas: *Pavimento flexible urbano* · *Pavimento rígido* · *Vereda peatonal* · *Vía afirmada* · *En blanco*.

Flujo real: elegir plantilla → ajustar 3 o 4 valores según el expediente técnico → **guardarla como plantilla propia** → el próximo proyecto arranca en 30 segundos.

### 5.6 Fuentes consultadas

- [RNE CE.010 Pavimentos Urbanos (gob.pe)](https://cdn.www.gob.pe/uploads/document/file/2365614/14%20CE.010%20PAVIMENTOS%20URBANOS%20DS%20N%C2%B0%20010-2010.pdf)
- [RNE CE.040 Drenaje Pluvial (RM 126-2021-VIVIENDA)](https://cdn.www.gob.pe/uploads/document/file/2366728/CE.040%20DRENAJE%20PLUVIAL_RM%20126-2021-VIVIENDA.pdf)
- [Norma OS.060 Drenaje Pluvial Urbano](https://cdn-web.construccion.org/normas/rne2012/rne2006/files/titulo2/03_OS/RNE2006_OS_060.pdf)
- [MTC Manual de Carreteras EG-2013](https://portal.mtc.gob.pe/transportes/caminos/normas_carreteras/documentos/manuales/MANUALES%20DE%20CARRETERAS%202019/MC-01-13%20Especificaciones%20Tecnicas%20Generales%20para%20Construcci%C3%B3n%20-%20EG-2013%20-%20(Versi%C3%B3n%20Revisada%20-%20JULIO%202013).pdf)
- [PROVÍAS — Sección 305.A Base Granular](http://gis.proviasnac.gob.pe/expedientes/2012/LP013/Componente%20de%20Ingenier%C3%ADa/VOL%2002%20%20ESP%20TECNICAS/300%20Sub%20Base%20y%20Bases/305.A%20BASE%20GRANULAR.doc)
- [Nivelación geométrica — errores y tolerancia (U. Huelva)](http://www.uhu.es/carlos.barranco/Almacen/Temas%20Topografia/006Tema%206.pdf)

---

## 6. Listado de funciones

🟢 **MVP** (Fase 1) · 🔵 Fase 2 · ⚪ Fase 3+

### A. Proyecto y datos
- 🟢 Crear/abrir/guardar proyecto en archivo `.topo` portable
- 🟢 Datos de obra: nombre, cliente, ubicación, responsable, fechas
- 🟢 Sistema de coordenadas (UTM/WGS84/PSAD56, EPSG)
- 🟢 Bancos de nivel (BM): oficiales y auxiliares
- 🟢 Autoguardado y recuperación ante cierre inesperado
- 🔵 Historial de versiones del proyecto
- ⚪ Fotos georreferenciadas adjuntas a puntos

### B. Ingreso de datos
- 🟢 Importar CSV/TXT con mapeo de columnas configurable
- 🟢 **Pegar directo desde Excel** (portapapeles TSV)
- 🟢 Tabla editable con validación en vivo
- 🟢 Códigos de punto (BM, TN, EJE, BORDE, VER, PC…)
- 🔵 Conexión Bluetooth a estación total (Android)
- 🔵 Conexión Bluetooth a GNSS/RTK, lectura NMEA (Android)
- 🔵 Captura con GPS interno del celular (baja precisión, para croquis)
- ⚪ Importar nube de puntos de dron (LAS/LAZ) con submuestreo

### C. Nivelación (libreta)
- 🟢 Libreta digital: vista atrás, cota instrumento, intermedias, vista adelante
- 🟢 Cálculo automático de cotas (lecturas crudas siempre preservadas)
- 🟢 **Cierre de circuito: error, tolerancia `e·√K`, ¿pasa o no?** — avisa en campo
- 🟢 Compensación proporcional del error
- 🟢 Clase de nivelación configurable
- 🔵 Nivelación por radiación desde nivel láser
- ⚪ Ajuste de red de nivelación por mínimos cuadrados

### D. Superficies
- 🟢 TIN (Delaunay) desde nube de puntos
- 🟢 Interpolación de cota en cualquier X,Y
- 🟢 Curvas de nivel con intervalo configurable
- 🔵 **Breaklines** (Delaunay restringido) — bordes rectos de vereda y sardinel
- 🔵 Límite de superficie (contorno) y agujeros
- ⚪ Suavizado de curvas y simplificación

### E. Capas de pavimento — el núcleo
- 🟢 Paquete de capas configurable (nombre, espesor, tolerancia, orden)
- 🟢 Rasante de proyecto **por pendientes**
- 🟢 Rasante **por cotas de proyecto** en puntos dados
- 🟢 Superficie generada por cada capa
- 🟢 **Cota teórica de cada capa en cada punto**
- 🟢 **Corte / relleno por punto y por capa**, con semáforo de tolerancia
- 🟢 Espesor real vs. teórico y desviación
- 🔵 Rasante importada de LandXML
- 🔵 Sobreanchos, peraltes y transiciones
- ⚪ Curva masa y diagrama de movimiento de tierras

### F. Pendientes y drenaje
- 🟢 Pendiente longitudinal y transversal por tramo
- 🟢 **Verificación contra pendiente mínima** (alerta de agua estancada)
- 🔵 Detección de **depresiones cerradas** (charcos)
- 🔵 **Rutas de flujo del agua** sobre el modelo
- 🔵 Mapa de pendientes coloreado
- ⚪ Simulación de escorrentía y aporte a sumideros

### G. Visualización 3D
- 🟢 Superficie del terreno en 3D con color por cota
- 🟢 Orbitar, acercar, encuadrar; exageración vertical
- 🔵 **Capas de pavimento apiladas**
- 🔵 Coloreado por corte/relleno y por pendiente
- 🔵 Sol/sombras, cortes de sección interactivos
- 🔵 Dibujar breaklines sobre el 3D con snap
- 🔵 Captura en alta resolución para informe
- ⚪ Animación de recorrido por el eje

### H. Gráficas 2D
- 🟢 Vista en planta con puntos, códigos y curvas
- 🟢 **Perfil longitudinal**: terreno vs. rasante vs. capas
- 🟢 **Secciones transversales** en progresivas configurables
- 🔵 Gráfica de corte/relleno acumulado
- 🔵 Histograma de desviaciones (control de calidad)

### I. Medición y consulta
- 🟢 Cota en cualquier punto (clic)
- 🟢 Distancia horizontal, inclinada y desnivel entre dos puntos
- 🟢 Pendiente % entre dos puntos
- 🟢 Área de polígono y perímetro
- 🔵 Medición sobre el modelo 3D
- 🔵 Volumen entre dos superficies
- 🔵 Buscar y filtrar puntos (por código, capa, precisión, desviación)

### J. Importación / Exportación
- 🟢 CSV / TXT (entrada y salida, formato configurable)
- 🟢 **Excel .xlsx** (tablas completas)
- 🟢 **Copiar tablas al portapapeles** para pegar en Excel
- 🟢 **DXF para AutoCAD**: puntos, curvas, líneas, textos, por capas
- 🔵 LandXML (superficies y ejes — intercambio con Civil 3D)
- 🔵 KML/KMZ para Google Earth
- ⚪ Formatos nativos de estación total (Leica GSI, Topcon, Sokkia)

### K. Informes
- 🟢 **Informe de control de capas**: por punto — teórico, real, desviación, ¿cumple?
- 🟢 **Informe de nivelación**: libreta completa, cierre, compensación
- 🟢 **Informe de incumplimientos**: solo lo que está fuera de tolerancia
- 🟢 Exportar a PDF con membrete, logo y firma
- 🟢 Exportar a Excel
- 🔵 Informe con vistas 3D y gráficas incrustadas
- 🔵 Plantillas de informe editables

### L. Variables y reglas
- 🟢 Variables por proyecto: añadir, quitar, editar
- 🟢 Plantillas Perú precargadas (CE.010, CE.040, EG-2013)
- 🟢 Guardar plantillas propias y reusarlas
- 🟢 Reglas de verificación con expresión y severidad
- 🔵 Editor visual de reglas

### M. Sistema
- 🟢 **Funciona 100% sin internet**
- 🟢 Interfaz en español
- 🟢 Modo claro y oscuro
- 🔵 Botones grandes para uso con guantes en campo
- 🔵 Sincronización celular ↔ PC por archivo
- ⚪ Nube, cuentas y licencias (solo si se decide vender)

---

## 7. Pendiente para la próxima sesión

1. **Decisión abierta:** ¿el 3D básico (sección G, ítems 🟢) se queda en el MVP o pasa a Fase 2? Sacarlo acelera el MVP; dejarlo cumple el requisito de 3D desde el inicio. **Sin resolver.**
2. **Sección 5 del diseño, sin presentar:** interfaz y experiencia de uso ("fantástica UI"), manejo de errores, y estrategia de testing.
3. Tras aprobar la Sección 5: auto-revisión del spec, revisión del usuario, y luego el plan de implementación (skill `writing-plans`).
4. El proyecto **no está bajo control de versiones todavía** — conviene `git init` antes de empezar a codificar.

---

## 8. Registro de la conversación de diseño

Preguntas resueltas con el usuario, en orden:

1. **¿Captura o procesa?** → Ambas: campo + gabinete.
2. **¿Disciplina principal?** → Todas, pero el dolor real y prioritario es **nivelado de pavimento por capas y de veredas**, con aplicación de pendientes y control del flujo de agua.
3. **¿Equipo de campo?** → Todos, según disponibilidad. El modelo de datos acepta dos formas de entrada (libreta de nivelación y puntos XYZ) hacia un mismo modelo de puntos.
4. **¿Plataformas?** → Android con funciones nativas extendidas + Windows no necesariamente nativo (web). Pidió análisis de pros/contras, entregado.
5. **¿Destino?** → Uso propio ahora, vender después.
6. **¿Qué significa "dibujar en 3D"?** → Generación automática desde puntos + breaklines + visualización bonita + medición esencial. **Rechazó explícitamente el editor CAD completo** ("para eso usaría AutoCAD").
7. **¿Variables?** → Configurables por proyecto, con investigación previa de las más usadas.
8. **¿País?** → Perú.
9. **¿Companion visual en navegador?** → Rechazado por ahora. Prefiere listados y avanzar al MVP.
10. **¿Orden de entrega?** → MVP primero, mejorar poco a poco, luego Android, luego web.
