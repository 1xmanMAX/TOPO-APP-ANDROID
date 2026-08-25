# Catálogo de códigos, importación y nivelaciones

**Fecha:** 2026-08-24
**Estado:** aprobado por Max
**Bloque A** de dos. El bloque B —comparación con colores, diferencias, pendientes
y vistas afinadas— va después y se apoya entero en este.

**Sustituye a:** `2026-08-23-entrada-por-excel-design.md`, que queda incorporado
aquí. Aquel describía la importación con una plantilla de columnas fijas; Max
pidió después que las columnas se reconozcan **por código**, sin orden fijo, y eso
cambia la pieza que interpreta.

---

## 1. Qué pide Max, con sus palabras

> *«si digo ZKJ le pongo, por ejemplo, ese es el código de la columna, y ahí puede
> vincularla con el eje… entonces realmente no necesitas un orden exacto»*

> *«quiero que me permitas si los datos en Excel subieron Excel o copiar los datos
> directamente desde un Excel»*

> *«una nivelación puede obtener varias tomas de datos para completar la
> nivelación: hoy ya fui y tomé datos de la progresiva 1 al 100, mañana del 100 al
> 200, todo eso conectando con puntos de control»*

Tres cosas: **reconocer columnas por código**, **entrar por archivo o por
pegado**, y **agrupar varias tomas en una nivelación**.

---

## 2. El catálogo de códigos

### Cómo funciona

La app conoce una lista de **conceptos** —lo que un punto significa— y cada
concepto acepta **varios códigos**. Los códigos se aprenden con el uso.

```
CONCEPTO              CÓDIGOS QUE RECONOCE DE FÁBRICA
progresiva            PROG · PK · ABSCISA · EST · PROGRESIVA
eje                   EJE · CL · CENTRO
borde calzada izq     BI · BOR-I · BORDE-IZQ
borde calzada der     BD · BOR-D · BORDE-DER
sardinel izquierdo    SI · SAR-I · SARDINEL-IZQ
sardinel derecho      SD · SAR-D · SARDINEL-DER
vereda izquierda      VI · VER-I · VEREDA-IZQ
vereda derecha        VD · VER-D · VEREDA-DER
```

Los de fábrica son un punto de partida, no una imposición: **Max eligió que el
catálogo se llene con su uso**, no dárselo escrito de antemano.

### Cuando aparece un código desconocido

La app **pregunta en vez de descartar**:

```
No conozco esta columna:
   «ZKJ»    valores: 1.955 · 1.965 · 1.970
   ¿Qué es?   [ eje                 ▼ ]    ☑ recordar este código
```

Con «recordar» marcado, el código queda vinculado al concepto **para siempre**, y
los archivos siguientes entran sin preguntar.

**Descartar una columna sin preguntar sería lo peor que podría pasar aquí**: la
lectura se perdería en silencio y nadie lo notaría hasta comparar contra obra.

### Reglas del catálogo

- **Sin orden fijo.** Cada columna se identifica por su código, esté en la
  posición que esté.
- **Sin distinguir mayúsculas ni tildes ni espacios.** `zkj`, `ZKJ` y ` Zkj ` son
  el mismo código.
- **Un código pertenece a un solo concepto.** Si se asigna `ZKJ` al eje y luego se
  intenta asignar al borde, la app avisa y pide confirmación antes de moverlo: en
  silencio, todas las importaciones anteriores quedarían mal interpretadas.
- **El catálogo es del proyecto y viaja en el archivo `.topo`**, porque es parte de
  cómo se leyó ese trabajo. Sin él, reimportar el mismo Excel daría otro
  resultado.
- **Se puede ver y editar** en una pantalla propia: qué códigos hay, a qué
  concepto van, y quitar los que sobren.

---

## 3. Entrar por archivo o por pegado

Los dos caminos acaban en lo mismo: **una tabla de celdas**. De ahí en adelante el
tratamiento es idéntico.

| Camino | Cómo llega |
|---|---|
| **Archivo `.xlsx`** | Un ZIP con XML dentro. Se lee sin dependencias nuevas: el proyecto ya descomprime ZIP y ya genera XML de Excel a mano |
| **Archivo `.csv`** | Texto separado por comas, respetando comillas |
| **Pegado** | El portapapeles de Excel llega como texto **separado por tabuladores**. Una fila por línea |

Pegar tiene que ser tan bueno como subir: es lo que se usa cuando los datos están
en Google Sheets y no apetece exportar nada.

### Qué se ve antes de aceptar

Siempre, en los tres casos:

- Qué columnas se reconocieron y a qué concepto van.
- Qué columnas **no** se reconocieron, con sus valores, para asignarlas.
- Cuántas progresivas, cuántas lecturas, y a qué calle van.
- Qué filas no se supieron interpretar.

**Nada entra en el proyecto hasta confirmar.** Un archivo con una columna corrida
se importaría en silencio y produciría cotas equivocadas que nadie vería hasta la
obra.

---

## 4. La nivelación como agrupación de tomas

### El problema de hoy

La app llama «campaña» a una jornada de nivelación. Pero una nivelación real
puede tardar días:

```
NIVELACIÓN «Terreno existente»
   ├── toma del 20 ago    0+000 → 0+100    arranca en BM-1
   └── toma del 21 ago    0+100 → 0+200    arranca en PC-1, que dejó la anterior
```

Las dos tomas son **la misma superficie**. Compararlas entre sí no tiene sentido;
lo que se compara es esta nivelación contra la siguiente.

### El modelo

