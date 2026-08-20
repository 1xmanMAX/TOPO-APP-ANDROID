# Herramienta 1 — Nivelación por progresivas y capas

**Fecha:** 2026-08-19
**Estado:** Diseño aprobado en conversación. Pendiente de revisión del usuario.
**Autor:** Max (max.antony.9@gmail.com) — Perú
**Diseño padre:** [App de Topografía (2026-08-08)](2026-08-08-app-topografica-design.md)

---

## 1. Qué es

La primera herramienta de la app: **nivelación de calles con nivel de ingeniero, organizada por progresivas y capas**.

Ingresas las lecturas de mira tal como las anotaste en campo. La app calcula las cotas, verifica el cierre del circuito contra la tolerancia normativa, compensa el error y te muestra la calle en una grilla y en cortes transversales interactivos.

Los datos **crecen**: hoy nivelas una calle, mañana la siguiente, pasado la siguiente capa de la primera. Nada se sobrescribe.

**En una frase:** escribes lo que leíste en la mira y la app te dice si tu nivelación cierra, cuánto vale cada cota, y te deja recorrer la calle corte por corte.

---

## 2. Decisiones tomadas

| Tema | Decisión | Por qué |
|---|---|---|
| Dato de entrada | **Lecturas de mira crudas** (vista atrás, intermedias, vista adelante) | Permite recalcular todo si cambia un BM o una lectura. Es la única forma de verificar cierre. |
| Sección transversal | **Plantilla configurable por calle** + puntos sueltos | A veces hay vereda, a veces no; a veces pelo de agua o puntos existentes de amarre. |
| Comparación entre capas | **Selector de capas** — el usuario elige cuáles dibujar y cuáles comparar | Más flexible que fijar una comparación predeterminada. |
| Posición en el plano | **Sin coordenadas UTM.** Plano de referencia cargado como imagen, con pines anclados | El nivel de ingeniero no da XY. El pin sobre el plano resuelve la ubicación visual. |
| Longitud K del circuito | **Calculada de las progresivas, editable** | Cero trabajo en el caso normal, control cuando hubo rodeos. |
| Interactividad | **Regla de diseño, no detalle.** Todo responde | Requisito explícito del usuario. |
| Alcance de la Entrega 1 | Libreta + cierre + grilla + **corte 2D con deslizador** + perfil longitudinal | El corte es el mejor detector de errores de anotación. |

### 2.1 Alcance por entregas

El modelo de datos contempla todo desde el día uno; lo que se reparte es la interfaz.

| | Contenido |
|---|---|
| **Entrega 1** | Proyecto · BM · calle con plantilla configurable · grilla progresiva × elemento · libreta cruda · cierre, tolerancia y compensación · tabla de resultados · exportar Excel/CSV · **corte transversal con deslizador** · **perfil longitudinal** |
| **Entrega 2** | Varias campañas por capa · selector de capas · espesor real colocado · cota teórica vs. real · semáforo de tolerancia · cortes superpuestos y rellenos |
| **Entrega 3** | Visor 3D de la calle · capas apiladas · color por cota / corte-relleno / pendiente · **plano de corte ligado al mismo deslizador** |
| **Entrega 4** | Planos de referencia cargados como imagen · pines anclados y estables · encadenamiento visual de calles |

### 2.2 Fuera de alcance de la Entrega 1

Conexión Bluetooth a equipos · superficies TIN y curvas de nivel · volúmenes · rasante de proyecto · detección de charcos y rutas de flujo · DXF · LandXML · informes PDF · Android.

### 2.3 Resuelve un pendiente del diseño padre

El diseño del 2026-08-08 dejó abierto si el 3D básico entraba al MVP (sección 7, punto 1). **Queda resuelto: el 3D pasa a la Entrega 3.** A cambio, el corte 2D con deslizador se adelanta a la Entrega 1, de modo que hay visualización interactiva desde el primer día sin cargar Three.js todavía.

