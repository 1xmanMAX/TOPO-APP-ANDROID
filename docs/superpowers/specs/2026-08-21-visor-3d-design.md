# Entrega 3 — Visor 3D: la calle en volumen

**Fecha:** 2026-08-21
**Estado:** aprobado por Max
**Depende de:** Entregas 1, 2A y 2B, las tres integradas en `main`
**Diseño padre:** `2026-08-08-app-topografica-design.md`, sección G

---

## 1. Qué resuelve

Las cuatro vistas de la Entrega 2B cuentan la calle por partes: un corte, un
perfil, una tabla, un mapa. Ninguna la enseña **entera y en volumen**.

Un lomo o un bache tienen forma, y esa forma dice de qué son: un montículo
redondo es un problema de compactación, una cresta a lo largo es un problema de
la máquina. En una tabla los dos son la misma cifra.

Max lo quiere para tres cosas, y en este orden:

1. **Detectar problemas** — la superficie pintada por su estado de tolerancia.
2. **Ver cómo va la obra** — el paquete de capas apilado, tramo a tramo.
3. **Sacar imágenes para el expediente.**

---

## 2. La decisión técnica: SVG, sin dependencias

El diseño padre proponía Three.js. Se descarta, y conviene dejar escrito por qué:

- **La malla es diminuta.** La grilla es progresivas × elementos de la plantilla:
  el proyecto de ejemplo son 10 × 7 = 70 vértices por capa, 280 con las cuatro.
  Three.js está pensado para cientos de miles.
- **Pesa unos 600 kB**, frente a los 315 kB que ocupa hoy la app entera. En este
  proyecto ya se quitó una biblioteca de Excel por ese motivo, y se rehizo a mano.
- **Un lienzo WebGL no es accesible.** Aquí el color no puede ser nunca el único
  portador de significado, y esa regla ha salido en casi todas las revisiones.
- **La app va a Android y se usa en obra**, en teléfonos que no siempre son
  nuevos y sin conexión.

Se dibuja con **SVG y aritmética propia**, como el corte transversal y el perfil.
Cero kilobytes añadidos, cada cara con su nombre accesible, misma paleta.

**Riesgo asumido:** no habrá orbitar suave con sombras. Habrá una vista
axonométrica que se gira arrastrando. Si resulta insuficiente, cambiar el
dibujante significa rehacer la vista — **no el cálculo**, que queda aislado en el
motor y serviría igual.

---

## 3. La proyección

Vive en `packages/core/src/vista3d/`, motor puro.

### 3.1 De la calle a la pantalla

Cada punto tiene tres coordenadas del mundo real:

| | |
|---|---|
| `x` | offset transversal en metros, positivo a la derecha del eje |
| `y` | progresiva en metros |
| `z` | cota en metros |

Y se proyecta con tres parámetros: **giro** (θ, alrededor del eje vertical),
**inclinación** (φ, la altura de la cámara sobre el horizonte) y **exageración
vertical** (e):

```
zx = z · e

pantallaX  =  x·cos θ − y·sin θ
pantallaY  = (x·sin θ + y·cos θ)·sin φ − zx·cos φ
profundidad = (x·sin θ + y·cos θ)·cos φ + zx·sin φ
```

**Verificado ejecutándolo.** Con θ = 45° y φ = 35.264° —el isométrico clásico—
los ejes X e Y caen a **30° exactos** de la horizontal y el eje Z queda vertical:

| punto | pantallaX | pantallaY | |
|---|---|---|---|
| `(1, 0, 0)` | `0.707` | `0.408` | 30° |
| `(0, 1, 0)` | `−0.707` | `0.408` | 30° |
| `(0, 0, 1)` | `0` | `−0.817` | vertical |

Y los dos casos límite se comportan: con φ = 90° la cota desaparece de la
pantalla (planta pura) y con φ = 0° desaparece la progresiva (alzado puro).

### 3.2 Por qué la exageración vertical no es un adorno

Una calle de 180 m ocupa 103.9 unidades de pantalla en isométrico. Un metro de
desnivel, sin exagerar, ocupa 0.8:

| exageración | 1 m de desnivel | respecto al largo |
|---|---|---|
| 1× | 0.8 | 0.8 % |
| 5× | 4.1 | 3.9 % |
| 10× | 8.2 | 7.9 % |
| **25×** | **20.4** | **19.6 %** |
| 50× | 40.8 | 39.3 % |

Sin exagerar, la calle se ve **plana** y el visor no sirve para nada. El valor de
partida es **25×**, ajustable de 1 a 50 con un deslizador.

**Y se dice siempre en pantalla**, junto al dibujo: `Alturas exageradas 25×`. Un
relieve que se ve veinticinco veces más pronunciado de lo que es puede llevar a
alguien a decisiones equivocadas si no lo sabe.

### 3.3 Qué se dibuja

La malla sale de la grilla que ya existe. Cada **cuadro** entre cuatro celdas
vecinas —dos progresivas consecutivas por dos elementos consecutivos— es una cara.

Una cara solo se dibuja si **sus cuatro esquinas tienen cota**. Es la misma regla
que ya rige el sombreado del corte transversal y el relleno entre capas: no se
inventa superficie donde no se midió.

Las caras se ordenan **de mayor a menor profundidad** y se dibujan en ese orden,
así lo de delante tapa lo de atrás. Con 280 caras eso es instantáneo.

---

## 4. Los tres modos

### 4.1 Estado — el mapa de calor en volumen

