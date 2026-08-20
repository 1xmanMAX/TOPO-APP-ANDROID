# Entrega 2B — Rasante de proyecto: plan de implementación

> **Para trabajadores agénticos:** SUB-SKILL REQUERIDA: usa
> superpowers:subagent-driven-development para implementar este plan tarea por
> tarea. Los pasos usan casillas (`- [ ]`) para el seguimiento.

**Objetivo:** que cada celda nivelada diga cuánto falta o sobra respecto al
proyecto, con semáforo por tolerancia y cuatro vistas del mismo dato.

**Arquitectura:** el cálculo de la rasante entra en `packages/core/src/rasante/`
como motor puro — geometría (dónde está la rasante) separada de evaluación
(cuánto se aparta lo medido). La interfaz consume el resultado igual que ya
consume `compararCapas`. Las vistas existentes ganan una capa de dibujo; solo el
mapa de la calle es pantalla nueva, y reutiliza `MapaGrilla`.

**Stack:** TypeScript, React 19, Vite 7, Tailwind v4, Vitest + jsdom + Testing
Library, Zustand. Sin dependencias nuevas.

**Spec:** `docs/superpowers/specs/2026-08-20-rasante-de-proyecto-design.md`

## Restricciones globales

- Español en identificadores, textos, comentarios y mensajes de commit. **Sin `ñ`
  en identificadores** (`Campania`, no `Campaña`); en textos visibles sí va la ñ.
- `packages/core` es motor puro: sin DOM, sin red, sin entrada ni salida. Nunca
  importa de `packages/app`.
- Los datos crudos (lecturas de mira) no se sobrescriben jamás; todo se deriva.
- Toda cota o diferencia que se muestre o exporte pasa por `formatearCota`
  (`packages/app/src/formato.ts`), 3 decimales con redondeo estable.
- Las diferencias se muestran **en milímetros y con signo**: `+18 mm cortar`,
  `−7 mm rellenar`.
- Convención de signos de la sección transversal: **un valor positivo baja al
  alejarse del eje; uno negativo sube**.
- Un dato calculado sobre una nivelación que no cerró se marca como **no
  comprobado**, siempre, en pantalla **y** en los archivos.
- El color nunca es el único portador de significado: cada celda lleva su valor y
  su estado en el nombre accesible, y un símbolo además del color.
- Nada de jerga de programador en textos visibles («error de validación»,
  «null», «undefined»).
- La salida de las pruebas queda **sin avisos**.
- La app funciona sin internet.

## Datos de referencia usados en todo el plan

La plantilla del proyecto de ejemplo (`packages/app/src/estado/ejemplo.ts`):

```
VER-I -5.6   SAR-I -4.4   BOR-I -4.2   EJE 0   BOR-D 4.2   SAR-D 4.4   VER-D 5.6
```

La rasante de ejemplo que usan las pruebas de todo el plan:

```
progresivaArranque      0
cotaArranque         3245.180
pendienteLongitudinal   -1.25 %

tramos (del eje hacia afuera):
  Calzada    hastaOffset 4.20   pendiente   +2.0 %
  Sardinel   hastaOffset 4.40   salto       -0.15 m
  Vereda     hastaOffset 5.60   pendiente   -1.5 %
```

**Valores calculados a mano y verificados** — son los que aparecen en las
pruebas, no los inventes de nuevo:

| | desnivel transversal |
|---|---|
| offset 0 | `0` |
| offset 4.2 | `-0.084` |
| offset 4.4 | `0.066` |
| offset 5.6 | `0.084` |
| offset 6.0 | `null` (fuera de la sección definida) |

| Progresiva | eje | BOR (±4.2) | SAR (±4.4) | VER (±5.6) |
|---|---|---|---|---|
| 0+000 | 3245.180 | 3245.096 | 3245.246 | 3245.264 |
| 0+020 | 3244.930 | 3244.846 | 3244.996 | 3245.014 |
| 0+040 | 3244.680 | 3244.596 | 3244.746 | 3244.764 |

La vereda queda 18 cm por encima del borde de calzada. Es correcto: 15 cm de
sardinel más la caída del bombeo.

## Estructura de archivos

**Motor** (`packages/core/src/`)

| Archivo | Responsabilidad |
|---|---|
| `modelo/tipos.ts` (modificar) | `Rasante`, `TramoTransversal`; `Capa` gana `espesor` y `toleranciaMm`; `Calle` gana `rasante` |
| `rasante/geometria.ts` (crear) | Dónde está la rasante: `cotaEjeRasante`, `desnivelTransversal`, `cotaRasante` |
| `rasante/espesores.ts` (crear) | `espesoresPorEncimaDe`, `cotaTeoricaDeCapa` |
| `rasante/evaluar.ts` (crear) | `evaluarContraRasante`: diferencia y estado por celda, más el resumen |
| `index.ts` (modificar) | Exporta los tres módulos nuevos |

**Interfaz** (`packages/app/src/`)

| Archivo | Responsabilidad |
|---|---|
| `archivo/topo.ts` (modificar) | Migrar capas sin `espesor`/`toleranciaMm` |
| `componentes/EditorRasante.tsx` (crear) | Formulario de rasante con dibujo del corte tipo en vivo |
| `componentes/CorteTipo.tsx` (crear) | Dibujo del corte que genera la rasante, sin datos medidos |
| `componentes/TablaDiferencias.tsx` (crear) | Tabla con semáforo e interruptor de qué mostrar |
| `componentes/MapaEstado.tsx` (crear) | El mapa de la calle coloreado por estado |
| `componentes/CorteTransversal.tsx` (modificar) | Rasante superpuesta y sombreado de corte/relleno |
| `componentes/PerfilLongitudinal.tsx` (modificar) | Recta de rasante sobre el terreno |
| `vistas/VistaCalle.tsx` (modificar) | Aloja `EditorRasante` |
| `vistas/VistaProyecto.tsx` (modificar) | Espesor y tolerancia por capa, con aviso si falta |
| `vistas/VistaResultados.tsx` (modificar) | Aloja `TablaDiferencias` y `MapaEstado` |
| `estado/derivados.ts` (modificar) | `useEvaluacionRasante` |
| `archivo/exportar.ts` (modificar) | Tabla de diferencias con su cabecera |

---

## Tarea R1: El modelo — rasante, tramos, espesor y tolerancia

**Archivos:**
- Modificar: `packages/core/src/modelo/tipos.ts`
- Test: `packages/core/src/modelo/capas.test.ts` (ampliar)

**Interfaces:**
- Produce: `Rasante`, `TramoTransversal`, `TipoTramo`; `Capa` con `espesor: number`
  y `toleranciaMm: number`; `Calle` con `rasante: Rasante | null`.

- [ ] **Paso 1: Escribir los tipos**

En `packages/core/src/modelo/tipos.ts`, junto a `Calle`:

```ts
// ---------- Rasante de proyecto ----------

export type TipoTramo = 'pendiente' | 'salto'

/**
 * Un tramo de la sección transversal, leído desde el eje hacia afuera.
 *
 * Convención de signos, y es la que hay que tener clara: un valor **positivo
 * baja** al alejarse del eje, uno **negativo sube**. Así el bombeo de la
 * calzada es `+2.0` y la vereda, que cae hacia la calzada, es `-1.5`.
 *
 * Un tramo de tipo `salto` aplica su desnivel **entero al alcanzar
 * `hastaOffset`**, no repartido: es la cara vertical del sardinel, que en la
 * plantilla ocupa los pocos centímetros que van del borde de calzada al
 * sardinel.
 */
export interface TramoTransversal {
  nombre: string
  /** Distancia desde el eje, en metros, donde termina este tramo. Siempre positiva. */
  hastaOffset: number
  tipo: TipoTramo
  /** Porcentaje si es `pendiente`; metros si es `salto`. */
  valor: number
}

export interface Rasante {
  progresivaArranque: number
  cotaArranque: number
  /** Porcentaje. Negativo = la calle baja al avanzar de progresiva. */
  pendienteLongitudinal: number
  /** Del eje hacia afuera. Vale para el lado derecho, y para el izquierdo si `simetrica`. */
  tramos: TramoTransversal[]
  simetrica: boolean
  /** Solo se usa cuando `simetrica` es false. */
  tramosIzquierda: TramoTransversal[] | null
}
```

