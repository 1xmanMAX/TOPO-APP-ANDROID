# TOPO APP — Aplicación de Topografía

Aplicación de topografía para **campo y gabinete**, con núcleo en el **control de niveles por capas** en pavimentación urbana y veredas.

**Estado:** Entregas 1, 2A, 2B y 3 funcionando, y la entrada de datos rehecha alrededor de cómo se anota de verdad en campo — se declara la sección de la calle con las palabras del propio topógrafo y su hoja de Excel entra sola, con nivelación por progresivas y verificación de cierre, comparación de capas con el espesor realmente colocado, comparación contra la rasante de proyecto con semáforo de tolerancia, y un visor 3D de la calle con las capas apiladas y el corte en vivo.

## Cómo usarla

```
npm install     # la primera vez
npm run dev     # abre en http://localhost:5173
```

Funciona **sin internet**. Guía completa: [docs/uso.md](docs/uso.md).

## Android y Windows

La misma app sale como **APK para Android** (Capacitor, en `packages/app/android`) y como **EXE para Windows** (Electron, en `escritorio/`). En Android la app ocupa toda la pantalla (la barra de la hora se esconde; deslizando desde arriba asoma) y los archivos exportados (Excel, CSV, PDF, `.topo`) se entregan con el menú de compartir del teléfono.

Para publicar una versión, se sube una etiqueta y GitHub Actions compila los dos y crea la release con el APK, el instalador y el portable de Windows:

```
git tag v0.2.0 && git push origin v0.2.0
```

O desde la pestaña **Actions → Release → Run workflow**. Para que cada APK se instale encima del anterior, guarda tu llave de firma en los secretos `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` y `ANDROID_KEY_PASSWORD`; sin ellos el APK se firma con una llave de depuración.

En local: `npx cap sync android` y `./gradlew assembleRelease` desde `packages/app/android` (con el SDK de Android), o `npm install && npm start` desde `escritorio/` para abrir la versión de escritorio.

## Qué hace hoy

- **Libreta de nivelación** con las lecturas de mira tal como se anotan en campo: vista atrás, intermedias, punto de cambio, vista adelante.
- **Cotas calculadas** por el método de cota instrumento, encadenando estaciones.
- **Verificación de cierre** contra la tolerancia `T = e·√K`, con los tres casos reales: cerrado, enlace a otro banco de nivel, y abierto sin verificación.
- **Compensación** proporcional del error, conservando siempre la cota cruda al lado de la compensada.
- **Avisos** de lectura que se aparta de sus vecinas, celda medida dos veces, punto de cambio repetido y cierre fuera de tolerancia.
- **Sección declarada** por calle, dibujada: un punto por cada cosa que se mide a lo ancho —con vereda o sin ella, con pelo de agua, con los puntos existentes de amarre que hagan falta—, cada uno con su distancia al eje y **con las palabras con las que el topógrafo lo escribe en su hoja**. La misma palabra puede valer para los dos lados: el lado sale de la posición de la columna respecto a la del eje.
- **Entrada de la hoja de campo** por archivo `.xlsx`, `.csv` o pegando las celdas — los tres caminos dan el mismo resultado. Encuentra la cabecera aunque la tabla no empiece arriba a la izquierda, saca la vista atrás del preámbulo, deduce la columna de progresivas aunque no tenga título, y guarda como referencias las filas de cosas existentes que no pertenecen a ninguna progresiva.
- **Nada entra hasta confirmar**, y lo que no se entendió se enseña con su contenido: columnas sin colocar (que se colocan de un clic y su palabra queda guardada), filas que quedaron fuera y valores sueltos del preámbulo. Cuando hay dos lecturas del mismo lado en una fila de existentes, la app **no elige**: las enseña y pide que se resuelva.
- **Avisos que no se apagan solos**: las distancias puestas por la app siguen señaladas mientras quede **una sola** sin medir, y una toma sin vuelta se marca como no comprobada.
- **Campañas apiladas** por fecha, calle y capa. Nunca se pisan entre sí.
- **Corte transversal con deslizador** y perfil longitudinal, ligados a la tabla: eliges una celda y el corte salta a esa progresiva.
- **Archivo `.topo` portable** y autoguardado con recuperación.
- **Comparación de dos capas** con el espesor colocado celda por celda, su mínimo, medio y máximo, y cuántas celdas son comparables. Una celda sin pareja sale vacía, nunca cero.
- **Corte con las capas superpuestas** y el área sombreada solo donde las dos tienen medida.
- **Rasante de proyecto**, por calle: cota de arranque, pendiente longitudinal y tramos transversales (pendiente o salto), con un dibujo en vivo del corte tipo mientras se define.
- **Comparación contra la rasante**, celda por celda: cuánto sobra o falta, en milímetros con signo, con semáforo de tolerancia (conforme, al límite, fuera) en cuatro vistas — tabla, mapa de la calle, corte transversal con corte y relleno sombreados, y perfil longitudinal.
- **Visor 3D** de la calle, dibujado a mano en SVG: gírala arrastrando o con las vistas Planta, Alzado e Isométrico, inclínala y exagera su relieve con deslizadores, y sécciónala con el mismo deslizador de progresiva del corte transversal. En modo Estado colorea por el semáforo de tolerancia; en modo Capas apila una superficie por cada campaña marcada. Un párrafo debajo dice con palabras lo que el color enseña con formas.
- **Niveles** (la hoja «Pistas y veredas» de Max, en Calle › Niveles): puestas, conjuntos escritos a mano por zona y categoría, replanteos, gráficas de separación y de corte y relleno con pendientes y escáner, y el nivel a registrar con la lectura de mira; se guarda con la calle.
- **Niveles en el plano** (Obra › Plano › Niveles): puntos numerados puestos sobre el plano antes de salir, sus lecturas en una tabla, y en el plano las cotas, hacia dónde cae el agua, las zonas planas y dónde se empoza, con los sumideros como salidas.
- **Pistas y veredas** sobre lo medido: en Replantear, la **capa siguiente desde una capa medida** («base = subrasante + 0.20 m») con cota y lectura de mira por progresiva —interpolada, proyectada o extrapolada, comparada con el proyecto— y su hoja de estacas; en Análisis › **Separación**, la separación mínima entre dos niveles a cada lado, con punto crítico, escáner y ajuste en cm.
- **Exportación** a Excel, CSV y portapapeles — de cotas, de espesores o de diferencias contra el proyecto, y siempre con el estado de verificación en la cabecera.
- Modo claro, oscuro y automático.