---

## 3. Stack y estructura

Principio heredado del diseño padre: **el motor de cálculo no sabe que existe una pantalla.**

```
TOPOGRAPHIC APP/
├── packages/
│   ├── core/          motor de cálculo — TypeScript puro, sin DOM ni IO
│   │   ├── modelo/       Proyecto, BM, Calle, Plantilla, Campania, Libreta
│   │   ├── nivelacion/   libreta -> cotas, cierre, tolerancia, compensacion
│   │   └── grilla/       progresivas x elementos
│   └── app/           interfaz — React + Vite
│       ├── vistas/       pantallas
│       ├── componentes/  tabla de libreta, editor de plantilla, corte, perfil
│       └── estado/       store del proyecto abierto
└── docs/superpowers/specs/
```

| Pieza | Elección | Razón |
|---|---|---|
| Monorepo | npm workspaces | npm 11 ya instalado. Cero herramientas extra. |
| Interfaz | React + Vite | Mejor integración con Three.js para la Entrega 3. |
| Estilos | Tailwind v4 | No agrega peso en producción. |
| Pruebas | Vitest | El motor va con pruebas desde la primera línea. |
| Gráficos 2D | uPlot | Previsto en el diseño padre. Ligero y rápido. |
| Excel | SheetJS | Previsto en el diseño padre. |
| Archivo `.topo` | ZIP + JSON con `fflate` | Portable, abrible con cualquier descompresor. |

**Alternativa descartada:** Svelte, que daría un empaquetado ~40 KB menor. Se descarta porque Three.js, las tablas grandes y el ecosistema están mejor resueltos en React, y la diferencia es irrelevante frente al objetivo de APK < 15 MB.

**Reglas de dependencia:** `core` no importa nada. `app` importa `core`. Nunca al revés.

**Sin servidor, sin base de datos, sin cuentas, sin internet.** Todo corre en el navegador; los datos viven en el archivo `.topo`.

---

## 4. Modelo de datos

**Principio rector: los datos crudos nunca se sobrescriben; las cotas son siempre derivadas.**

### 4.1 Banco de nivel

```
BM {
  id
  nombre        "BM-1"
  cota          3245.180
  tipo          oficial | auxiliar
  descripcion   "clavo en vereda esq. Av. Sol / Jr. Lima"
}
```

Los BM pertenecen al **proyecto**, no a la calle. Por eso el mismo BM-1 puede arrancar la nivelación de Av. Sol hoy y servir de amarre a Jr. Lima mañana. Así se encadenan las calles.

### 4.2 Plantilla transversal

```
Plantilla {
  id
  nombre        "Calle con vereda"
  elementos[] {
    clave       "BOR-I"
    etiqueta    "Borde de calzada izquierdo"
    offset      -4.20        (negativo = izquierda del eje)
    tipo        vereda | sardinel | calzada | eje | peloAgua | existente | otro
  }
}
```

Ejemplo:

```
VER-I   -5.60   vereda
SAR-I   -4.40   sardinel
BOR-I   -4.20   calzada
EJE      0.00   eje
BOR-D   +4.20   calzada
PA-D    +4.35   pelo de agua
EXIST   +6.10   punto existente de amarre
```

Cada fila se agrega, quita o mueve. La plantilla se guarda con nombre y se reutiliza en la siguiente calle.

### 4.3 Calle (tramo)

```
Calle {
  id
  nombre            "Av. Sol"
  plantillaId
  progresivaInicio  0
  progresivaFin     180
  intervalo         20
  progresivasExtra[]  [47, 112]     (buzón, entrada de garaje)
}
```

De aquí sale la **grilla vacía**: progresivas × elementos. En el ejemplo, 10 × 7 = 70 celdas.

Las progresivas se guardan en metros (entero o decimal) y se muestran con formato `0+000`.