Y en `Calle`, un campo más:

```ts
  /** Null mientras la calle no tenga proyecto cargado: la app funciona igual, sin cota teórica. */
  rasante: Rasante | null
```

En `Capa`, dos campos más:

```ts
  /** Metros de material que aporta esta capa. Cero mientras no se defina. */
  espesor: number
  /** Milímetros admitidos por encima y por debajo de la cota teórica. */
  toleranciaMm: number
```

- [ ] **Paso 2: Escribir la prueba de que las capas viejas siguen ordenándose**

En `packages/core/src/modelo/capas.test.ts`:

```ts
it('una capa con espesor y tolerancia se ordena igual que antes', () => {
  const capas: Capa[] = [
    { id: 'c2', nombre: 'BASE', orden: 1, espesor: 0.2, toleranciaMm: 10 },
    { id: 'c1', nombre: 'SUBRASANTE', orden: 0, espesor: 0.25, toleranciaMm: 20 },
  ]

  expect(ordenarCapas(capas).map((capa) => capa.nombre)).toEqual(['SUBRASANTE', 'BASE'])
})
```

- [ ] **Paso 3: Ejecutar y ver que compila**

`npm run typecheck --workspaces` va a fallar en todos los sitios que construyen
una `Capa` o una `Calle` sin los campos nuevos. **Eso es lo que se busca**: la
lista de errores es el inventario de sitios que hay que tocar.

- [ ] **Paso 4: Rellenar los campos donde haga falta**

Recorre los errores y añade los campos. En el proyecto de ejemplo
(`packages/app/src/estado/ejemplo.ts`) pon espesores y tolerancias reales, que se
usarán en las pruebas de todo el plan:

```ts
{ id: 'cap-terreno', nombre: 'TERRENO EXISTENTE', orden: 0, espesor: 0, toleranciaMm: 20 },
{ id: 'cap-subrasante', nombre: 'SUBRASANTE', orden: 1, espesor: 0.25, toleranciaMm: 20 },
```

Y en la calle del ejemplo, `rasante: null` — el ejemplo arranca sin proyecto
cargado, para que la app siga viéndose como hoy hasta que se defina una.

- [ ] **Paso 5: Ejecutar la batería completa**

Run: `npm test` y `npm run typecheck --workspaces`
Esperado: todo en verde, sin avisos.

- [ ] **Paso 6: Commit**

```bash
git add -A
git commit -m "Modela la rasante de proyecto y el espesor por capa"
```

---

## Tarea R2: Geometría — dónde está la rasante

**Archivos:**
- Crear: `packages/core/src/rasante/geometria.ts`
- Test: `packages/core/src/rasante/geometria.test.ts`
- Modificar: `packages/core/src/index.ts`

**Interfaces:**
- Consume: `Rasante`, `TramoTransversal` de la Tarea R1.
- Produce:
  - `cotaEjeRasante(rasante: Rasante, progresiva: number): number`
  - `desnivelTransversal(rasante: Rasante, offset: number): number | null`
  - `cotaRasante(rasante: Rasante, progresiva: number, offset: number): number | null`

- [ ] **Paso 1: Escribir las pruebas que fallan**

Crea `packages/core/src/rasante/geometria.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { Rasante } from '../modelo/tipos'
import { cotaEjeRasante, cotaRasante, desnivelTransversal } from './geometria'

function rasanteEjemplo(): Rasante {
  return {
    progresivaArranque: 0,
    cotaArranque: 3245.18,
    pendienteLongitudinal: -1.25,
    tramos: [
      { nombre: 'Calzada', hastaOffset: 4.2, tipo: 'pendiente', valor: 2 },
      { nombre: 'Sardinel', hastaOffset: 4.4, tipo: 'salto', valor: -0.15 },
      { nombre: 'Vereda', hastaOffset: 5.6, tipo: 'pendiente', valor: -1.5 },
    ],
    simetrica: true,
    tramosIzquierda: null,
  }
}

describe('cotaEjeRasante', () => {
  it('baja según la pendiente al avanzar de progresiva', () => {
    const rasante = rasanteEjemplo()

    expect(cotaEjeRasante(rasante, 0)).toBe(3245.18)
    expect(cotaEjeRasante(rasante, 20)).toBe(3244.93)
    expect(cotaEjeRasante(rasante, 40)).toBe(3244.68)
  })

  it('una pendiente de cero deja la calle a nivel, y no es un error', () => {
    const rasante = { ...rasanteEjemplo(), pendienteLongitudinal: 0 }

    expect(cotaEjeRasante(rasante, 120)).toBe(3245.18)
  })

  it('una progresiva anterior al arranque sube', () => {
    const rasante = rasanteEjemplo()

    expect(cotaEjeRasante(rasante, -20)).toBe(3245.43)
  })
})

describe('desnivelTransversal', () => {
  it('en el eje no hay desnivel', () => {
    expect(desnivelTransversal(rasanteEjemplo(), 0)).toBe(0)
  })

  it('el bombeo de la calzada baja hacia el borde', () => {
    // 4.2 m al 2 % = 84 mm por debajo del eje
    expect(desnivelTransversal(rasanteEjemplo(), 4.2)).toBe(-0.084)
  })

  it('el sardinel sube de golpe sus 15 cm', () => {
    // -0.084 del bombeo, más los 0.15 del salto
    expect(desnivelTransversal(rasanteEjemplo(), 4.4)).toBe(0.066)
  })

  it('la vereda sigue subiendo al alejarse, porque cae hacia la calzada', () => {
    // 0.066 + 1.2 m al 1.5 % = 0.066 + 0.018
    expect(desnivelTransversal(rasanteEjemplo(), 5.6)).toBe(0.084)
  })

  it('el lado izquierdo es espejo del derecho cuando la rasante es simétrica', () => {
    const rasante = rasanteEjemplo()

    expect(desnivelTransversal(rasante, -4.2)).toBe(desnivelTransversal(rasante, 4.2))
    expect(desnivelTransversal(rasante, -5.6)).toBe(desnivelTransversal(rasante, 5.6))
  })

  it('más allá del último tramo no hay rasante, y no se inventa', () => {
    expect(desnivelTransversal(rasanteEjemplo(), 6)).toBeNull()
    expect(desnivelTransversal(rasanteEjemplo(), -6)).toBeNull()
  })

  it('con la rasante no simétrica, cada lado usa sus tramos', () => {
    const rasante: Rasante = {
      ...rasanteEjemplo(),
      simetrica: false,
      tramosIzquierda: [{ nombre: 'Berma', hastaOffset: 3, tipo: 'pendiente', valor: 4 }],
    }

    expect(desnivelTransversal(rasante, 3)).toBe(-0.06)
    expect(desnivelTransversal(rasante, -3)).toBe(-0.12)
  })
})

describe('cotaRasante', () => {
  it('junta la pendiente longitudinal con el desnivel transversal', () => {
    const rasante = rasanteEjemplo()

    expect(cotaRasante(rasante, 0, 0)).toBe(3245.18)
    expect(cotaRasante(rasante, 0, 4.2)).toBe(3245.096)
    expect(cotaRasante(rasante, 0, 4.4)).toBe(3245.246)
    expect(cotaRasante(rasante, 0, 5.6)).toBe(3245.264)
    expect(cotaRasante(rasante, 20, -4.2)).toBe(3244.846)
    expect(cotaRasante(rasante, 40, 5.6)).toBe(3244.764)
  })

  it('la vereda queda por encima del borde de calzada, que es lo que hace el sardinel', () => {
    const rasante = rasanteEjemplo()
    const vereda = cotaRasante(rasante, 0, 5.6)!
    const borde = cotaRasante(rasante, 0, 4.2)!

    expect(vereda - borde).toBeCloseTo(0.168, 3)
  })

  it('sin rasante en ese offset, no hay cota', () => {
    expect(cotaRasante(rasanteEjemplo(), 0, 7)).toBeNull()
  })
})
```

- [ ] **Paso 2: Ejecutar y ver que falla**

Run: `npm test --workspace packages/core`
Esperado: FALLA, no encuentra `./geometria`.

- [ ] **Paso 3: Escribir la implementación**

Crea `packages/core/src/rasante/geometria.ts`:

