# Entrega 2B — Rasante de proyecto: cota teórica, corte y relleno

**Fecha:** 2026-08-20
**Estado:** aprobado por Max
**Depende de:** Entrega 1 (nivelación por progresivas) y Entrega 2A (capas y espesores), ambas integradas en `main`
**Diseño padre:** `2026-08-08-app-topografica-design.md`, secciones 4.4 y 4.5

---

## 1. Qué resuelve

Hoy la app responde **«qué cota hay»**. Con esta entrega responde **«cuánto falta o
sobra»**, que es la pregunta que se hace en obra con la mira todavía en la mano.

Para cada celda nivelada habrá tres números donde hoy hay uno:

| | |
|---|---|
| **Cota real** | la medida, derivada de las lecturas |
| **Cota teórica** | la que pide el proyecto en ese punto exacto |
| **Diferencia** | corte si sobra material, relleno si falta |

Y un semáforo por celda contra la tolerancia de su capa.

---

## 2. Alcance

### Entra

- Rasante **por pendientes**: cota de arranque, pendiente longitudinal y sección
  transversal por tramos. Es la forma que Max confirmó que usan sus expedientes.
- Sección transversal **por tramos con sardinel**: calzada con su bombeo, el salto
  del sardinel, y la vereda con su propia pendiente. Una sola caída desde el eje
  daría cotas equivocadas en toda la vereda, y las veredas son el trabajo de Max.
- **Espesor y tolerancia por capa**, para derivar la cota teórica de cada capa
  estructural a partir de la rasante final.
- Corte y relleno por celda, con semáforo.
- **Cuatro vistas** del mismo dato. Max lo pidió con estas palabras: «quiero que
  sea entendible, o sea, con diversos tipos de vista».

### No entra, y por qué

| Fuera | Razón |
|---|---|
| Rasante **por cotas dadas en puntos** | Max usa pendientes. Entra el día que un expediente se la dé así. |
| Rasante **importada** (LandXML) | La más costosa y la que menos se da en obra urbana pequeña. |
| **Peralte en curva** | El modelo es por progresivas de calle urbana. Una curva peraltada necesita otro modelo transversal; hoy no hay caso real. |
| **Drenaje** (pendiente mínima, charcos, rutas de flujo) | Necesita superficie triangulada, que llega con el 3D. Entrega 3. |
| **Volúmenes** de corte y relleno | Necesita área por sección y distancia entre secciones. Cabe después, sobre esto mismo. |

---

## 3. Modelo de datos

### 3.1 La rasante vive en la calle

Una rasante describe **el proyecto de una calle**, no una jornada de medición. Se
define una vez y todas las campañas de esa calle la usan. Corregirla recalcula
todo, igual que corregir la cota de un banco de nivel.

```
Rasante {
  progresivaArranque     number    m
  cotaArranque           number    m
  pendienteLongitudinal  number    %   negativa = la calle baja al avanzar
  tramos                 TramoTransversal[]
  simetrica              boolean   true = el lado derecho es espejo del izquierdo
  tramosIzquierda        TramoTransversal[] | null   solo si simetrica = false
}
```

`Calle` gana un campo `rasante: Rasante | null`. Null significa «esta calle
todavía no tiene proyecto cargado»: la app sigue funcionando exactamente como
hoy, sin cota teórica ni semáforo.

### 3.2 La sección transversal, tramo a tramo

Los tramos se leen **desde el eje hacia afuera**, y cada uno dice hasta dónde
llega:

```
TramoTransversal {
  nombre       string    "Calzada", "Sardinel", "Vereda"
  hastaOffset  number    m, distancia desde el eje donde termina este tramo
  tipo         pendiente | salto
  valor        number    % si es pendiente, m si es salto
}
```

**Convención de signos, y es la que hay que tener clara:**

> Un valor **positivo baja** al alejarse del eje. Un valor **negativo sube**.

Vale para los dos tipos. Una calle urbana típica:

```
  Calzada    hasta 3.50 m   pendiente   +2.0 %    baja hacia el borde (bombeo)
  Sardinel   hasta 3.50 m   salto       -0.15 m   sube 15 cm de golpe
  Vereda     hasta 5.00 m   pendiente   -1.5 %    sube al alejarse
                                                  (o sea, cae hacia la calzada)
```

Un salto **no consume ancho**: su `hastaOffset` es el mismo que el del tramo
anterior. Es un escalón vertical.

### 3.3 Las capas ganan espesor y tolerancia

