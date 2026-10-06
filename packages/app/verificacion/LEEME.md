# Verificación en un navegador real

Estas comprobaciones existen porque el entorno de pruebas (`jsdom`) no es un navegador: no reproduce fielmente el foco cuando un elemento cambia de posición, no descarga archivos, no dibuja nada, y ni siquiera lee un archivo elegido igual que un navegador de verdad. Dos riesgos del proyecto solo podían cerrarse aquí.

## Cómo ejecutarlas

La primera vez hace falta el navegador: `npx playwright install chromium`.

Hace falta la app servida. Vale el servidor de desarrollo o la app compilada; la URL se le pasa a cada guion en `BASE` (por defecto `http://localhost:4173/`, la de `vite preview`):

```
# desde packages/app, en otra ventana — una de las dos:
npx vite --port 5173 --strictPort                       # desarrollo
npm run build && npx vite preview --port 4173            # compilada
```

**Todos de una vez**, en serie y con un resumen al final:

```
BASE=http://localhost:5173/ node verificacion/todos.mjs [carpeta-de-salida] [guion ...]
```

- Sin carpeta, lo deja todo en `verificacion/salida/`, que git ignora (`verificacion/.gitignore`). Cada guion escribe en su subcarpeta (capturas, PDF, Excel y `.topo` descargados) y su salida de consola en `<guion>.txt`.
- Detrás de la carpeta se pueden nombrar solo algunos: `node verificacion/todos.mjs verificacion/salida capas rasante`.
- Imprime una línea por guion (`✓ capas 17/17 21 s`), las primeras comprobaciones que fallaron y el total; sale con código 1 si alguno falla. Si aparece un `.mjs` nuevo que no está en su lista, lo avisa.

**Uno solo**, con la carpeta donde dejar lo que produce:

```
BASE=http://localhost:5173/ node verificacion/capas.mjs <carpeta-de-salida>
```

No los apuntes a una carpeta del repo que git no ignore: la raíz ignora solo `/*.png`, `/*.xlsx` y `/*.topo` de la raíz, y `verificacion/salida/` está ignorada. `npm run verificar` corre solo `recorrido.mjs` sin carpeta, así que deja sus capturas y descargas en `packages/app/`, que **no** está ignorada: mejor `todos.mjs`.

Con el servidor de desarrollo hay que esperar a `load` y no a `networkidle` (que con vite dev no llega nunca); todos los guiones lo hacen así.

### Los guiones, en el orden en que los corre `todos.mjs`

| Guion | Sobre qué | Qué recorre |
|---|---|---|
| `obra-simulada.mjs` | obra simulada | Que el `.topo` abre: calles, planos y pistas, en laptop y celular |
| `obra.mjs` | obra simulada | Obra › Calles: inicio, lista de calles, panel de la calle, ajustes de la obra |
| `calle.mjs` | obra simulada | Calle › Medir / Revisar / Replantear: aviso al anotar, cierre en vivo, semáforo, lectura objetivo |
| `analisis-cierre.mjs` | obra simulada | Calle › Análisis (espesores, volúmenes, drenaje) y Cierre |
| `informes.mjs` | obra simulada | Los seis PDF y el Excel del control |
| `plano.mjs` | obra simulada | Obra › Plano: DXF y PDF, calibración, pistas y croquis |
| `planificador.mjs` | obra simulada | Calle › Planificar y la Guía de campo |
| `herramientas.mjs` | obra simulada | Calcular (calculadora de campo) y notas por progresiva |
| `archivo.mjs` | obra simulada | Guardar y volver a abrir el `.topo` con sus planos, autoguardado, `.topo` viejos |
| `movil.mjs` | obra simulada | Todas las pantallas en 390×844 y 360×740: 44 px, nada tapado, foco visible, nada a lo ancho |
| `recorrido.mjs` | proyecto de ejemplo | De punta a punta: sección, BM, libreta, corte, Excel, `.topo`, tema |
| `importar.mjs` | proyecto de ejemplo | Subir la hoja real de Max y pegarla |
| `capas.mjs` | proyecto de ejemplo | Segunda jornada en otra capa y espesores |
| `rasante.mjs` | proyecto de ejemplo | Rasante, semáforo del mapa y Excel de diferencias |
| `visor3d.mjs` | proyecto de ejemplo | 3D en modo Capas y corte vivo |
| `vista3d.mjs` | proyecto de ejemplo | 3D en modo Estado: controles, giro, resumen |
| `guiones-viejos.mjs` | obra simulada | Las pantallas de los seis anteriores en celular y laptop |