```ts
import type { Rasante, TramoTransversal } from '../modelo/tipos'
import { redondear3 } from '../numero'

/** Cota de la rasante en el eje de la calle, a esa progresiva. */
export function cotaEjeRasante(rasante: Rasante, progresiva: number): number {
  const avance = progresiva - rasante.progresivaArranque
  return redondear3(rasante.cotaArranque + (avance * rasante.pendienteLongitudinal) / 100)
}

function tramosDelLado(rasante: Rasante, offset: number): TramoTransversal[] {
  if (offset < 0 && !rasante.simetrica && rasante.tramosIzquierda !== null) {
    return rasante.tramosIzquierda
  }
  return rasante.tramos
}

/**
 * Cuánto sube o baja la rasante desde el eje hasta ese offset.
 *
 * Devuelve `null` si el offset cae más allá del último tramo: el proyecto no
 * define rasante ahí, y prolongar la última pendiente sería inventarse una
 * cota que nadie proyectó. Quien llame lo trata como «esta celda queda fuera
 * de la sección definida», no como un cero.
 */
export function desnivelTransversal(rasante: Rasante, offset: number): number | null {
  const tramos = tramosDelLado(rasante, offset)
  if (tramos.length === 0) return null

  const distancia = Math.abs(offset)
  const ultimo = tramos[tramos.length - 1]!
  if (distancia > ultimo.hastaOffset) return null

  let desnivel = 0
  let anterior = 0

  for (const tramo of tramos) {
    if (distancia <= anterior) break

    if (tramo.tipo === 'salto') {
      // El salto entra entero al alcanzar el tramo, no repartido: es la cara
      // vertical del sardinel.
      if (distancia >= tramo.hastaOffset) desnivel -= tramo.valor
    } else {
      const recorrido = Math.min(distancia, tramo.hastaOffset) - anterior
      desnivel -= (recorrido * tramo.valor) / 100
    }

    anterior = tramo.hastaOffset
  }

  return redondear3(desnivel)
}

/** Cota que el proyecto pide en ese punto de la calle. Null si cae fuera de la sección. */
export function cotaRasante(
  rasante: Rasante,
  progresiva: number,
  offset: number,
): number | null {
  const desnivel = desnivelTransversal(rasante, offset)
  if (desnivel === null) return null

  return redondear3(cotaEjeRasante(rasante, progresiva) + desnivel)
}
```

- [ ] **Paso 4: Exportarlo**

En `packages/core/src/index.ts`, añade:

```ts
export * from './rasante/geometria'
```

- [ ] **Paso 5: Ejecutar y ver que pasa**

Run: `npm test --workspace packages/core`
Esperado: PASA, sin avisos.

- [ ] **Paso 6: Commit**

```bash
git add -A
git commit -m "Calcula dónde está la rasante en cada punto de la calle"
```

---

## Tarea R3: Espesores por capa y evaluación contra la rasante

**Archivos:**
- Crear: `packages/core/src/rasante/espesores.ts`
- Crear: `packages/core/src/rasante/evaluar.ts`
- Test: `packages/core/src/rasante/espesores.test.ts`
- Test: `packages/core/src/rasante/evaluar.test.ts`
- Modificar: `packages/core/src/index.ts`

**Interfaces:**
- Consume: `cotaRasante` de R2; `ResultadoCampania` y `CotaCelda` de
  `nivelacion/calcularCampania`; `construirGrilla` de `grilla/grilla`.
- Produce:
  - `espesoresPorEncimaDe(capas: Capa[], capaId: Id): number`
  - `cotaTeoricaDeCapa(rasante, capas, capaId, progresiva, offset): number | null`
  - `type EstadoTolerancia = 'conforme' | 'alLimite' | 'fuera' | 'sinRasante'`
  - `estadoDeDiferencia(diferenciaMm: number, toleranciaMm: number): EstadoTolerancia`
  - `evaluarContraRasante(entrada: EntradaEvaluacion): ResultadoEvaluacion`

- [ ] **Paso 1: Escribir las pruebas de espesores**

Crea `packages/core/src/rasante/espesores.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { Capa, Rasante } from '../modelo/tipos'
import { cotaTeoricaDeCapa, espesoresPorEncimaDe } from './espesores'

function capas(): Capa[] {
  return [
    { id: 'terreno', nombre: 'TERRENO EXISTENTE', orden: 0, espesor: 0, toleranciaMm: 20 },
    { id: 'subrasante', nombre: 'SUBRASANTE', orden: 1, espesor: 0.25, toleranciaMm: 20 },
    { id: 'base', nombre: 'BASE', orden: 2, espesor: 0.2, toleranciaMm: 10 },
    { id: 'carpeta', nombre: 'CARPETA', orden: 3, espesor: 0.05, toleranciaMm: 5 },
  ]
}

function rasante(): Rasante {
  return {
    progresivaArranque: 0,
    cotaArranque: 3245.18,
    pendienteLongitudinal: -1.25,
    tramos: [{ nombre: 'Calzada', hastaOffset: 4.2, tipo: 'pendiente', valor: 2 }],
    simetrica: true,
    tramosIzquierda: null,
  }
}

describe('espesoresPorEncimaDe', () => {
  it('la capa de más arriba no tiene nada encima', () => {
    expect(espesoresPorEncimaDe(capas(), 'carpeta')).toBe(0)
  })

  it('suma solo las capas de orden mayor', () => {
    expect(espesoresPorEncimaDe(capas(), 'base')).toBe(0.05)
    expect(espesoresPorEncimaDe(capas(), 'subrasante')).toBe(0.25)
    expect(espesoresPorEncimaDe(capas(), 'terreno')).toBe(0.5)
  })

  it('una capa que no está en el paquete no suma nada', () => {
    expect(espesoresPorEncimaDe(capas(), 'inventada')).toBe(0)
  })
})

describe('cotaTeoricaDeCapa', () => {
  it('la carpeta terminada coincide con la rasante', () => {
    expect(cotaTeoricaDeCapa(rasante(), capas(), 'carpeta', 0, 0)).toBe(3245.18)
  })

  it('cada capa de debajo baja lo que suman las de encima', () => {
    expect(cotaTeoricaDeCapa(rasante(), capas(), 'base', 0, 0)).toBe(3245.13)
    expect(cotaTeoricaDeCapa(rasante(), capas(), 'subrasante', 0, 0)).toBe(3244.93)
    expect(cotaTeoricaDeCapa(rasante(), capas(), 'terreno', 0, 0)).toBe(3244.68)
  })

  it('el bombeo se conserva en las capas de abajo', () => {
    // 3245.13 de la base en el eje, menos los 84 mm del bombeo
    expect(cotaTeoricaDeCapa(rasante(), capas(), 'base', 0, 4.2)).toBe(3245.046)
  })

  it('fuera de la sección definida no hay cota teórica', () => {
    expect(cotaTeoricaDeCapa(rasante(), capas(), 'base', 0, 9)).toBeNull()
  })
})
```

- [ ] **Paso 2: Ejecutar y ver que falla**

Run: `npm test --workspace packages/core`
Esperado: FALLA, no encuentra `./espesores`.

- [ ] **Paso 3: Escribir espesores.ts**

```ts
import type { Capa, Id, Rasante } from '../modelo/tipos'
import { redondear3 } from '../numero'
import { cotaRasante } from './geometria'

/**
 * Cuánto material va por encima de esta capa. La rasante describe la
 * superficie terminada, así que la cota teórica de cualquier capa de debajo se
 * obtiene restando lo que se le va a poner encima.
 */
export function espesoresPorEncimaDe(capas: Capa[], capaId: Id): number {
  const capa = capas.find((c) => c.id === capaId)
  if (!capa) return 0

  const suma = capas
    .filter((c) => c.orden > capa.orden)
    .reduce((total, c) => total + c.espesor, 0)

  return redondear3(suma)
}

/** Cota que el proyecto pide para ESTA capa en ese punto. Null si cae fuera de la sección. */
export function cotaTeoricaDeCapa(
  rasante: Rasante,
  capas: Capa[],
  capaId: Id,
  progresiva: number,
  offset: number,
): number | null {
  const cota = cotaRasante(rasante, progresiva, offset)
  if (cota === null) return null

  return redondear3(cota - espesoresPorEncimaDe(capas, capaId))
}
```

