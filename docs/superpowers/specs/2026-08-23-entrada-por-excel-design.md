# Entrada por Excel y modelo de obra completa

**Fecha:** 2026-08-23
**Estado:** aprobado por Max
**Bloque 1 de 5** del replanteamiento del 2026-08-23

---

## 1. Por qué se replantea

Max revisó la app y señaló que el modelo está al revés:

> *«la pestaña calle no sirve para nada»* · *«la distancia varía según calle y la
> idea es meter todas las calles dentro del mismo modelo, así que no es útil»* ·
> *«primero yo tomo los datos en campo en Excel o Google Sheets usando cierta
> plantilla con nombres de columnas que me puedes dar y tú directamente tomar
> esos datos»*

Lo que hay hoy parte de **una calle con progresivas generadas**. Debe partir de
**una obra con puntos medidos**, y esos puntos entran desde la hoja de cálculo
donde ya se anotan en campo.

### Los cinco bloques del replanteamiento

Este spec cubre **solo el primero**. Los otros quedan anotados para que no se
pierdan:

| | Bloque | Estado |
|---|---|---|
| **1** | **Entrada por Excel y modelo de obra completa** | **este spec** |
| 2 | Movimiento de tierras: cuánta tierra hay que mover | pendiente |
| 3 | Material por capa, con esponjamiento | pendiente |
| 4 | Recomendador de pendientes que minimicen el movimiento | pendiente |
| 5 | Limpieza de pestañas y el fallo del visor 3D sobre la pantalla | pendiente |

El orden importa: sin el bloque 1 los demás no tienen de dónde partir.

---

## 2. La plantilla de campo

**Un archivo por obra. Una hoja por calle.** El nombre de la hoja es el nombre de
la calle.

```
CALLE          Av. Sol
BM             BM-1        3245.180
VISTA ATRAS    1.425
─────────────────────────────────────────────────────────────────
punto          VER-I  SAR-I  BOR-I    EJE   BOR-D  SAR-D  VER-D
distancia      -5.60  -4.40  -4.20   0.00    4.20   4.40   5.60
─────────────────────────────────────────────────────────────────
0+000          2.045  2.030  1.980  1.955   1.975  2.025  2.040
0+020          2.055  2.031  1.990  1.965   1.985  2.026  2.050
0+040          2.060  2.035  2.001  1.970   1.992  2.030  2.055
CAMBIO         PC-1    1.150
VISTA ATRAS    PC-1    1.630
0+060          2.470  2.445  2.410  2.380   2.400  2.440  2.465
0+080          2.480  2.450  2.420  2.390   2.410  2.445  2.470
CIERRE         BM-1    1.910
```

### Qué es cada fila

La app reconoce las filas **por su primera celda**, sin importar mayúsculas ni
tildes:

| Primera celda | Qué es |
|---|---|
| `CALLE` | El nombre de la calle. Si falta, se usa el nombre de la hoja |
| `BM` | El banco de nivel de arranque y su cota conocida |
| `VISTA ATRAS` | Lectura hacia el punto de arranque de la estación |
| `punto` | Los nombres de los puntos que se miden a lo ancho |
| `distancia` | La distancia de cada punto al eje, en metros |
| `CAMBIO` | Cierra la estación: nombre del punto de cambio y su lectura |
| `CIERRE` | Cierra el circuito contra un banco de nivel |
| `0+000`, `0+020`… | Una progresiva medida, con la lectura de cada punto |

Todo lo demás se ignora: filas en blanco, títulos, notas al pie.

### Reglas que hacen la plantilla soportable en campo

- **Las columnas que no lleves, no existen.** Una calle sin veredas no tiene esas
  columnas y no pasa nada.
- **Una celda vacía es un punto que no se midió**, y eso es información: la app
  no inventa cota ahí. Es la misma regla que ya rige toda la app.
- **La distancia se escribe una vez por hoja**, porque es fija por calle. Max lo
  confirmó: *«se mide siempre igual según la calle»*.