Los seis guiones «viejos» (`recorrido`, `importar`, `capas`, `rasante`, `visor3d`, `vista3d`) se escribieron para la navegación anterior (Campañas, Libreta, Resultados…) y se pasaron a la de la ola 2 sin perder comprobaciones; trabajan sobre el proyecto de ejemplo con que arranca la app, en 1280×800. Dónde quedó cada cosa:

| Antes | Ahora |
|---|---|
| Sección, Proyecto (bancos de nivel), Calle (rasante), Subir datos | Obra › Calles: panel de la calle (apartados Sección, Rasante, Jornadas y hojas, Subir una hoja de campo) y «Bancos de nivel» |
| Campañas › Nueva campaña | Obra › Calles › Nueva jornada; la capa se corrige en «Jornadas y hojas» |
| Libreta | Calle › Medir |
| Resultados (mapa, corte, perfil, 3D) | Calle › Revisar, con la vista de la calle en Corte, Perfil o 3D |
| Resultados › tabla de cotas | El corte nombra cada punto con su cota; el punto elegido, en la ficha de Revisar |
| Resultados › selector de capas | Calle › Análisis › Espesores (capa de abajo, de arriba y casillas «Dibujar …», que Revisar respeta) |
| Exportar … a Excel | Informes › Tablas para Excel |
| Guardar | Menú Archivo › Guardar |

## Qué comprueba `importar.mjs`

El camino por el que entra hoy el trabajo de campo: **el archivo real de Max**, `src/pruebas/muestras/detras-del-colegio.xlsx`, subido por el mismo campo por el que lo subiría él (Obra › Calles, apartado «Subir una hoja de campo»).

Treinta y seis comprobaciones. Entre ellas:

- Que de una hoja que no empieza arriba a la izquierda saca la vista atrás del preámbulo (1.45) y la columna de progresivas (la B), que no tiene título.
- Que `IZQ` y `DER` salen como columnas sin colocar —no como datos perdidos—, que **no deja importar mientras queden ahí**, y que se colocan de un clic.
- Que colocarlas vuelve a leer la hoja entera: las lecturas pasan de 21 a 35 y aparece el conflicto de las dos lecturas del mismo lado, que es el que deja la hoja en **tres** referencias y no cuatro.
- Que al aceptar, la calle que recibe la hoja pasa a ser la activa y el panel de Obra › Calles cambia a ella, y que **la palabra queda guardada en la sección de la calle**: se comprueba en su apartado Sección, con su nombre.
- Que el aviso de las distancias de fábrica **no se apaga al medir una**: baja de siete puntos a seis y sigue ahí.
- Que después de importar, en Calle › Revisar, hay **cotas** (la del eje en la primera progresiva, calculada desde la vista atrás de la hoja, en el corte y en el punto elegido), **perfil longitudinal** con un punto por progresiva y **modelo en volumen** — que sin rasante dice por qué no dibuja en modo Estado, y sí levanta la superficie medida en modo Capas.
- **El camino del pegado**, que es el que más fácil se queda sin probar: las mismas celdas por el portapapeles, con la sección ya declarada, entran sin colocar nada y dan las mismas cuentas.
- Que las dos hojas fueron **a una sola calle y como dos jornadas**, comprobado dentro del `.topo` descargado: importar añade y nunca pisa.

Deja capturas de pantalla en la carpeta que se le pase como argumento.

## Qué comprueba `recorrido.mjs`

Quince cosas de punta a punta, entre ellas:

- Que la barra de arriba trae Obra, Calle e Informes.
- Que el foco se mantiene al escribir una distancia en la sección (Obra › Calles), que reordena sola la lista por distancia.
- Que corregir la cota de un banco de nivel recalcula todo el proyecto (la cota se lee en el corte de Revisar).
- Que escribir una lectura en Calle › Medir y pulsar Enter la registra y avanza.
- Que el cierre en vivo da el veredicto, con su símbolo.
- Que el deslizador mueve el corte, y que una celda sin medir se anuncia como tal en el mapa de Revisar —sin inventarle un número— y no aparece dibujada en el corte.
- **Que el `.xlsx` descargado desde Informes es un archivo válido de verdad**, con sus cinco partes y las cotas escritas como número.
- Que el `.topo` descargado con Archivo › Guardar contiene el proyecto con sus lecturas.
- Que no hay ni un error en la consola del navegador.

Deja capturas de pantalla en la carpeta que se le pase como argumento.

## Qué comprueba `capas.mjs`

El recorrido completo de la Entrega 2A: registrar una segunda jornada sobre la misma calle, en otra capa, y comparar las dos.

Entre otras cosas:

- Que «Nueva jornada» (Obra › Calles) añade una jornada a la calle, y que su capa se corrige a TERRENO EXISTENTE desde «Jornadas y hojas».
- Que la libreta nueva avisa de que falta la vista atrás antes de aceptar lecturas.
- Que una jornada recién creada **declara la progresiva donde va a medir** y ahí recibe su primera lectura: sin eso, la libreta nueva no tendría ni una celda donde escribir.
- Que comparar dos capas en Calle › Análisis › Espesores muestra el espesor colocado celda por celda y el mínimo.
- Que con las dos capas marcadas («Dibujar …»), el corte de Revisar dibuja las dos y el relleno entre ellas.
- **Que el `.xlsx` de espesores descargado desde Informes es un archivo válido de verdad**, con las dos capas nombradas en la cabecera, el aviso de que los espesores no están comprobados cuando la jornada no cierra, los espesores como número, y la progresiva sin pareja en la otra capa vacía en vez de en cero.
- Que el corte de Medir siempre dibuja la jornada activa, nunca lo que haya quedado marcado para comparar.

Deja capturas de pantalla en la carpeta que se le pase como argumento.

## Qué comprueba `rasante.mjs`

El recorrido completo de la Entrega 2B: la rasante de la calle en su panel de Obra › Calles (cota de arranque, pendiente y corte tipo con sus quiebres), y lo que dice Calle › Revisar contra ella.

Entre otras cosas:

- Que el punto elegido en Revisar da la diferencia en mm, con su semáforo y qué hacer.
- Que las tres clases de estado (conforme, al límite, fuera de tolerancia) aparecen a la vez, y que el mapa las pinta con su color **y su símbolo** (✓, ✗).
- Que el corte transversal sombrea contra la rasante.
- **Que el `.xlsx` de diferencias descargado desde Informes es un archivo válido de verdad**, con la pendiente longitudinal y la tolerancia de la capa en la cabecera, el estado de verificación, y las celdas sin medir vacías (nunca en cero).

Deja capturas de pantalla en la carpeta que se le pase como argumento.

## Qué comprueba `visor3d.mjs`

La Tarea V7: capas apiladas y corte vivo en el modelo 3D.

- Que marcar SUBRASANTE y BASE en las casillas «Dibujar …» de Calle › Análisis › Espesores y, en Calle › Revisar, cambiar el modelo 3D a modo Capas dibuja una superficie por cada una (dos `data-capa-id` distintos).
- Que cada superficie lleva el nombre de su capa rotulado junto al dibujo, no solo el color.
- Que mover el deslizador de progresiva secciona el modelo de verdad (menos caras dibujadas, ninguna con `data-progresiva-desde` más allá del corte) en vez de dibujarlo entero y tapar unas con otras.

Deja capturas de pantalla en la carpeta que se le pase como argumento.

## Qué comprueba `vista3d.mjs`

El modelo 3D en modo Estado: que se dibuja, que los controles del visor están montados y alcanzables desde Calle › Revisar (botón «3D» de la vista de la calle), y que gira, secciona y resume de verdad.

Entre otras cosas:

