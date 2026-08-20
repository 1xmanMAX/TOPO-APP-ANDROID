# Cómo usar la app — Entrega 1

Nivelación de una calle por progresivas: escribes las lecturas de mira, la app calcula las cotas, verifica si tu circuito cierra, compensa el error y te deja recorrer la calle corte por corte.

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

Esta es la primera entrega. Todavía no:

- Compara capas entre sí ni calcula espesores reales (Entrega 2)
- Muestra la calle en 3D (Entrega 3)
- Carga planos de fondo con marcadores (Entrega 4)
- Se conecta a estación total ni a GNSS (llega con la versión Android)

El modelo de datos ya contempla todo eso, así que nada de lo que registres ahora se pierde ni hay que rehacerlo.
