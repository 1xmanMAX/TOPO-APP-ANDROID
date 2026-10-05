# Rediseño: una calle, una pantalla — y el motor que lo sostiene

**Fecha:** 2026-10-05
**Estado:** aprobado por Max sobre el lienzo de diseño (21 pantallas):
https://claude.ai/artifact/JFkdfpyssCZ36sjpomPCwo
**Rama:** `rediseno`, sacada de `ancho-variable` (e87f796). El cambio sin
confirmar de `tipos.ts` en `ancho-variable` NO entra aquí: es trabajo de esa
rama.

---

## 1. Lo que Max aprobó

- 7 pantallas → 3 espacios: **Obra · Calle · Informes**, y la calculadora a
  un toque desde cualquiera.
- Dentro de la calle, tres modos sobre la misma vista: **Medir · Revisar ·
  Replantear**.
- Funciones nuevas: replanteo con lectura objetivo, aviso al anotar, cierre en
  vivo, calculadora de campo, informes (protocolo, libreta con cierre, control,
  espesores, metrado, hoja de estacas), volúmenes, drenaje, notas.
- **Planos:** el plano de obra con las pistas encima, sus pendientes y sus
  controles; croquis de la pista dibujado sobre el plano; tocar una pista lleva
  a sus cálculos.
- **Formatos de plano: primero DXF y PDF** (le llegan los dos). DWG queda
  fuera: se convierte a DXF con ODA File Converter.
- **No se usa código de LibreCAD** (GPL: obligaría a publicar la app, que Max
  quiere vender). Librerías: `dxf-parser` (MIT), `pdfjs-dist` (Apache-2.0),
  `jspdf` (MIT).

## 2. La precisión manda en las pistas empinadas

Max, el 2026-10-05: *«la mira es de 100 m nomás, pero eso no importa, sino
dónde pongo los demás puntos para asegurar precisión»*.

Por eso el planificador de cambios no busca «la menor cantidad de
estaciones», sino **dónde poner estaciones, puntos de cambio y puntos de
control para que el error no se acumule**. Reglas, todas configurables y con
valor de fábrica:

| Regla | Fábrica | Por qué |
|---|---|---|
| Visuales equilibradas: \|atrás − adelante\| por estación | ≤ 5 m | Cancela colimación y curvatura/refracción |
| Visual más larga | 50 m | Precisión de lectura, aunque el equipo alcance 100 m |
| Lectura mínima en la mira | 0.30 m | Cerca del suelo la refracción engaña |
| Lectura máxima | largo de la mira − 0.30 m | La punta de la mira oscila |
| Largo de la mira | 4 m | La común en obra |
| Altura del instrumento | 1.50 m | |
| Puntos de cambio entre dos puntos de control | ≤ 4 | Cada tramo entre controles cierra por su cuenta |
| Error esperado por estación (σ) | 1 mm | Para estimar el error del tramo: σ·√n |
| Tolerancia del circuito | 12 mm·√K | La de la app (`calcularToleranciaMm`) |

**Puntos de control** (estacas con clavo y cota fija) van:
1. al inicio y al final de la pista;
2. en cada quiebre de pendiente de la rasante;
3. y donde haga falta para que ningún tramo entre controles pase de 4 cambios
   **ni** su error esperado (σ·√estaciones) pase de la mitad de su tolerancia.

Cada punto de control lleva **el porqué** en palabras («quiebre de pendiente»,
«para no pasar de 4 cambios»…). Cada tramo entre controles se nivela ida y
vuelta y cierra por su cuenta: el error de un tramo no se arrastra al
siguiente.

## 3. Convenciones que no cambian

- Se guardan lecturas, nunca cotas.
- Diferencia = medida − proyecto, en mm. **Positivo = sobra = corta**;
  negativo = falta = rellena.
- Lectura objetivo = altura instrumental − cota de proyecto. Si la mira marca
  más que el objetivo, falta material (rellena); si marca menos, sobra (corta).
- Sección: positivo baja al alejarse del eje.
- Un dato calculado sobre una nivelación que no cerró **tampoco está
  comprobado**, y se dice en pantalla y en los archivos, informes PDF incluidos.
- Semáforo con símbolo siempre: ✓ conforme, △ al límite (hasta 2×tol), ✗ fuera.
- Sin coordenadas UTM: los planos tienen su propio sistema; solo importan
  distancias, que se calibran.
- Código y comentarios en español, como el resto del repo.

## 4. Entregas de esta rama

**Ola 1 — motor y lectores (este documento):** módulos nuevos, cada uno en su
carpeta y con sus pruebas, sin tocar la interfaz:

| Módulo | Dónde |
|---|---|
| Calculadora de campo | `packages/core/src/campo/calculadora.ts` |
| Replanteo y aviso al anotar | `packages/core/src/campo/replanteo.ts`, `avisoLectura.ts` |
| Cierre en vivo | `packages/core/src/nivelacion/cierreEnVivo.ts` |
| Planificador de cambios y controles | `packages/core/src/planificar/` |
| Volúmenes y drenaje | `packages/core/src/analisis/` |
| Geometría de pistas sobre el plano | `packages/core/src/planos/` |
| Lector DXF | `packages/app/src/planos/dxf.ts` |
| Lector PDF | `packages/app/src/planos/pdf.ts` |
| Informes PDF | `packages/app/src/informes/` |

**Ola 2 — interfaz:** el armazón Obra · Calle · Informes, los tres modos, el
plano con pistas y croquis, el planificador, la calculadora y los informes,
sobre el motor de la ola 1. Tiene su propio plan cuando la ola 1 esté integrada.

**Ola 3 — verificación con datos simulados:** obra completa simulada (tres
calles, una pista empinada, un DXF y un PDF de expediente) recorrida en
navegador real con Playwright.
