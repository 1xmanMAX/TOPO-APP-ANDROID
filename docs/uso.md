# Cómo usar la app

Nivelación de una calle por progresivas: **subes tu hoja de campo tal como la anotas** —o escribes las lecturas de mira aquí dentro—, la app calcula las cotas, verifica si tu circuito cierra, compensa el error y te deja recorrer la calle corte por corte.

Y una vez tienes dos capas niveladas, te dice **cuánto material hay entre ellas**, celda por celda. Si además defines la rasante de proyecto, te dice **cuánto sobra o falta contra el diseño**, con semáforo de tolerancia.

## Arrancarla

La primera vez, en la carpeta del proyecto:

```
npm install
```

Después, cada vez que quieras usarla:

```
npm run dev
```

Se abre en el navegador, en `http://localhost:5173`. **No necesita internet**: una vez instalada funciona sin señal, que es como se trabaja en obra.

Para dejarla, `Ctrl+C` en la ventana de comandos.

## El orden de trabajo

```
Proyecto  →  Sección  →  Subir datos  →  Libreta  →  Resultados
```

Hay dos pantallas más — **Calle** y **Campañas** — que se usan de vez en cuando; van al final de este apartado.

### 1. Proyecto

Los datos de la obra y, sobre todo, los **bancos de nivel**: el punto de cota conocida donde arranca todo. Puedes tener varios — uno por esquina, por ejemplo — y usarlos para encadenar una calle con la siguiente.

También defines aquí las **capas** de pavimento: terreno existente, subrasante, sub-base, base, carpeta.

El **orden manda**: es el que decide qué capa queda debajo de cuál al calcular espesores. Si te falta una en medio, no hace falta borrar y rehacer — los botones de subir y bajar la ponen en su sitio.

> Si corriges la cota de un banco de nivel, **todas las cotas del proyecto se recalculan solas**. La app no guarda cotas: guarda tus lecturas y deriva todo lo demás cada vez.

> Cuando subes una hoja, sus cotas se cuelgan del **primer banco de nivel del proyecto**: todavía no se puede elegir otro para una hoja subida. La pantalla te dice de cuál cuelgan, con su cota, antes de que aceptes nada.

### 2. Sección: los puntos de tu calle, con tus palabras

**Cada calle tiene su sección**, y es lo primero que se declara. Aquí ves tu calle dibujada de lado a lado, con un punto por cada cosa que mides a lo ancho, y debajo una ficha por punto.

Cada punto lleva tres cosas:

| Lo que lleva | Qué se pone ahí |
|---|---|
| **Qué es** | eje, borde de calzada, sardinel, vereda, cuneta, pelo de agua, u otro |
| **A qué distancia del eje** | en metros: **negativa a la izquierda, positiva a la derecha**. El eje es siempre 0 |
| **En la hoja** | la palabra —o las palabras— con las que escribes ese punto en tu Excel |

Esa tercera es la que hace el trabajo: **tú le dices a la app cómo escribes tú**, y luego ella busca esas palabras en tu hoja. Si en tu Excel el eje lo escribes «ejito» y los bordes «bobo», pones eso y listo. No hay que cambiar cómo anotas.

Cuatro cosas que conviene saber:

- **La misma palabra puede valer para los dos lados.** Si escribes «vereda» dos veces, una a cada lado del eje, las dos entran bien: el lado no sale de la palabra, sale de **dónde cae la columna respecto a la del eje** — lo que está a su izquierda es lado izquierdo, y lo que está a su derecha, derecho.
- **No importan mayúsculas, tildes ni espacios de sobra.** `vereda `, `VEREDA` y `Vereda` son la misma palabra.
- **La sección nace rellenada** —vereda, sardinel, borde, eje, borde, sardinel, vereda— para no arrancar de cero. Quitas lo que no midas, añades lo que sí, y ya.
- **Las distancias vienen puestas por la app** hasta que las midas tú. Mientras quede una sola sin medir, arriba se lee un aviso: las pendientes y el bombeo que salgan de ahí son orientativos. Cuando midas una, escríbela; si la cifra que puso la app ya era la buena, pulsa **Confirmar** y cuenta como medida.

