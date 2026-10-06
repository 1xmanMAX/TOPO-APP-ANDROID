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
| Largo de la mira | 5 m | La telescópica común en obra (`INSTRUMENTO_DE_FABRICA`, una sola fuente) |
| Altura del instrumento | 1.50 m | |
| Puntos de cambio entre dos puntos de control | ≤ 4 | Cada tramo entre controles cierra por su cuenta |
| Error esperado por estación (σ) | 1 mm | Cada tramo se cierra ida y vuelta: error esperado del tramo = σ·√(2n), con n estaciones de ida. El tramo está bien si 2 × error esperado ≤ k·√K, K = ida y vuelta en km (confianza ~95 %; pide un paso medio ≥ 4000·σ²/k² = 27.8 m) |
| Tolerancia del circuito | 12 mm·√K | La de la app (`calcularToleranciaMm`) |

**Puntos de control** (estacas con clavo y cota fija) van:
1. al inicio y al final de la pista;
2. en cada quiebre de pendiente de la rasante;
3. y donde haga falta para que ningún tramo entre controles pase de 4 cambios
   **ni** el doble de su error esperado de ida y vuelta (2·σ·√(2n)) pase de su
   tolerancia. Un corte solo se acepta si deja bien las dos partes: con el
   mismo paso, el error y la tolerancia crecen juntos y partir no arregla
   nada; entonces el tramo queda marcado con el paso que haría falta.

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

---

## 5. Ola 2: el contrato que comparten las pantallas

Lo fija primero un solo agente («armazón»); después siete agentes llenan cada
uno su carpeta sin tocar los archivos de los demás.

### 5.1 Navegación (nombres visibles: los usan las pruebas de navegador)

- Barra superior: botones **Obra**, **Calle**, **Informes**, y a la derecha
  **Calcular** (abre la calculadora encima de cualquier pantalla), tema y archivo.
- Dentro de Obra: **Calles** (inicio: calles con el estado de sus capas, BMs,
  capas, ajustes de cada calle, subir hoja, historial) y **Plano** (plano de
  obra, visor DXF/PDF, pistas y croquis).
- Dentro de Calle: modos **Medir**, **Revisar**, **Replantear**; y tres
  pantallas de la calle: **Análisis** (espesores, volúmenes, drenaje),
  **Cierre** (cierre y compensación) y **Planificar** (cambios y puntos de
  control, con su **Guía de campo** paso a paso).
- Nada de router ni URL: estado en el almacén.

### 5.2 Estado nuevo (en `estado/almacen.ts`, lo pone el armazón)

- `espacio: 'obra' | 'calle' | 'informes'`, `subObra: 'calles' | 'plano'`,
  `modoCalle: 'medir' | 'revisar' | 'replantear'`,
  `pantallaCalle: null | 'analisis' | 'cierre' | 'planificar' | 'guia'`,
  `calculadoraAbierta: boolean`.
- `calleActivaId: Id | null` explícito (hoy se deduce de la toma activa; se
  mantienen sincronizados: activar una toma activa su calle; cambiar de calle
  activa su última toma).
- El tipo `Vista` viejo desaparece de la navegación; las vistas viejas se
  reutilizan como piezas dentro de las nuevas.

### 5.3 Modelo nuevo (en `core/src/modelo/tipos.ts`, todo opcional, con migración idempotente en `archivo/topo.ts`)

- `Proyecto.instrumento?: { largoMira: number (5 de fábrica), alturaInstrumento: 1.5, lecturaMin: 0.30, visualMax: 50, desequilibrioMax: 5, coeficienteK: 12, sigmaPorEstacionMm: 1, maxCambiosPorTramo: 4 }`
  — UNA sola fuente para la libreta, el aviso al anotar, el replanteo, la
  calculadora y el planificador (deuda de la ola 1: hoy la libreta acepta 5 m
  fijos y el replanteo 4 m).
- `Proyecto.planos?: PlanoImportado[]` = `{ id, nombre, formato: 'dxf'|'pdf', pagina?, calibracion: { metrosPorUnidad } | null, capasOcultas?: string[] }`.
  Los bytes del archivo NO van en el JSON: viven en el almacén como
  `archivosDePlano: Record<Id, Uint8Array>`, se guardan en el autoguardado y
  viajan dentro del .topo como entradas `planos/<id>.dxf|pdf` del zip.
- `Proyecto.pistas?: Pista[]` = `{ id, nombre, planoId, polilinea: {x,y}[], calleId?: Id, origen: 'croquis'|'dxf' }`.
- `Calle.notas?: Nota[]` = `{ id, progresiva, texto, fecha, foto?: string(dataURL) }`.
- `Calle.planControles?: { opciones, controles: {progresiva, cota, motivos}[] } | null` — lo que se decidió en el planificador, para dibujarlo en el plano y en la guía.

### 5.4 Acciones nuevas (las pone el armazón; las pantallas solo las llaman)

`irAEspacio`, `irASubObra`, `fijarModoCalle`, `abrirPantallaCalle(p|null)`,
`activarCalle(id)`, `abrirCalculadora(bool)`, `fijarInstrumento(parcial)`,
`agregarPlano(datos, bytes)`, `actualizarPlano`, `eliminarPlano`,
`agregarPista`, `actualizarPista`, `eliminarPista`, `crearCalleDesdePista(pistaId)`,
`agregarNota`, `eliminarNota`, `fijarPlanControles(calleId, plan|null)`.
Si una pantalla necesita algo más, lo hace en su carpeta (estado local o un
almacén propio pequeño), sin editar `almacen.ts`.

### 5.5 Archivos de cada pantalla (el armazón deja un esqueleto en cada uno)

| Agente | Carpeta | Entrada que monta el armazón |
|---|---|---|
| Obra | `vistas/obra/` | `EspacioObra.tsx` (sub Calles) |
| Calle | `vistas/calle/` | `EspacioCalle.tsx` (modos) |
| Análisis y cierre | `vistas/analisis/`, `vistas/cierre/` | `PantallaAnalisis.tsx`, `PantallaCierre.tsx` |
| Informes | `vistas/informes/` | `EspacioInformes.tsx` |
| Plano | `vistas/plano/` | `EspacioPlano.tsx` (sub Plano) |
| Planificador | `vistas/planificador/` | `PantallaPlanificar.tsx`, `PantallaGuia.tsx` |
| Herramientas | `vistas/herramientas/` | `PanelCalculadora.tsx`, `NotasDeCalle.tsx`, tema «sol» |

Reglas para todos: primero el celular (≥ 44 px por botón, se apila en
pantalla estrecha) y bien en laptop; el color nunca va solo (símbolo y texto);
nada calculado en la interfaz que ya calcule el motor; lo no comprobado se dice.
