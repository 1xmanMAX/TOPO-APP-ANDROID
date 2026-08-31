# Decisiones tomadas al rehacer la entrada de datos

Max delegó la ejecución completa. Estas son las decisiones que se tomaron en su nombre, con su porqué y con lo que costaría si alguna resulta equivocada. Ordenadas por lo que le afecta a él, no por orden cronológico.

El 2026-08-29 Max mandó una hoja suya de verdad —`Detrás del colegio`, exportada de Google Sheets— y **no encajaba** con lo que la app esperaba: la tabla no empezaba arriba a la izquierda, la columna de progresivas no tenía título, `vereda` estaba dos veces, `IZQ` y `DER` eran etiquetas de lado y no de elemento, no había ni una distancia al eje, y al final había otra tabla dentro de la tabla con lecturas de cosas existentes. Este trabajo es el arreglo, escrito con esa hoja delante.

El giro es este: **la app ya no pregunta cuando no reconoce algo. Max declara su sección una vez, con dibujo, y le pone a cada punto la palabra con la que lo escribe en su Excel.** Después su hoja entra sola.

---

## Decisiones que cambian cómo se usa la app

### La sección se declara antes, en vez de que la app pregunte después

El diseño anterior tenía un catálogo de códigos que crecía solo: la app leía la hoja, se topaba con una palabra que no conocía y **preguntaba en ese momento** qué era. Eso se retiró. Ahora hay **una sección por calle**, se ve como lo que es —la calle dibujada con sus puntos encima—, y cada punto lleva su palabra.

**Por qué:** lo pidió Max con estas palabras — *«que en una parte puedas asignar palabras para cada punto… el eje se pondrá en el Excel como "ejito" y los bordes como "bobo", y directamente busque estos en el Excel»*. Pero además es más sano: preguntar al vuelo, hoja tras hoja, obliga a decidir con prisa y en medio de la importación; declarar antes se hace una vez, en frío, mirando el dibujo de la calle. Y la lectura se vuelve muda y repetible: **la misma hoja leída dos veces da lo mismo**, porque lo que decide ya estaba guardado antes de empezar.

Lo que **no** cambió es la red de seguridad: una columna que no case con ninguna palabra declarada **no se descarta**. Sale en la vista previa con sus valores y ahí mismo se le asigna un punto, y esa palabra queda guardada para siempre. Declarar antes no significa tirar después lo que no se declaró.

**Si resulta equivocado:** la pantalla de la sección se parece peligrosamente a la vieja pantalla de «Plantilla» que Max mandó retirar. La diferencia es real —aquella era una tabla de columnas fijas, esta es su sección dibujada con sus propias palabras encima—, pero si al verla funcionando le suena a lo mismo, hay que parar y rehacerla, no defenderla.

### Una misma palabra puede valer para los dos lados de la calle

`vereda` aparece dos veces en la hoja de Max, una a cada lado del eje. El diseño anterior prohibía eso: un código pertenecía a un solo concepto. Esa regla queda **derogada**. La palabra nombra el **elemento**, y el lado sale de **dónde cae la columna respecto a la del eje**.

**Por qué:** es como anota Max y como anota cualquiera. Obligarle a escribir `vereda-izq` y `vereda-der` sería hacerle cambiar su hoja para que le encaje a la app, que es exactamente lo que este trabajo vino a evitar.

**Consecuencia que hubo que atender:** si el lado sale de la posición, la app **necesita encontrar la columna del eje**. Cuando la hoja no la trae, lo dice y pide que se asignen los lados a mano; no los adivina. Y en la pantalla de la sección **el eje no se puede correr de 0**: con el eje desplazado, la app lo tomaría por un punto de la derecha y el reparto de lados de toda la hoja se vendría abajo por una errata.

**Si resulta equivocado:** es una regla de búsqueda y su prueba.

### La llave de una columna es interna, y no la palabra que escribe Max

Cada lectura guardada apunta a su punto por una **llave que la app no enseña nunca**, no por la palabra con la que Max lo escribe.

**Por qué:** las palabras las edita él. Puede quitar `IZQ` y poner `BORDE-IZQ` cualquier tarde. Si la llave fuera la palabra, todas las lecturas ya guardadas quedarían apuntando al vacío en ese mismo momento — cotas que estaban en la tabla desaparecerían sin que nadie tocara un dato de campo. Con una llave interna, renombrar una palabra **no puede** dejar huérfana ninguna lectura.

Esto tuvo dos consecuencias que se atendieron enteras:

- **Lo que se enseña no puede ser la llave.** Diez sitios de la pantalla llegaron a enseñarla —«0+020 p-borde-i»—, que es jerga de programador donde tiene que ir el texto de Max. Se resolvió llevando los dos textos (la palabra corta y el nombre completo) desde el mismo sitio que arma cada tabla, para que no haya diez sitios donde equivocarse. En cabeceras y rótulos apretados va **la palabra corta de Max**; en los textos que lee un lector de pantalla, el **nombre completo** — porque la misma palabra puede estar a los dos lados, y dos celdas anunciadas «0+000 VEREDA» en la misma fila no se distinguirían de oído.
- **Los proyectos ya guardados hay que remaparlos.** Un `.topo` viejo trae lecturas apuntando a los códigos de antes. Al abrirlo, cada una se traduce a su punto nuevo — pero **solo cuando la correspondencia es inequívoca**. Si una palabra la declaran dos puntos (una `VEREDA` genérica está en la izquierda y en la derecha), no se resuelve: la lectura queda marcada como huérfana y se avisa. Resolver `BOR-I` es leer una correspondencia declarada; resolver `VEREDA` sería adivinar un lado, y eso no se hace aquí. Una lectura huérfana se ve; una lectura colocada en el lado equivocado, no.

**Si resulta equivocado:** volver a la palabra como llave y quitar el remapeo. Pero entonces vuelve el defecto que esto evita.

### Cuando hay dos lecturas del mismo lado en una fila de existentes, la app no elige

La fila 20 de la hoja de Max tiene, del lado derecho, un `1.955` que es una lectura y un `0.23` que es una resta arrastrada. La app **no se queda con ninguna de las dos**: las enseña las dos y pide que se diga cuál vale. Por eso esa hoja da **tres** puntos de referencia y no cuatro.

**Por qué:** «la app no elige» es la espina dorsal de este proyecto. La alternativa era quedarse con «la más cercana al eje», una corazonada que nadie pidió. El costo de no elegir es un clic en la vista previa, sobre un tipo de fila que en esa hoja sale dos veces. El costo de elegir mal es **una referencia falsa que nadie vuelve a mirar** — y que además parece un dato comprobado.

Conviene decir en voz alta por qué la app no puede distinguirlas sola: **no sabe qué celdas son fórmula y cuáles son dato, y no debe intentar saberlo**. El `.xlsx` guarda la fórmula, pero el portapapeles solo trae el resultado — y el archivo, el CSV y lo pegado tienen que dar el **mismo** resultado con los mismos datos. Así que se resuelve por la forma —dos valores del mismo lado— y no por el formato del archivo, que es lo único que vale para los tres caminos.

**Si resulta equivocado:** son dos líneas y una prueba.

### El aviso de «distancias de fábrica» sigue mientras quede una sola sin medir

La sección nace con distancias puestas por la app. Mientras **quede una** sin medir, el aviso sigue en pantalla. No desaparece al corregir la primera, ni la segunda: solo cuando no queda ninguna.

**Por qué:** el bombeo y la pendiente son cosas **entre dos puntos**, y solo son de fiar si **los dos** están medidos. Corregir la vereda no hace fiable su pendiente contra un borde que sigue puesto por la app. Un aviso que se apaga a mitad de camino diría que el dato ya está comprobado cuando todavía no lo está, y ese es exactamente el defecto que este proyecto ya ha cometido tres veces.

**Por eso también** el campo de la distancia **cierra el cambio al salir o con Enter**, no en cada tecla: marcar una distancia como medida no se deshace, y una tecla suelta no puede tener esa consecuencia. Antes bastaba rozar el campo —teclear un dígito y borrarlo— para que la app diera esa distancia por medida y el aviso entero desapareciera sin que nadie hubiera medido nada. Y si la cifra que puso la app ya era la buena, hay un botón de **Confirmar**: confirmarla también es medirla.

**Si resulta equivocado:** es una condición y tres pruebas.

### Lo que se exporta lleva la palabra corta, no el nombre largo

En la cabecera del Excel y del CSV que salen de la app va `IZQ`, `EJE`, `vereda` — la palabra de Max—, no «Borde izquierdo».

**Por qué:** lo que la app exporta tiene que **poder volver a entrar por la puerta de subir datos**. La palabra ya está declarada en la sección, así que al reimportar casa sola; «Borde izquierdo» no casaría con nada y habría que colocar todas las columnas otra vez. Además es exactamente lo que la app enseñaba antes, así que no cambia nada de lo que Max ya reconoce.

**Si resulta equivocado:** son dos cabeceras.

---

## Lo que se decidió NO hacer

### No se adivina qué celda es una fórmula

Ya está dicho arriba, pero merece su sitio: **la app no distingue una fórmula de un dato, y no va a intentarlo.** La columna H de la hoja de Max es una resta arrastrada, y las filas 12 a 19 son el cero que dejó esa fórmula. Ninguna de las dos entra — no porque la app sepa que son fórmulas, sino porque **la columna no tiene título** y **esas filas no tienen progresiva ni lectura bajo ninguna columna de puntos**. Se decide por la forma de la tabla, que es lo único que sobrevive a los tres caminos de entrada.