Abajo del todo hay **tres palabras que no son puntos** pero también están en tu hoja, y también se declaran aquí:

- la de la **columna de progresivas** (`PROG`, `PK`, `ABSCISA`…),
- la del **punto de control**, que es lo que escribes junto a la vista atrás (`PC`, `BM`…),
- la que abre una **fila de algo existente** (`existente`, `REF`…).

### 3. Subir datos: tu hoja entra tal como la anotas

Aquí entra el trabajo de campo. Subes el archivo (`.xlsx` o `.csv`) o **pegas las celdas** copiadas de Excel o de Google Sheets: los dos caminos se leen igual y dan lo mismo.

Antes de aceptar nada, la app te enseña **qué entendió y qué no**. Nada entra en el proyecto hasta que pulsas Importar.

#### Un ejemplo trabajado, con una hoja de verdad

Esta es una hoja real, tal como se anotó. Se llama `Detrás del colegio` y esto es todo lo que tiene:

| | B | C | D | E | F | G | H |
|---|---|---|---|---|---|---|---|
| **2** | PC | 1.45 | | | | | |
| **3** | | | | 2.11 | | | |
| **4** | | vereda | IZQ | EJE | DER | vereda | |
| **5** | 6 | 2.12 | 2.24 | 2.27 | 2.12 | 1.93 | |
| **6** | 10 | 2.07 | 2.17 | 2.14 | 2.15 | 1.84 | |
| **7** | 20 | 1.88 | 2.135 | 2.07 | 2.02 | 1.755 | 0.125 |
| … | … | … | … | … | … | … | … |
| **11** | 60 | 1.56 | 1.52 | 1.49 | 1.38 | 1.42 | 0.14 |
| **12–19** | | | | | | | 0 |
| **20** | existente | cuneta | 2.185 | | 1.955 | 0.23 | |
| **21** | existente | calzada | 2.41 | | 2.06 | | |

Fíjate en lo que **no** tiene: la tabla no empieza arriba a la izquierda, la columna de progresivas no tiene título, `vereda` está dos veces, y no hay ni una distancia al eje escrita. Y en lo que tiene de más: la columna H es una resta arrastrada, y las filas 12 a 19 son el cero que dejó esa fórmula.

**Qué entiende la app de ella:**

1. **La cabecera es la fila 4**, la primera donde reconoce alguna de tus palabras. Todo lo de encima es preámbulo.
2. **La vista atrás es el 1.45**, porque va justo detrás de `PC`, que es tu palabra para el punto de control.
3. **Las progresivas salen de la columna B**, aunque no tenga título: es la columna de números que va pegada a la izquierda de la primera columna de puntos.
4. **`vereda` de la columna C es la vereda izquierda y la de la G es la derecha**, porque una cae a la izquierda de `EJE` y la otra a la derecha.
5. **Las filas 20 y 21 son puntos de referencia**: no pertenecen a ninguna progresiva, se guardan aparte y se les calcula su cota desde la misma estación. La segunda celda dice qué son —cuneta, calzada— y eso es texto libre: no hace falta declararlo en la sección.

**Qué te pregunta:**

- **`IZQ` y `DER`** no las reconoce, y con razón: son etiquetas de lado, no de elemento, y nadie sabe si en tu hoja significan el borde o el sardinel. Salen en **«Columnas que no reconocí»**, con sus valores a la vista y un desplegable para decir a qué punto van. Un clic en cada una. **Al aceptar la hoja, esas dos palabras quedan guardadas en tu sección, y la próxima hoja igual entra sola.**
- **En la fila de la cuneta hay dos lecturas del lado derecho**: el 1.955 de la columna `DER` y el 0.23 de la vereda —que en realidad es la resta, no una lectura—. Una cosa existente solo tiene una por lado, así que **la app no elige**: te enseña las dos y espera a que digas cuál vale. Por eso salen **tres** referencias y no cuatro.

