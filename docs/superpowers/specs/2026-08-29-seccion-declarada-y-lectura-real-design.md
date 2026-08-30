# La sección declarada y la lectura de una hoja real

**Fecha:** 2026-08-29
**Estado:** aprobado por Max
**Enmienda** del spec `2026-08-24-catalogo-y-nivelaciones-design.md`. Sustituye
sus apartados 2 (el catálogo de códigos), 3 (qué se ve antes de aceptar) y la
parte del 6 que describe la pantalla del catálogo. Todo lo demás de aquel spec
—las nivelaciones con tomas, la migración, los tres caminos de entrada, las
restricciones— sigue en pie sin cambios.

**Por qué existe:** el riesgo número dos de aquel spec decía *«el formato de la
hoja puede no encajar del todo con cómo anota Max»*. El 2026-08-29 Max mandó un
archivo real y no encajaba. Esto es el arreglo, escrito con el archivo delante.

---

## 1. El archivo que lo provocó

`Detrás del colegio .xlsx`, exportado de Google Sheets —no de Excel: no trae
`docProps`—, guardado en el proyecto como
`packages/app/src/pruebas/muestras/detras-del-colegio.xlsx`. Se le quitó del
nombre el espacio final y la tilde para que ninguna herramienta tropiece; es
byte por byte el mismo archivo.

Esto es todo lo que contiene:

|  | B | C | D | E | F | G | H |
|---|---|---|---|---|---|---|---|
| **2** | PC | 1.45 | | | | | |
| **3** | | | | 2.11 | | | |
| **4** | | vereda | IZQ | EJE | DER | vereda | |
| **5** | 6 | 2.12 | 2.24 | 2.27 | 2.12 | 1.93 | |
| **6** | 10 | 2.07 | 2.17 | 2.14 | 2.15 | 1.84 | |
| **7** | 20 | 1.88 | 2.135 | 2.07 | 2.02 | 1.755 | 0.125 |
| **8** | 30 | 1.82 | 2.105 | 2.035 | 2.00 | 1.675 | 0.145 |
| **9** | 40 | 1.67 | 1.935 | 1.92 | 1.935 | 1.65 | 0.02 |
| **10** | 50 | 1.67 | 1.78 | 1.75 | 1.76 | 1.57 | 0.10 |
| **11** | 60 | 1.56 | 1.52 | 1.49 | 1.38 | 1.42 | 0.14 |
| **12–19** | | | | | | | 0 |
| **20** | existente | cuneta | 2.185 | | 1.955 | 0.23 | |
| **21** | existente | calzada | 2.41 | | 2.06 | | |

Las progresivas de la fila 7 en adelante son fórmula (`B6+10`); la columna H es
`C−G` arrastrada hasta la 19, de ahí los ceros; `G20` es `D20−F20`.

**Siete cosas que el spec anterior no contemplaba:**

1. La tabla no empieza arriba a la izquierda: hay dos filas de preámbulo y la
   primera columna es la B.
2. La columna de progresivas **no tiene título**, y ninguno de los códigos de
   fábrica (`PROG`, `PK`, `ABSCISA`, `EST`) aparece en la hoja.
3. `vereda` está **dos veces**, contra la regla «un código pertenece a un solo
   concepto». El lado solo se sabe por dónde cae respecto al `EJE`.
4. `IZQ` y `DER` son etiquetas de **lado**, no de elemento.
5. **No hay ni una distancia al eje** en toda la hoja.
6. La columna H y las filas 12–19 son **cálculo arrastrado**, no lecturas.
7. Las filas 20 y 21 son **otra tabla dentro de la tabla**: sin progresiva, con
   la etiqueta al principio de la fila y las lecturas bajo las columnas de
   puntos.

---

## 2. Qué pidió Max, con sus palabras

> *«el PC es la vista atrás o punto de control, y el 2.11 es solo un dato que
> tomo de una zona existente fija para guiarme; eso se ingresaría de forma
> separada en la app»*

> *«que se pueda configurar dentro de la app de forma sencilla; si no se pone, se
> toma un valor predeterminado»* — sobre las distancias al eje

