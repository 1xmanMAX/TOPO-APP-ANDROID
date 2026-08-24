# Verificación en un navegador real

Estas comprobaciones existen porque el entorno de pruebas (`jsdom`) no es un navegador: no reproduce fielmente el foco cuando un elemento cambia de posición, no descarga archivos, y no dibuja nada. Dos riesgos del proyecto solo podían cerrarse aquí.

## Cómo ejecutarlas

Con la app compilada y servida:

```
npm run build --workspace packages/app
npx vite preview --port 4173          # desde packages/app, en otra ventana
npm run verificar --workspace packages/app
```

La primera vez hace falta el navegador: `npx playwright install chromium`.

## Qué comprueba `recorrido.mjs`

Catorce cosas de punta a punta, entre ellas:

- Que corregir la cota de un banco de nivel recalcula todo el proyecto.
- Que escribir una lectura y pulsar Enter la registra y avanza.
- Que la barra de cierre da el veredicto correcto.
- Que el deslizador mueve el corte, y que elegir una celda sin medir avisa en vez de dibujar un gráfico vacío.
- **Que el `.xlsx` descargado es un archivo válido de verdad**, con sus cinco partes y las cotas escritas como número.
- Que el `.topo` descargado contiene el proyecto con sus lecturas.
- Que no hay ni un error en la consola del navegador.

Deja capturas de pantalla en la carpeta que se le pase como argumento.

## Qué comprueba `foco-plantilla.mjs`

Una sola cosa, pero delicada: en el editor de plantilla, cambiar la distancia de un elemento lo reordena en pantalla. Comprueba que **el campo que estás editando sigue siendo el del mismo elemento** después de que la fila salte de sitio.

No basta con mirar si algo tiene el foco: todos los campos de distancia se llaman igual. Hay que comprobar que el nodo enfocado sea el mismo y que pertenezca al elemento que se empezó a editar. Una comprobación menos precisa da un falso positivo.

## Qué comprueba `capas.mjs`

El recorrido completo de la Entrega 2A: registrar una segunda campaña sobre la misma calle, en otra capa, y comparar las dos.

Entre otras cosas:

- Que la libreta nueva avisa de que falta la vista atrás antes de aceptar lecturas.
- Que comparar dos capas muestra el espesor colocado celda por celda, y cuántas celdas son comparables.
- Que el corte con las capas superpuestas sombrea solo donde las dos tienen medida.
- **Que el `.xlsx` de espesores descargado es un archivo válido de verdad**, con las dos capas nombradas en la cabecera, el aviso de que los espesores no están comprobados cuando la campaña no cierra, los espesores como número, y la progresiva sin pareja en la otra capa vacía en vez de en cero.
- Que el corte de la libreta siempre dibuja la campaña activa, nunca lo que haya quedado marcado en el selector de capas de Resultados.

Deja capturas de pantalla en la carpeta que se le pase como argumento.

## Qué comprueba `rasante.mjs`

El recorrido completo de la Entrega 2B: definir la rasante de una calle desde la interfaz, comprobar que el corte tipo se dibuja mientras se escribe, y que las cuatro vistas de Resultados —tabla, mapa, corte transversal y perfil longitudinal— coinciden en lo que dicen.

Entre otras cosas:

- Que las tres clases de estado (conforme, al límite, fuera de tolerancia) aparecen a la vez con la cota de arranque elegida, y que el mapa las pinta con su color.
- Que el corte transversal sombrea contra la rasante.
- **Que el `.xlsx` de diferencias descargado es un archivo válido de verdad**, con la pendiente longitudinal y la tolerancia de la capa en la cabecera, el estado de verificación, y las celdas fuera de sección vacías (nunca en cero).

Deja capturas de pantalla en la carpeta que se le pase como argumento.

## Qué comprueba `visor3d.mjs`

La Tarea V7: capas apiladas y corte vivo en el modelo 3D.

- Que marcar SUBRASANTE y BASE en el selector de capas y cambiar el modelo 3D a modo Capas dibuja una superficie por cada una (dos `data-capa-id` distintos).
- Que cada superficie lleva el nombre de su capa rotulado junto al dibujo, no solo el color.
- Que mover el deslizador de progresiva secciona el modelo de verdad (menos caras dibujadas, ninguna con `data-progresiva-desde` más allá del corte) en vez de dibujarlo entero y tapar unas con otras.

Deja capturas de pantalla en la carpeta que se le pase como argumento.

## Qué comprueba `vista3d.mjs`

El modelo 3D en modo Estado: que se dibuja, que los cinco controles del visor están montados y alcanzables desde Resultados, y que gira, secciona y resume de verdad.

Entre otras cosas:

- Que la calle trae su rasante ya definida (condición para que el modo Estado levante algo) antes de seguir.
- Que el interruptor Estado/Capas, las tres vistas guardadas y los dos deslizadores (inclinación, exageración) están montados.
- **Que arrastrar con el ratón gira el modelo de verdad**: las coordenadas de las caras cambian tras un arrastre real — esto no se puede simular fuera de un navegador de verdad.
- Que el deslizador de progresiva secciona el modelo (menos caras al recortar el tramo).
- Que la exageración vertical aparece escrita junto al modelo y sigue al deslizador cuando se mueve.
- Que el resumen en texto nombra la peor zona, con su progresiva, elemento y diferencia en milímetros.

Deja capturas de pantalla en la carpeta que se le pase como argumento.