La superficie de una capa, pintada por el estado de tolerancia de sus celdas, con
la misma paleta y los mismos símbolos que la tabla y el mapa de la Entrega 2B.

Un bache aparece como una mancha con su forma real. Esto es lo primero que Max
pidió y es lo que más reaprovecha: el cálculo ya está hecho.

### 4.2 Capas apiladas — cómo va la obra

Las superficies de varias capas a la vez, una encima de otra, cada una con su
color. Se ve de un vistazo qué tramos tienen ya la base puesta y cuáles siguen en
subrasante.

Se eligen con el selector de capas que ya existe. Una capa sin medir en un tramo
simplemente no tiene superficie ahí, y ese hueco **es la información**.

### 4.3 Corte vivo — ligado al deslizador que ya existe

El mismo deslizador de progresiva que mueve el corte transversal secciona aquí el
modelo: lo que queda por delante del plano se oculta y se ve la calle cortada,
con el espesor de cada capa a la vista.

Es lo que pedía el diseño padre —«cortes de sección interactivos»— y sale casi
gratis: filtrar las caras por progresiva antes de proyectarlas.

---

## 5. Controles

- **Girar**: arrastrando sobre el dibujo. Con teclado, las flechas.
- **Inclinación**: de planta (90°) a casi alzado (5°).
- **Exageración vertical**: de 1× a 50×, con el valor siempre visible.
- **Vistas guardadas**: tres botones que colocan la cámara en isométrico, planta
  y alzado. Un topógrafo que quiere comparar dos días necesita poder volver al
  mismo encuadre exacto, y a mano no se consigue.
- **Qué capas se dibujan**: el selector que ya existe.

---

## 6. Accesibilidad

Un dibujo tridimensional es el sitio donde más fácil resulta dejar fuera a quien
no lo ve. No se hace así:

- **Cada cara lleva su nombre accesible**, con las dos progresivas y los dos
  elementos que la forman, y su estado: `Entre 0+000 y 0+020, de BOR-I a EJE:
  fuera de tolerancia`.
- **Un resumen en texto** acompaña siempre al dibujo, con lo que el dibujo enseña:
  cuántas caras hay de cada estado y **dónde está la peor zona**, nombrada por
  progresiva y elemento. Quien no ve el modelo tiene que poder enterarse igual de
  que hay un problema en `0+040 BOR-I`.
- **La exageración vertical, escrita**, como se dijo arriba.
- El color nunca es el único portador: cada estado conserva su símbolo.

---

## 7. Errores y casos límite

| Situación | Qué hace la app |
|---|---|
| Calle sin rasante | Los modos de estado no aplican. Se puede ver la superficie medida y las capas apiladas; el modo estado lo dice y no se dibuja. |
| Menos de dos progresivas o dos elementos medidos | No hay ninguna cara que formar. Se dice con palabras, no con un dibujo vacío. |
| Una capa sin ninguna medida | No aparece en el modelo. El selector lo indica. |
| Inclinación 90° (planta pura) | Válida: es la vista en planta. No es un error. |
| Exageración 1× | Válida. Solo significa que el relieve se verá muy plano. |
| Circuito sin cerrar | El visor queda bajo **el mismo aviso** que las otras cuatro vistas: si la nivelación no está comprobada, lo que enseña el 3D tampoco. |

---

## 8. Qué NO entra

| Fuera | Por qué |
|---|---|
| Sombras, luces, texturas | Necesitan un motor 3D. El valor está en la forma, no en el brillo. |
| Medición sobre el modelo | Las cotas y diferencias ya se leen en la tabla, con más precisión que pinchando en un dibujo. |
| Breaklines dibujadas sobre el 3D | Es edición, y Max rechazó explícitamente el editor CAD: «para eso usaría AutoCAD». |
| Drenaje: charcos, rutas de flujo | Necesita superficie triangulada de verdad, no la grilla regular. |
| Volúmenes de corte y relleno | Cabe después, sobre este mismo modelo. |
| Captura en imagen | Llega cuando haya algo que capturar. El SVG se puede guardar tal cual; se decide al cerrar la entrega. |

---

## 9. Pruebas

**Motor** (`packages/core`): la proyección con números verificados a mano — los
tres ejes del isométrico a 30°, los dos casos límite de la inclinación, y la
exageración vertical. El armado de caras: que una cara con una esquina sin cota
**no se forma**, y que el orden por profundidad pone delante lo que está delante.

**Interfaz** (`packages/app`): que los tres modos dibujan lo que dicen, afirmando
**valores concretos**. Que el resumen en texto nombra la peor zona. Que la
exageración aparece escrita. Que sin rasante el modo estado lo dice en vez de
dibujar. Que el corte vivo oculta lo que queda por delante del deslizador.

**Navegador real**: girar el modelo, mover el deslizador y comprobar que la
sección cambia, y que la página no se desborda.

---

## 10. Restricciones que se mantienen

- Español en identificadores y textos. Sin `ñ` en identificadores.
- Los datos crudos nunca se sobrescriben; todo se deriva.
- `packages/core` es motor puro: sin DOM, sin red, sin entrada ni salida.
- **Sin dependencias nuevas.**
- Funciona sin internet.
- Toda cota que se muestre pasa por el redondeo estable.
- Nada de jerga de programador en textos visibles.
- El color nunca es el único portador de significado.
- Un dato calculado sobre una nivelación sin comprobar se marca como tal.
- La campaña de referencia se recibe **por parámetro**, nunca leyendo el estado
  global. Esa regla costó cuatro rondas de arreglo en la entrega anterior.
