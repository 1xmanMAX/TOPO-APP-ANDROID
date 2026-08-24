# Decisiones tomadas durante la Entrega 3

Max delegó la ejecución completa. Estas son las decisiones que se tomaron en su nombre, con su porqué y con lo que costaría si alguna resulta equivocada. Ordenadas por lo que le afecta a él, no por orden cronológico.

La Entrega 3 es el **visor 3D**: la misma calle que ya se ve en tabla, mapa, corte y perfil, ahora levantada en volumen, para ver de un vistazo la forma que tiene — un lomo, una hondonada, un tramo torcido.

---

## La decisión que más importa: no se usó un motor 3D

El modelo se dibuja con **SVG a mano** — la misma técnica que ya usan el corte transversal y el perfil longitudinal, solo que ahora proyectando en volumen antes de dibujar. No hay Three.js, ni WebGL, ni ninguna librería de gráficos nueva.

**Por qué:**

- **Peso.** Un motor 3D como Three.js pesa por sí solo alrededor de **600 kB**, más del **doble de lo que pesaba la app entera** antes de esta entrega (315 kB). El SVG a mano no añade ninguna dependencia: el paquete terminó en 332 kB, un crecimiento de 17 kB por todo el visor junto (el dibujo, los controles, el resumen en texto y el modo de capas apiladas).
- **Tamaño del modelo.** La malla de la calle tiene, en el proyecto de ejemplo, **280 vértices**. Es un modelo pequeño y regular (una grilla de progresivas por elementos transversales), no una nube de puntos ni una superficie triangulada libre: no hace falta la maquinaria de un motor de videojuegos para dibujarlo.
- **Accesibilidad.** Un lienzo WebGL es una caja negra para un lector de pantalla: no hay forma de que anuncie "tramo entre 0+000 y 0+020, cortar, conforme" porque ahí dentro no hay nodos, solo píxeles. Con SVG cada tramo es un elemento real del documento, con su propio texto accesible — lo mismo que ya hace el corte transversal y el mapa de la calle.

**El riesgo que se asume:** no hay un orbitar suave (el giro salta en pasos, no se desliza con inercia) ni sombras que ayuden al ojo a leer el relieve sin mirar el color. Es una limitación real frente a un visor con motor 3D.

**Si resulta equivocado:** si algún día el modelo crece mucho (una obra completa con decenas de calles a la vez, no un tramo) o hace falta orbitar con inercia y sombras, se puede introducir un motor 3D como una pieza aparte, sin rehacer el cálculo de la malla ni la proyección — `packages/core` ya entrega los puntos proyectados; lo que cambiaría es solo cómo se pintan.

---

## Decisiones que cambian cómo se usa la app

### La cámara no se reinicia al abrir otro proyecto

Cargar un `.topo` distinto, o empezar uno nuevo, no mueve el modelo: si lo tenías girado y exagerado 10×, sigue así al abrir el siguiente archivo. Lo que sí se reinicia son la celda seleccionada y las capas marcadas en el selector, porque esas sí apuntan a datos concretos del proyecto (una celda, unas campañas) que en el proyecto nuevo pueden no existir.

**Por qué:** la cámara (giro, inclinación, exageración) no referencia ningún identificador del proyecto — no puede quedar "apuntando a algo que ya no existe", a diferencia de una celda seleccionada. Y conservar el encuadre es útil: un topógrafo que compara el archivo de hoy con el de ayer quiere volver a mirar desde el mismo punto de vista, no tener que girar el modelo de nuevo cada vez.

**Si resulta equivocado:** son dos campos que agregar a lo que sí se reinicia al cargar un proyecto.

### Las vistas guardadas (Planta, Alzado, Isométrico) conservan la exageración que tenías puesta

Pulsar uno de esos tres botones mueve el giro y la inclinación a un encuadre fijo, pero **no toca el deslizador de exageración**: si lo tenías en 10×, sigue en 10× después de pulsar Planta.

**Por qué:** una vista guardada es un encuadre de cámara, no un ajuste de cuánto se exagera el relieve — son dos decisiones distintas del topógrafo. Si pulsar una vista guardada reiniciara la exageración a 25×, habría que volver a buscarla cada vez que se quisiera comparar el mismo relieve desde ángulos distintos.

**Si resulta equivocado:** es una línea en la función que aplica la vista guardada.

### En modo Capas, sin ninguna marcada en el selector se dibuja la campaña de referencia

El interruptor Estado/Capas cambia qué manda el color del modelo. En modo Capas, si no marcaste ninguna casilla en el selector de capas, el modelo dibuja igualmente la campaña que estás trabajando — la misma regla que ya usan el corte transversal y el mapa de la calle.

**Por qué:** así las cinco vistas de "Control contra el proyecto" (modelo 3D, diferencias, mapa, corte, perfil) se comportan igual: ninguna se queda en blanco solo porque no abriste el panel de capas.

**Si resulta equivocado:** es una condición más en el mismo sitio donde ya vive para las otras vistas.

### En modo Capas, el color es una paleta neutra por posición, no el semáforo de tolerancia

Cada capa apilada lleva un tono neutro propio (no verde/ámbar/rojo) y su **nombre rotulado** junto a la superficie, además de en el texto accesible de cada cara.