- **Los nombres de los puntos son libres.** La app toma los que traiga el
  archivo. Si una obra usa `IZQ` y `DER` en vez de `BOR-I` y `BOR-D`, funciona
  igual.
- **Las progresivas se admiten como `0+020` o como `20`**, porque en una hoja de
  cálculo lo segundo es más rápido de escribir.

### Formatos aceptados

- **`.xlsx`**, que es lo que Max usa. Se lee sin dependencias nuevas: un `.xlsx`
  es un ZIP con XML dentro, y el proyecto ya descomprime ZIP para el archivo
  `.topo` y ya genera XML de Excel a mano.
- **`.csv`**, para quien exporte desde Google Sheets. Una hoja por archivo.

---

## 3. El modelo nuevo

### Lo que desaparece

**`Plantilla` deja de ser una entidad global.** Era lo que ataba una lista de
puntos con sus distancias a todas las calles, y Max señaló que eso no sirve
porque las distancias cambian de una calle a otra.

**La calle deja de generar sus progresivas.** Hoy tiene `progresivaInicio`,
`progresivaFin` e `intervalo`, y la app fabrica la lista. A partir de ahora **las
progresivas son las que trae el archivo**: si mediste 0+000, 0+020 y 0+047, esas
son las que hay.

Eso quita de en medio dos pantallas enteras —`Plantilla` y `Calle`— y con ellas la
queja de Max de que no servían.

### Lo que queda

```
Proyecto
├── meta            obra, ubicación, cliente
├── bms[]           bancos de nivel, compartidos por toda la obra
├── capas[]         el paquete estructural, compartido
└── calles[]
     ├── nombre
     ├── puntos[]       { clave, distancia }   ← propios de esta calle
     └── campanias[]    las jornadas de nivelación sobre esta calle
```

Una obra con muchas calles, cada una con sus puntos y sus distancias, todas
compartiendo los bancos de nivel y el paquete de capas. Que es lo que Max pidió:
*«meter todas las calles dentro del mismo modelo»*.

### Lo que no cambia

El motor de cálculo sigue igual: cota instrumento, cierre, compensación, cota
teórica, corte y relleno, semáforo. **Ni una fórmula se toca.** Lo único que
cambia es de dónde salen los datos que come.

---

## 4. Cómo entra un archivo

1. Se elige el archivo desde la pantalla de la obra.
2. La app lo lee y **enseña lo que ha entendido antes de aceptarlo**: cuántas
   calles, cuántas progresivas, cuántos puntos por calle, y qué filas no supo
   interpretar.
3. Se confirma y entra.

**El paso 2 no es un adorno.** Un archivo con una columna mal escrita o una fila
corrida se importaría en silencio y produciría cotas equivocadas que nadie
notaría hasta la obra. Enseñar lo entendido antes de aceptar es lo que impide
eso.

### Qué se hace con lo que ya había

Importar **añade**, no reemplaza. Si la obra ya tiene una calle con ese nombre,
la campaña nueva se suma a las suyas. Nunca se pisan datos existentes: es la regla
que rige toda la app desde el principio.

### Cuando el archivo tiene algo raro

| Situación | Qué hace la app |
|---|---|
| Una hoja sin fila `punto` | Se salta esa hoja y lo dice, nombrándola |
| Una columna sin distancia | Se salta esa columna y lo dice, nombrándola |
| Una lectura que no puede ser de una mira | Se marca como pendiente, como ya hace hoy |
| Una progresiva repetida | Entra igual, y el aviso de celda medida dos veces la señala |
| Un `CIERRE` contra un banco de nivel que no existe | Entra, y el circuito queda sin verificar, como ya pasa hoy |
| Un archivo que no se puede leer | Se dice qué pasó, sin jerga, y no se toca nada del proyecto |

---

## 5. Migrar lo que ya existe