> *«que en una parte puedas asignar palabras para cada punto, y que esto se
> muestre de forma interactiva en la app con gráficos. Podré poner, por ejemplo:
> el eje se pondrá en el Excel como "ejito" y los bordes como "bobo", y
> directamente busque estos en el Excel y los tome para esos puntos»*

Y sobre las filas 20 y 21, eligió: **leerlas del Excel y guardarlas como
referencia**.

El giro está en la tercera cita. El spec anterior hacía que la app **preguntara
después**, al toparse con un código que no conocía. Max quiere lo contrario:
**declarar antes**, con dibujo, y que la importación sea muda porque ya sabe qué
busca.

---

## 3. La sección declarada

Sustituye al catálogo entendido como lista de códigos. **Hay una sección por
calle**, y se ve como lo que es: la sección dibujada, con sus puntos encima.

Cada punto de la sección lleva tres cosas:

| | Qué es | Para qué sirve |
|---|---|---|
| **Rol** | eje · borde de calzada · sardinel · vereda · cuneta · otro | Lo que la app usa para **dibujar** y para calcular el bombeo y el salto de sardinel |
| **Distancia al eje** | en metros, con signo por el lado | Lo que da **escala real** a la sección transversal |
| **Palabras** | una o varias | Con lo que **se busca en la hoja** |

Y tres palabras más que no son puntos de la sección pero sí están en la hoja:

- la de la **progresiva**,
- la del **punto de control** (la de Max es `PC`),
- la que marca una **fila de referencia** (la de Max es `existente`).

### Reglas

- **Una palabra puede servir a los dos lados.** Max escribe `vereda` dos veces y
  quiere escribir `bobo` para los dos bordes. Esto **deroga** la regla del spec
  anterior de que un código pertenece a un solo concepto: la palabra nombra el
  **elemento**, y el lado sale de la posición.
- **El lado se deduce por la columna del eje**: lo que cae a su izquierda es lado
  izquierdo, lo que cae a su derecha es lado derecho.
- **Sin distinguir mayúsculas, tildes ni espacios**, como ya estaba. `vereda `,
  `VEREDA` y `Vereda` son la misma palabra. Esto ya funciona y no se toca.
- **Las distancias tienen valor de fábrica.** Si Max no las toca, la app usa una
  sección urbana típica y **lo dice en pantalla** (apartado 6). Nunca bloquean la
  importación.
- **La sección nace rellenada** —vereda, sardinel, borde, eje, borde, sardinel,
  vereda— para no arrancar de cero, y se edita entera.
- **La sección viaja en el `.topo`**, por lo mismo que viajaba el catálogo: sin
  ella, reimportar la misma hoja daría otro resultado.

---

## 4. Cómo se lee una hoja

En orden, y con el archivo de muestra como ejemplo de cada paso.

**0. Elegir primero la calle.** La sección es de la calle, y sin sección no hay
con qué buscar: **primero se dice a qué calle va la hoja, y luego se lee**. Al
importar se propone el nombre del archivo —`Detrás del colegio`— como nombre de
calle, y se puede cambiar. Si la calle es nueva, arranca con la sección de
fábrica del apartado 3, así que una hoja siempre se puede leer aunque no se haya
declarado nada todavía.

**1. Encontrar la cabecera.** Es la primera fila que contiene alguna de las
palabras declaradas de un punto de la sección. En la muestra, la fila 4. Todo lo
que esté encima es **preámbulo**.

**2. Sacar el punto de control del preámbulo.** Se busca la palabra del punto de
control y se toma el número de la celda siguiente: `PC` en `B2`, `1.45` en `C2`.
Esa es la vista atrás de la toma.

**3. Lo demás del preámbulo no entra, pero se enseña.** El `2.11` de `E3` no
lleva etiqueta: la app no lo importa y lo lista en la vista previa como *«había
esto arriba y no supe qué era»*. Max ya dijo que ese dato lo mete él aparte.

**4. Identificar la columna de progresivas.** Si alguna columna lleva la palabra
declarada, esa es. Si ninguna la lleva —el caso de la muestra—, se toma la
**columna numérica más cercana por la izquierda a la primera columna de
puntos**. En los dos casos la vista previa lo enseña. Si no hay ninguna candidata, la app
**lo dice y pide que se señale**; no importa nada a ciegas.