### 4.4 Campaña — la unidad que crece

```
Campania {
  id
  fecha         2026-08-19
  calleId
  capaId        SUBRASANTE
  bmInicialId   BM-1
  libreta       Libreta
  estado        abierta | cerrada
}
```

Una campaña **nunca pisa** a otra. Se apilan:

```
12/08/2026 · Av. Sol  · SUBRASANTE · BM-1
13/08/2026 · Jr. Lima · SUBRASANTE · BM-2
19/08/2026 · Av. Sol  · BASE       · BM-1
```

El selector de capas de la Entrega 2 lee exactamente esta lista.

### 4.5 Libreta

```
Libreta {
  estaciones[] {
    vistaAtras     { destino: BM | PuntoCambio, lectura }
    intermedias[]  { destino: Celda | PuntoSuelto, lectura }
    vistaAdelante  { destino: PuntoCambio, lectura }   (ausente en la última estación)
  }
  cierre {
    tipo       cerrado | enlace | abierto
    bmFinalId  (en cerrado y enlace)
    longitudK  0.360    calculada de las progresivas, editable
    clase      precision | tercerOrden | personalizada
  }
}

Celda        { progresiva, elementoClave }
PuntoSuelto  { etiqueta, offset, notas }
```

Cada lectura intermedia **apunta a una celda de la grilla**. Eso es lo que une la libreta con la tabla de resultados.

### 4.6 Derivados — nunca escritos a mano

Cota instrumento · cota cruda de cada punto · error de cierre · tolerancia · ¿pasa? · corrección por estación · **cota compensada**.

Se guardan **ambas**: cota cruda y cota compensada. El dato original nunca se pierde.

Si se corrige la cota de un BM o una lectura, **todo el proyecto se recalcula solo**.

---

## 5. Motor de cálculo

### 5.1 Cotas crudas — método de cota instrumento

```
CI            = cota del punto atrás + vista atrás
cota de punto = CI - lectura
```

```
BM-1  3245.180 + 1.425  ->  CI = 3246.605
  0+000 EJE    3246.605 - 1.980 = 3244.625
  0+000 BOR-I  3246.605 - 2.045 = 3244.560
```

### 5.2 Cierre — tres casos

| Caso | Comportamiento |
|---|---|
| **Cerrado** al mismo BM | Compara cota de llegada contra cota conocida -> error |
| **Enlace** a otro BM conocido | Igual, contra el segundo BM. Es el caso al pasar de calle a calle |
| **Abierto** | Aviso en rojo: "sin verificación, cotas no comprobadas". Se marcan así en el informe |

### 5.3 Tolerancia

```
T = e · raiz(K)        T en mm · K en km
```

| Clase | Coeficiente `e` |
|---|---|
| Precisión | <= 7 mm |
| Tercer orden (obra común) | 12 – 15 mm — **predeterminado: 12** |
| Rango general admitido | 10 – 30 mm |

`K` se calcula de las progresivas niveladas (ida y vuelta si el circuito es cerrado) y queda **editable** por si hubo rodeos o traslado al BM.

Ejemplo: circuito de 180 m ida y vuelta.

```
K = 0.360 km
T = 12 · raiz(0.360) = ±7.2 mm
error medido = -5.0 mm     PASA
```

### 5.4 Compensación

Si el cierre pasa, el error se reparte **proporcionalmente entre estaciones**. La suma de las correcciones debe igualar exactamente el error de cierre.

Si no pasa, la app lo avisa **con la libreta todavía abierta** — el único momento en que la información sirve.

### 5.5 Celda medida más de una vez

Ocurre en la práctica: una progresiva se lee desde dos estaciones distintas, o se repite una lectura dudosa. La app **guarda todas las lecturas** y usa la **última ingresada** para la cota, mostrando un aviso discreto en la celda con la diferencia entre ambas. Si la diferencia supera 5 mm, el aviso pasa a advertencia. Nunca se descarta una lectura en silencio.

