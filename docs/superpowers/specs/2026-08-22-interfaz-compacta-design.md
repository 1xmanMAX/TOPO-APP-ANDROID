# Interfaz compacta: de seis pestañas a tres

**Fecha:** 2026-08-22
**Estado:** aprobado por Max
**Depende de:** Entregas 1, 2A y 2B integradas en `main`; la Entrega 3 (visor 3D)
en curso en `entrega-3-visor-3d`

---

## 1. Qué resuelve

Max lo pidió así: *«que no tenga tantas pestañas sino que en menos lugar pueda
ingresar más; en otras palabras, optimiza sin sacrificar»*.

Hoy la app tiene **seis pestañas** y todo lo que se ve dentro de cada una se
apila en vertical. Dos problemas concretos:

- **Saltos innecesarios.** Definir una calle obliga a pasar por tres pestañas:
  la plantilla en una, el tramo en otra, y los bancos de nivel y las capas en una
  tercera. Son cosas que se tocan juntas.
- **Resultados es una torre.** Siete secciones apiladas: para llegar al mapa hay
  que pasar por encima de dos tablas, y cada vista se dibuja en una franja
  estrecha aunque la pantalla sea ancha.

**Nada de esto es un cambio de funcionalidad.** No se añade ni se quita ninguna
capacidad, ningún dato cambia de forma, y el archivo `.topo` no se toca. Es solo
dónde vive cada cosa.

---

## 2. Las tres pestañas

```
ANTES   Proyecto · Plantilla · Calle · Campañas · Libreta · Resultados
DESPUÉS Obra · Libreta · Resultados
```

El criterio del agrupamiento es **cuándo se usa cada cosa**:

| Pestaña | Qué reúne | Cuándo se toca |
|---|---|---|
| **Obra** | Datos, bancos de nivel, capas, calle, plantilla y rasante | Al empezar, y poco más |
| **Libreta** | Elegir o crear la jornada, y medir | Todos los días de campo |
| **Resultados** | Cotas, espesores, y el control contra el proyecto | Al terminar, y en gabinete |

---

## 3. Obra: tres pantallas en una

```
┌─ Obra ────────────────┬─ Capas del pavimento ──────────┐
│ Nombre, ubicación     │ TERRENO      0.00 m   ±20 mm   │
│                       │ SUBRASANTE   0.25 m   ±20 mm   │
│ Bancos de nivel       │ BASE         0.20 m   ±10 mm   │
│  BM-1   3245.180      │ CARPETA      0.05 m   ± 5 mm   │
└───────────────────────┴────────────────────────────────┘
┌─ Calle: Av. Sol ───────────────────────────────────────┐
│ 0+000 → 0+180  cada 20 m      [Plantilla ▾] [Rasante ▾]│
└────────────────────────────────────────────────────────┘
```

**Dos columnas arriba**, en pantalla ancha: los datos de la obra con sus bancos
de nivel a la izquierda, las capas a la derecha. En pantalla estrecha se apilan,
como hoy.

**La calle debajo, a todo lo ancho**, con su plantilla y su rasante **plegadas**.
Las dos se abren al pulsarlas. Se pliegan porque se tocan pocas veces: una vez
definida la sección transversal de una calle, no se vuelve a mirar.

La plantilla deja de tener pestaña propia. Pertenece a la calle, y ahí es donde
alguien la busca.

### Qué se pliega y qué no

Lo que está **siempre abierto** es lo que se consulta o corrige con frecuencia:
los bancos de nivel y las capas. Lo que se **pliega** es lo que se define una vez:
la plantilla y la rasante.

Un bloque plegado tiene que decir **qué contiene sin abrirlo**: `Plantilla: 7
puntos, de −5.60 a +5.60 m` y `Rasante: 3245.180 en 0+000, −1.25 %`. Un
desplegable que solo dice «Plantilla» obliga a abrirlo para saber si hace falta.

---

## 4. Libreta: la jornada deja de ser una pantalla

```
┌────────────────────────────────────────────────────────┐
│ Av. Sol · SUBRASANTE · 19 ago     [cambiar] [+ nueva]  │
└────────────────────────────────────────────────────────┘
```

Una barra compacta arriba de la libreta, con la jornada activa y dos acciones.
`Cambiar` despliega la lista de campañas de la calle; `+ nueva` abre el
formulario que hoy vive en la pestaña de Campañas.

Todo el resto de la libreta —el panel de estación, la grilla, el cierre y el
corte— gana el espacio de la pestaña que desaparece.

**La lista completa de campañas no se pierde:** sigue siendo la misma que hoy,
con sus selectores de calle, capa, banco de nivel y fecha. Solo cambia de sitio:
de una pestaña a un desplegable dentro de la libreta.