Y hay dos cosas que te dice sin que preguntes: que **las distancias son las de fábrica** hasta que las midas, y que **esta toma no cierra** —trae un punto de control y ninguna vuelta—, así que las cotas salen pero quedan sin comprobar.

**Qué queda fuera, dicho con su contenido:** el 2.11 suelto del preámbulo, la columna H entera y los ceros de las filas 12 a 19. Salen listados en **«Lo que no importé»** con sus valores: si algo de eso era una lectura tuya, lo ves ahí antes de aceptar y le asignas su punto.

**Qué sale al final:** una jornada de nivelación con **7 progresivas × 5 puntos = 35 lecturas**, la vista atrás 1.45 colgada del primer banco de nivel del proyecto, y **3 puntos de referencia**. Nada más: ni la columna H, ni las filas de ceros, ni el 2.11.

> Si no reconoce **ninguna** de tus palabras, no importa nada a ciegas: te lo dice y te manda a la pantalla de Sección a escribirlas.

> Tampoco te deja aceptar una hoja con una **columna sin colocar que tenga números dentro**. Dejar fuera una columna medida es perder trabajo de campo sin que se note, y eso no puede pasar en silencio. Una columna de puras notas, en cambio, no estorba: te avisa de que no trae números y sigue.

### 4. Libreta

Donde pasas el tiempo cuando anotas dentro de la app en vez de en la hoja. Escribes la lectura que leíste en la mira, pulsas **Enter**, y el cursor salta solo a la siguiente celda pendiente.

- **Trasladar el instrumento**: cierra la estación con un punto de cambio y abre la siguiente leyendo hacia atrás a ese mismo punto.
- **Cerrar el circuito**: remata contra el banco de nivel para que la app pueda verificar tu trabajo.
- Puedes **corregir o borrar** cualquier lectura ya escrita, venga de donde venga. Todo se recalcula al instante: cota, corte y cierre.

Una hoja importada se abre aquí igual que si la hubieras escrito a mano, y sus puntos de referencia aparecen en la estación con su nombre y su lado: «cuneta a la izquierda», «calzada a la derecha».

### 5. Resultados

La tabla de cotas compensadas, el corte transversal con su deslizador y el perfil longitudinal.

Al hacer clic en una celda de la tabla, el corte salta a esa progresiva. Al hacer clic en un punto del corte, se marca su celda. Todo está ligado.

Desde aquí exportas a **Excel**, a **CSV** o **copias la tabla** para pegarla en una hoja ya abierta.

En las cabeceras de las tablas y en los rótulos de los dibujos se lee **tu palabra**, la corta, la que escribiste en la sección — es la que cabe, y es la que reconoces. Lo que exportas también sale con tu palabra, y por eso **se puede volver a importar** sin tocar nada.

### La pantalla de Calle

Dos cosas: el **nombre** de la calle y su **rasante de proyecto** (más abajo hay un apartado entero sobre ella). Los puntos y sus distancias ya no se escriben aquí — viven en la sección.

### La pantalla de Campañas

Una campaña es **una jornada de nivelación**: una fecha, una calle, una capa y el banco de nivel donde arrancas. Cada hoja que importas crea la suya.

Las campañas se apilan y **nunca se pisan**. Hoy nivelas Av. Sol en subrasante; mañana Jr. Lima; pasado, la base de Av. Sol. Cada una guarda su libreta completa, y puedes volver a cualquiera y encontrarla como la dejaste. Subir dos veces una hoja de la misma calle añade una jornada más, no pisa la anterior.

La libreta de una jornada se arma con las progresivas que trae su hoja. Por eso hoy una jornada entra **subiendo datos**: el botón de «Nueva campaña» de esta pantalla crea la jornada, pero su libreta abre sin ninguna progresiva y no acepta lecturas hasta que tenga alguna.

## Comparar capas: el espesor colocado

