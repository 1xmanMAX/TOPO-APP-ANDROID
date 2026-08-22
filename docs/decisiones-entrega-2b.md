# Decisiones tomadas durante la Entrega 2B

Max delegó la ejecución completa. Estas son las decisiones que se tomaron en su nombre, con su porqué y con lo que costaría si alguna resulta equivocada. Ordenadas por lo que le afecta a él, no por orden cronológico.

La Entrega 2B es **comparar lo medido contra la rasante de proyecto**: el topógrafo define la cota, la pendiente y los tramos que pide el diseño, y la app dice cuánto sobra o falta en cada punto, con semáforo de tolerancia, en cuatro vistas.

---

## Decisiones que cambian cómo se usa la app

### El semáforo tiene cinco estados, no tres

Verde, ámbar y rojo son la tolerancia. Pero una celda **sin medir** y una celda **fuera de la sección que define el proyecto** son dos cosas distintas, y las dos necesitaban su propio color y su propio símbolo — ni son "conforme" ni son "no comprobada".

**Por qué:** una celda sin medir se resuelve midiendo; una fuera de sección **nunca** va a ser comparable, la midas o no, porque el proyecto no define nada ahí. Confundirlas en el mapa de avance de campaña haría que "esto me toca hoy" se viera igual que "esto no aplica". Costó dos rondas de arreglo en el motor dejar esta distinción exacta y sin solapes.

**Si resulta equivocado:** son dos valores de un tipo y sus colores; se ajustan sin tocar el cálculo.

### El color nunca va solo

Cada celda, en las cuatro vistas, lleva además un símbolo (✓ △ ✗ · —) y el texto completo: milímetros con signo, si toca cortar o rellenar, y el estado en palabras.

**Por qué:** con lector de pantalla, o mirando la pantalla en blanco y negro bajo el sol, el color solo no dice nada. Fue una revisión la que encontró que el mapa se había quedado sin el verbo ("cortar"/"rellenar") que la tabla sí llevaba: la misma celda se anunciaba distinto según en qué vista se mirara. Se unificó en un solo lugar (`estadoRasante.ts`) para que las dos vistas usen exactamente el mismo texto y no puedan volver a desalinearse.

### El editor de rasante avisa si la sección no cubre toda la plantilla

Si definiste tramos que llegan hasta el borde de calzada pero la plantilla también tiene sardinel y vereda, el editor te lo dice: qué puntos se quedan sin cota de proyecto.

**Por qué:** la rasante nacía con un solo tramo por defecto, y la plantilla del proyecto de ejemplo tiene siete puntos. Sin el aviso, cuatro de esos puntos quedaban sin cota de proyecto **en silencio** — se podían medir toda la campaña y nunca saber por qué esas celdas nunca salían comparables.

**Si resulta equivocado:** es un cálculo de alcance y un párrafo de aviso; no toca el motor.

### El corte y relleno se sombrea contra la campaña activa, nunca contra "lo que esté marcado"

Con varias capas visibles a la vez en Resultados, el sombreado de corte/relleno usa siempre la capa de la **campaña de referencia** (la que estás trabajando), pasada explícitamente a cada vista — nunca la que resulte de mayor orden entre las casillas que tengas encendidas.

**Por qué:** la primera versión sombreaba contra "la capa de mayor orden entre las marcadas". Eso significa que **el mismo punto medido cambiaba de qué se le comparaba solo por encender o apagar una casilla que no tenía nada que ver** — la revisión lo demostró marcando una capa nueva por encima: una zona que antes salía sombreada dejó de estarlo, sin que el topógrafo hubiera tocado ese dato. Es el defecto más serio que se encontró en esta entrega, porque el sombreado se veía razonable en pantalla y solo fallaba con más de una capa visible a la vez.

**Si resulta equivocado:** es cambiar de qué variable lee cada vista; ya está resuelto pasándola por parámetro desde el llamador en vez de leerla del estado global, que es justamente la fuga que lo causaba.

### Una zona de corte o relleno nunca cruza el eje de la calle

El corte transversal parte cualquier zona sombreada también donde cruza el offset 0, además de donde cruza la rasante.

**Por qué:** el texto accesible de una zona decía de qué lado de la calle estaba mirando cuál de sus dos extremos se alejaba más del eje. En una plantilla sin un punto exactamente en el eje —normal en secciones angostas—, eso podía juntar un punto de la izquierda con uno de la derecha en una sola zona y **anunciar el lado equivocado**: alguien podría ir a rellenar el lado derecho cuando el problema estaba en el izquierdo. Partir la zona en el eje lo corrige de raíz — el texto no puede volver a mentir porque ya no hay una zona que abarque los dos lados.

**Si resulta equivocado:** es una condición más al cortar zonas, en una función que ya corta por la rasante.

### El paquete de capas del proyecto de ejemplo ahora está completo

Antes solo tenía TERRENO EXISTENTE y SUBRASANTE. Se agregaron BASE (0.20 m, ±10 mm) y CARPETA (0.05 m, ±5 mm), con las tolerancias de referencia que ya estaban citadas en la pantalla de Proyecto (MTC EG-2013 y RNE CE.010).

