# Decisiones tomadas durante la Entrega 2A

Max delegó la ejecución completa. Estas son las decisiones que se tomaron en su nombre, con su porqué y con lo que costaría si alguna resulta equivocada. Ordenadas por lo que le afecta a él, no por orden cronológico.

La Entrega 2A es **comparar capas y medir el espesor colocado**: elegir dos capas de la misma calle y ver, celda por celda, cuánto material hay entre ellas.

---

## Decisiones que cambian cómo se usa la app

### Las capas se pueden reordenar

Botones de subir y bajar en la pantalla de Proyecto.

**Por qué:** era un callejón sin salida que el propio diseño creó. Se registran TERRENO y BASE, luego se cae en la cuenta de que falta SUBRASANTE en medio, y la capa nueva queda al final del orden aunque físicamente vaya en medio: el espesor se calcularía entre capas equivocadas. Antes se salía borrando y recreando; con la protección de borrado de la Entrega 1, ya no. Desde que el orden manda en el cálculo, tiene que ser corregible.

**Si molesta:** son dos botones y una función de doce líneas.

### Una campaña nueva nace con su primera estación

Con la vista atrás apuntando al banco de nivel de arranque y la lectura pendiente.

**Por qué:** antes nacía vacía y la libreta era **inservible**: no dibujaba nada, y una lectura escrita ahí se descartaba en silencio. Toda nivelación empieza plantando el nivel y leyendo hacia atrás al banco, así que ese es el estado natural de arranque.

**Ojo:** los proyectos guardados antes de este cambio siguen abriéndose; la libreta tiene una red para ellos.

### Un espesor negativo se marca en pantalla

Si la capa de arriba sale por debajo de la de abajo, la celda se distingue **incluso estando seleccionada**.

**Por qué:** un espesor negativo es físicamente imposible: o hay una lectura mal anotada, o las dos capas están al revés. Antes el color de selección tapaba el aviso justo en la celda que estabas mirando.

### Cada celda dice qué es y cuánto vale

El nombre accesible de una celda pasó de `0+000 EJE` a `Cota en 0+000 EJE: 3244.628` y `Espesor en 0+000 EJE: 0.253`.

**Por qué:** las dos tablas componían el nombre igual, y como el nombre **reemplaza** al contenido, la cifra no llegaba nunca a un lector de pantalla. En la tabla de espesores, que decide cuánto se le paga al contratista, la cifra es lo único que importa.

> En la libreta la celda conserva su nombre corto a propósito: ahí muestra si está medida o no, no una cifra.

### Una celda sin pareja sale vacía, nunca cero

En pantalla y en los archivos exportados.

**Por qué:** un cero en una columna de espesores se lee como *«aquí no se puso material»*, que es una afirmación muy distinta de *«aquí no se midió»*.

### El archivo de espesores dice si el trabajo está comprobado

Y **cuál de las dos** nivelaciones falla:

> `ESPESORES NO COMPROBADOS — la capa de abajo (TERRENO EXISTENTE · 2026-08-20): el circuito no se verificó`

**Por qué:** un espesor calculado sobre una nivelación que no cerró tampoco está comprobado. Quien recibe ese Excel tiene que saberlo.

### El relleno del corte cubre solo donde hay dos medidas

Si la vereda izquierda se midió en el terreno pero no en la subrasante, el área sombreada no llega hasta ahí.

**Por qué:** sombrear hasta un punto donde solo una capa tiene medida es dibujar un espesor que nadie midió.

### Lo que estás mirando no se guarda en el archivo

Qué capas ves y cuáles comparas es estado de la sesión, como la celda seleccionada o la campaña activa.

**Por qué:** el archivo guarda el trabajo del topógrafo, no la vista que tenía abierta.
**Si resulta equivocado** (al reabrir un proyecto conviene encontrar la misma comparación): son dos campos más en el modelo.

---

## Lo que se decidió NO hacer

### No se cuentan las celdas por debajo de un espesor mínimo

Se propuso, porque la media sola puede esconder un tramo delgado.

**Por qué no:** sin cota de proyecto no hay umbral contra el que contar. Y el **mínimo**, que ya sale en el resumen, delata el tramo delgado igual. Queda para la Entrega 2B, donde el espesor de diseño existe y el conteo cobra sentido pleno.

### No se amplió la paleta de colores de las capas

Azul continuo y gris discontinuo se leen bien con dos o tres capas, que es el caso de esta entrega. Con las cinco capas de un pavimento completo se agota.

**Por qué no ahora:** inventar una paleta grande sin ver el caso real es adivinar. Anotado para cuando se dibujen más de tres a la vez; el costo de equivocarse son cuatro colores.

### La selección sigue siendo por celda, no por celda y capa

Con varias capas visibles, elegir un punto lo resalta en todas. Lo anticipó la revisión final de la Entrega 1 y sigue pendiente.

---

## Defectos reales encontrados durante la ejecución

Los cuatro que más importan:

1. **Una campaña nueva era inservible.** Nacía sin estaciones: la libreta no dibujaba nada y la lectura que se escribiera se **descartaba sin avisar**. Las 275 pruebas de entonces no lo vieron porque todas arrancan del proyecto de ejemplo, que sí tiene estaciones. Lo encontró la verificación en un navegador de verdad.
2. **La cifra no llegaba a un lector de pantalla** en la tabla que decide el pago, porque el nombre accesible la reemplazaba.
3. **Los dos campos de visada no tenían nombre accesible.** Un lector de pantalla decía solo *«cuadro de edición»* en los dos campos de los que depende toda la cadena de cotas.
4. **Reordenar una capa no la movía.** El código repartido en el plan volvía a ordenar por el número viejo de cada capa, deshaciendo el movimiento. Lo detectó quien lo implementaba, no una prueba.

Y una regla de proceso que salió de un tropiezo: **nunca dos implementadores a la vez**, aunque toquen archivos distintos. Ya se vio a uno recoger en su commit el trabajo de otro que corría en paralelo. El riesgo no es el archivo, es el índice de git compartido.

---

## Cómo comprobarlo todo

```
npm test
npm run typecheck --workspaces
npm run build --workspace packages/app
npm audit --omit=dev
```

Y en un navegador de verdad, que comprueba lo que un entorno simulado no puede —el foco al reordenar filas, la descarga de archivos, el Excel por dentro—:

```
npm run build --workspace packages/app
npx vite preview --port 4173        # desde packages/app, en otra ventana
npm run verificar --workspace packages/app
node packages/app/verificacion/capas.mjs <carpeta-de-salida>
```