En la pantalla de Resultados, arriba, hay dos desplegables: **capa de abajo** y **capa de arriba**. Eliges dos campañas de la misma calle y la app resta una de otra.

El resultado es el **espesor colocado**: lo que de verdad hay puesto, no lo que dice el proyecto.

```
Espesor colocado: mínimo 0.248 m · medio 0.250 m · máximo 0.253 m · 2 de 3 celdas comparables
```

Léelo así:

- **Mínimo** es tu punto flaco. Si el proyecto pide 0.25 y el mínimo sale 0.19, ahí falta material aunque la media cuadre.
- **Medio** se calcula con el espesor completo de cada celda, antes de redondearlo a milímetro para mostrarlo en la tabla. Si tú promedias a mano las cifras que ves en pantalla, puedes salir con 1 mm de diferencia: es normal, y el medio de la app es el más preciso de los dos.
- **Celdas comparables** son las que midieron las dos campañas. Si nivelaste el terreno hasta la vereda pero la subrasante solo hasta el borde, esas celdas de vereda no tienen pareja.

### Lo que la app no hace, y por qué

- **Una celda sin pareja sale vacía, nunca cero.** Un cero diría «aquí no se puso material». Vacío dice «aquí no se midió». No es lo mismo, y no conviene confundirlo delante de una valorización.
- **Un espesor negativo se marca.** Es físicamente imposible: o hay una lectura mal anotada, o elegiste las capas al revés.

### El corte con las dos capas

Debajo, el corte transversal dibuja las dos capas superpuestas con el área sombreada entre ellas. Un tramo delgado se ve antes de lo que se calcula.

El sombreado **solo cubre donde las dos capas tienen medida**. Si se corta antes de llegar a la vereda, es que ahí solo mediste una.

Con el selector de capas eliges cuáles se dibujan, sin cambiar la comparación.

### Exportar

Los botones distinguen qué tabla se llevan: **Exportar cotas a Excel** y **Exportar espesores a Excel**.

El archivo de espesores lleva cabecera con las dos capas comparadas, sus fechas, el resumen y —esto es lo que importa— **el estado de verificación de las dos**:

```
ESPESORES NO COMPROBADOS — la capa de abajo (TERRENO EXISTENTE · 2026-08-20): el circuito no se verificó
```

Un espesor calculado sobre una nivelación que no cerró **tampoco está comprobado**. Quien reciba el archivo tiene que poder saberlo sin preguntarte.

## La rasante de proyecto: cuánto sobra o falta

Hasta acá comparaste dos capas medidas entre sí. Esto es distinto: comparas lo que mediste contra **lo que el proyecto pide** — la rasante — y la app te dice, en cada punto, si sobra material, si falta, o si está clavado en la cota.

### Definir la rasante

En la pantalla de **Calle**, el botón **Definir la rasante** abre un editor con dos partes: los datos de la calzada y, al lado, un dibujo en vivo del corte tipo que cambia mientras escribes.

- **Cota de arranque**: la cota del eje en la primera progresiva de la calle.
- **Pendiente longitudinal**: cuánto sube o baja la calle al avanzar, en porcentaje. Negativo es que baja.
- **Tramos**, de eje hacia afuera, a cada lado: cada uno dice hasta qué distancia del eje llega y cuánto se desnivela ahí. Un tramo puede ser **pendiente** (un porcentaje, como el bombeo de la calzada) o **salto** (un desnivel de golpe, como la cara vertical de un sardinel).

Si la calle no es simétrica —una vereda solo de un lado, por ejemplo— hay un tramo de tramos para la izquierda y otro para la derecha. Si la dejas simétrica, el mismo juego de tramos vale para los dos lados.

### La convención de signos, con el corte tipo delante

Esto es lo que cuesta agarrarle la mano, así que léelo mirando el dibujo:

```
            EJE (distancia 0)
    izquierda  |  derecha
                |
  VER-I  SAR-I  |  SAR-D  VER-D
    \      |  BOR-I   BOR-D  |      /
     \     |____\      /____|     /
      \___/      \    /      \___/
   (vereda sube      (bombeo: calzada
    hacia la           baja al alejarse
    vereda: -1.5%)      del eje: +2.0%)
```