**5. Repartir las columnas de puntos y sus lados.** Cada columna cuyo título
coincida con una palabra declarada es un punto. El lado sale de su posición
respecto a la columna del eje: `C` (vereda) a la izquierda → vereda izquierda;
`G` (vereda) a la derecha → vereda derecha.

- **Si la hoja no trae columna de eje**, no hay de dónde deducir el lado: la app
  lo dice y pide que se asigne en la vista previa.
- **Si una misma palabra aparece dos veces del mismo lado**, la app **no elige**:
  lo señala y pide que se resuelva.

**6. Columnas que no son de nadie.** La H no tiene título y no coincide con
ninguna palabra: **no entra**. Pero aparece en la vista previa como columna no
importada, **con sus valores**, y **ahí mismo se le puede asignar un punto de la
sección**, lo que guarda su palabra para siempre. Que una lectura se pierda en
silencio es la peor cosa que puede pasar aquí, y sigue siendo la regla que manda:
declarar antes no significa descartar después lo que no se declaró.

Esto es lo que hace que la primera importación de una hoja nueva funcione. En la
muestra, con la sección de fábrica solo casarían `EJE` y `vereda`; `IZQ` y `DER`
salen como columnas sin asignar —no como datos perdidos— y se colocan de un clic.

**7. Filas que no son filas de datos.** Una fila sin progresiva y sin ninguna
lectura bajo una columna de puntos no es un punto medido, **aunque tenga
números**. Las filas 12 a 19 de la muestra solo tienen el cero arrastrado de la
H: no entran.

**8. Filas de referencia.** Apartado 5.

---

## 5. Los puntos de referencia

Son lecturas sobre cosas existentes y fijas —una cuneta, una calzada, un umbral—
que Max toma para guiarse. **No pertenecen a ninguna progresiva** y se guardan
aparte de la grilla, con su cota calculada desde la misma estación.

Una fila es de referencia cuando su primera celda lleva la palabra declarada para
ello (`existente`). Entonces:

- **La segunda celda dice qué elemento es** (`cuneta`, `calzada`), y es **texto
  libre**: no hace falta declararlo en la sección. Se guarda tal como se escribió
  y se enseña así. Exigir que estuviera declarado añadiría un paso sin ganar
  nada — una referencia no se dibuja en la sección, se anota.
- **La columna solo dice el lado y la distancia; el elemento lo dice la fila.**
  En la fila 20, el `2.185` de `D` es la cuneta izquierda y el `1.955` de `F` es
  la cuneta derecha.
- **Si en una fila de referencia caen dos lecturas del mismo lado, la app no
  elige**: las enseña y pide que se diga cuál vale. Esto es lo que atrapa el
  `0.23` de `G20`, que es la resta `D20−F20` y no una lectura.

Sobre ese `0.23` conviene ser explícito: **la app no distingue una fórmula de un
dato**, y no debe intentarlo. El `.xlsx` guarda la fórmula, pero el portapapeles
solo trae el resultado, y el spec anterior exige que archivo, CSV y pegado den el
**mismo** resultado con los mismos datos. Se resuelve por la forma —dos valores
del mismo lado— y no por el formato del archivo, que es lo único que vale para
los tres caminos.

---

## 6. Dos avisos obligatorios

Van en pantalla, con el mismo criterio con el que ya se avisa de una nivelación
que no cerró. Un dato con cara de comprobado que no lo está es el defecto que
este proyecto ya ha cometido tres veces.

- **«Las distancias son las de fábrica.»** Mientras Max no las cambie, la
  pendiente y el bombeo salen de números que puso la app, no de la calle. Se
  dice, y se dice donde se ve el bombeo.
- **«Esta toma no cierra.»** La muestra tiene un solo punto de control y ninguna
  vuelta. Las cotas se calculan igual, y se marcan como no comprobadas. La regla
  ya existe; se hace notar que el archivo real de Max **es justo ese caso**, así
  que el aviso no es teórico.

---

## 7. Qué se ve antes de aceptar

Sigue vigente el «nada entra hasta confirmar» del spec anterior. Lo que la vista
previa tiene que enseñar, con la muestra como medida:

- Qué palabra cayó en qué punto y **de qué lado**, sobre el dibujo de la sección.
- Cuántas progresivas y cuántas lecturas: 7 progresivas (6 a 60) × 5 puntos.
- Las referencias encontradas: **tres**, no cuatro — la cuneta izquierda, la
  calzada izquierda y la calzada derecha. La cuneta derecha no entra: ahí caen
  dos lecturas del mismo lado (el `1.955` bajo `DER` y el `0.23` bajo la vereda)
  y la app no elige. Sale en los conflictos, con los dos valores.
- **Lo que no importó, con su contenido**: la columna H, las filas 12–19, y el
  `2.11` suelto del preámbulo.
- Lo que quedó sin resolver, si algo quedó: dos lecturas del mismo lado, una
  palabra sin declarar, una columna de progresivas dudosa.

---

## 8. Qué cambia del plan en curso

El plan `2026-08-24-catalogo-y-nivelaciones.md` va por la tarea C4, que es
exactamente la que esto reescribe. C1, C2 y C3 están hechas y **no se tocan**.

| Tarea | Cambio |
|---|---|
| **C1** (catálogo en el motor) | Hecha, pero se amplía: cada punto gana **rol** y **distancia**, y una palabra puede valer para los dos lados. Las pruebas que afirman «un código, un concepto» se reescriben apuntando a la regla nueva, no se borran |
| **C2** (lector de hoja) | Sin cambios. La tabla rectangular que produce es justo lo que esto necesita |
| **C3** (modelo con tomas) | Sin cambios, más los **puntos de referencia** colgando de la calle |
| **C4** (intérprete) | Se escribe sobre el apartado 4 de este spec, no sobre el catálogo que pregunta |
| **C6** (pantalla de subir datos) | La vista previa del apartado 7 |
| **C7** (pantalla del catálogo) | Deja de ser una lista de códigos y pasa a ser **la sección dibujada** del apartado 3 |

---

## 9. Pruebas

Además de las del spec anterior, que siguen:

- **El archivo real entra bien.** `detras-del-colegio.xlsx` da 7 progresivas, 5
  puntos por progresiva con el lado correcto, la vista atrás 1.45, dos
  referencias (cuneta y calzada, izquierda y derecha), y **nada más**: ni la
  columna H, ni las filas 12–19, ni el `2.11`.
- **Lo no importado se nombra.** La misma importación tiene que listar esas tres
  cosas. Una prueba que solo compruebe lo que entró dejaría pasar el defecto que
  más se teme.
- **El mismo archivo por los tres caminos** —subido, en CSV y pegado— da el mismo
  resultado, incluido el `0.23` señalado como conflicto.
- **La palabra en los dos lados.** Una hoja con `bobo` a izquierda y derecha del
  eje reparte los dos bordes bien.
- **Sin columna de eje**, la app lo dice y no adivina el lado.
- **Distancias de fábrica**: el aviso aparece, y **sigue mientras quede una sola
  sin medir**. Solo desaparece cuando ya no queda ninguna. La pendiente entre dos
  puntos únicamente es fiable si los dos están medidos, así que corregir la
  vereda no hace fiable su pendiente contra un borde que sigue puesto por la app.

---

## 10. Restricciones que se mantienen

Todas las del spec del 2026-08-24, sin excepción: español en identificadores y
textos, sin `ñ` en identificadores, **sin dependencias nuevas**, `packages/core`
como motor puro, los datos crudos nunca se sobrescriben, importar añade y nunca
pisa, funciona sin internet, sin jerga en textos visibles, y un dato calculado
sobre una nivelación que no cerró se marca como no comprobado.

---

## 11. Riesgos

**El mayor:** la sección declarada se parece a la pantalla `Plantilla` que Max
mandó retirar. Se le dijo a la cara antes de aprobar esto, y la diferencia es
real: aquella era una tabla de columnas fijas y esta es su sección dibujada con
sus propias palabras encima. Si al verla funcionando le suena a lo mismo, hay que
parar y rehacerla, no defenderla.

**El segundo:** una hoja real más puede volver a no encajar. Esta ya es la
segunda vez. La defensa no es adivinar mejor: es que **todo lo que no se entendió
se enseña con su contenido** antes de aceptar, y que la sección se declara en
lugar de deducirse.