- Que la calle trae su rasante ya definida (condición para que el modo Estado levante algo) antes de seguir.
- Que el interruptor Estado/Capas, las tres vistas guardadas y los dos deslizadores (inclinación, exageración) están montados.
- **Que arrastrar con el ratón gira el modelo de verdad**: las coordenadas de las caras cambian tras un arrastre real — esto no se puede simular fuera de un navegador de verdad.
- Que el deslizador de progresiva secciona el modelo (menos caras al recortar el tramo).
- Que la exageración vertical aparece escrita junto al modelo y sigue al deslizador cuando se mueve.
- Que el resumen en texto nombra la peor zona, con su progresiva, elemento y diferencia en milímetros.

Deja capturas de pantalla en la carpeta que se le pase como argumento.

## Qué comprueba `guiones-viejos.mjs`

Las pantallas que recorren los seis guiones viejos, ahora sobre la obra simulada y dos veces: en la laptop (1280×800) y en el celular (390×844). Abre `datos/obra-simulada.topo` y comprueba:

- **Obra › Calles**: bancos de nivel y panel de Av. Sol con su rasante.
- **Revisar**: las 21 celdas de la subrasante de Av. Sol y las 18 de Jr. Lima, cada una con su diferencia (medida − proyecto), su acción (cortar/rellenar) y su símbolo; los conteos del resumen; la ficha del 0+080 Eje (+54 mm, corta, ✗), del 0+040 Borde derecho (−26 mm, rellena, △) y del 0+140 Eje de Jr. Lima (−60 mm, rellena, ✗); corte, perfil y 3D.
- **«No comprobado»**: Jr. Lima, que no cerró, lo dice en el aviso del mapa, en la ficha del punto, en el resumen, en el cierre y el aviso al anotar de Medir y en Replantear. Av. Sol, que cierra, no lo dice y dice «DIFERENCIAS VERIFICADAS».
- **Replantear y Medir**: la lectura objetivo del 0+020 Eje de la base desde la estación 1 es AI − cota de proyecto, con la AI de la libreta compensada por el cierre (2.436, no el 2.437 sin compensar de ESPERADO); la «Lectura esperada» de Medir es la misma; el veredicto da CORTA si se lee de menos y RELLENA si se lee de más, y el aviso al anotar da el signo de la diferencia.
- **Espesores**: 0+080 Eje, 0.152 m, fuera y delgada.
- **Informes** (en la laptop descarga los archivos): el Excel de diferencias de cada calle con sus diferencias con signo, y el PDF del control contra proyecto; los de Jr. Lima dicen «no comprobado» en cada página, los de Av. Sol no.

En cada pantalla: que no se desplaza a lo ancho ni la página ni `<main>` (que es quien se desplaza en esta app), que nada queda cortado o escondido a lo ancho dentro de una caja (las tablas de datos sí pueden deslizarse) y, en el celular, que todo lo que se toca (botones, enlaces, campos, deslizadores, casillas por su etiqueta y puntos tocables del dibujo) mide 44 px de alto y de ancho. No hay esperas fijas: cada paso espera a que la pantalla diga lo que pidió. Deja una captura por pantalla y por tamaño, con lo que hay dentro de `<main>` aunque no quepa en la ventana.

## La obra simulada (ola 3) y `obra-simulada.mjs`

`datos/obra-simulada.topo` es una obra completa y coherente para todos los guiones de la ola 3: tres calles (Av. Sol con subrasante y base cerradas, un punto fuera y uno al límite; Jr. Lima con una subrasante **sin cerrar** y un empozamiento en 0+140; Psje. Las Lomas, la pista empinada sin mediciones, enlazada a su pista del DXF), los dos planos de muestra (el DXF calibrado y el PDF sin calibrar) y dos pistas (una del DXF y una de croquis). `datos/obra-simulada.esperado.json` dice lo que cada guion debe encontrar: nombres, cotas, cierres, diferencias por celda, espesores, drenaje y los planes de controles de Las Lomas.

Los dos salen de `src/pruebas/obraSimulada.ts` (`construirObraSimulada()` y `ESPERADO`), y `src/pruebas/obraSimulada.test.ts` comprueba con el motor que lo esperado es verdad y que los archivos guardados están al día. Si se toca la obra, se regeneran desde `packages/app` con:

```
npx vite-node src/pruebas/generarObraSimulada.ts
```

Cómo la abre un guion (el campo está oculto dentro del menú Archivo; no hace falta abrir el menú):