### 5.6 Precisión numérica

Cotas y lecturas en metros con **3 decimales**. El redondeo se aplica solo en la presentación; los cálculos intermedios conservan la precisión completa para no acumular arrastre.

---

## 6. Interfaz

```
Inicio  ->  Proyecto  ->  Calle  ->  LIBRETA  ->  Resultados
                            ^
                     Plantilla transversal
```

### 6.1 Libreta — la pantalla donde se pasa el tiempo

Entrada rápida por teclado, estilo hoja de cálculo: escribes la lectura, `Enter`, y salta a la siguiente celda pendiente de la grilla.

```
+- Av. Sol · SUBRASANTE · 19/08/2026 --------------------------+
|                                                              |
|  ESTACION 1          +--------------------------------------+|
|  -----------         |  GRILLA        leido: v   pendiente: ·|
|  Vista atras         |         VER-I SAR-I BOR-I  EJE  BOR-D |
|  BM-1      1.425     |  0+000    v     v     v     v     ·   |
|  CI = 3246.605       |  0+020    ·     ·     ·     ·     ·   |
|                      |  0+040    ·     ·     ·     ·     ·   |
|  Intermedias         |                                       |
|  0+000 EJE   1.980   |  llenadas 4 de 70                     |
|  0+000 BOR-I 2.045   +--------------------------------------+|
| >0+000 SAR-I [    ]  <- escribe y Enter                      |
|                                                              |
|  [+ Vista adelante]   [+ Punto suelto]                       |
|                                                              |
|  CIERRE   K 0.360 km · 3er orden · tol ±7.2 mm               |
|           falta cerrar contra BM-1                           |
+--------------------------------------------------------------+
```

Al cerrar, la barra inferior se pone **verde** (`error -5.0 mm  PASA`) o **roja** (`+18 mm  FUERA DE TOLERANCIA`).

### 6.2 Resultados

Grilla completa con las cotas compensadas, más exportación a Excel y copia al portapapeles.

```
            VER-I     SAR-I     BOR-I      EJE      BOR-D
0+000     3244.610  3244.567  3244.560  3244.625  3244.558
0+020     3244.588  3244.545  3244.538  3244.603  3244.536
```

### 6.3 Corte transversal con deslizador

```
  3245.0 -|
          |   *---*                              *---*
  3244.8 -|       |  *                        *  |
          |       +--*------*-------*------*--+
  3244.6 -|        BOR-I   EJE     BOR-D
          +----+-----+-----+-----+-----+-----+-----+----
             -6    -4    -2     0    +2    +4    +6   m

   0+000 *===================*========================* 0+180
                          0+080
         <  arrastra o usa flechas  ·  reproducir
```

El deslizador recorre las progresivas y el corte se redibuja en vivo. Flechas del teclado para avanzar de una en una. Botón de reproducir para recorrer la calle como animación.

**Justificación del adelanto a la Entrega 1:** un punto mal anotado salta a la vista. Una lectura de 2.045 escrita como 2.450 se ve como un diente en la línea. Es el mejor detector de errores disponible y ya funciona con una sola capa.

### 6.4 Perfil longitudinal

Cota a lo largo de la calle, con selector del elemento a graficar (eje, borde izquierdo, vereda…).

### 6.5 Evolución en entregas posteriores

| | Corte transversal | Perfil longitudinal | 3D |
|---|---|---|---|
| **1 capa** (Entrega 1) | Línea del terreno medido | Cota a lo largo, por elemento | — |
| **Varias capas** (Entrega 2) | Capas superpuestas y rellenas entre sí: se ve el espesor | Todas las capas + teórica | — |
| **3D** (Entrega 3) | — | — | Capas apiladas, color por cota / corte-relleno / pendiente, **plano de corte ligado al mismo deslizador** |

### 6.6 Base

