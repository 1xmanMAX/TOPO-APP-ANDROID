# Cómo usar la app

Nivelación de una calle por progresivas: escribes las lecturas de mira, la app calcula las cotas, verifica si tu circuito cierra, compensa el error y te deja recorrer la calle corte por corte.

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
Proyecto  →  Plantilla  →  Calle  →  Campañas  →  Libreta  →  Resultados
```

### 1. Proyecto

Los datos de la obra y, sobre todo, los **bancos de nivel**: el punto de cota conocida donde arranca todo. Puedes tener varios — uno por esquina, por ejemplo — y usarlos para encadenar una calle con la siguiente.

También defines aquí las **capas** de pavimento: terreno existente, subrasante, sub-base, base, carpeta.

El **orden manda**: es el que decide qué capa queda debajo de cuál al calcular espesores. Si te falta una en medio, no hace falta borrar y rehacer — los botones de subir y bajar la ponen en su sitio.

> Si corriges la cota de un banco de nivel, **todas las cotas del proyecto se recalculan solas**. La app no guarda cotas: guarda tus lecturas y deriva todo lo demás cada vez.

### 2. Plantilla

Qué puntos tomas a lo ancho de la calle, y a qué distancia del eje está cada uno. Negativo hacia la izquierda, positivo hacia la derecha.

Es libre: pones vereda si la hay, pelo de agua si lo tomas, un punto existente al que tienes que llegar. La guardas con nombre y la reutilizas en la siguiente calle.

### 3. Calle

El tramo: desde qué progresiva hasta cuál, y cada cuántos metros tomas una sección. Puedes añadir **progresivas extra** donde el terreno lo pida: un buzón, una entrada de garaje, un quiebre.

Abajo ves cuántas celdas te va a tocar llenar. Útil para dimensionar la jornada antes de salir.

### 4. Campañas

Una campaña es **una jornada de nivelación**: una fecha, una calle, una capa y el banco de nivel donde arrancas.

Las campañas se apilan y **nunca se pisan**. Hoy nivelas Av. Sol en subrasante; mañana Jr. Lima; pasado, la base de Av. Sol. Cada una guarda su libreta completa, y puedes volver a cualquiera y encontrarla como la dejaste.

### 5. Libreta

Donde pasas el tiempo. Escribes la lectura que leíste en la mira, pulsas **Enter**, y el cursor salta solo a la siguiente celda pendiente.

- **Trasladar el instrumento**: cierra la estación con un punto de cambio y abre la siguiente leyendo hacia atrás a ese mismo punto.
- **Cerrar el circuito**: remata contra el banco de nivel para que la app pueda verificar tu trabajo.
- Puedes **corregir o borrar** cualquier lectura ya escrita. Todo se recalcula al instante: cota, corte y cierre.

### 6. Resultados

La tabla de cotas compensadas, el corte transversal con su deslizador y el perfil longitudinal.

Al hacer clic en una celda de la tabla, el corte salta a esa progresiva. Al hacer clic en un punto del corte, se marca su celda. Todo está ligado.

Desde aquí exportas a **Excel**, a **CSV** o **copias la tabla** para pegarla en una hoja ya abierta.

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
            EJE (offset 0)
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

### Si la sección no cubre toda la plantilla, la app te lo dice

La plantilla puede tener puntos —un sardinel, una vereda, un punto de amarre— más allá de donde llegan tus tramos. Si eso pasa, el editor avisa:

> La sección definida llega hasta 4.20 m del eje. Estos puntos de la plantilla quedan sin cota de proyecto: SAR-I, SAR-D, VER-I, VER-D.

Esos puntos no van a tener nunca una diferencia contra el proyecto, midas lo que midas ahí: el proyecto simplemente no define nada en ese offset. No es un error tuyo — es información que necesitabas antes de salir a medir esos puntos por gusto.

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

**Mapa de la calle.** Toda la calle de un vistazo: una fila por elemento de la plantilla, una columna por progresiva, cada celda con su color y su símbolo. Es la vista para ver de un salto dónde está el problema, sin recorrer la tabla progresiva por progresiva.

**Corte transversal.** Dibuja la rasante junto al terreno medido, y sombrea entre las dos: una trama para **corte** (donde el terreno sobra frente a la rasante) y otra para **relleno** (donde falta), con su leyenda al lado — la trama distingue una de otra incluso en blanco y negro. El sombreado **solo cubre donde mediste**: si tu nivelación no llegó hasta la vereda, ahí no hay sombreado, aunque la rasante sí esté definida.

**Perfil longitudinal.** La rasante y el terreno medido a lo largo de toda la calle, para el elemento que elijas del desplegable (el eje, un borde, una vereda). Sirve para ver de corrido si un tramo entero está sistemáticamente alto o bajo, en vez de mirarlo punto por punto.

### Lo que no está comprobado, tampoco aquí

Igual que con los espesores: un corte y relleno calculado sobre una nivelación que **no cerró** tampoco está comprobado, aunque la resta en sí dé un número. La pantalla y el Excel de diferencias lo dicen igual:

```
DIFERENCIAS NO COMPROBADAS — el circuito no se verificó
```

El archivo de diferencias lleva además, en la cabecera, la **pendiente longitudinal** y la **tolerancia de la capa** contra las que se juzgó cada celda — para que quien lo reciba sepa con qué se comparó, no solo el resultado.

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

- Muestra la calle en 3D (Entrega 3)
- Carga planos de fondo con marcadores (Entrega 4)
- Se conecta a estación total ni a GNSS (llega con la versión Android)

El modelo de datos ya contempla todo eso, así que nada de lo que registres ahora se pierde ni hay que rehacerlo.