**Por qué:** con solo dos capas, SUBRASANTE era la capa más alta del paquete y no tenía nada encima — su cota teórica coincidía exactamente con la rasante, sin restar nada. Eso es un caso especial que **no enseña lo más característico de esta entrega**: cómo la cota teórica de una capa de abajo se obtiene restando el espesor de todo lo que va encima. Con las cuatro capas, la cota teórica de SUBRASANTE en el ejemplo ahora sí resta 0.25 m (BASE + CARPETA), como pasaría en cualquier pavimento real.

**Ojo:** esto corrió la cota teórica de SUBRASANTE en el ejemplo (y con ella, varios números que las pruebas afirmaban) exactamente 0.25 m hacia abajo. Se revisaron y recalcularon uno por uno los que dependían de eso; ninguno reveló un error del motor, solo del dato de partida.

**Si resulta equivocado:** son cuatro cifras en un archivo y sus pruebas asociadas.

### El proyecto de ejemplo no se deforma para que pase una prueba

Cuando una prueba necesitó un escenario particular (una capa sin espesor, una capa nueva sin renombrar), se armó su propio escenario en la prueba — nunca cambiando el dato del proyecto de ejemplo que ve cualquiera que abre la app por primera vez.

**Por qué:** el ejemplo es lo primero que ve quien prueba la app. Ya pasó una vez en esta entrega que una prueba forzó el espesor de SUBRASANTE a cero para poder probar un aviso — con espesor cero la cota teórica habría sido igual a la rasante (falso) y el aviso habría salido de entrada, como ruido. Se revirtió y quedó como regla: los datos de demostración se mantienen realistas incluso si cuesta un poco más escribir la prueba.

---

## Lo que se decidió NO hacer

### No se completó el paquete de capas a mitad de las vistas

La falta de BASE y CARPETA en el ejemplo se detectó temprano (al escribir las pruebas del perfil longitudinal), pero completar el paquete ahí habría movido los números de varias pruebas que otras tareas estaban escribiendo en paralelo sobre el mismo ejemplo.

**Por qué no ahora (entonces):** se dejó anotado para el cierre de la entrega, cuando ya no hay tareas corriendo a la vez sobre el mismo dato. El costo de esperar fue que la demostración enseñó menos durante esas tareas intermedias; se resolvió en el cierre, como quedó dicho arriba.

### No se dibuja un tramo con rasante variable dentro de la misma calle

La rasante de una calle es un solo juego de cota de arranque, pendiente y tramos para toda su longitud. No hay forma de decir "cambia el bombeo a partir de la progresiva 0+080".

**Por qué no:** no lo pidió el diseño de esta entrega, y añadirlo sin un caso real de por medio sería adivinar la forma que debería tener. Queda anotado para cuando aparezca una calle real que lo necesite.

---

## Defectos reales encontrados durante la ejecución

Los tres que más importan, contados en lenguaje llano:

1. **El corte transversal sombreaba contra la capa equivocada según qué casillas estuvieran marcadas.** Con varias capas visibles en Resultados, el sombreado de corte/relleno se dibujaba contra "la capa de mayor orden entre las marcadas" — así que encender o apagar una casilla que no tenía nada que ver con la campaña que estabas mirando podía hacer que una zona sombreada apareciera o desapareciera sola. Se corrigió sombreando siempre contra la campaña que de verdad estás trabajando, pasada explícitamente, nunca leída de "lo que está encendido en pantalla".

2. **El texto accesible de un corte podía mentir sobre en qué lado de la calle estaba.** En una plantilla sin un punto exactamente en el eje, una zona de corte o relleno podía juntar un punto de la izquierda con uno de la derecha y anunciarse solo con el lado del extremo más alejado — dejando fuera, en silencio, que la zona también llegaba al otro lado. Se corrigió partiendo toda zona en el eje además de en la rasante, así que una zona ya no puede abarcar los dos lados y el texto no puede volver a mentir.

3. **El editor de rasante no avisaba de que su sección dejaba puntos de la plantilla sin cota de proyecto.** La rasante nace con un solo tramo hasta el borde de calzada, pero la plantilla del ejemplo llega hasta la vereda: cuatro de sus siete puntos quedaban sin cota de proyecto sin que nada lo dijera en pantalla. Se agregó el aviso, nombrando exactamente qué puntos quedan fuera.

Los tres se encontraron con la app corriendo de verdad en un navegador, no con las pruebas automáticas — que en los tres casos seguían en verde, porque probaban cada pieza por separado y ninguna ejercitaba la combinación completa que hacía falta para verlos.

---

## Cómo comprobarlo todo

```
npm test
npm run typecheck --workspaces
npm run build --workspace packages/app
npm audit --omit=dev
```

Y en un navegador de verdad, que comprueba lo que un entorno simulado no puede —el corte tipo dibujándose en vivo, el color de cada celda, la descarga de archivos, el Excel de diferencias por dentro—:

```
npm run build --workspace packages/app
npx vite preview --port 4173        # desde packages/app, en otra ventana
node packages/app/verificacion/capas.mjs <carpeta-de-salida>
node packages/app/verificacion/rasante.mjs <carpeta-de-salida>
```