- [ ] **Paso 4: Escribir las pruebas de evaluación**

Crea `packages/core/src/rasante/evaluar.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { estadoDeDiferencia } from './evaluar'

describe('estadoDeDiferencia', () => {
  it('dentro de la tolerancia está conforme', () => {
    expect(estadoDeDiferencia(0, 10)).toBe('conforme')
    expect(estadoDeDiferencia(7, 10)).toBe('conforme')
    expect(estadoDeDiferencia(-7, 10)).toBe('conforme')
  })

  it('justo en la tolerancia todavía está conforme', () => {
    expect(estadoDeDiferencia(10, 10)).toBe('conforme')
    expect(estadoDeDiferencia(-10, 10)).toBe('conforme')
  })

  it('entre la tolerancia y su doble está al límite', () => {
    expect(estadoDeDiferencia(11, 10)).toBe('alLimite')
    expect(estadoDeDiferencia(-18, 10)).toBe('alLimite')
  })

  it('justo en el doble todavía está al límite', () => {
    expect(estadoDeDiferencia(20, 10)).toBe('alLimite')
    expect(estadoDeDiferencia(-20, 10)).toBe('alLimite')
  })

  it('pasado el doble está fuera', () => {
    expect(estadoDeDiferencia(21, 10)).toBe('fuera')
    expect(estadoDeDiferencia(-45, 10)).toBe('fuera')
  })

  it('con tolerancia cero, cualquier diferencia está fuera y el cero exacto es conforme', () => {
    expect(estadoDeDiferencia(0, 0)).toBe('conforme')
    expect(estadoDeDiferencia(1, 0)).toBe('fuera')
  })
})
```

- [ ] **Paso 5: Escribir evaluar.ts**

```ts
import { claveCelda, construirGrilla, type CeldaGrilla } from '../grilla/grilla'
import type { Calle, Capa, Id, Plantilla, Rasante } from '../modelo/tipos'
import type { ResultadoCampania } from '../nivelacion/calcularCampania'
import { aMilimetros, redondear3 } from '../numero'
import { cotaTeoricaDeCapa } from './espesores'

export type EstadoTolerancia = 'conforme' | 'alLimite' | 'fuera' | 'sinRasante'

export interface CeldaEvaluada {
  clave: string
  progresiva: number
  elementoClave: string
  offset: number
  cotaReal: number | null
  cotaTeorica: number | null
  /** Real menos teórica, en milímetros. Positiva = sobra material, hay que cortar. */
  diferenciaMm: number | null
  estado: EstadoTolerancia
}

export interface ResultadoEvaluacion {
  celdas: Map<string, CeldaEvaluada>
  conformes: number
  alLimite: number
  fuera: number
  /** Medidas, pero en un punto donde el proyecto no define rasante. */
  fueraDeSeccion: number
  /** Sin medir todavía. */
  sinMedir: number
}

export interface EntradaEvaluacion {
  resultado: ResultadoCampania
  calle: Calle
  plantilla: Plantilla
  rasante: Rasante
  capas: Capa[]
  capaId: Id
}

/**
 * Compara lo medido contra lo que pide el proyecto, celda por celda.
 *
 * Ojo con lo que NO hace: no mira si el circuito cerró. Un semáforo verde sobre
 * una nivelación sin comprobar sigue siendo una cota sin comprobar, y decirlo es
 * responsabilidad de quien muestra o exporta esto — igual que ya pasa con las
 * cotas y con los espesores.
 */
export function evaluarContraRasante(entrada: EntradaEvaluacion): ResultadoEvaluacion {
  const { resultado, calle, plantilla, rasante, capas, capaId } = entrada

  let grilla: CeldaGrilla[] = []
  try {
    grilla = construirGrilla(calle, plantilla)
  } catch {
    grilla = []
  }

  const toleranciaMm = capas.find((capa) => capa.id === capaId)?.toleranciaMm ?? 0
  const celdas = new Map<string, CeldaEvaluada>()
  let conformes = 0
  let alLimite = 0
  let fuera = 0
  let fueraDeSeccion = 0
  let sinMedir = 0

  for (const celda of grilla) {
    const clave = claveCelda(celda.progresiva, celda.elementoClave)
    const medida = resultado.cotasPorCelda.get(clave)
    const cotaReal = medida ? medida.cota : null
    const cotaTeorica = cotaTeoricaDeCapa(
      rasante,
      capas,
      capaId,
      celda.progresiva,
      celda.offset,
    )

    let diferenciaMm: number | null = null
    let estado: EstadoTolerancia = 'sinRasante'

    if (cotaTeorica === null) {
      if (cotaReal !== null) fueraDeSeccion += 1
    } else if (cotaReal === null) {
      sinMedir += 1
    } else {
      // A milímetros enteros: la mira se lee al milímetro, y sin redondear
      // aquí `aMilimetros(-0.302)` devuelve -302.00000000000006, que acabaría
      // en pantalla y en el Excel.
      diferenciaMm = Math.round(aMilimetros(redondear3(cotaReal - cotaTeorica)))
      estado = estadoDeDiferencia(diferenciaMm, toleranciaMm)
      if (estado === 'conforme') conformes += 1
      else if (estado === 'alLimite') alLimite += 1
      else fuera += 1
    }

    celdas.set(clave, {
      clave,
      progresiva: celda.progresiva,
      elementoClave: celda.elementoClave,
      offset: celda.offset,
      cotaReal,
      cotaTeorica,
      diferenciaMm,
      estado,
    })
  }

  return { celdas, conformes, alLimite, fuera, fueraDeSeccion, sinMedir }
}

/**
 * Verde hasta la tolerancia, ámbar hasta su doble, rojo pasado eso. Los bordes
 * exactos caen del lado bueno: una diferencia igual a la tolerancia está
 * conforme, no al límite.
 */
export function estadoDeDiferencia(
  diferenciaMm: number,
  toleranciaMm: number,
): EstadoTolerancia {
  const magnitud = Math.abs(diferenciaMm)
  if (magnitud <= toleranciaMm) return 'conforme'
  if (magnitud <= toleranciaMm * 2) return 'alLimite'
  return 'fuera'
}
```

- [ ] **Paso 6: Exportar los dos módulos**

En `packages/core/src/index.ts`:

```ts
export * from './rasante/espesores'
export * from './rasante/evaluar'
```

- [ ] **Paso 7: Ejecutar la batería**

Run: `npm test` y `npm run typecheck --workspaces`
Esperado: todo en verde, sin avisos.

- [ ] **Paso 8: Commit**

```bash
git add -A
git commit -m "Evalúa lo medido contra la rasante, con semáforo por tolerancia"
```

---

## Tarea R4: Migrar los archivos guardados antes de esta entrega

**Archivos:**
- Modificar: `packages/app/src/archivo/topo.ts`
- Test: `packages/app/src/archivo/topo.test.ts`

**Interfaces:**
- Consume: `Capa` y `Calle` con los campos nuevos, de R1.
- Produce: `desempaquetarProyecto` deja usables los archivos viejos.

- [ ] **Paso 1: Escribir las pruebas que fallan**

En `packages/app/src/archivo/topo.test.ts`:

```ts
it('un proyecto guardado antes de la 2B sale con espesor cero y tolerancia por defecto', () => {
  const original = proyectoEjemplo()
  const viejo = {
    ...original,
    capas: original.capas.map(({ espesor: _e, toleranciaMm: _t, ...resto }) => resto),
  } as never

  const recuperado = desempaquetarProyecto(empaquetarProyecto(viejo))

  expect(recuperado.capas.every((capa) => capa.espesor === 0)).toBe(true)
  expect(recuperado.capas.every((capa) => capa.toleranciaMm > 0)).toBe(true)
})

it('un proyecto guardado antes de la 2B sale con las calles sin rasante', () => {
  const original = proyectoEjemplo()
  const viejo = {
    ...original,
    calles: original.calles.map(({ rasante: _r, ...resto }) => resto),
  } as never

  const recuperado = desempaquetarProyecto(empaquetarProyecto(viejo))

  expect(recuperado.calles.every((calle) => calle.rasante === null)).toBe(true)
})

it('un proyecto que ya trae espesores no se toca', () => {
  const original = proyectoEjemplo()
  original.capas[1]!.espesor = 0.25

  const recuperado = desempaquetarProyecto(empaquetarProyecto(original))

  expect(recuperado.capas[1]!.espesor).toBe(0.25)
})
```