**Por qué:** el semáforo de tolerancia compara una medición contra el proyecto — no tiene sentido entre dos capas medidas, que no son "correctas" o "incorrectas" entre sí. Usar los mismos tres colores ahí habría hecho pensar que una capa está "mal" solo por dibujarse en rojo. El color nunca es la única pista: aunque dos capas compartieran tono por coincidencia, el nombre rotulado y el texto accesible siguen distinguiéndolas.

**Si resulta equivocado:** es una paleta y una condición de qué colores usar, sin tocar el cálculo.

### El resumen en texto cuenta los tramos que el dibujo realmente pinta, no toda la grilla evaluada

El párrafo bajo el modelo ("El modelo dibuja 12 tramos: 8 conformes, 3 al límite, 1 fuera...") cuenta exactamente las mismas caras que `armarCaras` arma para dibujar — nunca el total de celdas de la grilla, que puede incluir muchas sin medir todavía.

**Por qué:** si el resumen contara la grilla completa, podría nombrar una progresiva que el dibujo no pinta porque le falta una esquina medida — el texto y el dibujo dirían cosas distintas sobre la misma pantalla. Contar las mismas caras que se dibujan garantiza que el párrafo nunca hable de un tramo que no está a la vista, ni calle uno que sí lo está.

**Si resulta equivocado:** el costo es leer el conteo de otra parte del mismo cálculo; no hay dato nuevo que agregar.

---

## Lo que se decidió NO hacer

### No se tocó el `role="img"` anidado del dibujo

Una revisión anterior sospechó, honestamente marcada como "inferencia no verificada", que el `role="img"` del SVG completo, con cada cara también en `role="img"` dentro, podría dejar los nombres de las caras fuera del alcance de un lector de pantalla — el rol "imagen" le dice a la tecnología asistiva que trate el contenido como una unidad, no como partes por separado.

**Se verificó con el árbol de accesibilidad real de un navegador (Chromium, por protocolo de depuración), no dando la sospecha por buena.** Las caras del modelo aparecen todas en el árbol y ninguna sale marcada como ignorada; una cara anuncia, por ejemplo:

> Entre 0+000 y 0+020, de SAR-I a BOR-I: +10 mm, cortar, conforme

**Por qué no tocarlo:** el mismo patrón (`role="img"` anidado) ya existe desde antes en `MarcoGrafico` y `CorteTransversal`, así que es una forma que ya se usa en la app y funciona en el navegador probado. Cambiarla sin necesidad habría sido resolver un problema que los datos dicen que no existe.

**Si resulta equivocado:** el costo es que un lector de pantalla distinto de Chromium se comporte diferente — habría que comprobarlo con ese lector antes de decidir si hace falta un cambio.

### No hay medición sobre el modelo, ni breaklines, ni volúmenes de corte y relleno

El modelo se mira y se gira, pero no se puede hacer clic para medir una distancia, ni dibujar líneas de quiebre sobre él, ni calcular cuánto material hay que mover.

**Por qué no:** las cotas y diferencias ya se leen con más precisión en la tabla que sobre un dibujo en pantalla. Las breaklines son edición de la malla, y Max ya rechazó un editor tipo CAD dentro de la app («para eso usaría AutoCAD»). Los volúmenes de corte y relleno necesitan una superficie triangulada, no la grilla regular que arma el modelo hoy — pero caben después, montados sobre este mismo modelo.

---

## Defecto real encontrado durante la ejecución

**Los controles del visor estaban construidos y probados, pero no montados en ninguna pantalla.** `ControlesVista3D` — el interruptor Estado/Capas, los tres botones de vista guardada, y los deslizadores de inclinación y exageración — existía como componente y tenía sus pruebas en verde, pero nunca se agregó a `VistaResultados`. En un navegador real, la pantalla de Resultados no mostraba ninguno de los cinco: la única forma de mover el modelo era arrastrar sobre el dibujo.

Se encontró en la revisión de la tarea anterior, marcado como hallazgo menor, y se confirmó con el navegador real antes de tocar nada. Se corrigió montando `ControlesVista3D` junto al modelo, dentro del mismo grupo donde ya vivía `Vista3D`, y se agregó una prueba que lo fija: que desde la pantalla de Resultados se llega a los cinco controles. Es exactamente la prueba que habría cazado el defecto si hubiera existido antes.

Las pruebas automáticas del componente seguían en verde durante todo este tiempo — probaban `ControlesVista3D` aislado, nunca la pantalla completa que decide si algo se monta o no. La lección es la misma que ya dejaron las entregas anteriores: algunos defectos solo aparecen con la app entera corriendo de verdad, no con cada pieza probada por separado.

---

## Cómo comprobarlo todo

```
npm test
npm run typecheck --workspaces
npm run build --workspace packages/app
npm audit --omit=dev
```

Y en un navegador de verdad, que comprueba lo que un entorno simulado no puede —el giro arrastrando con eventos de puntero reales, el corte en vivo del modelo, la exageración escrita, el resumen nombrando la peor zona—:

```
npm run build --workspace packages/app
npx vite preview --port 4173        # desde packages/app, en otra ventana
node packages/app/verificacion/recorrido.mjs <carpeta-de-salida>
node packages/app/verificacion/foco-plantilla.mjs <carpeta-de-salida>
node packages/app/verificacion/capas.mjs <carpeta-de-salida>
node packages/app/verificacion/rasante.mjs <carpeta-de-salida>
node packages/app/verificacion/visor3d.mjs <carpeta-de-salida>
node packages/app/verificacion/vista3d.mjs <carpeta-de-salida>
```