```
Proyecto
├── catalogo         códigos → conceptos
├── bms[]
├── capas[]
└── calles[]
     ├── puntos[]         { concepto, codigo, distancia }
     └── nivelaciones[]
          ├── nombre      «Terreno existente», «Tras el corte»
          ├── color       el que la identifica en todas las vistas
          └── tomas[]     lo que hoy es una campaña
```

**Lo que hoy es `Campania` pasa a ser una toma**, y las tomas se agrupan en
nivelaciones. Las estaciones, lecturas, cierre y compensación **no cambian**: una
toma sigue siendo exactamente lo que era.

### Cómo se enlazan las tomas

Por sus **puntos de control**. Si la toma del 21 arranca en `PC-1` y la del 20
dejó `PC-1`, la app lo ve y las enlaza: la cota de `PC-1` viene de la primera.

Y cuando **no** enlazan —la segunda arranca en un punto que nadie dejó— **se dice
con claridad**. Una nivelación con tomas sueltas no es una superficie continua, y
tratarla como tal daría diferencias inventadas donde solo hay dos orígenes
distintos.

### El color

Cada nivelación tiene el suyo, elegido al crearla, y es **el mismo en todas
partes**: en la lista, en el perfil, en el corte y en el modelo. El bloque B se
apoya entero en esto.

---

## 5. Qué pasa con lo que ya existe

Los proyectos guardados tienen campañas sueltas y una plantilla global. Al
abrirlos:

- **Cada campaña se convierte en una nivelación de una sola toma**, conservando su
  nombre, su fecha y todas sus lecturas. Nada se pierde ni se agrupa por
  adivinación: agrupar es decisión de Max, no de la migración.
- **Cada calle hereda los puntos de su plantilla**, con sus distancias, y pasan a
  ser suyos.
- **El catálogo nace con los códigos de fábrica** más los que se deduzcan de las
  claves que ya usaban las plantillas.

Un `.topo` anterior tiene que abrirse y enseñar **exactamente las mismas cotas**.
Se comprueba con un archivo real, no de palabra.

---

## 6. Qué se ve en pantalla

Este spec no rediseña la navegación —eso sigue pendiente en su propio plan— pero
sí cambia dónde viven dos cosas:

- **Pestaña de subir datos**, nueva: el archivo o el pegado, la vista previa, y la
  asignación de códigos desconocidos.
- **Pantalla del catálogo**, para ver y editar los códigos aprendidos.
- **`Plantilla` y `Calle` desaparecen**: los puntos y sus distancias entran por el
  archivo. Max ya dijo que esas dos pantallas no servían.
- **La lista de campañas pasa a ser lista de nivelaciones**, con sus tomas dentro.

---

## 7. Errores y casos límite

| Situación | Qué hace la app |
|---|---|
| Columna con código desconocido | Pregunta qué es, con sus valores a la vista. No la descarta |
| Código ya asignado a otro concepto | Avisa y pide confirmación antes de moverlo |
| Columna sin distancia | Se salta y lo dice, nombrándola |
| Celda vacía | Punto no medido. No se inventa cota |
| Progresiva repetida en la misma toma | Entra, y el aviso de celda medida dos veces la señala |
| Toma que no enlaza con ninguna anterior | Entra, y la nivelación avisa de que tiene tomas sin enlazar |
| Pegado que no parece una tabla | Se dice qué se esperaba, sin jerga, y no se toca nada |
| Archivo ilegible | Igual: se explica y el proyecto queda intacto |

---

## 8. Lo que hay que dar hecho

Un **`.xlsx` de ejemplo** listo para copiar a Google Sheets, con una hoja llena y
otra vacía con solo la cabecera. Sin eso, la plantilla es una descripción; con
eso, es algo que se abre y se usa.

---

## 9. Pruebas

**El catálogo:** que reconoce sin distinguir mayúsculas, tildes ni espacios; que
un código nuevo queda aprendido; que reasignar un código avisa; que el catálogo
viaja en el `.topo`.

**Los tres caminos de entrada:** que archivo, CSV y pegado producen **el mismo
resultado** con los mismos datos. Es la prueba que garantiza que pegar no es un
camino de segunda.

**Las nivelaciones:** que las tomas se enlazan por punto de control; que una toma
suelta se señala; que agrupar no altera ninguna cota.

**La migración:** un `.topo` anterior da las mismas cotas que daba. Con archivo
real.

**Navegador real:** importar un `.xlsx` de verdad y pegar datos de verdad, y
comprobar que después hay cotas, perfil y modelo.

---

## 10. Restricciones que se mantienen

- Español en identificadores y textos. Sin `ñ` en identificadores.
- **Sin dependencias nuevas.**
- `packages/core` es motor puro: sin DOM, sin red, sin entrada ni salida. **El
  lector y el portapapeles viven en `packages/app`.**
- Los datos crudos no se sobrescriben jamás; las cotas siempre se derivan.
- **Importar añade, nunca pisa.**
- Funciona sin internet.
- Nada de jerga de programador en textos visibles.
- El color nunca es el único portador de significado. **En el bloque B, donde el
  color identifica nivelaciones, cada una llevará además su nombre.**
- Un dato calculado sobre una nivelación que no cerró se marca como no comprobado.

---

## 11. Riesgos

**El mayor:** el modelo cambia de campañas sueltas a nivelaciones con tomas, y las
cuatro entregas integradas se apoyan en él. La migración y las 472 pruebas son la
red. Ninguna se borra: la que deje de tener sentido se reescribe apuntando al
sitio nuevo, y si algo ya no es alcanzable **se dice en voz alta** en vez de
borrar la prueba.

**El segundo:** el formato de la hoja puede no encajar del todo con cómo anota Max.
Por eso el lector va en dos piezas —una convierte a celdas, otra interpreta— y el
catálogo se aprende con el uso en vez de fijarse por adelantado.