- [ ] **Paso 2: Ejecutar y ver que falla**

Run: `npm test --workspace packages/app -- topo`
Esperado: FALLA, las capas salen con `espesor` indefinido.

- [ ] **Paso 3: Ampliar la migración**

En `packages/app/src/archivo/topo.ts`, junto a `migrarCapasSinOrden`:

```ts
/** Tolerancia de partida para una capa que viene de un archivo anterior a la 2B. */
const TOLERANCIA_POR_DEFECTO_MM = 20

/**
 * `espesor` y `toleranciaMm` son nuevos en la Entrega 2B, y `rasante` en la
 * calle también. Un archivo anterior no los trae.
 *
 * El espesor arranca en cero **a propósito**: inventar uno sería peor que no
 * tenerlo, porque la cota teórica de todas las capas de debajo saldría movida
 * sin que nadie lo hubiera decidido. La pantalla de Proyecto avisa de las capas
 * que están así.
 */
function migrarCamposDe2B(proyecto: Proyecto): Proyecto {
  return {
    ...proyecto,
    capas: proyecto.capas.map((capa) => ({
      ...capa,
      espesor: typeof capa.espesor === 'number' ? capa.espesor : 0,
      toleranciaMm:
        typeof capa.toleranciaMm === 'number' ? capa.toleranciaMm : TOLERANCIA_POR_DEFECTO_MM,
    })),
    calles: proyecto.calles.map((calle) => ({
      ...calle,
      rasante: calle.rasante ?? null,
    })),
  }
}
```

Y encadénala donde hoy se llama a la migración de capas:

```ts
  return migrarCamposDe2B(migrarCapasSinOrden(proyecto))
```

- [ ] **Paso 4: Ejecutar y ver que pasa**

Run: `npm test --workspace packages/app -- topo`
Esperado: PASA.

- [ ] **Paso 5: Commit**

```bash
git add -A
git commit -m "Deja usables los archivos guardados antes de la rasante"
```

---

## Tarea R5: Espesor y tolerancia por capa en la pantalla de Proyecto

**Archivos:**
- Modificar: `packages/app/src/vistas/VistaProyecto.tsx`
- Modificar: `packages/app/src/estado/almacen.ts`
- Test: `packages/app/src/vistas/VistaProyecto.test.tsx`

**Interfaces:**
- Consume: `Capa` con `espesor` y `toleranciaMm`.
- Produce: acción de almacén `actualizarCapa(id: Id, cambios: Partial<Omit<Capa, 'id'>>): void`.

- [ ] **Paso 1: Escribir las pruebas que fallan**

En `packages/app/src/vistas/VistaProyecto.test.tsx`:

```ts
it('se puede escribir el espesor de una capa y queda guardado', async () => {
  render(<VistaProyecto />)

  const campo = screen.getByLabelText('Espesor de SUBRASANTE')
  await userEvent.clear(campo)
  await userEvent.type(campo, '0.25')
  fireEvent.blur(campo)

  const capa = useAlmacen.getState().proyecto.capas.find((c) => c.nombre === 'SUBRASANTE')
  expect(capa!.espesor).toBe(0.25)
})

it('avisa de las capas que todavía no tienen espesor, diciendo cuáles', () => {
  render(<VistaProyecto />)

  expect(screen.getByText(/sin espesor definido/i)).toBeInTheDocument()
  expect(screen.getByText(/SUBRASANTE/)).toBeInTheDocument()
})

it('cuando todas las capas tienen espesor, no queda ningún aviso', () => {
  const proyecto = useAlmacen.getState().proyecto
  useAlmacen.getState().cargarProyecto({
    ...proyecto,
    capas: proyecto.capas.map((capa) => ({ ...capa, espesor: capa.orden === 0 ? 0 : 0.2 })),
  })

  render(<VistaProyecto />)

  expect(screen.queryByText(/sin espesor definido/i)).toBeNull()
})
```

**Ojo con la tercera prueba:** la capa de terreno existente tiene espesor cero de
forma legítima — es el punto de partida, no aporta material. El aviso solo debe
contar las capas con `orden > 0`.

- [ ] **Paso 2: Ejecutar y ver que falla**

Run: `npm test --workspace packages/app -- VistaProyecto`
Esperado: FALLA, no encuentra el campo.

- [ ] **Paso 3: Añadir la acción al almacén**

En `packages/app/src/estado/almacen.ts`, junto a `agregarCapa`:

```ts
  actualizarCapa: (id, cambios) =>
    set((s) => ({
      proyecto: marcarModificado({
        ...s.proyecto,
        capas: s.proyecto.capas.map((capa) => (capa.id === id ? { ...capa, ...cambios } : capa)),
      }),
    })),
```

Declara `actualizarCapa(id: Id, cambios: Partial<Omit<Capa, 'id'>>): void` en la
interfaz del estado, junto a las demás acciones de capas.

- [ ] **Paso 4: Añadir los campos a la pantalla**

En la fila de cada capa de `VistaProyecto.tsx`, junto al nombre, dos
`CampoNumero` (el componente ya existe en `componentes/CampoNumero.tsx` y maneja
bien el punto decimal, que fue un defecto real de la Entrega 1):

- `ariaLabel={`Espesor de ${capa.nombre}`}`, en metros, 3 decimales.
- `ariaLabel={`Tolerancia de ${capa.nombre}`}`, en milímetros, sin decimales.

Debajo de la lista, el aviso. Cuenta solo las capas con `orden > 0` y espesor
cero, y **nómbralas**:

```tsx
{capasSinEspesor.length > 0 && (
  <p className="rounded border border-aviso bg-aviso/10 p-2 text-sm text-aviso">
    Hay capas sin espesor definido: {capasSinEspesor.map((c) => c.nombre).join(', ')}.
    Sin su espesor, la cota que el proyecto pide para las capas de debajo sale movida.
  </p>
)}
```

Junto al campo de tolerancia, deja escrita la fuente de los valores de norma para
que se puedan poner con criterio: base granular ±10 mm (MTC EG-2013), carpeta de
rodadura 5 mm (RNE CE.010).

- [ ] **Paso 5: Ejecutar y ver que pasa**

Run: `npm test --workspace packages/app -- VistaProyecto`
Esperado: PASA.

- [ ] **Paso 6: Commit**

```bash
git add -A
git commit -m "Define el espesor y la tolerancia de cada capa"
```

---

## Tarea R6: El editor de rasante, con el corte tipo dibujándose en vivo

**Archivos:**
- Crear: `packages/app/src/componentes/CorteTipo.tsx`
- Crear: `packages/app/src/componentes/EditorRasante.tsx`
- Modificar: `packages/app/src/vistas/VistaCalle.tsx`
- Modificar: `packages/app/src/estado/almacen.ts`
- Test: `packages/app/src/componentes/EditorRasante.test.tsx`
- Test: `packages/app/src/componentes/CorteTipo.test.tsx`

**Interfaces:**
- Consume: `Rasante`, `TramoTransversal`, `cotaEjeRasante`, `desnivelTransversal`.
- Produce: acción `fijarRasante(calleId: Id, rasante: Rasante | null): void`;
  componente `CorteTipo` con props `{ rasante: Rasante; anchoMaximo?: number }`.

- [ ] **Paso 1: Escribir las pruebas que fallan**

En `packages/app/src/componentes/EditorRasante.test.tsx`:

```ts
it('muestra en vivo la cota al final del tramo, para comprobar el signo', async () => {
  // Calle de 0+000 a 0+140. Con -1.25 %, la cota baja 1.750 m en 140 m.
  render(<EditorRasante calleId="c-1" />)

  await userEvent.click(screen.getByRole('button', { name: /definir la rasante/i }))

  const cota = screen.getByLabelText('Cota de arranque')
  await userEvent.clear(cota)
  await userEvent.type(cota, '3245.180')
  fireEvent.blur(cota)

  const pendiente = screen.getByLabelText('Pendiente longitudinal')
  await userEvent.clear(pendiente)
  await userEvent.type(pendiente, '-1.25')
  fireEvent.blur(pendiente)

  expect(screen.getByText(/3243\.430/)).toBeInTheDocument()
})

it('un tramo que retrocede se rechaza con un mensaje que se entiende', async () => {
  render(<EditorRasante calleId="c-1" />)
  await userEvent.click(screen.getByRole('button', { name: /definir la rasante/i }))
  await userEvent.click(screen.getByRole('button', { name: /añadir tramo/i }))

  const hasta = screen.getAllByLabelText(/Hasta el metro/).at(-1)!
  await userEvent.clear(hasta)
  await userEvent.type(hasta, '1')
  fireEvent.blur(hasta)

  expect(screen.getByText(/del eje hacia afuera/i)).toBeInTheDocument()
})

it('la rasante escrita queda guardada en la calle', async () => {
  render(<EditorRasante calleId="c-1" />)
  await userEvent.click(screen.getByRole('button', { name: /definir la rasante/i }))

  const cota = screen.getByLabelText('Cota de arranque')
  await userEvent.clear(cota)
  await userEvent.type(cota, '3245.180')
  fireEvent.blur(cota)

  const calle = useAlmacen.getState().proyecto.calles.find((c) => c.id === 'c-1')
  expect(calle!.rasante!.cotaArranque).toBe(3245.18)
})
```

En `packages/app/src/componentes/CorteTipo.test.tsx`:

```ts
it('dibuja un punto por cada quiebre de la sección, a los dos lados', () => {
  render(<CorteTipo rasante={rasanteEjemplo()} />)

  // eje + 3 quiebres por lado
  expect(screen.getAllByLabelText(/^Quiebre a /)).toHaveLength(7)
})

it('el nombre de cada quiebre dice a qué distancia y a qué cota queda', () => {
  render(<CorteTipo rasante={rasanteEjemplo()} />)

  expect(screen.getByLabelText('Quiebre a 4.40 m del eje: sube 0.066 m sobre el eje')).toBeInTheDocument()
  expect(screen.getByLabelText('Quiebre a 4.20 m del eje: baja 0.084 m bajo el eje')).toBeInTheDocument()
})
```

- [ ] **Paso 2: Ejecutar y ver que falla**

Run: `npm test --workspace packages/app -- Rasante CorteTipo`
Esperado: FALLA, no existen los componentes.

- [ ] **Paso 3: Escribir CorteTipo**

Dibuja la sección que genera la rasante, sin datos medidos. Usa `MarcoGrafico`
(`componentes/MarcoGrafico.tsx`), que ya resuelve ejes, marcas y rejilla y se
comparte con el corte transversal y el perfil.

Los puntos son los quiebres: offset 0 y el `hastaOffset` de cada tramo, a los dos
lados, con el desnivel que devuelve `desnivelTransversal`. Une los puntos con una
polilínea. Cada punto lleva su nombre accesible con la distancia y el desnivel,
como fijan las pruebas.

Un tramo de tipo `salto` produce **dos puntos en el mismo offset**: el de antes
del salto y el de después. Es lo que dibuja la cara vertical del sardinel.

- [ ] **Paso 4: Escribir EditorRasante**

Un bloque plegado mientras la calle no tenga rasante, con el botón «Definir la
rasante de esta calle». Al abrirlo:

- `CampoNumero` para progresiva de arranque, cota de arranque y pendiente
  longitudinal, con `ariaLabel` exactamente `Progresiva de arranque`, `Cota de
  arranque` y `Pendiente longitudinal`.
- Debajo de la pendiente, en vivo: `Al final del tramo (0+140): 3243.430`,
  calculado con `cotaEjeRasante(rasante, calle.progresivaFin)`. Es la comprobación
  de que el signo es el correcto.
- Tabla de tramos: nombre, `Hasta el metro N` (el `ariaLabel` lleva el índice para
  que no se repitan), tipo (pendiente o salto) y valor. Botones de añadir, quitar
  y reordenar.
- Casilla `Los dos lados son iguales`, marcada por defecto.
- `CorteTipo` al lado, actualizándose con cada cambio.

Si un `hastaOffset` no es mayor que el del tramo anterior, muéstralo así y **no
guardes ese valor**:

> Los tramos van del eje hacia afuera: este tiene que llegar más lejos que el anterior.

Y un aviso más, que **no bloquea** porque puede ser intencional: si la sección
deja el extremo de la vereda **por debajo** del borde de calzada, dilo. Suele
significar que el signo del sardinel está al revés.

```tsx
{veredaBajoCalzada && (
  <p className="text-sm text-aviso">
    Con estos valores la vereda queda por debajo del borde de la calzada.
    Comprueba el signo del sardinel: un valor negativo sube.
  </p>
)}
```

Su prueba:

```ts
it('avisa si la vereda queda por debajo de la calzada, sin impedir guardarlo', async () => {
  render(<EditorRasante calleId="c-1" />)
  await userEvent.click(screen.getByRole('button', { name: /definir la rasante/i }))
  await escribirSardinelAlReves()

  expect(screen.getByText(/la vereda queda por debajo/i)).toBeInTheDocument()
  expect(useAlmacen.getState().proyecto.calles[0]!.rasante).not.toBeNull()
})
```

- [ ] **Paso 5: Añadir la acción al almacén y colgar el editor de VistaCalle**

```ts
  fijarRasante: (calleId, rasante) =>
    set((s) => ({
      proyecto: marcarModificado({
        ...s.proyecto,
        calles: s.proyecto.calles.map((calle) =>
          calle.id === calleId ? { ...calle, rasante } : calle,
        ),
      }),
    })),
```

- [ ] **Paso 6: Ejecutar la batería**

Run: `npm test` y `npm run typecheck --workspaces`
Esperado: todo en verde, sin avisos.

- [ ] **Paso 7: Commit**

```bash
git add -A
git commit -m "Define la rasante de la calle viendo el corte tipo al escribir"
```

---

## Tarea R7: La evaluación disponible para las vistas

**Archivos:**
- Modificar: `packages/app/src/estado/derivados.ts`
- Test: `packages/app/src/estado/derivados.test.ts`

**Interfaces:**
- Consume: `evaluarContraRasante` de R3.
- Produce: `useEvaluacionRasante(campaniaId?: Id): ResultadoEvaluacion | null`.

- [ ] **Paso 1: Escribir la prueba que falla**

```ts
it('sin rasante en la calle no hay evaluación, y eso no es un fallo', () => {
  const { result } = renderHook(() => useEvaluacionRasante())

  expect(result.current).toBeNull()
})

it('con rasante definida, evalúa la campaña activa contra su capa', () => {
  fijarRasanteDeEjemplo()

  const { result } = renderHook(() => useEvaluacionRasante())

  const celda = result.current!.celdas.get('0|EJE')!
  expect(celda.cotaTeorica).toBe(3244.93)
  expect(celda.diferenciaMm).toBe(-302)
  expect(celda.estado).toBe('fuera')
})
```

**El número sale así:** la subrasante del ejemplo mide 3244.628 en `0+000 EJE`. La
rasante da 3245.180 en el eje, menos 0.25 de espesor de las capas de encima =
3244.930. La diferencia es −0.302 m, o sea −302 mm: falta material. Comprueba
estos valores contra el proyecto de ejemplo real antes de fijarlos; si no
coinciden, **usa los reales y dilo en el informe** — no ajustes el motor para que
cuadren.

- [ ] **Paso 2: Ejecutar y ver que falla**

Run: `npm test --workspace packages/app -- derivados`
Esperado: FALLA, `useEvaluacionRasante` no existe.

- [ ] **Paso 3: Escribir el hook**

Sigue el patrón de `useResultadoDe`, que ya está en ese archivo. Devuelve `null`
si falta la calle, la plantilla, la rasante o el resultado. Envuelve la llamada en
`useMemo` con las dependencias correctas.

- [ ] **Paso 4: Ejecutar y ver que pasa**

Run: `npm test --workspace packages/app -- derivados`
Esperado: PASA.

- [ ] **Paso 5: Commit**

```bash
git add -A
git commit -m "Pone la evaluación contra la rasante al alcance de las vistas"
```

---

## Tarea R8: Vista 1 — el corte transversal con corte y relleno