**Un valor positivo BAJA al alejarse del eje. Uno negativo SUBE.**

- El **bombeo de la calzada** es `+2.0`: al alejarte del eje hacia el borde, la calzada baja — es el desagüe normal de una pista, el agua corre hacia el sardinel.
- La **vereda**, que en cambio sube desde el sardinel hacia la fachada (cae hacia la calzada, no hacia la propiedad), lleva `-1.5`.
- Un **sardinel** (tramo tipo salto) casi siempre sube: por ejemplo un salto de `0.15` levanta 15 cm de golpe entre el borde de calzada y la vereda.

Con la calzada al `+2.0 %` y el borde a 4.20 m del eje, el borde queda **84 mm por debajo del eje** (4.20 × 2.0 % = 0.084 m). Es la cuenta que usa el perfil longitudinal cuando miras un elemento que no es el eje.

### Si los tramos no llegan a toda la calle, la app te lo dice

La sección de la calle puede tener puntos —un sardinel, una vereda, un punto de amarre— más allá de donde llegan tus tramos. Si eso pasa, el editor avisa:

> La sección definida llega hasta 4.20 m del eje. Estos puntos de la calle quedan sin cota de proyecto: Sardinel izquierdo, Sardinel derecho, Vereda izquierda, Vereda derecha.

Esos puntos no van a tener nunca una diferencia contra el proyecto, midas lo que midas ahí: el proyecto simplemente no define nada a esa distancia del eje. No es un error tuyo — es información que necesitabas antes de salir a medir esos puntos por gusto.

### Las cuatro vistas, en Resultados

Una vez hay rasante, en Resultados aparecen cuatro formas de ver lo mismo. Todas comparten el mismo semáforo:

| Símbolo | Color | Significa |
|---|---|---|
| ✓ | Verde | Conforme: dentro de la tolerancia de la capa |
| △ | Ámbar | Al límite: pasó la tolerancia, no el doble |
| ✗ | Rojo | Fuera de tolerancia: pasó el doble |
| · | Gris | Sin medir todavía |
| — | Gris con borde punteado | Fuera de la sección: el proyecto no define rasante ahí |

**El color nunca va solo.** Cada celda, en cualquier vista, también lleva el símbolo y el texto: milímetros con signo, si toca cortar o rellenar, y el estado en palabras. Un lector de pantalla se entera igual que alguien mirando la pantalla.

**Tabla de diferencias.** Un interruptor cambia entre **cota real**, **cota teórica** y **diferencia**. La diferencia va en milímetros con signo: positivo es que sobra material (toca **cortar**), negativo es que falta (toca **rellenar**), cero es que está clavado en la cota del proyecto.

**Mapa de la calle.** Toda la calle de un vistazo: una fila por punto de la sección, una columna por progresiva, cada celda con su color y su símbolo. Es la vista para ver de un salto dónde está el problema, sin recorrer la tabla progresiva por progresiva.

**Corte transversal.** Dibuja la rasante junto al terreno medido, y sombrea entre las dos: una trama para **corte** (donde el terreno sobra frente a la rasante) y otra para **relleno** (donde falta), con su leyenda al lado — la trama distingue una de otra incluso en blanco y negro. El sombreado **solo cubre donde mediste**: si tu nivelación no llegó hasta la vereda, ahí no hay sombreado, aunque la rasante sí esté definida.

**Perfil longitudinal.** La rasante y el terreno medido a lo largo de toda la calle, para el elemento que elijas del desplegable (el eje, un borde, una vereda). Sirve para ver de corrido si un tramo entero está sistemáticamente alto o bajo, en vez de mirarlo punto por punto.

### El modelo en volumen (3D)