---

## 5. Resultados: las cinco vistas se turnan

```
┌─ Cotas ──────────────┬─ Espesor entre capas ───────────┐
└──────────────────────┴─────────────────────────────────┘
┌─ Control contra el proyecto ───────────────────────────┐
│ DIFERENCIAS VERIFICADAS — el circuito cierra           │
│ [Tabla] [Mapa] [Corte] [Perfil] [3D]                   │
│                                                        │
│         ... la que elijas, a pantalla ancha ...        │
└────────────────────────────────────────────────────────┘
```

Las dos tablas de arriba, en dos columnas. Debajo, el grupo de control contra el
proyecto que ya existe, con sus cinco vistas **turnándose en el mismo hueco** en
vez de apilarse.

Tres cosas que esto gana:

1. **Cada vista se ve más grande** que hoy, porque ocupa el ancho completo en vez
   de una franja.
2. **Se llega al mapa o al 3D sin pasar por encima de nada.**
3. **La comparación es directa:** cambiar entre Corte y 3D deja las dos en el
   mismo sitio de la pantalla, así que se comparan de un vistazo.

**El aviso de nivelación comprobada sigue donde está**, arriba del grupo,
cubriendo a las cinco. Esa regla costó tres apariciones del mismo defecto y no se
toca: **una sola sección, un solo aviso**.

### Qué vista se ve al entrar

La **tabla**, que es la que da los números exactos. Y la elección **se recuerda
mientras la app está abierta**: quien está revisando el mapa y va a la libreta a
corregir una lectura vuelve al mapa, no a la tabla.

Es estado de sesión, como la cámara del visor: no viaja en el archivo.

---

## 6. Accesibilidad

- Las cinco vistas que se turnan son **un grupo de pestañas de verdad**, con su
  semántica correcta, no botones sueltos: se recorren con las flechas del teclado
  y un lector de pantalla anuncia cuál está activa y cuántas hay.
- Los bloques plegables dicen si están abiertos o cerrados, y su resumen se lee
  aunque estén cerrados.
- **El foco no se pierde al cambiar de vista**: quien cambia de Tabla a Mapa con
  el teclado sigue en el mismo sitio.

---

## 7. Lo que NO cambia

| | |
|---|---|
| Funcionalidad | Ninguna capacidad se añade ni se quita |
| Datos | Ningún tipo cambia de forma |
| El archivo `.topo` | Idéntico; los archivos guardados siguen abriéndose |
| El motor | `packages/core` no se toca |
| Los cálculos | Ni una fórmula cambia |
| Los textos | Los mismos, en los mismos sitios |

---

## 8. Riesgos

**El que más pesa:** las cinco vistas que se turnan dejan de verse a la vez. Hoy
alguien podría estar mirando el corte y el perfil juntos bajando la página.

Se acepta porque en la práctica esa comparación no se hace —son escalas y ejes
distintos— y porque el mismo cambio hace que cada una se vea al doble de tamaño.
**Si resulta molesto**, volver a apilarlas es cambiar un contenedor, no rehacer
las vistas.

**El segundo:** los guiones de verificación en navegador navegan por nombre de
pestaña. Tres pestañas menos significa que hay que ajustarlos. Es trabajo
mecánico, pero no puede olvidarse: son 48 comprobaciones que protegen las tres
entregas anteriores.

---

## 9. Pruebas

**Interfaz:** que las tres pestañas existen y que **ninguna función quedó sin
sitio** — para cada cosa que hoy se puede hacer, una prueba que la haga desde su
nuevo sitio: crear un banco de nivel, editar la plantilla, definir la rasante,
crear una campaña, cambiar de campaña, y llegar a las cinco vistas.

Que los bloques plegados **resumen su contenido sin abrirse**. Que la vista
elegida se recuerda al ir y volver. Que el aviso de nivelación cubre las cinco.

**Navegador real:** los tres guiones que ya existen, ajustados a la navegación
nueva, más comprobar que la página **no se desborda en horizontal** en pantalla
estrecha — las dos columnas son lo primero que rompe eso.

---

## 10. Restricciones que se mantienen

- Español en identificadores y textos. Sin `ñ` en identificadores.
- Los datos crudos nunca se sobrescriben; todo se deriva.
- `packages/core` es motor puro y **no se toca en este trabajo**.
- Sin dependencias nuevas.
- Funciona sin internet.
- Nada de jerga de programador en textos visibles.
- El color nunca es el único portador de significado.
- Un dato calculado sobre una nivelación sin comprobar se marca como tal.
- El contenido ancho hace scroll dentro de su caja; la página nunca se desborda
  en horizontal.