Hoy `Capa` es `{ id, nombre, orden }`. Pasa a:

```
Capa {
  id, nombre, orden        (como hoy)
  espesor       number     m, cuánto material aporta esta capa
  toleranciaMm  number     mm, ± admitido en esta capa
}
```

La rasante describe la **superficie terminada** — la cara de rodadura. La cota
teórica de una capa cualquiera es la rasante **menos los espesores de todas las
capas que van encima**:

```
cotaTeoricaDeCapa(capa) = cotaRasante − (suma de espesores de las capas con orden mayor)
```

Cambiar un espesor recalcula todas las capas de debajo al instante. Esto ya
estaba en el diseño padre (sección 4.4) y aquí se implementa.

**Compatibilidad:** un `.topo` anterior trae capas sin `espesor` ni
`toleranciaMm`. Se migran igual que se migró `orden`: espesor 0 y tolerancia por
defecto, y la app **avisa** en la pantalla de Proyecto de que hay capas sin
espesor definido. Con espesor 0, la cota teórica de una capa intermedia sería la
de la rasante, que es falso: callar no es opción.

---

## 4. El cálculo

Vive en `packages/core/src/rasante/`, motor puro, sin pantalla.

### 4.1 Cota de la rasante en el eje

```
cotaEje(progresiva) = cotaArranque
                    + (progresiva − progresivaArranque) × pendienteLongitudinal / 100
```

### 4.2 Desnivel transversal hasta un offset

Se recorren los tramos desde el eje acumulando:

- **pendiente**: se resta `(tramo recorrido) × valor / 100`
- **salto**: se resta `valor` entero, en cuanto el offset alcanza ese tramo

Se **resta** porque un valor positivo baja, según la convención de 3.2.

Si el offset cae **más allá del último tramo**, el cálculo devuelve `null`, no
una extrapolación. La app no inventa rasante donde el proyecto no la define: esa
celda sale sin cota teórica y lo dice.

### 4.3 Cota teórica de una celda

```
cotaTeorica(progresiva, offset, capa) =
      cotaEje(progresiva)
    + desnivelTransversal(offset)
    − espesoresPorEncimaDe(capa)
```

### 4.4 Corte y relleno

```
diferencia = cotaReal − cotaTeorica
```

- **Positiva** → la superficie está **alta**: sobra material, hay que **cortar**.
- **Negativa** → está **baja**: falta material, hay que **rellenar**.

Se muestra en **milímetros y con signo**, que es como se habla en obra:
`+18 mm cortar`, `−7 mm rellenar`.

### 4.5 El semáforo

Contra la `toleranciaMm` de la capa:

| Estado | Condición | Qué significa |
|---|---|---|
| Verde | diferencia absoluta ≤ tolerancia | Conforme |
| Ámbar | entre la tolerancia y su doble | Al límite: vigilar |
| Rojo | por encima del doble de la tolerancia | Fuera: hay que corregir |

Valores por defecto al crear capas, citando su fuente (diseño padre, 5.3): base
granular ±10 mm (MTC EG-2013), carpeta de rodadura 5 mm (RNE CE.010).

### 4.6 Un semáforo verde no vale si la nivelación no cerró

**Regla heredada y no negociable:** si el circuito de la campaña no cerró, sus
cotas están sin comprobar, y por tanto **el corte y relleno tampoco**. El
semáforo se sigue calculando —orienta en campo— pero la pantalla y los archivos
lo marcan como no comprobado, igual que ya hacen las cotas y los espesores.

Este defecto apareció en la Entrega 1 y otra vez en la 2A. Aquí entra como
requisito desde el primer día.

---

## 5. Las cuatro vistas

El mismo dato mirado de cuatro maneras. Todas ligadas: elegir una celda en
cualquiera la resalta en las demás, como ya funciona hoy.

### 5.1 Corte transversal — existe, gana la rasante

Sobre el corte que ya está, la rasante como línea discontinua y el área entre
ella y el terreno sombreada: **hacia arriba corte, hacia abajo relleno**, con
colores distintos para no confundirlos.

Igual que el relleno entre capas de la 2A, el sombreado cubre **solo donde hay
medida real**: no se sombrea contra una rasante en un punto que nadie niveló.

### 5.2 Perfil longitudinal — existe, gana la rasante

La rasante del eje como recta y el terreno medido alrededor. Un tramo entero por
debajo se ve de un golpe.

### 5.3 Tabla con semáforo — la de cotas, ampliada