Encima de las cuatro vistas anteriores hay una quinta: el mismo tramo, pero levantado en volumen en vez de aplanado en una tabla o un corte. Sirve para ver de un vistazo la forma que tiene la calle — un lomo, una hondonada, un tramo torcido — que a veces cuesta más de leer en una tabla de números que de ver en un dibujo.

**Dos modos, con el interruptor Estado / Capas:**

- **Estado** colorea cada tramo con el mismo semáforo de las otras vistas: verde conforme, ámbar al límite, rojo fuera, gris sin medir o fuera de sección. Es la calle de hoy, comparada contra el proyecto.
- **Capas** apila una superficie por cada campaña que marques en el selector de capas — SUBRASANTE, BASE, CARPETA, la que sea — para ver cómo se van montando unas sobre otras. Aquí el color no es un semáforo (no hay tolerancia que comparar entre capas): cada capa lleva un tono neutro propio y su nombre rotulado junto a la superficie, para no confundir "de qué capa es esto" con "está bien o mal".

En los dos modos, debajo del dibujo hay un párrafo que dice con palabras lo mismo que el color enseña con formas: cuántos tramos se dibujan y dónde está la mayor diferencia contra el proyecto, con su progresiva y sus milímetros. Sirve si no distingues los colores en pantalla, o si prefieres leerlo antes de mirar el dibujo.

**Cómo moverlo:**

- **Arrastra sobre el dibujo** (con el dedo o el ratón) para girarlo alrededor de la calle.
- Los botones **Planta**, **Alzado** e **Isométrico** saltan a tres encuadres fijos, los mismos que usan los planos de obra.
- El deslizador de **inclinación** sube o baja la cámara de forma continua, desde arriba del todo (planta) hasta de costado (alzado).
- El **deslizador de progresiva** — el mismo de siempre, el que también mueve el corte transversal — secciona el modelo: solo se dibuja hasta la progresiva donde lo dejes, como si cortaras la calle ahí mismo.

**La exageración vertical, y por qué importa.** Un metro de desnivel en una calle real ocupa, en pantalla, una fracción diminuta de lo que ocupan sus 180 metros de largo — la calle se vería aplastada, como una regla. Por eso el modelo estira las cotas con un deslizador de **exageración**, de 1× a 50×, y arranca en 25×.

**Esto quiere decir que el relieve que ves en el modelo no es el relieve real de la calle: está exagerado, y con la exageración por defecto, veinticinco veces.** Un lomo que en el dibujo se ve como una loma real, en el terreno puede ser un desnivel de pocos centímetros. El número de la exageración va siempre escrito junto al dibujo («Alturas exageradas 25×») para que no se te olvide mientras lo miras — pero solo lo escrito. Si vas a decidir algo con esto (dónde escurre el agua, qué tan fuerte es una pendiente), no lo decidas mirando el modelo: **usa las cotas de la tabla o el perfil longitudinal**, que sí están a escala real.

### Lo que no está comprobado, tampoco aquí

Igual que con los espesores: un corte y relleno calculado sobre una nivelación que **no cerró** tampoco está comprobado, aunque la resta en sí dé un número. La pantalla y el Excel de diferencias lo dicen igual:

```
DIFERENCIAS NO COMPROBADAS — el circuito no se verificó
```

El archivo de diferencias lleva además, en la cabecera, la **pendiente longitudinal** y la **tolerancia de la capa** contra las que se juzgó cada celda — para que quien lo reciba sepa con qué se comparó, no solo el resultado.

## Pistas y veredas: la capa siguiente y la separación entre niveles

Tu herramienta «Pistas y veredas: separación entre niveles» está dentro de la app, en **Calle › Niveles**, y se guarda con la calle en el `.topo`.

### La hoja de niveles (Calle › Niveles)

