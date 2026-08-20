# Decisiones tomadas durante la Entrega 1

Max delegó la ejecución completa. Estas son las decisiones que se tomaron en su nombre, con su porqué y con lo que costaría si alguna resulta equivocada. Están ordenadas por lo que le afecta a él, no por orden cronológico.

---

## Decisiones que cambian cómo se usa la app

### El botón de borrar pregunta dos veces

Borrar un banco de nivel o una capa pide confirmación: el primer clic arma el botón, el segundo borra. Si el elemento está en uso, el botón armado lo dice: *«¿Seguro? Hay campañas que lo usan»*.

**Por qué:** un banco de nivel es el punto de apoyo de toda una nivelación, y borrarlo deja campañas apuntando a algo que ya no existe.
**Si molesta:** volver al borrado directo es cambiar una condición.

### «Nuevo» y «Abrir» también preguntan

Por la misma razón, y porque el autoguardado escribiría encima del borrador un segundo después: el trabajo se perdería también de la recuperación.

### La app arranca en la pantalla de Proyecto

Antes arrancaba en una pantalla que decía «en construcción».

### El tema sigue al equipo mientras la app está abierta

En modo «Sistema», si el equipo cambia a oscuro al anochecer, la app cambia con él. Antes solo lo consultaba al abrirse: se habría quedado con la pantalla blanca deslumbrando de noche.

### Una lectura imposible queda pendiente, no se calcula

Una lectura de `0.000` o de `14.230` no puede salir de una mira. En vez de producir una cota inventada, la app la marca como pendiente y avisa: *«la lectura 14.230 no puede ser de una mira (tiene que estar entre 0 y 5 m)»*.

**Por qué:** el diseño lo pedía y no estaba implementado. Además resolvía un rojo falso: al pulsar «Cerrar el circuito», la visada nacía en 0 y la barra se ponía en rojo con un error de +1905 mm antes de que se escribiera nada.
**Ojo:** si alguna vez se usa una mira de más de 5 metros, habrá que subir ese límite. Está en una sola constante del motor.

### El Excel exportado lleva cabecera

Calle, capa, fecha, banco de nivel de arranque, longitud del circuito, tolerancia, error de cierre y **el estado del trabajo**: `VERIFICADO` o `COTAS NO COMPROBADAS`.

**Por qué:** el archivo que llega a la obra eran cotas desnudas. Nadie podía saber de qué calle y capa eran, ni si el trabajo llegó a verificarse. El diseño prometía ese marcado y no existía.

### La pantalla de Resultados muestra el estado del cierre

Y el título cambia: dice «Cotas compensadas» solo cuando de verdad lo están; si el circuito no cerró, dice «Cotas sin compensar».

### La pantalla de campañas deja elegir la calle

El plan solo dejaba cambiar la capa y el banco de nivel. Sin poder elegir calle no se pueden encadenar Av. Sol con Jr. Lima, que es la razón de ser de esa pantalla.

---

## Decisiones técnicas con consecuencias visibles

### Se eliminó la biblioteca de Excel

`SheetJS` arrastraba dos vulnerabilidades de severidad alta **sin parche disponible** y pesaba 429 kB: el 61 % de toda la app. Como un `.xlsx` es un ZIP con XML dentro y el proyecto ya usa una biblioteca de ZIP para el archivo `.topo`, el archivo se genera directamente.

**Resultado:** la app pasó de 701 kB a 281 kB y `npm audit` quedó limpio.
**Riesgo asumido:** que Excel rechazara el archivo generado. Comprobado descargándolo desde un navegador real y validándolo: trae sus cinco partes y las cotas van como número, no como texto.

### Todas las cotas pasan por un redondeo estable

Una cota compensada real es, por ejemplo, `3244.6274999999996` — el arrastre normal de la aritmética de una computadora. Mostrada sin cuidado sale `3244.627`: **un milímetro menos** del valor calculado. Ahora toda cota que se ve en pantalla o se exporta pasa por una función que redondea de forma estable.

La función existía desde la primera tarea, pero solo se usaba al calcular, no al mostrar.

### Se trabajó en una rama, no directamente sobre `main`

`entrega-1-nivelacion`, ya integrada. La rama se conserva como punto de referencia.

### El código no se ha publicado en GitHub

El repositorio tiene un remoto configurado, pero **no se ha subido nada**. Publicar es una decisión de Max.

---

## Lo que se decidió NO hacer

### No se extrajo el marco de dibujo compartido

El perfil longitudinal y el corte transversal repiten casi el mismo andamiaje de ejes, marcas y rejilla. Se decidió no unificarlos con las dos pantallas recién terminadas.

**La revisión final discrepa**, y con argumento: la Entrega 2 mete varias capas superpuestas en **ambos**, así que unificarlos después significa fusionar dos implementaciones ya divergentes en vez de una función de cuarenta líneas. **Recomendación: hacerlo al empezar la Entrega 2.**

### No se arreglaron 46 detalles menores

Están registrados uno a uno. La revisión final los trió: unos pocos merecen atención pronto (la sincronización del cálculo cuando haya varias capas, el orden de las columnas centralizado, las etiquetas de accesibilidad repetidas) y la mayoría son ruido interno sin efecto para quien usa la app.

---

## Defectos reales encontrados durante la ejecución

Diez, todos del plan que se escribió al principio. Los cinco que más importan:

1. **Progresivas mal formateadas al redondear.** `999.995` salía como `0+999.100` y al releerse daba `999.1`: noventa centímetros de error silencioso.
2. **Puntos de cambio con el mismo nombre.** La app tomaba la cota del último y seguía calculando sin decir nada: todas las cotas medidas después salían mal.
3. **El autoguardado destruía el trabajo antes de ofrecer recuperarlo.** Al abrir la app, escribía el proyecto de ejemplo encima del trabajo real un segundo después de mostrar el aviso de recuperación.
4. **Las lecturas se archivaban en la estación equivocada.** Ir a Resultados y volver a la libreta reiniciaba la estación activa: lo que se escribiera después se calculaba con la altura de aparato equivocada —metros de error— y la barra de cierre seguía en verde, porque el cierre no mira las lecturas intermedias.
5. **Un cierre podía darse por bueno sin serlo.** Una visada de control a un banco de nivel a mitad de recorrido se tomaba como el cierre del circuito: veredicto `PASA` falso, y la corrección repartida entre estaciones que nadie había verificado.

Los cuatro últimos solo aparecieron mirando el conjunto, no revisando cada pieza por separado.

Hubo además un defecto **introducido por una de las correcciones**: al hacer que las lecturas imposibles quedaran pendientes, trasladar el instrumento —operación normal en cualquier calle— hacía desaparecer todas las cotas de la pantalla y de la exportación. Lo encontró la re-revisión. La prueba que faltaba, y que ya existe, es volver a calcular después de trasladar: las pruebas de esa pantalla solo miraban lo que se guardaba.

---

## Cómo comprobarlo todo

```
npm test                                   # 225 pruebas
npm run typecheck --workspaces
npm run build --workspace packages/app
npm audit --omit=dev
```

Y el recorrido en un navegador real, que comprueba lo que un entorno simulado no puede —el foco al reordenar filas, la descarga de archivos, el Excel de verdad—:

```
npm run build --workspace packages/app
npx vite preview --port 4173               # desde packages/app, en otra ventana
npm run verificar --workspace packages/app
```