Y aun así, las dos salen listadas con su contenido en «Lo que no importé». Si alguna vez uno de esos ceros fuera una lectura de verdad, se ve antes de aceptar.

### No se guarda como referencia una fila de existentes sin elemento

Si una fila empieza con `existente` pero la celda de al lado no dice de qué es, no se guarda ninguna referencia de ella y se dice por qué.

**Por qué no:** una lectura sobre «algo» no es un dato, es una adivinanza pendiente. Lo que sí se decidió es que **ese texto sea libre**: `cuneta`, `calzada`, `umbral`, lo que sea, sin declararlo antes en la sección. Exigir declararlo añadiría un paso sin ganar nada — una referencia no se dibuja en la sección, se anota.

### No se avisa por pantalla de lo que ocurre al migrar un proyecto viejo

Al abrir un `.topo` de antes, las traducciones que hace la app quedan anotadas para quien programa, no en un aviso en pantalla.

**Por qué no:** el caso grave ya es visible por otro camino — una lectura que quede apuntando a un punto que no está en la sección **dispara el aviso de lecturas huérfanas**, que se lee con palabras normales y salió comprobado de punta a punta. Montar un segundo canal de avisos solo para la migración habría sido trabajo nuevo para decir dos veces lo mismo.

**Si resulta equivocado:** hay que añadir ese canal.

### No se eligió el banco de nivel de una hoja subida

Las cotas de una hoja importada cuelgan siempre del **primer** banco de nivel del proyecto, y la pantalla lo dice con su nombre y su cota antes de aceptar.

**Por qué no ahora:** con dos bancos de nivel en la obra, unas cotas colgadas del que no era no se verían por ningún lado. Decirlo en voz alta cierra el agujero hoy; poder elegirlo es una mejora que pide su propio diseño.

---

## Defectos reales encontrados durante la ejecución

Los cuatro que más importan, contados en lenguaje llano:

1. **Bastaba rozar un campo de distancia para que el aviso de «distancias de fábrica» desapareciera entero.** El campo avisaba del cambio en cada pulsación, y marcar una distancia como medida no tiene vuelta atrás. Teclear un dígito y borrarlo dejaba el mismo número de antes, pero ya dado por medido. Repetido en siete puntos, el aviso entero se apagaba sin que nadie hubiera medido nada. Se corrigió cerrando el cambio al salir del campo o con Enter, y añadiendo un botón de Confirmar para cuando la cifra de la app ya era la buena.

2. **Una columna con notas arriba y lecturas debajo se podía colar sin bloquear.** Para saber si una columna traía medidas, la pantalla miraba solo los tres primeros valores que enseñaba de muestra. Una columna titulada, con tres observaciones escritas arriba y las lecturas debajo, parecía de puro texto: no bloqueaba la importación, no salía en «lo que no importé», y sus lecturas se iban con la hoja aceptada mientras la pantalla afirmaba en voz alta «sin ningún número dentro». Se corrigió mirando la columna **entera**.

3. **Una columna colocada en el punto equivocado no tenía vuelta atrás.** Al colocarla desaparecía de la lista, y con ella su desplegable; volver a elegir el mismo archivo tampoco reaccionaba. La palabra equivocada se escribía en la sección al aceptar. Se corrigió dejando la columna a la vista con su punto elegido mientras no se acepte la hoja, y vaciando el campo de archivo después de cada lectura.

4. **El proyecto de ejemplo se abría vacío.** Al cambiar la llave de las lecturas, las del proyecto de demostración se quedaron apuntando a los códigos viejos: ninguna caía en la grilla y todo lo derivado salía en blanco. Se remaparon las lecturas de los ejemplos y se comprobó, una por una, que caen en celdas reales.

Los cuatro se encontraron revisando el trabajo hecho, no ejecutando las pruebas automáticas — que en los cuatro casos seguían en verde, porque cada pieza estaba probada por separado y ninguna prueba ejercitaba la combinación completa que hacía falta para verlos.

---

## Cómo comprobarlo todo

```
npm test
npm run typecheck --workspaces
npm run build --workspace packages/app
npm audit --omit=dev
```

Y en un navegador de verdad, que comprueba lo que un entorno simulado no puede —subir un archivo, pegar celdas, colocar una columna de un clic, y ver la hoja convertida en cotas—:

```
npm run build --workspace packages/app
npx vite preview --port 4173        # desde packages/app, en otra ventana
node packages/app/verificacion/importar.mjs <carpeta-de-salida>
```