**Archivos:**
- Modificar: `packages/app/src/componentes/CorteTransversal.tsx`
- Test: `packages/app/src/componentes/CorteTransversal.test.tsx`

**Interfaces:**
- Consume: `useEvaluacionRasante` de R7.

- [ ] **Paso 1: Escribir las pruebas que fallan**

```ts
it('dibuja la rasante además del terreno medido', () => {
  fijarRasanteDeEjemplo()
  render(<CorteTransversal progresiva={0} />)

  expect(screen.getByLabelText(/rasante de proyecto/i)).toBeInTheDocument()
})

it('sombrea corte y relleno por separado, no como una sola mancha', () => {
  fijarRasanteDeEjemplo()
  const { container } = render(<CorteTransversal progresiva={0} />)

  expect(container.querySelectorAll('[data-zona="corte"]').length).toBeGreaterThan(0)
  expect(container.querySelectorAll('[data-zona="relleno"]').length).toBeGreaterThan(0)
})

it('sin rasante definida el corte se dibuja como hasta ahora', () => {
  render(<CorteTransversal progresiva={0} />)

  expect(screen.queryByLabelText(/rasante de proyecto/i)).toBeNull()
  expect(screen.getAllByLabelText(/cota/).length).toBeGreaterThan(0)
})

it('no sombrea contra la rasante donde no hay medida', () => {
  // VER-I no se midió en la campaña del ejemplo: el sombreado no llega hasta ahí.
  fijarRasanteDeEjemplo()
  const { container } = render(<CorteTransversal progresiva={0} />)

  const zonas = [...container.querySelectorAll('[data-zona]')]
  const puntos = zonas.flatMap((z) => (z.getAttribute('points') ?? '').split(' '))
  expect(puntos.some((p) => p.startsWith('-5.6'))).toBe(false)
})
```

- [ ] **Paso 2: Ejecutar y ver que falla**

Run: `npm test --workspace packages/app -- CorteTransversal`
Esperado: FALLA.

- [ ] **Paso 3: Implementar**

La rasante va como polilínea discontinua, con `aria-label` que la nombre. El
sombreado se calcula por tramos entre puntos consecutivos **que tengan medida y
cota teórica**: donde el terreno está por encima, zona de corte; por debajo, zona
de relleno. Marca cada polígono con `data-zona="corte"` o `data-zona="relleno"` y
colores distintos.

Un tramo donde el terreno **cruza** la rasante se parte en el punto de cruce, para
no pintar de corte un trozo que es de relleno.

Reutiliza `MarcoGrafico` y el criterio de la Entrega 2A: **solo se sombrea donde
las dos líneas existen**. Es exactamente la misma regla que ya se aplicó al
relleno entre capas.

- [ ] **Paso 4: Ejecutar y ver que pasa**

Run: `npm test --workspace packages/app -- CorteTransversal`
Esperado: PASA.

- [ ] **Paso 5: Commit**

```bash
git add -A
git commit -m "Dibuja el corte y el relleno en el corte transversal"
```

---

## Tarea R9: Vista 2 — el perfil longitudinal con la rasante

**Archivos:**
- Modificar: `packages/app/src/componentes/PerfilLongitudinal.tsx`
- Test: `packages/app/src/componentes/PerfilLongitudinal.test.tsx`

- [ ] **Paso 1: Escribir las pruebas que fallan**

```ts
it('dibuja la recta de la rasante junto al terreno medido', () => {
  fijarRasanteDeEjemplo()
  render(<PerfilLongitudinal elementoClave="EJE" />)

  expect(screen.getByLabelText(/rasante de proyecto/i)).toBeInTheDocument()
})

it('la rasante del perfil usa el elemento que se está mirando, no siempre el eje', () => {
  fijarRasanteDeEjemplo()
  render(<PerfilLongitudinal elementoClave="BOR-D" />)

  // En BOR-D la rasante va 84 mm por debajo de la del eje en toda la calle.
  expect(screen.getByLabelText(/rasante de proyecto/i)).toBeInTheDocument()
  expect(screen.getByText(/3245\.096/)).toBeInTheDocument()
})

it('sin rasante definida el perfil se dibuja como hasta ahora', () => {
  render(<PerfilLongitudinal elementoClave="EJE" />)

  expect(screen.queryByLabelText(/rasante de proyecto/i)).toBeNull()
})
```

**La segunda prueba es la que importa.** Es el error fácil: dibujar siempre la
rasante del eje aunque se esté mirando el perfil del borde, que va 84 mm más
abajo.

- [ ] **Paso 2: Ejecutar y ver que falla**

Run: `npm test --workspace packages/app -- PerfilLongitudinal`
Esperado: FALLA.

- [ ] **Paso 3: Implementar**

La rasante del elemento que se está mirando: para cada progresiva,
`cotaTeoricaDeCapa(rasante, capas, capaId, progresiva, offset del elemento)`. Se
salta las progresivas donde devuelva null.

- [ ] **Paso 4: Ejecutar y ver que pasa**

Run: `npm test --workspace packages/app -- PerfilLongitudinal`
Esperado: PASA.

- [ ] **Paso 5: Commit**

```bash
git add -A
git commit -m "Dibuja la rasante en el perfil longitudinal"
```

---

## Tarea R10: Vista 3 — la tabla con semáforo

**Archivos:**
- Crear: `packages/app/src/componentes/TablaDiferencias.tsx`
- Modificar: `packages/app/src/vistas/VistaResultados.tsx`
- Test: `packages/app/src/componentes/TablaDiferencias.test.tsx`

- [ ] **Paso 1: Escribir las pruebas que fallan**

```ts
it('muestra la diferencia en milímetros con signo y dice qué hacer', () => {
  fijarRasanteDeEjemplo()
  render(<TablaDiferencias />)

  expect(screen.getByLabelText(/0\+000 EJE: −302 mm, rellenar/)).toBeInTheDocument()
})

it('el interruptor cambia entre cota real, cota teórica y diferencia', async () => {
  fijarRasanteDeEjemplo()
  render(<TablaDiferencias />)

  await userEvent.click(screen.getByRole('button', { name: 'Cota teórica' }))
  expect(screen.getByText('3244.930')).toBeInTheDocument()

  await userEvent.click(screen.getByRole('button', { name: 'Cota real' }))
  expect(screen.getByText('3244.628')).toBeInTheDocument()
})

it('el estado no viaja solo en el color: va en el nombre de la celda', () => {
  fijarRasanteDeEjemplo()
  render(<TablaDiferencias />)

  const celda = screen.getByLabelText(/0\+000 EJE/)
  expect(celda.getAttribute('aria-label')).toMatch(/fuera de tolerancia/)
})

it('una celda fuera de la sección definida sale vacía, no en cero', () => {
  fijarRasanteEstrecha()
  render(<TablaDiferencias />)

  const celda = screen.getByLabelText(/0\+000 VER-I/)
  expect(celda.textContent).toBe('')
  expect(celda.getAttribute('aria-label')).toMatch(/fuera de la sección/)
})
```

**La última prueba fija la misma regla que ya rige en los espesores:** un cero
diría «está justo en la cota», que no es lo mismo que «el proyecto no dice nada
de este punto».

- [ ] **Paso 2: Ejecutar y ver que falla**

Run: `npm test --workspace packages/app -- TablaDiferencias`
Esperado: FALLA.

- [ ] **Paso 3: Implementar**

Misma forma que `TablaEspesores` (mira cómo está hecha; el orden de columnas sale
de la plantilla por `offset`). Tres botones para elegir qué se muestra. Cada celda
lleva el color de su estado, un símbolo, y el nombre accesible completo:
`0+000 EJE: −302 mm, rellenar, fuera de tolerancia`.

Un resumen debajo: `Conformes 34 · Al límite 5 · Fuera 3 · Sin medir 28`.

- [ ] **Paso 4: Colgarlo de VistaResultados**

Debajo de la tabla de espesores. Y **el aviso de no comprobado que ya existe
tiene que cubrirlo**: si el circuito de la campaña no cerró, este semáforo
tampoco está comprobado. Reutiliza el componente de aviso que ya está ahí; no
escribas otro.

- [ ] **Paso 5: Ejecutar la batería**

Run: `npm test` y `npm run typecheck --workspaces`
Esperado: todo en verde, sin avisos.

- [ ] **Paso 6: Commit**