Los proyectos guardados tienen `Plantilla` global y calles con progresivas
generadas. Al abrirlos:

- Cada calle **hereda los puntos y distancias** de la plantilla que usaba, y pasan
  a ser suyos.
- Las progresivas que tuviera medidas se conservan; las que solo estaban
  generadas y vacías, no.
- Las campañas, lecturas, bancos de nivel, capas y rasantes **no se tocan**.

Un `.topo` anterior tiene que seguir abriéndose y enseñando exactamente los mismos
números. Eso se comprueba con un archivo real, no de palabra.

---

## 6. Qué se ve en pantalla

Este spec **no rediseña la navegación** —eso es el bloque 5— pero dos pantallas se
quedan sin contenido y no puede quedar un hueco:

- **`Plantilla` y `Calle` desaparecen.**
- La pantalla de **obra** gana la importación y la lista de calles, con sus puntos
  y distancias, **solo de lectura**: quien quiera cambiarlas, cambia el Excel y
  vuelve a importar. Esa es la fuente de verdad ahora.
- **Campañas se queda como está.** Max lo dijo: *«la pestaña de campañas de
  nivelación está bien ya que se suele nivelar varias veces una zona»*.

---

## 7. Lo que hay que dar hecho

Además del código, **un archivo `.xlsx` de ejemplo listo para copiar a Google
Sheets**, con:

- Una hoja por calle, con las filas especiales ya puestas.
- Datos de una obra pequeña pero completa, que al importarla produzca superficie,
  perfiles y modelo.
- Una segunda hoja **vacía y lista para llenar**, con solo la cabecera.

Sin eso, la plantilla es una descripción en un documento; con eso, es algo que se
abre y se usa.

---

## 8. Pruebas

**Motor:** el lector, con archivos de verdad. Que reconoce las filas por su
primera celda con y sin tildes; que una columna sin distancia se salta con aviso;
que una celda vacía no produce cota; que las progresivas entran en los dos
formatos; que un archivo con una hoja rota no impide leer las demás.

**Interfaz:** que lo entendido se enseña antes de aceptar; que importar **añade**
y no pisa; que un archivo ilegible no deja el proyecto a medias.

**Migración:** un `.topo` guardado con el modelo anterior se abre y da **las
mismas cotas** que daba antes. Con un archivo real.

**Navegador real:** importar un `.xlsx` de verdad de punta a punta, y comprobar
que después hay superficie, perfiles y modelo.

---

## 9. Restricciones que se mantienen

- Español en identificadores y textos. Sin `ñ` en identificadores.
- **Sin dependencias nuevas.** El `.xlsx` se lee con lo que ya hay.
- `packages/core` es motor puro: sin DOM, sin red, sin entrada ni salida. **El
  lector de archivos vive en `packages/app`**; el motor solo recibe datos ya
  interpretados.
- Los datos crudos —las lecturas de mira— no se sobrescriben jamás; las cotas
  siempre se derivan.
- Funciona sin internet.
- Nada de jerga de programador en textos visibles.
- El color nunca es el único portador de significado.
- Un dato calculado sobre una nivelación que no cerró se marca como no
  comprobado, en pantalla y en los archivos.

---

## 10. Riesgos

**El que más pesa:** la plantilla puede no encajar con cómo Max anota de verdad.
Él lo asumió explícitamente —*«lo veo cuando lo pruebe»*— y el coste es rehacer
parte del lector, no el modelo ni el motor.

Para que ese coste sea pequeño, **el lector se escribe separado**: una pieza
convierte el archivo en una tabla de celdas, y otra interpreta esa tabla. Cambiar
el formato toca solo la segunda.

**El segundo:** el modelo cambia y las cuatro entregas anteriores se apoyan en él.
La migración y las 457 pruebas existentes son la red. Ninguna se borra: la que
deje de tener sentido se reescribe apuntando al sitio nuevo, y si algo ya no es
alcanzable, se dice en voz alta en vez de borrar la prueba.
