# El ancho de la calle cambia de progresiva a progresiva

**Fecha:** 2026-09-19
**Estado:** aprobado por Max en conversación; pendiente de su lectura de este documento
**Primero de tres trabajos** pedidos el mismo día. Los otros dos —el ajuste de
la rasante al terreno natural y la reorganización de la interfaz— tienen su
propio spec y van después, en ese orden: el cálculo de material movido depende
de los anchos reales, y la interfaz se reordena una sola vez, con las pantallas
nuevas ya dentro.

**Por qué existe:** hoy cada punto de la sección guarda **una sola distancia al
eje para toda la calle** (`PuntoSeccion.distancia`), y la rasante termina sus
tramos en un ancho fijo (`TramoTransversal.hastaOffset`). Las calles de Max no
son así: la calzada y las veredas se ensanchan y se angostan, y él **mide esas
distancias en campo con wincha**, progresiva a progresiva.

---

## 1. Lo que Max decidió

| Pregunta | Respuesta |
|---|---|
| ¿De dónde salen las distancias? | Las mide en campo, en cada progresiva. |
| ¿Por dónde entran a la app? | Por las dos puertas: escritas a mano y desde la hoja Excel. |
| ¿Y en una progresiva sin medida? | Se interpola entre las vecinas; fuera del rango medido se repite la más cercana; lo estimado se distingue de lo medido. |
| ¿La cota teórica sigue al ancho real? | Sí: los tramos de la rasante se amarran a puntos de la sección. |

## 2. Alternativas descartadas

- **La distancia pegada a cada lectura de mira.** El ancho es de la calle, no
  de la jornada: con cuatro capas niveladas habría cuatro anchos de la misma
  vereda, y nada impediría que se contradijeran.
- **Partir la calle en tramos, cada uno con su sección.** El ancho cambiaría en
  escalón, y Max no mide por tramos sino por progresivas.

## 3. El modelo

### 3.1 La tabla de anchos

La calle gana una lista de anchos medidos:

```ts
interface AnchoMedido {
  progresiva: number
  puntoId: Id
  /** Metros desde el eje, siempre positivos: lo que marca la wincha. */
  distancia: number
}

interface Calle {
  // …lo de hoy…
  /** Ausente o vacía: la calle tiene un solo ancho, el de su sección. */
  anchos?: AnchoMedido[]
}
```

- Como mucho una entrada por pareja (progresiva, punto). La progresiva se
  compara ya redondeada a tres decimales, igual que en `claveCelda`.
- La distancia se guarda **positiva**; el lado lo pone el signo de
  `PuntoSeccion.distancia`, que sigue siendo quien dice a qué lado está el punto.
- El eje no admite entradas: está a cero siempre.
- `PuntoSeccion.distancia` no desaparece: pasa a ser **el ancho típico**, el
  respaldo de un punto que no se midió en ninguna progresiva.

### 3.2 La distancia de un punto en una progresiva

Una sola función en `core/src/seccion/anchos.ts`, de la que sale toda distancia
que use la app:

```ts
interface DistanciaEn {
  /** Con signo, como `PuntoSeccion.distancia`. */
  distancia: number
  origen: 'medida' | 'interpolada' | 'extendida' | 'tipica'
}

function distanciaEn(calle: Calle, puntoId: Id, progresiva: number): DistanciaEn
```

Con las medidas de **ese punto**, ordenadas por progresiva:

1. Ninguna medida → la típica (`tipica`).
2. Medida exacta en esa progresiva → esa (`medida`).
3. Entre dos medidas → interpolación lineal, a tres decimales (`interpolada`).
4. Antes de la primera o después de la última → la más cercana (`extendida`).

Cada punto se interpola por separado: haber medido el borde en 0+020 no dice
nada de la vereda en 0+020.

### 3.3 La grilla

`construirGrilla` deja de copiar `punto.distancia` y pide `distanciaEn` para
cada celda. `CeldaGrilla` gana `origenOffset` con el origen. Es el único cambio
que necesitan casi todos los que consumen la grilla —tablas, evaluación,
comparación de capas, malla 3D, exportación—, porque ya leen `celda.offset`.

El orden de las columnas sigue saliendo de la distancia **típica**, no de la de
cada progresiva: las columnas de una tabla no pueden cambiar de sitio de una
fila a otra.

Los sitios que hoy leen `punto.distancia` directamente para dibujar una
progresiva concreta (`CorteTransversal`, `Vista3D`, `VistaPreviaHoja`,
`interpretar.ts` en las filas de referencia, `esqueletoTabla`) pasan a
`distanciaEn`. Los que dibujan la sección **típica** (`DibujoSeccion`,
`CorteTipo`, `VistaSeccion`) se quedan como están.

### 3.4 La rasante amarrada a puntos

```ts
interface TramoTransversal {
  // …lo de hoy…
  /**
   * El rol del punto donde termina este tramo («hasta el borde»). Null: el
   * tramo termina en `hastaOffset`, fijo, como hasta ahora.
   */
  hastaRol: Rol | null
}
```

Se amarra al **rol** y no al id del punto porque los tramos de una rasante
simétrica valen para los dos lados: «hasta el borde» es el borde izquierdo a la
izquierda y el derecho a la derecha.

`desnivelTransversal` y `cotaRasante` reciben, además de la rasante, los finales
de tramo ya resueltos para esa progresiva y ese lado: si el tramo está amarrado
y el lado tiene un punto con ese rol, su final es `|distanciaEn(...)|`; si no,
`hastaOffset`. La resolución vive en una función aparte
(`tramosResueltos(calle, rasante, progresiva, lado)`), para que la geometría
siga siendo aritmética pura y se pruebe como hoy.