Todo en español · modo claro y oscuro · funciona sin internet · autoguardado.

---

## 7. Interactividad — regla de diseño

Nada es una imagen estática.

| Acción | Respuesta |
|---|---|
| Clic en un punto del corte | Resalta su fila en la tabla y su celda en la grilla |
| Clic en una celda de la tabla | El deslizador salta a esa progresiva y marca el punto en el corte |
| Corregir una lectura | Cota, corte, perfil y cierre se recalculan al instante, sin botón de actualizar |
| Puntero sobre un punto | Cota, offset y desviación, sin hacer clic |
| Rueda del mouse / arrastre | Zoom y desplazamiento en todos los gráficos |
| Flechas izquierda/derecha | Progresiva anterior / siguiente |
| Corregir la cota del BM | Todo el proyecto se recalcula solo |

---

## 8. Manejo de errores

Los mensajes dicen **qué pasó, dónde y qué hacer**. Ninguno dice "error de validación".

```
0+040 EJE — lectura 2.450: se aparta 39 cm de sus vecinos.
¿Quisiste escribir 2.045?          [ Corregir ]  [ Es correcto ]

Cierre fuera de tolerancia: +18.0 mm (máximo ±7.2 mm).
Revisa la libreta o repite el circuito. Las cotas quedan
marcadas como NO COMPROBADAS en el informe.

Faltan 6 celdas por llenar en 0+120 y 0+140.
```

| Situación | Respuesta de la app |
|---|---|
| Lectura muy apartada de sus vecinas | Aviso con sugerencia de corrección, nunca bloqueo |
| Lectura fuera del rango físico de la mira | Aviso inmediato en la celda |
| Cierre fuera de tolerancia | Aviso rojo; cotas marcadas NO COMPROBADAS |
| Circuito abierto | Aviso permanente de "sin verificación" |
| Celdas sin llenar | Contador visible y lista de faltantes |
| Cierre inesperado de la app | Al reabrir: "Recuperé tu trabajo del 19/08 14:32 — Av. Sol, 64 lecturas" |
| Archivo `.topo` dañado | Mensaje claro y, si es posible, recuperación parcial de las lecturas crudas |

---

## 9. Pruebas

El motor de cálculo se construye con **pruebas antes que código**. Cada regla se verifica contra una libreta cuyo resultado se conoce a mano.

- Cota instrumento y cotas derivadas
- Cierre: circuito que pasa, circuito que no pasa, circuito abierto
- Cierre por enlace a un segundo BM
- Tolerancia `e·raiz(K)` con los tres coeficientes
- Compensación proporcional: la suma de correcciones iguala exactamente el error
- Corregir la cota del BM recalcula todo correctamente
- Redondeo a 3 decimales sin arrastre acumulado
- Generación de la grilla: progresivas regulares más extras, sin duplicados ni huecos

La interfaz no lleva ese nivel de pruebas: se verifica usándola. El motor sí, porque **un error de cota es un error en obra**.

---

## 10. Registro de decisiones de esta sesión

1. **¿Qué se ingresa?** -> Lecturas de mira crudas, no cotas ya calculadas.
2. **¿Cómo se define la sección transversal?** -> Plantilla configurable por calle; a veces hay vereda, a veces pelo de agua o puntos existentes de amarre.
3. **¿Contra qué se compara una capa nueva?** -> Selector de capas: el usuario elige cuáles dibujar y cuáles comparar.
4. **¿Hace falta coordenada XY?** -> No. Se cargan planos como imagen y se colocan pines anclados y estables sobre ellos.
5. **¿De dónde sale K?** -> Calculada de las progresivas, editable.
6. **¿Hasta dónde llega la Entrega 1?** -> Libreta + cierre + grilla, y se adelanta el corte 2D con deslizador por su valor como detector de errores.
7. **¿Interactividad?** -> Requisito transversal explícito: todo tiene que ser altamente interactivo.