Cada celda muestra la diferencia en milímetros con el color de su estado, y un
interruptor permite ver cota real, cota teórica o diferencia sin cambiar de
pantalla.

### 5.4 Mapa de la calle — vista nueva

Toda la calle de un vistazo, progresivas en columnas y elementos en filas, cada
celda pintada por su estado:

```
          0+000  0+020  0+040  0+060  0+080
  VER-I     ·      ·      ▒      ▒      ·
  BOR-I     ·      ▒      █      █      ▒
  EJE       ·      ·      ▒      █      ▒
  BOR-D     ·      ·      ·      ▒      ·
  VER-D     ·      ·      ·      ·      ·
```

Es la vista que contesta «¿dónde está el problema?» sin recorrer progresiva por
progresiva. Reutiliza `MapaGrilla`, que ya dibuja esta rejilla para marcar
celdas medidas: gana un modo de coloreado por estado.

**Accesibilidad:** el color no puede ser el único portador del significado. Cada
celda lleva su valor en el nombre accesible (`0+040 BOR-I: +23 mm, fuera de
tolerancia`) y un símbolo distinto por estado, no solo un color. Esto ya mordió
dos veces en la 2A.

---

## 6. Dónde se define la rasante

Pantalla de **Calle**, debajo del tramo y las progresivas:

- Progresiva y cota de arranque.
- Pendiente longitudinal en %, **con la cota resultante al final del tramo
  mostrada en vivo**. Así se comprueba de un vistazo que el signo es el correcto,
  que es el error más fácil de cometer.
- Los tramos transversales en una tabla con añadir, quitar y reordenar, y un
  **dibujo del corte tipo que se actualiza mientras se escribe**. Es la forma de
  ver que el sardinel sube y que la vereda cae hacia la calzada antes de nivelar
  nada.
- Casilla de simetría, marcada por defecto.

Los espesores y tolerancias de capa van en la pantalla de **Proyecto**, junto a
las capas, que es donde ya se definen.

---

## 7. Errores y casos límite

| Situación | Qué hace la app |
|---|---|
| Calle sin rasante | Todo funciona como hoy. Las vistas de corte y relleno dicen que falta definir la rasante de esta calle. |
| Celda con offset fuera del último tramo | Sin cota teórica: la celda sale vacía y el resumen dice cuántas quedaron fuera de la sección definida. |
| Capa sin espesor definido | Aviso visible en Proyecto. La cota teórica de las capas de debajo sale marcada como no fiable; no se calla. |
| Tramos con `hastaOffset` decreciente | Se rechaza al escribir, con mensaje claro: los tramos van del eje hacia afuera. |
| Pendiente longitudinal de 0 % | Válida: calle a nivel. No es un error. |
| Circuito sin cerrar | Semáforo calculado pero marcado como no comprobado, en pantalla y en los archivos. |
| Rasante que deja la calzada por encima de la vereda | Aviso, no bloqueo: es raro, pero puede ser intencional. |

---

## 8. Pruebas

**Motor** (`packages/core`): la aritmética con números de obra reales, no
inventados. Cota de eje a lo largo del tramo con pendiente positiva, negativa y
cero. Desnivel transversal con calzada, sardinel y vereda, comprobado a mano
punto por punto. Offset fuera de la sección devuelve null. Espesores acumulados
por capa. Los tres estados del semáforo, **incluidos los bordes exactos**: la
diferencia igual a la tolerancia y igual a su doble.

**Interfaz** (`packages/app`): el formulario de rasante, incluida la cota final
en vivo. Cada una de las cuatro vistas afirmando **valores concretos**, no que se
rendericen. El marcado de no comprobado cuando el circuito no cierra. La
migración de un `.topo` sin espesores.

**Navegador real**: definir una rasante de punta a punta y comprobar que el corte
dibuja el sombreado, que el mapa colorea y que la exportación lleva las
diferencias y el estado de verificación.

---

## 9. Restricciones que se mantienen

Todas las de las entregas anteriores, sin excepción:

- Español en identificadores y textos. Sin `ñ` en identificadores.
- Los datos crudos nunca se sobrescriben; todo se deriva.
- `packages/core` es motor puro: sin DOM, sin red, sin entrada ni salida.
- Funciona sin internet.
- Toda cota o diferencia que se muestre pasa por el redondeo estable.
- Nada de jerga de programador en textos visibles.
- Un dato sin comprobar se marca como tal, siempre, en pantalla **y** en los
  archivos.