- **Puestas del nivel**: cota del BM (escrita o tomada de un BM del proyecto) y lectura atrás → AI. Si cambias la lectura atrás, se mueven todas las cotas de los conjuntos leídos desde esa puesta. Para otro día, «+ Nueva puesta» y «Pasar todos los conjuntos a esta puesta».
- **Conjuntos**: tus lecturas de una zona, «progresiva, lectura» una por renglón (o cotas), con su **categoría** —Base, Subbase, Vereda, Replanteo… o la que escribas— y ▲ ▼ para subir o bajar la línea entera en cm. «Traer de lo medido» copia una capa ya nivelada en la app.
- **Replanteo**: «+ Nuevo replanteo» copia otro conjunto (subido o bajado los cm que digas) o lo traza con una cota de arranque y una pendiente. Queda como conjunto de cotas que puedes corregir.
- **Gráficas** (una o dos, izquierda y derecha), con la pendiente de cada tramo y un escáner:
  - **Separación**: de la línea de arriba a la de abajo contra el mínimo; la menor, dónde, y los puntos que no cumplen.
  - **Corte y relleno**: lo que hay contra el replanteo; cuánto cortar (naranja) o rellenar (azul) en cada punto, y el mayor de cada uno.
- **Nivel a registrar**: eliges el conjunto, escribes la progresiva (o varias, «10, 20, 30») y sale la cota y **lo que debe marcar la mira**, siguiendo las pendientes; si el conjunto no llega ahí, se proyecta desde la línea más cercana o se extrapola, y se dice.

Lecturas en m, cm o mm, y mira hacia abajo o invertida, como en tu hoja.

Además, con las capas ya medidas en la app:

### Dar la capa siguiente desde la que ya mediste

En **Calle › Replantear › Desde una capa medida**:

1. Elige la **capa medida** de la que partes (de entrada, la de la jornada activa). La app propone **sumar** el espesor de la capa de encima: «BASE = SUBRASANTE + 0.200 m». Lo puedes cambiar.
2. Toca el **punto de la sección** que vas a estacar (borde izquierdo, eje, vereda…).
3. La **AI** sale de la estación de la libreta (compensada si cerró) o de una vista atrás a un BM.
4. Mueve el deslizador o toca una fila: sale la **cota** y, en grande, lo que **la mira debe marcar**. Siguen las pendientes que de verdad quedaron en la capa medida, no las del plano.

Cada fila dice cómo se obtuvo: **interpolado** sobre lo medido (✓), **proyectado** desde la línea más cercana cuando el punto no tiene medida ahí, o **extrapolado** más allá del último punto (△, no comprobado; más de 20 m no se extrapola). Si la calle tiene rasante, la columna **Proy.** dice cuántos mm queda la cota a dar sobre la del proyecto: seguir una capa que quedó alta arrastra el error, y la app lo avisa con ✗ antes de estacar.

Puedes añadir progresivas que no están en las jornadas («0+130, 140»), leer en m, cm o mm, con la mira invertida, y bajar la **hoja de estacas** en PDF.

### Comprobar la separación entre dos niveles

En **Calle › Análisis › Separación** (o con «Comprobar separación» desde Replantear): a cada lado de la calle eliges la **línea de arriba** y la **de abajo** —una capa medida en un punto de la sección, p. ej. el terreno en la vereda y la base en el borde— y la **separación mínima** en cm. Sale si **cumple**, la menor separación y en qué progresiva, los puntos que no llegan, la pendiente de cada tramo y un **escáner** para recorrer la calle. Con ▲ ▼ subes o bajas una línea unos cm para probar «¿y si doy 2 cm más?» sin tocar lo medido. La tabla se descarga en Excel.

Lo que sale de una nivelación sin cerrar se marca **no comprobado**, igual que en el resto de la app.

## Niveles en el plano: por dónde se va el agua

Para una zona complicada (varias intersecciones juntas) en la que quieres que el agua de una lluvia fuerte vaya por donde tú decides, en **Obra › Plano**, herramienta **Niveles**:

1. **Antes de salir**, toca el plano donde vas a leer: el punto 1, el 2, el 3… Tocar un punto lo elige; «Mover» lo cambia de sitio con el siguiente toque.
2. **En campo**, escribe en la tabla la lectura de cada punto (Enter pasa al siguiente). La cota sale de la puesta (cota del BM + lectura atrás); si cambias de estación, agrega otra puesta y elige en cada punto con cuál lo leíste.
3. **En el plano** aparece la cota de cada punto, una flecha en cada triángulo hacia donde cae el agua y en ámbar las zonas con menos pendiente que la mínima (0.5 % por defecto).
4. Marca como **salida** los sumideros, cunetas o canales. Arriba sale el veredicto: ✓ toda el agua llega a una salida, ✗ se empoza en tal punto (más bajo que todos sus vecinos), o △ llega al borde de lo nivelado. Al elegir un punto se dibuja el camino de su agua y cuánto baja hasta el siguiente.

Con el plano sin escala se ven la dirección del agua y dónde se empoza, pero no las pendientes en %: calíbralo para verlas. Los puntos se guardan con esa lámina, en el `.topo`.

## La barra de cierre: qué significa cada color

Aparece al pie de la libreta y es lo que te dice si tu trabajo sirve, **mientras sigues en la calle**.

| Color | Qué dice | Qué significa |
|---|---|---|
| 🟢 Verde | `error −5.0 mm ✓ PASA` | Tu nivelación cierra dentro de la tolerancia. Las cotas quedan compensadas. |
| 🔴 Rojo | `+18.0 mm ✗ FUERA DE TOLERANCIA` | El error supera lo admitido. **Las cotas quedan sin compensar y marcadas como no comprobadas.** |
| 🟠 Ámbar | `circuito abierto — sin verificación` | No cerraste contra ningún banco de nivel: no hay forma de verificar nada. |
| 🟠 Ámbar | `falta cerrar contra un banco de nivel` | Estás a mitad del trabajo. Normal. |
| 🟠 Ámbar | `el banco de nivel de cierre ya no está en el proyecto` | Lo borraste. Elige otro. |

La tolerancia sale de `T = e · √K`:

- **K** es la longitud del circuito en kilómetros. La app la calcula de tus progresivas (ida y vuelta si el circuito es cerrado) y puedes corregirla si caminaste más.
- **e** es el coeficiente según la clase: 7 mm en nivelación de precisión, 12 o 15 mm en tercer orden, que es la de obra común.

## Qué hacer cuando el cierre no pasa

1. **Mira el corte transversal.** Una lectura mal anotada salta a la vista como un diente en la línea. Un 2.045 escrito como 2.450 se ve de inmediato.
2. **Mira los avisos.** La app marca las lecturas que se apartan de sus vecinas y las celdas medidas dos veces con diferencia mayor a 5 mm.
3. **Revisa los puntos de cambio.** Si dos se llaman igual, la app te lo dice y se detiene: es el error que corrompería todas las cotas siguientes sin avisar.
4. Si no aparece nada raro, **el circuito hay que repetirlo**. Para eso la app te lo dice ahí mismo y no en gabinete.

## Tus datos

- **Se guardan solos** en el navegador cada pocos segundos. Si la app se cierra de golpe, al volver a abrirla te ofrece recuperar el trabajo y te dice de cuándo es.
- **El botón Guardar** descarga un archivo `.topo` con el proyecto entero. Es lo que llevas del celular al PC, por USB, correo o lo que sea. Sin nube, sin cuentas.
- Un `.topo` es un ZIP corriente: si algún día hiciera falta, se abre con cualquier descompresor y los datos están ahí en texto.

## El tema

El botón de arriba a la derecha alterna **Sistema → Oscuro → Claro**. En modo Sistema sigue lo que tenga configurado tu equipo, incluso si cambia con la app abierta.

Con sol directo el modo claro se lee mejor; de noche o dentro del vehículo, el oscuro no deslumbra.

## Lo que todavía no hace

Todavía no:

- Carga planos de fondo con marcadores (Entrega 4)
- Se conecta a estación total ni a GNSS (llega con la versión Android)

El modelo de datos ya contempla todo eso, así que nada de lo que registres ahora se pierde ni hay que rehacerlo.
