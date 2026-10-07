# Terreno, puntos de estación total y GNSS, y niveles de la capa siguiente

**Fecha:** 2026-10-06
**Rama:** `terreno`, worktree `F:\THE FORGE\TOPO-terreno`, sacada de `rediseno` (616d192).
**Diseño:** lienzo https://claude.ai/artifact/JFkdfpyssCZ36sjpomPCwo, tableros 22 (Terreno), 23 (Puntos) y 24 (Replanteo por coordenadas). Pendiente del visto bueno de Max; esta rama adelanta **solo el motor y los lectores**, sin interfaz.

Pedidos de Max (2026-10-05/06): curvas de nivel y extraerlas por zonas; estación total y GNSS; visualizar; «sin meter muchas pestañas, todo bien integrado». Y su herramienta propia «Pistas y veredas: separación entre niveles» (HTML que él usa), «añádela para que pueda nivelar en campo y mejórala».

Convenciones del rediseño (spec 2026-10-05, sección 3) siguen: diferencia = medida − proyecto (positivo corta), lo calculado sobre una nivelación sin cerrar es «no comprobado», semáforo con símbolo, código y comentarios en español.

**Coordenadas:** el rediseño no usaba UTM. Con estación total y GNSS hacen falta coordenadas. Decisión provisional (a confirmar con Max): los puntos guardan `x` (este) e `y` (norte) en metros en un **sistema declarado** por conjunto: `'local'` o `'utm'` (con zona y hemisferio como texto, sin transformar a geográficas). Para ponerlos sobre un plano se amarra con 2 puntos comunes (transformación de semejanza 2D; escala 1 por defecto, y se informa la escala que saldría libre como control). La **cota** de un punto de GNSS no reemplaza a la de la nivelación: se informa la diferencia.

## Módulos

### A. Superficie y curvas (`packages/core/src/terreno/`)
- `triangulacion.ts`: TIN de Delaunay con `delaunator` (ISC). Entrada `PuntoTerreno {id, x, y, z, origen: 'nivel'|'estacion'|'gnss', comprobado: boolean, codigo?}`. Descarta duplicados (mismo x,y a < 1 mm: se queda el comprobado, y si ambos, avisa la diferencia de z). Quita triángulos del borde con lado > `ladoMaximo` (por defecto 3 × mediana de lados) para no inventar terreno en huecos. Cada triángulo sabe si es comprobado (sus 3 vértices lo son).
- `curvas.ts`: curvas cada `intervalo` (0.25/0.5/1 m…), maestras cada `cadaMaestra` curvas; segmentos por triángulo unidos en polilíneas (abiertas o cerradas), con tramos marcados no comprobados; posiciones de rótulo. Recorte opcional a un polígono `zona`.
- `zona.ts`: área en planta de un polígono, cota mín/máx/media de la superficie dentro, volumen de corte y relleno respecto a una cota de referencia (o a otra superficie), integrado por triángulos recortados al polígono. Dice qué parte del área es no comprobada.
- `perfilLinea.ts`: perfil del terreno a lo largo de una polilínea (cortes con aristas del TIN), con distancia acumulada, cota, pendiente por tramo y tramos fuera de la superficie o no comprobados.

### B. Puntos y replanteo por coordenadas
- `packages/app/src/puntos/lectores.ts`: CSV/TXT con orden detectado (PNEZD, PENZD, NEZ…, separador coma/punto y coma/tab/espacios, encabezado opcional), Leica GSI-8 y GSI-16 (palabras 11 punto, 81 este, 82 norte, 83 cota, 71 código). Devuelve puntos + avisos por línea que no se entendió, nunca descarta en silencio. Detecta coordenadas que parecen UTM (este 6 cifras, norte 7) para proponer el sistema.
- `packages/core/src/terreno/amarre.ts`: semejanza 2D por 2 puntos (o mínimos cuadrados con más), escala fija 1 o libre, residuos por punto.
- `packages/core/src/terreno/replanteoCoord.ts`: desde estación + punto atrás → ángulo horizontal (en sentido horario desde el atrás, en grados sexagesimales con texto 47°12′30″), azimut, distancia horizontal; con GNSS → avanza al norte/este (m) y distancia que falta; al llegar, cota medida vs proyecto con el veredicto del motor (corta/rellena, ✓ △ ✗).

### C. Salida DXF (`packages/app/src/planos/dxfSalida.ts`)
DXF ASCII R12 que AutoCAD y LibreCAD abren: capas `CURVAS`, `CURVAS_MAESTRAS`, `ROTULOS`, `PUNTOS`, `PERFIL`; POLYLINE 3D con elevación, POINT, TEXT. Prueba: se vuelve a leer con el lector DXF existente (`planos/dxf.ts`) y da lo mismo.

### D. Niveles de la capa siguiente — la herramienta de Max, mejorada (`packages/core/src/campo/niveles.ts`)
Lo que hace su HTML: puestas (cota BM + lectura atrás → HI), conjuntos (progresiva, lectura o cota) por capa y lado, lectura en m/cm/mm, mira normal (Z = HI − L) o invertida (Z = HI + L), ajuste en cm por conjunto; comparar dos líneas → separación mínima, punto crítico, puntos que no cumplen, escáner por progresiva, pendiente por tramo; «nivel a registrar»: cota y lectura en progresivas pedidas, interpolando sobre la línea, si no la cubre proyectando paralelo a la línea más cercana que cubra ambas progresivas, si no extrapolando el tramo extremo; avisa lectura negativa.
Lo que se mejora al meterla en el motor:
1. **Líneas desde la app**: `lineaDeCapa(proyecto, calleId, capa, puntoSeccion)` arma la línea (progresiva, cota) desde las tomas calculadas por el motor, por punto de la sección (borde izq, eje, vereda der…), con `comprobado` por punto. También acepta líneas escritas a mano como en su HTML.
2. **Separación entre capas** `separacionEntreLineas(superior, inferior, minimoM)`: lo de su HTML, más el veredicto con símbolo (✓ ≥ mínimo, △ hasta 2× tolerancia por debajo… usar el criterio de espesores ya existente si aplica, si no ✓/✗), y «no comprobado» si alguna de las dos líneas lo es en ese punto. `separacionEn(x)` para el escáner.
3. **Nivel a registrar** `nivelARegistrar({ linea, otras, progresivas, ai, desplazamientoM, instrumento })`: la capa siguiente = línea base + desplazamiento (p. ej. base = subrasante medida + 0.20 m) siguiendo sus pendientes; por progresiva da cota, lectura de mira, pendiente, cómo se obtuvo (`'interpolado'|'proyectado'|'extrapolado'` con de qué línea), y avisos: lectura fuera de la mira (lecturaMin…largoMira − margen del instrumento: «cambie de estación»), negativa, no comprobado.
4. **La puesta**: la AI compensada de la libreta cuando hay nivelación cerrada; si no, puesta rápida `{cotaBM, lecturaAtras}` (y se dice no comprobada). Unidades m/cm/mm y mira invertida se conservan.
5. Hoja de estacas: el resultado se puede pasar al informe existente (`informes/hojaDeEstacas.ts`) — solo el adaptador, sin tocar la interfaz.

Cada módulo con pruebas vitest, incluidas pruebas con los datos de ejemplo del HTML de Max (Vereda/Base/Subbase izquierda y derecha, puesta BM 100, atrás 1.5) para que dé los mismos números que su herramienta donde no hay mejora.