Si al resolver un tramo queda terminando **antes** que el anterior —una medida
mal escrita—, ese tramo se trata como de ancho cero y se avisa; no se truena ni
se inventa un orden.

**Migración:** al abrir una rasante guardada, un tramo cuyo `hastaOffset`
coincide (a tres decimales) con la distancia típica de un punto de ese lado
queda amarrado al rol de ese punto. Los demás quedan con `hastaRol: null`.
Mientras la calle no tenga anchos medidos, el resultado es idéntico al de hoy
en los dos casos.

## 4. La pantalla

En **Sección**, debajo del dibujo de la sección típica, un bloque nuevo:
**«Anchos medidos por progresiva»**.

```
Progresiva │ Vereda I │ Sardinel I │ Borde I │ Borde D │ Sardinel D │ Vereda D
 0+000     │   5.15   │    3.65    │  3.50   │  3.50   │    3.65    │   5.15
 0+020     │  (5.40)  │   (3.90)   │ (3.75)  │  3.50   │    3.65    │   5.15
 0+040     │   5.65   │    4.15    │  4.00   │  3.50   │    3.65    │   6.20
```

- Una fila por progresiva: las que ya tienen las nivelaciones de la calle, más
  las que Max añada con «Agregar progresiva». Una columna por punto, sin el eje.
- Se escribe **en positivo**. Celda vacía = sin medir: muestra el valor
  estimado en gris y entre paréntesis, y escribir encima lo convierte en medido.
  Borrar una celda medida la devuelve a estimada.
- **Avisos que no bloquean:** un punto que queda más cerca del eje que el que
  debería tener por dentro (vereda a 3.40 con el borde a 3.50), y un cambio de
  más de 1 m entre progresivas medidas vecinas a menos de 20 m.
- Mientras la tabla esté vacía, el bloque es una sola línea que explica para
  qué sirve: no estorba a quien tiene una calle de ancho constante.

El **corte transversal** dice, junto a la progresiva, si su ancho es medido o
estimado. El **3D** y el **mapa** dibujan la calle con su ancho real: deja de
ser un rectángulo.

En el **editor de rasante**, el final de cada tramo se elige de una lista
—«hasta el borde», «hasta el sardinel», «hasta la vereda», o «a una distancia
fija» con su número—.

## 5. La hoja Excel

La sección declara una cuarta lista de palabras sueltas, `palabrasDistancia`,
de fábrica `['DIST', 'ANCHO', 'DISTANCIA']` (sin `D` a secas: en una hoja puede querer decir «derecha»), junto a las de la progresiva,
el punto de control y la referencia.

Al interpretar una hoja:

- Una columna cuya cabecera es una palabra de distancia se toma como la
  distancia del punto de la columna de lecturas **inmediatamente a su
  izquierda**.
- Si a su izquierda no hay una columna de punto, sale como **columna sin
  colocar** y Max la asigna con un clic, igual que `IZQ` y `DER`. Mientras
  quede sin colocar no se deja importar.
- Valores negativos se guardan en positivo; celdas vacías o de texto no son
  medidas y no producen nada.
- **Importar nunca pisa en silencio:** si la hoja trae para una pareja
  (progresiva, punto) una distancia distinta de la ya medida, la vista previa
  enseña las dos y Max elige. Si coinciden, no se pregunta.

Una hoja sin columnas de distancia —como `detras-del-colegio.xlsx`— se lee
exactamente igual que hoy.

## 6. El archivo `.topo`

Se añaden `calle.anchos`, `tramo.hastaRol` y `seccion.palabrasDistancia`. Un
archivo anterior abre sin ellos: tabla vacía, tramos amarrados por la migración
del 3.4, y las palabras de distancia de fábrica. La versión del proyecto no
cambia: los tres campos son opcionales al leer.

## 7. Cómo se prueba

**Cálculo (`core`)**
- `distanciaEn`: sin medidas, una sola, exacta, entre dos, antes de la primera,
  después de la última, lado izquierdo con signo, progresivas con decimales.
- Un punto medido no arrastra a otro no medido.
- `tramosResueltos` y `cotaRasante`: bombeo amarrado al borde en una calle que
  pasa de 3.50 a 4.20; tramo sin amarrar; lado sin punto de ese rol; tramo que
  termina antes que el anterior.
- La grilla devuelve el offset y el origen de cada celda.

**Que nada cambie sin anchos medidos**
- Todas las pruebas que existen siguen pasando sin tocarlas.
- `detras-del-colegio.xlsx` y el proyecto de ejemplo dan las mismas cotas,
  diferencias y espesores que antes, comparados número a número.
- Un `.topo` guardado con el modelo anterior abre y vuelve a guardar sin
  perder nada.

**Importación**
- Hoja con columna de distancia colocada sola; sin colocar; con conflicto
  contra una medida existente; con negativos y celdas vacías.

**Navegador real** — `verificacion/anchos.mjs`
- Escribir anchos en la tabla y ver el estimado de la progresiva intermedia.
- Que el corte transversal de esa progresiva sale más ancho y dice «estimado».
- Que la cota teórica del borde cambia al amarrar el tramo.
- Que el 3D levanta una calle que se ensancha.
- Guardar, reabrir, y que la tabla siga ahí.

## 8. Lo que no entra

- Anchos de **proyecto** distintos de los medidos (un plano que pida 4.20
  donde hay 4.00). Max mide; no tiene plano de anchos. Si aparece, es otro spec.
- Curvas, sobreanchos y peraltes: la interpolación es lineal y la calle sigue
  siendo recta en planta.
- El cálculo de volúmenes: es del segundo trabajo, que se apoya en este.