## Verificación

```
npm test                                   # 668 pruebas: 184 del motor + 484 de la interfaz
npm run typecheck --workspaces             # tipos
npm run build --workspace packages/app     # 373 kB, 113 kB comprimido
npm audit --omit=dev                       # sin vulnerabilidades
```

Y la verificación en un navegador real, que comprueba lo que un entorno simulado no puede:

```
npm run build --workspace packages/app
npx vite preview --port 4173                 # desde packages/app, en otra ventana
node packages/app/verificacion/importar.mjs <carpeta-de-salida>    # 34 comprobaciones: la hoja real de campo, por archivo y pegada
node packages/app/verificacion/recorrido.mjs <carpeta-de-salida>   # 15 comprobaciones
node packages/app/verificacion/capas.mjs <carpeta-de-salida>       # 17 comprobaciones
node packages/app/verificacion/rasante.mjs <carpeta-de-salida>     # 19 comprobaciones
node packages/app/verificacion/niveles.mjs <carpeta-de-salida>     # 21 comprobaciones: capa siguiente y separación, laptop y celular
node packages/app/verificacion/visor3d.mjs <carpeta-de-salida>     # el visor en modo Capas: capas apiladas y corte vivo
node packages/app/verificacion/vista3d.mjs <carpeta-de-salida>     # el visor en modo Estado: se dibuja, gira arrastrando, secciona y resume la peor zona
```

El de importar sube el archivo real de campo por el mismo campo por el que lo subiría el topógrafo, coloca las columnas de un clic, acepta la hoja y comprueba que salen cotas, perfil y modelo — y repite el recorrido entero pegando las mismas celdas. El de capas descarga el Excel de espesores de verdad, y el de rasante el de diferencias: los dos lo descomprimen y comprueban lo que solo se ve dentro del archivo. Los dos del visor 3D comprueban con un arrastre real de ratón que girar cambia el dibujo — eso no se puede simular fuera de un navegador de verdad.

## Estructura

```
packages/
  core/   motor de cálculo — TypeScript puro, sin pantalla ni archivos
  app/    interfaz — React + Vite + Tailwind
```

El motor no sabe que existe una pantalla: recibe números y devuelve números. La interfaz lo consume; nunca al revés.

## Documentación

- [Diseño general de la app](docs/superpowers/specs/2026-08-08-app-topografica-design.md)
- [Diseño de la herramienta 1](docs/superpowers/specs/2026-08-19-nivelacion-por-progresivas-design.md)
- [Diseño de la rasante de proyecto](docs/superpowers/specs/2026-08-20-rasante-de-proyecto-design.md)
- [Plan de implementación de la Entrega 1](docs/superpowers/plans/2026-08-19-entrega-1-nivelacion-por-progresivas.md)
- [Plan de implementación de la Entrega 2A](docs/superpowers/plans/2026-08-20-entrega-2a-capas-y-espesores.md)
- [Plan de implementación de la Entrega 2B](docs/superpowers/plans/2026-08-20-entrega-2b-rasante-de-proyecto.md)
- [Diseño del visor 3D](docs/superpowers/specs/2026-08-21-visor-3d-design.md)
- [Plan de implementación de la Entrega 3](docs/superpowers/plans/2026-08-21-entrega-3-visor-3d.md)
- [Diseño de la sección declarada y la lectura de una hoja real](docs/superpowers/specs/2026-08-29-seccion-declarada-y-lectura-real-design.md)
- [Plan de implementación de la sección declarada](docs/superpowers/plans/2026-08-29-seccion-declarada.md)
- [Guía de uso](docs/uso.md)
- [Decisiones tomadas durante la Entrega 1](docs/decisiones-entrega-1.md)
- [Decisiones tomadas durante la Entrega 2A](docs/decisiones-entrega-2a.md)
- [Decisiones tomadas durante la Entrega 2B](docs/decisiones-entrega-2b.md)
- [Decisiones tomadas durante la Entrega 3](docs/decisiones-entrega-3.md)
- [Decisiones tomadas al rehacer la entrada de datos](docs/decisiones-seccion-declarada.md)

## Lo que viene

| | |
|---|---|
| **Entrega 4** | Planos de fondo con marcadores anclados, para ubicar y encadenar calles |

## Stack

TypeScript · React 19 · Vite 7 · Tailwind v4 · Vitest · fflate · idb-keyval · Zustand

Sin servidor, sin base de datos, sin cuentas. Los datos viven en tu archivo `.topo`.

## Normativa de referencia (Perú)

RNE CE.010 · RNE CE.040 · MTC EG-2013