```js
const ESPERADO = JSON.parse(readFileSync(new URL('./datos/obra-simulada.esperado.json', import.meta.url), 'utf8'))
await pagina.locator(ESPERADO.archivo.selectorAbrir) // 'input[type="file"][aria-label="Abrir archivo .topo"]'
  .setInputFiles(fileURLToPath(new URL(ESPERADO.archivo.rutaDesdeGuion, import.meta.url)))
```

`obra-simulada.mjs` hace justo eso, en laptop (1280×800) y en celular (390×844), y comprueba que aparecen las tres calles y los dos planos con sus pistas, que la página no se desplaza a lo ancho y que no hay errores en la consola. Con el servidor de desarrollo, la URL va en `BASE`:

```
BASE=http://localhost:5190/ node verificacion/obra-simulada.mjs <carpeta-de-salida>
```

## Qué comprueba `informes.mjs`

Los seis informes PDF (protocolo, libreta con cierre, control contra proyecto, espesores, metrado y hoja de estacas) y el Excel del control, con la obra simulada: se eligen en Informes, se descargan con el botón como lo haría Max y se lee el texto de cada PDF con pdfjs. Cada fila se compara con `datos/obra-simulada.esperado.json`, renglón por renglón, no «que aparezca en algún sitio»:

- Que cada PDF dice la obra y la calle, y que no lleva `NaN`, `undefined`, `null` ni `Infinity`; que ningún carácter salió como «?» ni como cuadro vacío (las fuentes estándar del PDF no tienen ✓ △ ✗: el semáforo se dibuja con líneas y lleva su palabra).
- Protocolo: las 21 celdas de Av. Sol y las 18 de Jr. Lima con su diferencia con signo (medida − proyecto, positivo = corta) y su estado en SU fila, la fila entera del punto fuera y del al límite, y el conteo (19/1/1 y 17/0/1).
- Libreta: alturas instrumentales, «Error de cierre … = −4 mm», «Tolerancia: ±5.9 mm (0.24 km)» y que la comprobación aritmética cuadra; en Jr. Lima, «no comprobado» en cada página y que falta la vista adelante a BM-2.
- Control: la fila entera «0+080 Eje 3243.620 3243.674 corta 54 mm FUERA», la del al límite y la de Jr. Lima «rellena 60 mm FUERA»; y en el .xlsx cada diferencia como número con su signo en su celda (+54 en 0+080 EJE, −60 en 0+140 EJE).
- Espesores: 21 filas, proyecto 0.200 en cada una, espesor = arriba − abajo y dif. con signo, mínimo y máximo, la fila FUERA (0.152, −48) y las dos al límite (+19, −14).
- Metrado: las áreas de cada sección se recalculan aquí desde las diferencias (bordes a ±3.60 m, cruce por cero partido) y los volúmenes por áreas medias, hasta el TOTAL (Av. Sol 7.100 / 1.720 m³).
- Hoja de estacas: Psje. Las Lomas, sin medir, estaca cada 20 m por su pista del DXF, replantea la subrasante y da lectura objetivo = AI − cota en las 21 filas; como 15 no caben en la mira, la pantalla va con △ y «cambie de estación», nunca ✓. En Av. Sol, la lectura objetivo de la base: AI 3246.467 − 3244.030 = 2.437.
- En el celular: que la página no se desplaza a lo ancho ni se alarga por debajo de la pantalla, que los botones miden 44 px o más y que «Descargar PDF» queda a la vista.

No espera por tiempo: la imagen de la vista previa lleva en `data-archivo` el nombre del PDF (informe — calle — capa — fecha) y el guion espera a que sea el de la calle pedida; tras escribir la vista atrás, espera a que el veredicto nombre la altura instrumental nueva.

Lo que se sabe que está mal fuera de `vistas/informes` sale como `AVISO` y no cuenta como comprobación (hoy: la comprobación aritmética de la libreta de una nivelación sin cerrar).

```
BASE=http://localhost:5194/ node verificacion/informes.mjs [carpeta-de-salida]
```

Sin carpeta deja todo en `verificacion/salida/informes/`, que git ignora: las capturas, los PDF y Excel descargados y `informes-texto.txt` con el texto de cada PDF.