```bash
git add -A
git commit -m "Muestra corte y relleno por celda con su semáforo"
```

---

## Tarea R11: Vista 4 — el mapa de la calle

**Archivos:**
- Crear: `packages/app/src/componentes/MapaEstado.tsx`
- Modificar: `packages/app/src/vistas/VistaResultados.tsx`
- Test: `packages/app/src/componentes/MapaEstado.test.tsx`

- [ ] **Paso 1: Escribir las pruebas que fallan**

```ts
it('pinta la calle entera, una celda por progresiva y elemento', () => {
  fijarRasanteDeEjemplo()
  render(<MapaEstado />)

  expect(screen.getAllByRole('button', { name: /^0\+\d{3} / }).length).toBe(49)
})

it('cada celda dice su estado por escrito, no solo por color', () => {
  fijarRasanteDeEjemplo()
  render(<MapaEstado />)

  expect(screen.getByLabelText(/0\+000 EJE: −302 mm, fuera de tolerancia/)).toBeInTheDocument()
})

it('elegir una celda del mapa la selecciona en el resto de vistas', async () => {
  fijarRasanteDeEjemplo()
  render(<MapaEstado />)

  await userEvent.click(screen.getByLabelText(/0\+020 EJE/))

  expect(useAlmacen.getState().seleccion.clave).toBe('20|EJE')
})

it('la leyenda explica qué es cada símbolo', () => {
  fijarRasanteDeEjemplo()
  render(<MapaEstado />)

  expect(screen.getByText(/dentro de tolerancia/i)).toBeInTheDocument()
  expect(screen.getByText(/al límite/i)).toBeInTheDocument()
  expect(screen.getByText(/fuera/i)).toBeInTheDocument()
})
```

- [ ] **Paso 2: Ejecutar y ver que falla**

Run: `npm test --workspace packages/app -- MapaEstado`
Esperado: FALLA.

- [ ] **Paso 3: Implementar**

Parte de `MapaGrilla`, que ya dibuja esta rejilla para marcar celdas medidas.
Cada celda: color de fondo por estado, un símbolo distinto por estado (para que
no dependa del color), y el nombre accesible con progresiva, elemento,
diferencia y estado.

Clic en una celda hace `seleccionar(clave)`, igual que las demás vistas, para que
todo siga ligado.

Con muchas progresivas la rejilla se hace ancha: que la tabla tenga scroll
horizontal propio y la primera columna quede fija, para no perder de vista qué
elemento es cada fila.

- [ ] **Paso 4: Colgarlo de VistaResultados**

- [ ] **Paso 5: Ejecutar la batería**

Run: `npm test` y `npm run typecheck --workspaces`
Esperado: todo en verde, sin avisos.

- [ ] **Paso 6: Commit**

```bash
git add -A
git commit -m "Añade el mapa de la calle coloreado por estado"
```

---

## Tarea R12: Exportar las diferencias

**Archivos:**
- Modificar: `packages/app/src/archivo/exportar.ts`
- Modificar: `packages/app/src/vistas/VistaResultados.tsx`
- Test: `packages/app/src/archivo/exportar.test.ts`

**Interfaces:**
- Produce: `armarTablaDiferencias(evaluacion, calle, plantilla): string[][]` y
  `armarCabeceraDiferencias(datos): string[][]`.

- [ ] **Paso 1: Escribir las pruebas que fallan**

```ts
it('una celda fuera de la sección definida sale vacía, nunca en cero', () => {
  const tabla = armarTablaDiferencias(evaluacionEstrecha(), calle(), plantilla())

  expect(tabla.find((f) => f[0] === '0+000')![columnaVerI]).toBe('')
})

it('las diferencias van en milímetros con signo', () => {
  const tabla = armarTablaDiferencias(evaluacionEjemplo(), calle(), plantilla())

  expect(tabla.find((f) => f[0] === '0+000')![columnaEje]).toBe('-302')
})

it('la cabecera lleva la rasante y la tolerancia con la que se juzgó', () => {
  const cabecera = armarCabeceraDiferencias(datosEjemplo())

  expect(cabecera).toContainEqual(['Pendiente longitudinal', '-1.250 %'])
  expect(cabecera).toContainEqual(['Tolerancia de la capa', '±20 mm'])
})

it('si el circuito no cerró, la cabecera dice que el resultado no está comprobado', () => {
  const cabecera = armarCabeceraDiferencias({ ...datosEjemplo(), resultado: resultadoSinCerrar() })

  expect(cabecera.find((f) => f[0] === 'Estado')![1]).toMatch(/NO COMPROBAD/)
})

it('un cero real sale como cero, porque significa que está justo en la cota', () => {
  const tabla = armarTablaDiferencias(evaluacionConCeroExacto(), calle(), plantilla())

  expect(tabla.find((f) => f[0] === '0+000')![columnaEje]).toBe('0')
})
```

**La última prueba está aquí a propósito.** El cero de una diferencia significa
«clavado en la cota del proyecto», que es la mejor noticia posible. Confundirlo
con «sin dato» ya pasó dos veces en la Entrega 2A.

- [ ] **Paso 2: Ejecutar y ver que falla**

Run: `npm test --workspace packages/app -- exportar`
Esperado: FALLA.

- [ ] **Paso 3: Implementar**

Reutiliza `armarEsqueletoTabla`, que ya existe y decide el orden de columnas: las
tres tablas de la misma calle tienen que salir alineadas.

Para la cabecera, reutiliza el estado de verificación que ya calcula
`estadoComparacion.ts`; el criterio es el mismo, aquí con una sola campaña en
vez de dos.

Botones `Exportar diferencias a Excel` y `Exportar diferencias a CSV`, con esos
nombres, para que se distingan de los de cotas y espesores.

- [ ] **Paso 4: Ejecutar y ver que pasa**

Run: `npm test --workspace packages/app -- exportar`
Esperado: PASA.

- [ ] **Paso 5: Commit**

```bash
git add -A
git commit -m "Exporta las diferencias contra el proyecto"
```

---

## Tarea R13: Cierre de la Entrega 2B

- [ ] **Paso 1: Batería completa**

```
npm test
npm run typecheck --workspaces
npm run build --workspace packages/app
npm audit --omit=dev
```

Anota el tamaño del paquete. Todo sin avisos.

- [ ] **Paso 2: Verificación en navegador real**

Crea `packages/app/verificacion/rasante.mjs`, siguiendo el patrón de `capas.mjs`.
El recorrido: definir la rasante de la calle, comprobar que el corte tipo se
dibuja, ir a Resultados y comprobar que la tabla muestra diferencias en
milímetros, que el mapa colorea, que el corte transversal sombrea corte y
relleno, y que el Excel de diferencias descargado trae la cabecera con la
pendiente y el estado de verificación.

Descarga el archivo de verdad y míralo por dentro, como hace `capas.mjs` con el
de espesores.

Añade el guion al README junto a los otros dos.

- [ ] **Paso 3: Documentación**

En `docs/uso.md`, una sección nueva sobre la rasante: cómo se define, qué
significa el signo de la pendiente y del bombeo, cómo se leen las cuatro vistas y
qué dice cada color. Con el dibujo del corte tipo, que es lo que hace entendible
la convención de signos.

Actualiza el README con lo que la app hace ahora y la cuenta de pruebas.

Escribe `docs/decisiones-entrega-2b.md` con las decisiones tomadas durante la
ejecución, siguiendo el formato de `docs/decisiones-entrega-2a.md`: qué se
decidió, por qué, y qué costaría si resulta equivocado.

- [ ] **Paso 4: Commit**

```bash
git add -A
git commit -m "Cierre de la Entrega 2B: verificación completa y guía"
```

---

## Lo que queda fuera y por qué

| Fuera | Cuándo entra |
|---|---|
| Rasante por cotas dadas en puntos | El día que un expediente se la dé así a Max. El modelo ya la contempla. |
| Rasante importada (LandXML) | Después de las dos formas escritas a mano. |
| Peralte en curva | Necesita otro modelo transversal; hoy no hay caso real. |
| Drenaje: pendiente mínima, charcos, rutas de flujo | Entrega 3, sobre la superficie triangulada. |
| Volúmenes de corte y relleno | Cabe después, encima de esto mismo. |
