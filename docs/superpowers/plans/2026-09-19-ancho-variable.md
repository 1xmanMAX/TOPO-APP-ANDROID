# Ancho variable por progresiva — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que la distancia al eje de cada punto de la sección pueda cambiar de progresiva a progresiva —medida en campo, escrita a mano o leída del Excel—, y que la cota teórica, el corte, el 3D y lo exportado usen ese ancho real.

**Architecture:** La calle gana una lista `anchos` de medidas (progresiva, punto, distancia). Una sola función pura, `distanciaEn`, resuelve la distancia de un punto en una progresiva (medida → interpolada → extendida → típica) y `construirGrilla` la usa, así que casi todos los consumidores la heredan por `celda.offset`. Los tramos de la rasante pueden amarrarse al rol de un punto (`hastaRol`); `tramosResueltos` los convierte en tramos de ancho concreto para una progresiva y un lado, y la geometría sigue siendo aritmética pura.

**Tech Stack:** TypeScript, monorepo npm workspaces (`packages/core` lógica pura, `packages/app` React 19 + Zustand + Tailwind 4 + Vite 7), Vitest + Testing Library, Playwright para `verificacion/`.

**Spec:** `docs/superpowers/specs/2026-09-19-ancho-variable-design.md`

## Global Constraints

- Todo identificador, comentario, texto de pantalla y mensaje de commit va **en español**, con el estilo de comentarios del código vecino (explican el porqué).
- **Sin anchos medidos, ningún número cambia.** Ninguna prueba existente se edita para hacerla pasar; si una falla, el cambio está mal.
- Los campos nuevos son **opcionales** al leer: `Calle.anchos?`, `TramoTransversal.hastaRol?`, `Seccion.palabrasDistancia?`. Ausente = comportamiento de hoy. `Proyecto.version` se queda en `1`. (Afina el spec, que escribe `hastaRol: Rol | null`: opcional para no romper los literales de las pruebas ni los `.topo` guardados; ausente y `null` significan lo mismo.)
- Las distancias medidas se guardan **positivas**; el lado lo da el signo de `PuntoSeccion.distancia`. El eje no admite medidas.
- Progresivas y distancias se redondean con `redondear3` (de `core/src/numero`), igual que `claveCelda`.
- Palabras de distancia de fábrica: `['DIST', 'ANCHO', 'DISTANCIA']` — **sin** `D`.
- Avisos de la tabla: nunca bloquean. Salto brusco = más de `1` m entre dos medidas vecinas del mismo punto separadas menos de `20` m.
- Pruebas: `npm test --workspace packages/core`, `npm test --workspace packages/app`, y `npm run typecheck` en cada paquete. Commits pequeños, uno por tarea como mínimo.

## Mapa de archivos

| Archivo | Qué hace |
|---|---|
| `packages/core/src/modelo/tipos.ts` (modificar) | `AnchoMedido`, `Calle.anchos?`, `TramoTransversal.hastaRol?` |
| `packages/core/src/seccion/anchos.ts` (crear) | `distanciaEn`, `conAncho`, `sinAncho`, `avisosDeAnchos`, `progresivasConAncho` |
| `packages/core/src/seccion/seccion.ts` (modificar) | `palabrasDistancia?`, `PALABRAS_DISTANCIA_DE_FABRICA`, `palabrasDistanciaDe` |
| `packages/core/src/grilla/grilla.ts` (modificar) | offset por progresiva + `origenOffset` |
| `packages/core/src/rasante/amarre.ts` (crear) | `tramosResueltos`, `amarrarTramos` |
| `packages/core/src/rasante/geometria.ts`, `espesores.ts`, `evaluar.ts` (modificar) | aceptan tramos ya resueltos |
| `packages/core/src/vista3d/malla.ts` (modificar) | `offsetDe(progresiva, elemento)` |
| `packages/app/src/archivo/topo.ts` (modificar) | migración `migrarAnchoVariable` |
| `packages/app/src/estado/almacen.ts` (modificar) | `fijarAncho`, `quitarAncho`, lista `'distancia'`, anchos al importar |
| `packages/app/src/componentes/TablaAnchos.tsx` (crear) | la tabla de la pantalla Sección |
| `packages/app/src/vistas/VistaSeccion.tsx` (modificar) | monta `TablaAnchos` y la lista «La distancia» |
| `packages/app/src/componentes/EditorRasante.tsx` (modificar) | selector «Hasta» |
| `packages/app/src/componentes/Vista3D.tsx`, `CorteTransversal.tsx` (modificar) | ancho real y rótulo medido/estimado |
| `packages/app/src/importar/interpretar.ts`, `vistas/VistaSubirDatos.tsx`, `componentes/VistaPreviaHoja.tsx` (modificar) | columnas de distancia |
| `packages/app/verificacion/anchos.mjs` (crear), `LEEME.md`, `docs/uso.md` (modificar) | navegador real y guía |

---

### Task 1: `distanciaEn` y las operaciones puras sobre anchos

**Files:**
- Modify: `packages/core/src/modelo/tipos.ts`
- Create: `packages/core/src/seccion/anchos.ts`
- Test: `packages/core/src/seccion/anchos.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Produces:
  - `interface AnchoMedido { progresiva: number; puntoId: Id; distancia: number }`
  - `Calle.anchos?: AnchoMedido[]`
  - `type OrigenDistancia = 'medida' | 'interpolada' | 'extendida' | 'tipica'`
  - `interface DistanciaEn { distancia: number; origen: OrigenDistancia }`
  - `distanciaEn(calle: Calle, puntoId: Id, progresiva: number): DistanciaEn`
  - `conAncho(calle: Calle, progresiva: number, puntoId: Id, distancia: number): Calle`
  - `sinAncho(calle: Calle, progresiva: number, puntoId: Id): Calle`
  - `progresivasConAncho(calle: Calle): number[]`
  - `interface AvisoAncho { progresiva: number; puntoId: Id; que: string }`
  - `avisosDeAnchos(calle: Calle, progresivas: number[]): AvisoAncho[]`

- [ ] **Step 1: Añadir los tipos**

En `tipos.ts`, antes de `// ---------- Calle ----------`:

```ts
// ---------- Anchos medidos ----------

/**
 * La distancia al eje de un punto, medida con wincha en una progresiva.
 *
 * Vive en la calle y no en la lectura de mira: el ancho es de la calle, no de
 * la jornada. Con cuatro capas niveladas habría cuatro anchos de la misma
 * vereda y nada impediría que se contradijeran.
 */
export interface AnchoMedido {
  progresiva: number
  puntoId: Id
  /** Metros desde el eje, siempre positivos: lo que marca la wincha. El lado lo da el punto. */
  distancia: number
}
```

Y dentro de `interface Calle`, después de `rasante`:

```ts
  /**
   * Ausente o vacía: la calle tiene un solo ancho, el de su sección, y todo
   * sale exactamente como salía antes de que esto existiera.
   */
  anchos?: AnchoMedido[]
```

- [ ] **Step 2: Escribir las pruebas que fallan**

`packages/core/src/seccion/anchos.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { AnchoMedido, Calle } from '../modelo/tipos'
import { avisosDeAnchos, conAncho, distanciaEn, progresivasConAncho, sinAncho } from './anchos'
import { seccionDeFabrica } from './seccion'

function calle(anchos?: AnchoMedido[]): Calle {
  return { id: 'c-1', nombre: 'Av. Sol', seccion: seccionDeFabrica(), nivelaciones: [], rasante: null, anchos }
}

describe('distanciaEn', () => {
  it('sin medidas devuelve la típica de la sección, con su signo', () => {
    expect(distanciaEn(calle(), 'p-borde-i', 20)).toEqual({ distancia: -3.5, origen: 'tipica' })
    expect(distanciaEn(calle([]), 'p-borde-d', 20)).toEqual({ distancia: 3.5, origen: 'tipica' })
  })

  it('una medida exacta manda, y sale con el signo del lado', () => {
    const c = calle([{ progresiva: 20, puntoId: 'p-borde-i', distancia: 4 }])
    expect(distanciaEn(c, 'p-borde-i', 20)).toEqual({ distancia: -4, origen: 'medida' })
  })

  it('entre dos medidas interpola en línea recta, a tres decimales', () => {
    const c = calle([
      { progresiva: 20, puntoId: 'p-borde-d', distancia: 3.5 },
      { progresiva: 40, puntoId: 'p-borde-d', distancia: 4.1 },
    ])
    expect(distanciaEn(c, 'p-borde-d', 30)).toEqual({ distancia: 3.8, origen: 'interpolada' })
    expect(distanciaEn(c, 'p-borde-d', 25)).toEqual({ distancia: 3.65, origen: 'interpolada' })
  })

  it('antes de la primera y después de la última repite la más cercana', () => {
    const c = calle([
      { progresiva: 20, puntoId: 'p-borde-d', distancia: 3.5 },
      { progresiva: 40, puntoId: 'p-borde-d', distancia: 4.1 },
    ])
    expect(distanciaEn(c, 'p-borde-d', 0)).toEqual({ distancia: 3.5, origen: 'extendida' })
    expect(distanciaEn(c, 'p-borde-d', 60)).toEqual({ distancia: 4.1, origen: 'extendida' })
  })

  it('con una sola medida, esa vale para toda la calle', () => {
    const c = calle([{ progresiva: 20, puntoId: 'p-vereda-d', distancia: 6 }])
    expect(distanciaEn(c, 'p-vereda-d', 80)).toEqual({ distancia: 6, origen: 'extendida' })
  })

  it('cada punto se interpola por separado', () => {
    const c = calle([{ progresiva: 20, puntoId: 'p-borde-d', distancia: 4 }])
    expect(distanciaEn(c, 'p-vereda-d', 20)).toEqual({ distancia: 5.15, origen: 'tipica' })
  })

  it('el eje está siempre a cero, aunque alguien le colara una medida', () => {
    const c = calle([{ progresiva: 20, puntoId: 'p-eje', distancia: 1 }])
    expect(distanciaEn(c, 'p-eje', 20)).toEqual({ distancia: 0, origen: 'tipica' })
  })

  it('no desordena las medidas aunque vengan al revés', () => {
    const c = calle([
      { progresiva: 40, puntoId: 'p-borde-d', distancia: 4.1 },
      { progresiva: 20, puntoId: 'p-borde-d', distancia: 3.5 },
    ])
    expect(distanciaEn(c, 'p-borde-d', 30).distancia).toBe(3.8)
  })

  it('un punto que no está en la sección cae a cero y típica', () => {
    expect(distanciaEn(calle(), 'p-que-no-esta', 20)).toEqual({ distancia: 0, origen: 'tipica' })
  })
})

describe('conAncho y sinAncho', () => {
  it('añade una medida, en positivo aunque se escriba en negativo', () => {
    const c = conAncho(calle(), 20, 'p-borde-i', -4)
    expect(c.anchos).toEqual([{ progresiva: 20, puntoId: 'p-borde-i', distancia: 4 }])
  })

  it('sustituye la de la misma pareja en vez de duplicarla', () => {
    const c = conAncho(conAncho(calle(), 20, 'p-borde-i', 4), 20.0004, 'p-borde-i', 4.2)
    expect(c.anchos).toEqual([{ progresiva: 20, puntoId: 'p-borde-i', distancia: 4.2 }])
  })

  it('no admite medidas del eje ni de un punto que no existe, ni un cero', () => {
    expect(conAncho(calle(), 20, 'p-eje', 1).anchos ?? []).toEqual([])
    expect(conAncho(calle(), 20, 'p-nada', 1).anchos ?? []).toEqual([])
    expect(conAncho(calle(), 20, 'p-borde-i', 0).anchos ?? []).toEqual([])
  })

  it('quitar devuelve el punto a estimado', () => {
    const c = sinAncho(conAncho(calle(), 20, 'p-borde-i', 4), 20, 'p-borde-i')
    expect(c.anchos).toEqual([])
  })

  it('no toca la calle de entrada', () => {
    const original = calle([])
    conAncho(original, 20, 'p-borde-i', 4)
    expect(original.anchos).toEqual([])
  })
})

describe('progresivasConAncho', () => {
  it('las da sin repetir y ordenadas', () => {
    const c = calle([
      { progresiva: 40, puntoId: 'p-borde-d', distancia: 4 },
      { progresiva: 20, puntoId: 'p-borde-d', distancia: 4 },
      { progresiva: 40, puntoId: 'p-borde-i', distancia: 4 },
    ])
    expect(progresivasConAncho(c)).toEqual([20, 40])
  })
})

describe('avisosDeAnchos', () => {
  it('sin medidas no avisa de nada', () => {
    expect(avisosDeAnchos(calle(), [0, 20, 40])).toEqual([])
  })

  it('avisa si un punto queda más cerca del eje que el que tiene por dentro', () => {
    const c = calle([{ progresiva: 20, puntoId: 'p-vereda-d', distancia: 3.4 }])
    const avisos = avisosDeAnchos(c, [20])
    expect(avisos).toHaveLength(1)
    expect(avisos[0]).toMatchObject({ progresiva: 20, puntoId: 'p-vereda-d' })
    expect(avisos[0]!.que).toContain('Vereda derecha')
  })

  it('avisa de un salto de más de 1 m entre medidas a menos de 20 m', () => {
    const c = calle([
      { progresiva: 20, puntoId: 'p-vereda-d', distancia: 5.15 },
      { progresiva: 30, puntoId: 'p-vereda-d', distancia: 6.5 },
    ])
    expect(avisosDeAnchos(c, [20, 30]).some((a) => a.progresiva === 30)).toBe(true)
  })

  it('el mismo salto repartido en 20 m o más no es un aviso', () => {
    const c = calle([
      { progresiva: 20, puntoId: 'p-vereda-d', distancia: 5.15 },
      { progresiva: 40, puntoId: 'p-vereda-d', distancia: 6.5 },
    ])
    expect(avisosDeAnchos(c, [20, 40])).toEqual([])
  })
})
```

- [ ] **Step 3: Verificar que fallan**

Run: `npm test --workspace packages/core -- anchos`
Expected: FAIL — `Cannot find module './anchos'`.

- [ ] **Step 4: Implementar**

`packages/core/src/seccion/anchos.ts`:

```ts
import type { AnchoMedido, Calle, Id } from '../modelo/tipos'
import { redondear3 } from '../numero'

export type OrigenDistancia = 'medida' | 'interpolada' | 'extendida' | 'tipica'

export interface DistanciaEn {
  /** Con signo, como `PuntoSeccion.distancia`: negativa a la izquierda. */
  distancia: number
  origen: OrigenDistancia
}

/** Cuánto puede cambiar un ancho entre dos medidas vecinas antes de parecer un error de dedo. */
const SALTO_BRUSCO_M = 1
/** …y a menos de cuántos metros de progresiva tienen que estar para que cuente. */
const TRAMO_CORTO_M = 20

function medidasDe(calle: Calle, puntoId: Id): AnchoMedido[] {
  return (calle.anchos ?? [])
    .filter((ancho) => ancho.puntoId === puntoId)
    .sort((a, b) => a.progresiva - b.progresiva)
}

/**
 * La distancia al eje de un punto en una progresiva. De aquí sale toda
 * distancia que use la app para una progresiva concreta: si dos sitios la
 * calcularan por su cuenta, el corte y la tabla podrían dibujar dos calles.
 *
 * Cada punto se interpola por separado: haber medido el borde en 0+020 no
 * dice nada de la vereda en 0+020.
 */
export function distanciaEn(calle: Calle, puntoId: Id, progresiva: number): DistanciaEn {
  const punto = calle.seccion.puntos.find((p) => p.id === puntoId)
  if (!punto) return { distancia: 0, origen: 'tipica' }

  // El eje es el origen de las distancias: a cero pase lo que pase, igual
  // que en `cambiarDistancia`.
  if (punto.rol === 'eje' || punto.distancia === 0) return { distancia: 0, origen: 'tipica' }

  const medidas = medidasDe(calle, puntoId)
  if (medidas.length === 0) return { distancia: punto.distancia, origen: 'tipica' }

  const signo = punto.distancia < 0 ? -1 : 1
  const donde = redondear3(progresiva)

  const exacta = medidas.find((m) => redondear3(m.progresiva) === donde)
  if (exacta) return { distancia: signo * exacta.distancia, origen: 'medida' }

  const primera = medidas[0]!
  const ultima = medidas[medidas.length - 1]!
  if (donde < primera.progresiva) return { distancia: signo * primera.distancia, origen: 'extendida' }
  if (donde > ultima.progresiva) return { distancia: signo * ultima.distancia, origen: 'extendida' }

  const indice = medidas.findIndex((m) => m.progresiva > donde)
  const antes = medidas[indice - 1]!
  const despues = medidas[indice]!
  const t = (donde - antes.progresiva) / (despues.progresiva - antes.progresiva)
  const valor = redondear3(antes.distancia + t * (despues.distancia - antes.distancia))

  return { distancia: signo * valor, origen: 'interpolada' }
}

/**
 * Devuelve una calle nueva con esa medida puesta. Una sola por pareja
 * (progresiva, punto): escribir otra vez sustituye. Lo que no es una medida
 * —el eje, un punto que no está, un cero— deja la calle como estaba.
 */
export function conAncho(calle: Calle, progresiva: number, puntoId: Id, distancia: number): Calle {
  const punto = calle.seccion.puntos.find((p) => p.id === puntoId)
  const medida = redondear3(Math.abs(distancia))
  if (!punto || punto.rol === 'eje' || !Number.isFinite(medida) || medida === 0) return calle

  const donde = redondear3(progresiva)
  const resto = (calle.anchos ?? []).filter(
    (a) => !(a.puntoId === puntoId && redondear3(a.progresiva) === donde),
  )
  return { ...calle, anchos: [...resto, { progresiva: donde, puntoId, distancia: medida }] }
}

/** Quita la medida de esa pareja: el punto vuelve a salir estimado ahí. */
export function sinAncho(calle: Calle, progresiva: number, puntoId: Id): Calle {
  const donde = redondear3(progresiva)
  return {
    ...calle,
    anchos: (calle.anchos ?? []).filter(
      (a) => !(a.puntoId === puntoId && redondear3(a.progresiva) === donde),
    ),
  }
}

/** Las progresivas donde hay alguna medida de ancho, sin repetir y ordenadas. */
export function progresivasConAncho(calle: Calle): number[] {
  return [...new Set((calle.anchos ?? []).map((a) => redondear3(a.progresiva)))].sort((a, b) => a - b)
}

export interface AvisoAncho {
  progresiva: number
  puntoId: Id
  que: string
}

/**
 * Lo que huele a error de anotación. Nunca bloquea: Max mide lo que hay, y
 * una vereda puede de verdad pegar un salto en una esquina.
 */
export function avisosDeAnchos(calle: Calle, progresivas: number[]): AvisoAncho[] {
  if ((calle.anchos ?? []).length === 0) return []

  const avisos: AvisoAncho[] = []

  for (const lado of [-1, 1] as const) {
    const delLado = calle.seccion.puntos
      .filter((p) => Math.sign(p.distancia) === lado)
      .sort((a, b) => Math.abs(a.distancia) - Math.abs(b.distancia))

    for (const progresiva of progresivas) {
      for (let i = 1; i < delLado.length; i += 1) {
        const dentro = delLado[i - 1]!
        const fuera = delLado[i]!
        const dDentro = Math.abs(distanciaEn(calle, dentro.id, progresiva).distancia)
        const dFuera = Math.abs(distanciaEn(calle, fuera.id, progresiva).distancia)
        if (dFuera < dDentro) {
          avisos.push({
            progresiva,
            puntoId: fuera.id,
            que: `«${fuera.nombre}» queda a ${dFuera.toFixed(2)} m, más cerca del eje que «${dentro.nombre}» (${dDentro.toFixed(2)} m).`,
          })
        }
      }
    }
  }

  for (const punto of calle.seccion.puntos) {
    const medidas = medidasDe(calle, punto.id)
    for (let i = 1; i < medidas.length; i += 1) {
      const antes = medidas[i - 1]!
      const despues = medidas[i]!
      const cambio = Math.abs(despues.distancia - antes.distancia)
      if (cambio > SALTO_BRUSCO_M && despues.progresiva - antes.progresiva < TRAMO_CORTO_M) {
        avisos.push({
          progresiva: despues.progresiva,
          puntoId: punto.id,
          que: `«${punto.nombre}» cambia ${cambio.toFixed(2)} m en solo ${(despues.progresiva - antes.progresiva).toFixed(0)} m de calle. Comprueba la anotación.`,
        })
      }
    }
  }

  return avisos
}
```

En `index.ts`, tras `export * from './seccion/seccion'`: `export * from './seccion/anchos'`.

- [ ] **Step 5: Verificar que pasan**

Run: `npm test --workspace packages/core && npm run typecheck --workspace packages/core`
Expected: PASS, todo verde, sin tocar ninguna prueba vieja.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src
git commit -m "La distancia de un punto se resuelve por progresiva: medida, interpolada o tipica"
```

---

### Task 2: La grilla reparte el ancho real de cada progresiva

**Files:**
- Modify: `packages/core/src/grilla/grilla.ts` (interface `CeldaGrilla`, `construirGrilla`)
- Test: `packages/core/src/grilla/grilla.test.ts` (añadir al final)

**Interfaces:**
- Consumes: `distanciaEn`, `OrigenDistancia` (Task 1)
- Produces: `CeldaGrilla.origenOffset: OrigenDistancia`; `CeldaGrilla.offset` pasa a ser el de **esa** progresiva. El orden de las columnas sigue saliendo de la distancia típica.

- [ ] **Step 1: Pruebas que fallan** — añadir a `grilla.test.ts`:

```ts
import { seccionDeFabrica } from '../seccion/seccion'

describe('construirGrilla con anchos medidos', () => {
  const base: Calle = { id: 'c-1', nombre: 'Av. Sol', seccion: seccionDeFabrica(), nivelaciones: [], rasante: null }

  it('sin anchos, cada celda lleva la distancia típica', () => {
    const celda = construirGrilla(base, [20]).find((c) => c.elementoClave === 'p-borde-d')!
    expect(celda.offset).toBe(3.5)
    expect(celda.origenOffset).toBe('tipica')
  })

  it('con anchos, el offset es el de esa progresiva y dice de dónde sale', () => {
    const calle: Calle = {
      ...base,
      anchos: [
        { progresiva: 20, puntoId: 'p-borde-d', distancia: 3.5 },
        { progresiva: 40, puntoId: 'p-borde-d', distancia: 4.1 },
      ],
    }
    const celdas = construirGrilla(calle, [20, 30, 40]).filter((c) => c.elementoClave === 'p-borde-d')
    expect(celdas.map((c) => c.offset)).toEqual([3.5, 3.8, 4.1])
    expect(celdas.map((c) => c.origenOffset)).toEqual(['medida', 'interpolada', 'medida'])
  })

  it('las columnas no cambian de sitio aunque una medida cruce a la vecina', () => {
    const calle: Calle = { ...base, anchos: [{ progresiva: 20, puntoId: 'p-vereda-d', distancia: 3.4 }] }
    const orden = construirGrilla(calle, [20]).map((c) => c.elementoClave)
    expect(orden).toEqual(construirGrilla(base, [20]).map((c) => c.elementoClave))
  })
})
```

- [ ] **Step 2: Verificar que fallan** — Run: `npm test --workspace packages/core -- grilla` → FAIL (`origenOffset` undefined, offsets 3.5).

- [ ] **Step 3: Implementar** — en `grilla.ts`:

Importar: `import { distanciaEn, type OrigenDistancia } from '../seccion/anchos'`.

En `CeldaGrilla`, sustituir `offset: number` por:

```ts
  /**
   * La distancia al eje **en esta progresiva**: la calle se ensancha y se
   * angosta, así que dos celdas de la misma columna pueden no compartirla.
   */
  offset: number
  /** De dónde sale ese offset. Lo que no es `'medida'` es una estimación y se enseña como tal. */
  origenOffset: OrigenDistancia
```

En el cuerpo del bucle de `construirGrilla`:

```ts
    for (const punto of puntosOrdenados) {
      const { distancia, origen } = distanciaEn(calle, punto.id, progresiva)
      celdas.push({
        progresiva,
        elementoClave: punto.id,
        elementoNombre: punto.nombre,
        elementoPalabra: palabraDePunto(punto),
        offset: distancia,
        origenOffset: origen,
        clave: claveCelda(progresiva, punto.id),
      })
    }
```

Y añadir al comentario de la función: «El orden de las columnas sale de la distancia **típica**, no de la de cada progresiva: las columnas de una tabla no pueden cambiar de sitio de una fila a otra.»

En `packages/app/src/esqueletoTabla.ts`, `armarEsqueletoTabla` ordena los elementos por `celda.offset` de la primera celda vista, que ahora es de una progresiva concreta. Sustituir ese criterio por la distancia típica:

```ts
  const tipica = new Map(calle.seccion.puntos.map((punto) => [punto.id, punto.distancia]))
  // …y al guardar en `vistos`:
      offset: tipica.get(celda.elementoClave) ?? celda.offset,
```

- [ ] **Step 4: Verificar** — Run: `npm test --workspaces --if-present && npm run typecheck --workspace packages/core && npm run typecheck --workspace packages/app`
Expected: PASS. Si el typecheck de `app` se queja de literales `CeldaGrilla` en pruebas, añadirles `origenOffset: 'tipica'` (es añadir un campo obligatorio nuevo, no cambiar un resultado).

- [ ] **Step 5: Commit**

```bash
git add packages
git commit -m "La grilla reparte el ancho de cada progresiva y dice si es medido o estimado"
```

---

### Task 3: La rasante se amarra a los puntos de la sección

**Files:**
- Modify: `packages/core/src/modelo/tipos.ts` (`TramoTransversal`)
- Create: `packages/core/src/rasante/amarre.ts`
- Test: `packages/core/src/rasante/amarre.test.ts`
- Modify: `packages/core/src/rasante/geometria.ts`, `espesores.ts`, `evaluar.ts`, `packages/core/src/index.ts`
- Test: `packages/core/src/rasante/evaluar.test.ts` (añadir)

**Interfaces:**
- Consumes: `distanciaEn` (Task 1)
- Produces:
  - `TramoTransversal.hastaRol?: Rol | null`
  - `type LadoRasante = 'izquierda' | 'derecha'`
  - `tramosResueltos(calle: Calle, rasante: Rasante, progresiva: number, lado: LadoRasante): TramoTransversal[]`
  - `amarrarTramos(calle: Calle): Calle` (para la migración)
  - `desnivelTransversal(rasante, offset, tramos?: TramoTransversal[])`
  - `cotaRasante(rasante, progresiva, offset, tramos?: TramoTransversal[])`
  - `cotaTeoricaDeCapa(rasante, capas, capaId, progresiva, offset, tramos?: TramoTransversal[])`

- [ ] **Step 1: Tipo** — en `TramoTransversal`, tras `valor`:

```ts
  /**
   * El rol del punto de la sección donde termina este tramo: «hasta el
   * borde». Ausente o null, el tramo termina en `hastaOffset`, fijo.
   *
   * Es el rol y no el id del punto porque los tramos de una rasante simétrica
   * valen para los dos lados: «hasta el borde» es el borde izquierdo a la
   * izquierda y el derecho a la derecha. `hastaOffset` se conserva siempre:
   * es el respaldo si el lado no tiene un punto con ese rol, y lo que dibuja
   * el corte tipo.
   */
  hastaRol?: Rol | null
```

Importar `Rol` con `import type { Rol } from '../seccion/roles'`.

- [ ] **Step 2: Pruebas que fallan** — `amarre.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { Calle, Rasante } from '../modelo/tipos'
import { seccionDeFabrica } from '../seccion/seccion'
import { amarrarTramos, tramosResueltos } from './amarre'
import { cotaRasante } from './geometria'

function rasante(amarrada: boolean): Rasante {
  return {
    progresivaArranque: 0,
    cotaArranque: 100,
    pendienteLongitudinal: 0,
    simetrica: true,
    tramosIzquierda: null,
    tramos: [
      { nombre: 'Calzada', hastaOffset: 3.5, tipo: 'pendiente', valor: 2, hastaRol: amarrada ? 'bordeCalzada' : null },
      { nombre: 'Sardinel', hastaOffset: 3.65, tipo: 'salto', valor: -0.15, hastaRol: amarrada ? 'sardinel' : null },
      { nombre: 'Vereda', hastaOffset: 5.15, tipo: 'pendiente', valor: -1.5, hastaRol: amarrada ? 'vereda' : null },
    ],
  }
}

function calle(r: Rasante, ensanchada: boolean): Calle {
  return {
    id: 'c-1', nombre: 'Av. Sol', seccion: seccionDeFabrica(), nivelaciones: [], rasante: r,
    anchos: ensanchada
      ? [
          { progresiva: 40, puntoId: 'p-borde-d', distancia: 4.2 },
          { progresiva: 40, puntoId: 'p-sardinel-d', distancia: 4.35 },
          { progresiva: 40, puntoId: 'p-vereda-d', distancia: 5.85 },
        ]
      : [],
  }
}

describe('tramosResueltos', () => {
  it('sin anchos medidos devuelve los mismos finales de tramo', () => {
    const r = rasante(true)
    expect(tramosResueltos(calle(r, false), r, 40, 'derecha').map((t) => t.hastaOffset)).toEqual([3.5, 3.65, 5.15])
  })

  it('un tramo amarrado termina donde está el punto en esa progresiva', () => {
    const r = rasante(true)
    expect(tramosResueltos(calle(r, true), r, 40, 'derecha').map((t) => t.hastaOffset)).toEqual([4.2, 4.35, 5.85])
  })

  it('el otro lado, sin medir, se queda en lo típico', () => {
    const r = rasante(true)
    expect(tramosResueltos(calle(r, true), r, 40, 'izquierda').map((t) => t.hastaOffset)).toEqual([3.5, 3.65, 5.15])
  })

  it('un tramo sin amarrar no se mueve aunque la calle se ensanche', () => {
    const r = rasante(false)
    expect(tramosResueltos(calle(r, true), r, 40, 'derecha').map((t) => t.hastaOffset)).toEqual([3.5, 3.65, 5.15])
  })

  it('si el lado no tiene punto con ese rol, vale el ancho fijo', () => {
    const r = rasante(true)
    r.tramos[2]!.hastaRol = 'cuneta'
    expect(tramosResueltos(calle(r, true), r, 40, 'derecha')[2]!.hastaOffset).toBe(5.15)
  })

  it('un tramo que terminaría antes que el anterior se queda de ancho cero', () => {
    const r = rasante(true)
    const c = calle(r, false)
    c.anchos = [{ progresiva: 40, puntoId: 'p-sardinel-d', distancia: 3 }]
    expect(tramosResueltos(c, r, 40, 'derecha').map((t) => t.hastaOffset)).toEqual([3.5, 3.5, 5.15])
  })

  it('con lados distintos usa los tramos de la izquierda', () => {
    const r: Rasante = { ...rasante(true), simetrica: false, tramosIzquierda: [
      { nombre: 'Calzada', hastaOffset: 3, tipo: 'pendiente', valor: 2, hastaRol: null },
    ] }
    expect(tramosResueltos(calle(r, false), r, 0, 'izquierda').map((t) => t.hastaOffset)).toEqual([3])
  })
})

describe('cotaRasante con tramos resueltos', () => {
  it('el bombeo llega hasta el borde real: 4.20 m al 2 % son 84 mm', () => {
    const r = rasante(true)
    const c = calle(r, true)
    expect(cotaRasante(r, 40, 4.2, tramosResueltos(c, r, 40, 'derecha'))).toBe(99.916)
  })

  it('sin pasar tramos calcula como siempre, con el ancho fijo', () => {
    expect(cotaRasante(rasante(true), 40, 3.5)).toBe(99.93)
  })
})

describe('amarrarTramos', () => {
  it('amarra el tramo cuyo final coincide con un punto de la sección', () => {
    const r = rasante(false)
    r.tramos.forEach((t) => delete t.hastaRol)
    const migrada = amarrarTramos(calle(r, false))
    expect(migrada.rasante!.tramos.map((t) => t.hastaRol)).toEqual(['bordeCalzada', 'sardinel', 'vereda'])
  })

  it('deja sin amarrar el que no coincide con ninguno', () => {
    const r = rasante(false)
    r.tramos = [{ nombre: 'Calzada', hastaOffset: 4.2, tipo: 'pendiente', valor: 2 }]
    expect(amarrarTramos(calle(r, false)).rasante!.tramos[0]!.hastaRol).toBeNull()
  })

  it('no toca un tramo que ya decidió, ni una calle sin rasante', () => {
    const r = rasante(false)
    expect(amarrarTramos(calle(r, false)).rasante!.tramos.map((t) => t.hastaRol)).toEqual([null, null, null])
    const sin: Calle = { ...calle(r, false), rasante: null }
    expect(amarrarTramos(sin)).toEqual(sin)
  })
})
```

- [ ] **Step 3: Verificar que fallan** — Run: `npm test --workspace packages/core -- amarre` → FAIL, módulo inexistente.

- [ ] **Step 4: Implementar `amarre.ts`**

```ts
import type { Calle, Rasante, TramoTransversal } from '../modelo/tipos'
import { redondear3 } from '../numero'
import { distanciaEn } from '../seccion/anchos'

export type LadoRasante = 'izquierda' | 'derecha'

// Misma regla que `tramosDelLado` en `geometria.ts`: una rasante a medio
// configurar —asimétrica y sin tramos de la izquierda— cae a los de la derecha.
function tramosDe(rasante: Rasante, lado: LadoRasante): TramoTransversal[] {
  if (lado === 'izquierda' && !rasante.simetrica && rasante.tramosIzquierda !== null) {
    return rasante.tramosIzquierda
  }
  return rasante.tramos
}

/**
 * Los tramos de ese lado con su final ya puesto para esa progresiva: el
 * amarrado termina donde esté su punto ahí, el otro donde decía.
 *
 * Vive aparte de la geometría para que aquella siga siendo aritmética pura
 * sobre una lista de tramos, y se pruebe sin montar una calle.
 *
 * Un tramo que acabaría antes que el anterior —una medida mal escrita— se
 * queda de ancho cero: ni se truena ni se inventa un orden. El aviso lo da
 * `avisosDeAnchos`, que es quien mira las medidas.
 */
export function tramosResueltos(
  calle: Calle,
  rasante: Rasante,
  progresiva: number,
  lado: LadoRasante,
): TramoTransversal[] {
  const signo = lado === 'izquierda' ? -1 : 1
  let anterior = 0

  return tramosDe(rasante, lado).map((tramo) => {
    let hasta = tramo.hastaOffset

    if (tramo.hastaRol) {
      const punto = calle.seccion.puntos.find(
        (p) => p.rol === tramo.hastaRol && Math.sign(p.distancia) === signo,
      )
      if (punto) hasta = Math.abs(distanciaEn(calle, punto.id, progresiva).distancia)
    }

    hasta = redondear3(Math.max(hasta, anterior))
    anterior = hasta
    return { ...tramo, hastaOffset: hasta }
  })
}

function amarrarLista(calle: Calle, tramos: TramoTransversal[], signos: number[]): TramoTransversal[] {
  return tramos.map((tramo) => {
    if (tramo.hastaRol !== undefined) return tramo

    const punto = calle.seccion.puntos.find(
      (p) =>
        p.rol !== 'eje' &&
        signos.includes(Math.sign(p.distancia)) &&
        redondear3(Math.abs(p.distancia)) === redondear3(tramo.hastaOffset),
    )
    return { ...tramo, hastaRol: punto ? punto.rol : null }
  })
}

/**
 * Para una rasante guardada antes de que los tramos pudieran amarrarse: el
 * que termina justo donde está un punto de la sección queda amarrado a su
 * rol. Mientras la calle no tenga anchos medidos el resultado es idéntico;
 * cuando los tenga, la cota teórica ya sigue al ancho real sin que Max tenga
 * que volver a escribir su rasante.
 *
 * Solo toca los tramos que no traen el campo: uno que ya dice `null` es una
 * decisión —«a una distancia fija»— y se respeta.
 */
export function amarrarTramos(calle: Calle): Calle {
  const rasante = calle.rasante
  if (!rasante) return calle

  return {
    ...calle,
    rasante: {
      ...rasante,
      // Los tramos de la derecha valen para los dos lados si es simétrica:
      // se busca primero a la derecha y, si no, a la izquierda.
      tramos: amarrarLista(calle, rasante.tramos, rasante.simetrica ? [1, -1] : [1]),
      tramosIzquierda: rasante.tramosIzquierda
        ? amarrarLista(calle, rasante.tramosIzquierda, [-1])
        : null,
    },
  }
}
```

- [ ] **Step 5: Geometría y espesores aceptan tramos resueltos**

`geometria.ts`:

```ts
export function desnivelTransversal(
  rasante: Rasante,
  offset: number,
  /** Los de ese lado ya resueltos para una progresiva (`tramosResueltos`). Sin ellos, los de la rasante tal cual. */
  tramosDelPunto?: TramoTransversal[],
): number | null {
  const tramos = tramosDelPunto ?? tramosDelLado(rasante, offset)
  // …resto igual…
}

export function cotaRasante(
  rasante: Rasante,
  progresiva: number,
  offset: number,
  tramosDelPunto?: TramoTransversal[],
): number | null {
  const desnivel = desnivelTransversal(rasante, offset, tramosDelPunto)
  // …resto igual…
}
```

`espesores.ts`: `cotaTeoricaDeCapa(rasante, capas, capaId, progresiva, offset, tramosDelPunto?)` y pasa el sexto a `cotaRasante`.

`evaluar.ts`, dentro del bucle, antes de `cotaTeoricaDeCapa`:

```ts
    // El ancho es el de esta progresiva: el bombeo llega hasta donde esté el
    // borde aquí, no hasta donde estaba en la sección típica.
    const tramos = tramosResueltos(calle, rasante, celda.progresiva, celda.offset < 0 ? 'izquierda' : 'derecha')
```

y pasar `tramos` como sexto argumento. `index.ts`: `export * from './rasante/amarre'`.

- [ ] **Step 6: Prueba de extremo en `evaluar.test.ts`** — añadir un caso que monte la calle de `amarre.test.ts` (ensanchada, rasante amarrada), una toma con una lectura en `40|p-borde-d` cuya cota real sea `99.916`, y compruebe `diferenciaMm === 0` y `offset === 4.2`. Construir la `EntradaEvaluacion` copiando la fábrica que ya usa ese archivo de pruebas para las suyas (no inventar otra).

- [ ] **Step 7: Verificar** — Run: `npm test --workspaces --if-present && npm run typecheck --workspace packages/core && npm run typecheck --workspace packages/app` → PASS.

- [ ] **Step 8: Commit**

```bash
git add packages
git commit -m "Los tramos de la rasante se amarran a un punto y la cota teorica sigue al ancho real"
```

---

### Task 4: Las palabras de distancia y la migración del archivo

**Files:**
- Modify: `packages/core/src/seccion/seccion.ts`
- Test: `packages/core/src/seccion/seccion.test.ts`
- Modify: `packages/app/src/archivo/topo.ts`
- Test: `packages/app/src/archivo/topo.test.ts`

**Interfaces:**
- Consumes: `amarrarTramos` (Task 3)
- Produces:
  - `Seccion.palabrasDistancia?: string[]`
  - `PALABRAS_DISTANCIA_DE_FABRICA: readonly string[]` = `['DIST', 'ANCHO', 'DISTANCIA']`
  - `palabrasDistanciaDe(seccion: Seccion): string[]`
  - `migrarProyecto` deja toda calle con `anchos` (array), tramos con `hastaRol` decidido y sección con `palabrasDistancia`.

- [ ] **Step 1: Pruebas que fallan**

En `seccion.test.ts`:

```ts
describe('palabras de distancia', () => {
  it('la sección de fábrica trae DIST, ANCHO y DISTANCIA, y no la D a secas', () => {
    expect(seccionDeFabrica().palabrasDistancia).toEqual(['DIST', 'ANCHO', 'DISTANCIA'])
  })

  it('una sección guardada sin ellas responde con las de fábrica', () => {
    const { palabrasDistancia: _, ...vieja } = seccionDeFabrica()
    expect(palabrasDistanciaDe(vieja)).toEqual(['DIST', 'ANCHO', 'DISTANCIA'])
  })

  it('una lista vaciada a propósito se respeta', () => {
    expect(palabrasDistanciaDe({ ...seccionDeFabrica(), palabrasDistancia: [] })).toEqual([])
  })
})
```

En `topo.test.ts` (usar la fábrica de proyecto que ya tenga ese archivo; si construye el proyecto a mano, seguir ese mismo patrón):

```ts
describe('migrarProyecto con ancho variable', () => {
  it('un proyecto de antes abre con la tabla de anchos vacía, los tramos decididos y las palabras de distancia', () => {
    const migrado = migrarProyecto(proyectoDeAntes())   // sin anchos, sin hastaRol, sin palabrasDistancia
    const calle = migrado.calles[0]!
    expect(calle.anchos).toEqual([])
    expect(calle.seccion.palabrasDistancia).toEqual(['DIST', 'ANCHO', 'DISTANCIA'])
    expect(calle.rasante!.tramos.every((t) => t.hastaRol !== undefined)).toBe(true)
  })

  it('migrar dos veces da lo mismo que una', () => {
    const una = migrarProyecto(proyectoDeAntes())
    expect(migrarProyecto(una)).toEqual(una)
  })

  it('no pierde los anchos que el archivo ya traía', () => {
    const p = proyectoDeAntes()
    p.calles[0]!.anchos = [{ progresiva: 20, puntoId: 'p-borde-d', distancia: 4 }]
    expect(migrarProyecto(p).calles[0]!.anchos).toEqual([{ progresiva: 20, puntoId: 'p-borde-d', distancia: 4 }])
  })
})
```

`proyectoDeAntes()` = un `Proyecto` con una calle de `seccionDeFabrica()` sin `palabrasDistancia`, y rasante con los tres tramos 3.5 / 3.65 / 5.15 sin `hastaRol`.

- [ ] **Step 2: Verificar que fallan.**

- [ ] **Step 3: Implementar**

`seccion.ts` — en `Seccion`:

```ts
  /**
   * Cómo se titula en la hoja la columna de la distancia al eje medida con
   * wincha. Ausente en una sección guardada antes de que existiera: entonces
   * valen las de fábrica (`palabrasDistanciaDe`).
   */
  palabrasDistancia?: string[]
```

```ts
/**
 * Sin `D` a secas, a propósito: en una hoja de campo lo más probable es que
 * quiera decir «derecha», y tomarla por distancia leería lecturas de mira
 * como anchos.
 */
export const PALABRAS_DISTANCIA_DE_FABRICA: readonly string[] = ['DIST', 'ANCHO', 'DISTANCIA']

export function palabrasDistanciaDe(seccion: Seccion): string[] {
  return seccion.palabrasDistancia ?? [...PALABRAS_DISTANCIA_DE_FABRICA]
}
```

y en `seccionDeFabrica()` añadir `palabrasDistancia: [...PALABRAS_DISTANCIA_DE_FABRICA]`.

`topo.ts`:

```ts
/**
 * El ancho variable trae tres campos nuevos. Un archivo de antes abre con la
 * tabla de anchos vacía —o sea, con el ancho de siempre—, con las palabras de
 * distancia de fábrica, y con cada tramo de la rasante amarrado al punto
 * donde ya terminaba, si terminaba en alguno.
 *
 * Va la última: `amarrarTramos` necesita la sección ya en su forma de hoy.
 */
function migrarAnchoVariable(proyecto: Proyecto): Proyecto {
  return {
    ...proyecto,
    calles: proyecto.calles.map((calle) =>
      amarrarTramos({
        ...calle,
        anchos: calle.anchos ?? [],
        seccion: { ...calle.seccion, palabrasDistancia: palabrasDistanciaDe(calle.seccion) },
      }),
    ),
  }
}
```

y `migrarProyecto` pasa a `migrarAnchoVariable(migrarProgresivasDeclaradas(…))`.

En `packages/app/src/estado/ejemplo.ts`: los tramos del ejemplo ganan `hastaRol` explícito (el que coincida con un punto de su sección, o `null`) y la calle `anchos: []`. Donde el almacén crea una calle nueva (`agregarCalle`) añadir `anchos: []`.

- [ ] **Step 4: Verificar** — `npm test --workspaces --if-present` y los dos typecheck → PASS.

- [ ] **Step 5: Commit** — `git commit -m "El archivo guarda anchos, amarres y palabras de distancia, y los de antes abren igual"`

---

### Task 5: El almacén escribe y borra anchos

**Files:**
- Modify: `packages/app/src/estado/almacen.ts`
- Test: `packages/app/src/estado/almacen.test.ts`

**Interfaces:**
- Consumes: `conAncho`, `sinAncho`, `palabrasDistanciaDe`
- Produces (en `EstadoApp`):
  - `fijarAncho(calleId: Id, progresiva: number, puntoId: Id, distancia: number): void`
  - `quitarAncho(calleId: Id, progresiva: number, puntoId: Id): void`
  - `ListaDePalabras` gana `'distancia'`

- [ ] **Step 1: Pruebas que fallan** — siguiendo el arranque que ya usan las pruebas de `cambiarDistancia` en ese archivo:

```ts
describe('anchos medidos', () => {
  it('fijarAncho guarda la medida en la calle y marca el proyecto modificado', () => {
    useAlmacen.getState().fijarAncho('c-1', 20, 'p-borde-d', 4.1)
    expect(calleC1().anchos).toEqual([{ progresiva: 20, puntoId: 'p-borde-d', distancia: 4.1 }])
  })

  it('escribir otra vez en la misma celda sustituye', () => {
    useAlmacen.getState().fijarAncho('c-1', 20, 'p-borde-d', 4.1)
    useAlmacen.getState().fijarAncho('c-1', 20, 'p-borde-d', 4.3)
    expect(calleC1().anchos).toHaveLength(1)
  })

  it('quitarAncho la devuelve a estimada', () => {
    useAlmacen.getState().fijarAncho('c-1', 20, 'p-borde-d', 4.1)
    useAlmacen.getState().quitarAncho('c-1', 20, 'p-borde-d')
    expect(calleC1().anchos).toEqual([])
  })

  it('quitar un punto de la sección se lleva sus anchos', () => {
    useAlmacen.getState().fijarAncho('c-1', 20, 'p-vereda-d', 6)
    useAlmacen.getState().quitarPunto('c-1', 'p-vereda-d')
    expect(calleC1().anchos).toEqual([])
  })

  it('la lista de palabras de distancia se edita como las otras tres', () => {
    useAlmacen.getState().anadirPalabraSuelta('c-1', 'distancia', 'WINCHA')
    expect(calleC1().seccion.palabrasDistancia).toContain('WINCHA')
    useAlmacen.getState().quitarPalabraSuelta('c-1', 'distancia', 'wincha')
    expect(calleC1().seccion.palabrasDistancia).not.toContain('WINCHA')
  })
})
```

(`calleC1()` = `useAlmacen.getState().proyecto.calles.find((c) => c.id === 'c-1')!`.)

- [ ] **Step 2: Verificar que fallan.**

- [ ] **Step 3: Implementar**

```ts
export type ListaDePalabras = 'progresiva' | 'puntoControl' | 'referencia' | 'distancia'
```

en `conListaDePalabras`:

```ts
    case 'distancia':
      return { ...seccion, palabrasDistancia: cambiar(palabrasDistanciaDe(seccion)) }
```

acciones, junto a `cambiarDistancia`:

```ts
  fijarAncho: (calleId, progresiva, puntoId, distancia) =>
    set((s) => ({
      proyecto: marcarModificado({
        ...s.proyecto,
        calles: s.proyecto.calles.map((calle) =>
          calle.id === calleId ? conAncho(calle, progresiva, puntoId, distancia) : calle,
        ),
      }),
    })),

  quitarAncho: (calleId, progresiva, puntoId) =>
    set((s) => ({
      proyecto: marcarModificado({
        ...s.proyecto,
        calles: s.proyecto.calles.map((calle) =>
          calle.id === calleId ? sinAncho(calle, progresiva, puntoId) : calle,
        ),
      }),
    })),
```

En `quitarPunto`, además de lo que ya hace, filtrar `anchos` de esa calle: `anchos: (calle.anchos ?? []).filter((a) => a.puntoId !== puntoId)` — un ancho de un punto que ya no existe no se puede enseñar ni borrar desde ninguna pantalla.

- [ ] **Step 4: Verificar** → PASS. **Step 5: Commit** — `"El almacen escribe y borra anchos medidos"`

---

### Task 6: La tabla «Anchos medidos por progresiva»

**Files:**
- Create: `packages/app/src/componentes/TablaAnchos.tsx`
- Test: `packages/app/src/componentes/TablaAnchos.test.tsx`
- Modify: `packages/app/src/vistas/VistaSeccion.tsx` (montarla bajo `DibujoSeccion`; añadir `'distancia'` a `LISTAS_SUELTAS`)

**Interfaces:**
- Consumes: `fijarAncho`, `quitarAncho`, `distanciaEn`, `avisosDeAnchos`, `progresivasConAncho`, `progresivasDeLaToma`, `formatearProgresiva`, `parsearProgresiva`, `CampoNumero`
- Produces: `<TablaAnchos calleId={Id} />`

Comportamiento exacto:
- **Filas** = unión, ordenada y sin repetir, de: `progresivasDeLaToma` de todas las tomas de todas las nivelaciones de la calle, `progresivasConAncho(calle)`, y las añadidas en esta sesión con «Agregar progresiva» (estado local `useState<number[]>`; una fila añadida y sin ninguna medida no se guarda).
- **Columnas** = los puntos de la sección ordenados por `distancia`, **sin** el de rol `eje`. Cabecera: `punto.nombre`.
- **Celda**: `CampoNumero` con `ariaLabel={`${punto.nombre} en ${formatearProgresiva(progresiva)}`}`, `decimales={2}`, `sufijo="m"`. Si `origen === 'medida'`, `valor` = la medida. Si no, campo vacío con `placeholder={`(${Math.abs(distancia).toFixed(2)})`}` y texto `text-slate-400 italic`. Revisar las props de `CampoNumero` antes: si no admite valor vacío o `placeholder`, añadirle esas dos props opcionales sin cambiar su comportamiento por defecto, con su prueba.
- Confirmar un número > 0 → `fijarAncho`. Dejar vacía una celda que era medida → `quitarAncho`.
- **Vacía** (la calle no tiene anchos y no hay filas añadidas): en vez de la tabla, una línea: «Si esta calle no tiene el mismo ancho en todo su largo, anota aquí la distancia al eje que mediste en cada progresiva. Lo que dejes en blanco se estima entre las medidas vecinas.» y el botón «Agregar progresiva» (si hay progresivas de nivelaciones, un botón «Anotar anchos» que despliega la tabla).
- **Agregar progresiva**: un campo de texto que acepta lo que `parsearProgresiva` acepte (`0+040`, `40`) y añade la fila.
- **Avisos**: `avisosDeAnchos(calle, filas)` en una lista `text-aviso` bajo la tabla, cada uno con su progresiva formateada delante. Leyenda fija: «( ) estimado entre medidas vecinas».

- [ ] **Step 1: Pruebas que fallan** — con Testing Library, cargando en el almacén un proyecto con la calle `c-1` de `seccionDeFabrica()` y una toma con progresivas declaradas `[0, 20, 40]`:

```tsx
it('enseña una fila por progresiva y una columna por punto, sin el eje', …)
  // getAllByRole('row') = 1 cabecera + 3; queryByRole('columnheader', { name: 'Eje' }) es null
it('escribir una distancia la guarda como medida', …)
  // type '4.1' + tab en «Borde derecho en 0+040» → calle.anchos = [{ progresiva: 40, puntoId: 'p-borde-d', distancia: 4.1 }]
it('la progresiva intermedia enseña el estimado entre paréntesis', …)
  // con medidas 3.5 en 0+000 y 4.1 en 0+040, el campo de 0+020 tiene placeholder '(3.80)' y valor vacío
it('vaciar una celda medida la devuelve a estimada', …)
it('agregar progresiva añade la fila aunque nadie haya nivelado ahí', …)
it('avisa, sin bloquear, de una vereda más cerca del eje que el borde', …)
it('sin anchos ni progresivas enseña la explicación y no una tabla vacía', …)
```

Escribir cada una completa, con el patrón de render y de `userEvent` que ya usa `VistaSeccion.test.tsx`.

- [ ] **Step 2: Verificar que fallan.**
- [ ] **Step 3: Implementar `TablaAnchos.tsx`** según el comportamiento de arriba, con las clases Tailwind de las tablas vecinas (`TablaResultados.tsx` como referencia de estilo), y montarlo en `VistaSeccion`. Añadir a `LISTAS_SUELTAS`:

```ts
  {
    lista: 'distancia',
    titulo: 'La distancia al eje',
    nombre: 'la distancia al eje',
    ayuda: 'La columna donde anotas lo que marca la wincha desde el eje: DIST, ANCHO…',
    avisoSinPalabras: 'Sin ninguna palabra, las distancias de la hoja no se leerán.',
  },
```

y donde `VistaSeccion` lee las palabras de cada lista, usar `palabrasDistanciaDe(seccion)` para esta.

- [ ] **Step 4: Verificar** → PASS + typecheck. **Step 5: Commit** — `"La pantalla de la seccion tiene su tabla de anchos por progresiva"`

---

### Task 7: El editor de rasante elige hasta dónde llega cada tramo

**Files:**
- Modify: `packages/app/src/componentes/EditorRasante.tsx`
- Test: `packages/app/src/componentes/EditorRasante.test.tsx`

**Interfaces:**
- Consumes: `TramoTransversal.hastaRol`, `ETIQUETA_ROL`, `puntos` (prop ya existente)

Comportamiento: en `TablaTramos`, delante de «Hasta el metro», un `<select aria-label={`Hasta dónde llega el tramo ${numero}${sufijo}`}>` con la opción «A una distancia fija» (`''`) y una por cada rol —distinto de `eje`— que tenga algún punto en ese lado (para la rasante simétrica, en cualquiera de los dos): texto `Hasta ${ETIQUETA_ROL[rol].toLowerCase()}` → «Hasta borde de calzada», «Hasta sardinel», «Hasta vereda».

- Elegir un rol: guarda `hastaRol: rol` **y** `hastaOffset` = `|distancia típica|` del punto de ese rol y lado, para que el corte tipo y el respaldo coincidan. Si ese valor no supera al tramo anterior, se enseña `MENSAJE_RETROCESO` y no se guarda.
- Con rol elegido, «Hasta el metro» se muestra `disabled` con ese valor.
- Elegir «A una distancia fija»: `hastaRol: null`, el campo vuelve a ser editable.
- `TablaTramos` necesita recibir `puntos` y `lado`; `agregarTramo` crea el tramo con `hastaRol: null`.
- Bajo las tablas, si algún tramo está amarrado: «Los tramos amarrados a un punto siguen el ancho medido en cada progresiva.»

- [ ] **Step 1: Pruebas que fallan**

```tsx
it('amarrar un tramo al borde guarda el rol y pone su distancia típica', …)
  // selectOptions(«Hasta dónde llega el tramo 1», 'bordeCalzada') → tramo.hastaRol === 'bordeCalzada', hastaOffset === 3.5
it('un tramo amarrado no deja escribir el metro', …)          // el CampoNumero está disabled
it('volver a distancia fija lo suelta', …)                     // hastaRol === null y el campo se habilita
it('no deja amarrar a un punto que queda antes que el tramo anterior', …)   // aparece MENSAJE_RETROCESO y no cambia
it('solo ofrece los roles que la sección tiene en ese lado', …)  // sin cuneta declarada, no hay opción «Hasta cuneta»
```

- [ ] **Step 2–4: fallar, implementar, pasar.** Si `CampoNumero` no admite `disabled`, añadirle la prop opcional.
- [ ] **Step 5: Commit** — `"En la rasante se elige hasta que punto llega cada tramo"`

---

### Task 8: El 3D y el corte dibujan el ancho real

**Files:**
- Modify: `packages/core/src/vista3d/malla.ts`, `malla.test.ts`
- Modify: `packages/app/src/componentes/Vista3D.tsx`, `Vista3D.test.tsx`
- Modify: `packages/app/src/componentes/CorteTransversal.tsx`, `CorteTransversal.test.tsx`

**Interfaces:**
- `EntradaMalla.offsets: Map<string, number>` se sustituye por `offsetDe: (progresiva: number, elemento: string) => number`.

- [ ] **Step 1: Prueba que falla en `malla.test.ts`**

```ts
it('cada esquina lleva el offset de su progresiva: la cara se abre donde la calle se ensancha', () => {
  const caras = armarCaras({
    progresivas: [0, 20],
    elementos: ['EJE', 'BD'],
    offsetDe: (progresiva, elemento) => (elemento === 'EJE' ? 0 : progresiva === 0 ? 3.5 : 4.2),
    cotaDe: () => 100,
  })
  expect(caras[0]!.esquinas.map((e) => e.offset)).toEqual([0, 3.5, 4.2, 0])
})
```

Adaptar las entradas de las pruebas existentes de ese archivo de `offsets: new Map([...])` a `offsetDe: (_p, e) => mapa.get(e) ?? 0` — es un cambio de firma, los resultados esperados no se tocan.

- [ ] **Step 2: Implementar** — en `armarCaras`: `offset: offsetDe(progresiva, elemento)`. En `Vista3D.tsx` (línea ~189), sustituir el mapa de `punto.distancia` por:

```ts
const offsetDe = (progresiva: number, elemento: string) =>
  contexto ? distanciaEn(contexto.calle, elemento, progresiva).distancia : 0
```

y pasarlo a `armarCaras`. Si el encuadre de la cámara usa el ancho máximo, calcularlo sobre todas las progresivas dibujadas, no sobre la sección típica.

- [ ] **Step 3: Prueba en `Vista3D.test.tsx`** — con una calle cuyo borde derecho pase de 3.5 a 4.2, los polígonos de la cara entre 0 y 20 no son rectángulos en planta: comprobar, con la cámara cenital que ya usen esas pruebas, que las dos `x` del lado derecho de la cara difieren.

- [ ] **Step 4: Corte transversal** — `CorteTransversal` ya dibuja con `celda.offset`. Añadir junto al rótulo de la progresiva: «ancho medido» si **todas** las celdas de esa progresiva (menos el eje) tienen `origenOffset === 'medida'`; «ancho estimado» si alguna es `'interpolada'` o `'extendida'`; nada si todas son `'tipica'`. Si el componente recibe `CeldaEvaluada` y no `CeldaGrilla`, obtener el origen con `distanciaEn(calle, celda.elementoClave, progresiva).origen`. Pruebas:

```tsx
it('dice «ancho estimado» en una progresiva entre dos medidas', …)
it('dice «ancho medido» donde se midieron todos los puntos', …)
it('no dice nada en una calle sin anchos medidos', …)
```

- [ ] **Step 5: Verificar todo** → PASS. **Step 6: Commit** — `"El 3D y el corte dibujan la calle con su ancho de cada progresiva"`

---

### Task 9: La hoja Excel trae distancias

**Files:**
- Modify: `packages/app/src/importar/interpretar.ts`, `interpretar.test.ts`
- Modify: `packages/app/src/estado/almacen.ts`, `almacen.test.ts`
- Modify: `packages/app/src/vistas/VistaSubirDatos.tsx`, `VistaSubirDatos.test.tsx`
- Modify: `packages/app/src/componentes/VistaPreviaHoja.tsx`

**Interfaces:**
- Produces en `interpretar.ts`:
  - `interface AnchoLeido { progresiva: number; puntoId: Id; distancia: number }`
  - `interface ColumnaDistancia { indice: number; palabra: string; puntoId: Id | null }`
  - `HojaInterpretada.anchos: AnchoLeido[]`, `HojaInterpretada.columnasDistancia: ColumnaDistancia[]`
  - `interpretarHoja(hoja, seccion, opciones?: { distanciaDe?: Map<number, Id> })` — `distanciaDe` asigna a mano una columna de distancia (por su índice) a un punto.
- Produces en `almacen.ts`: `importarHoja(calleId, hoja, fecha, capaId, anchosAceptados?: AnchoLeido[])` — si se omite, entran todos los de `hoja.anchos` que **no** choquen con una medida existente.

Reglas del intérprete:
1. Una cabecera que sea palabra de distancia (`esPalabraDe(palabrasDistanciaDe(seccion), celda)`) es una **columna de distancia**. No entra nunca en `sinAsignar`.
2. Su punto: `opciones.distanciaDe.get(indice)` si está; si no, el de la columna de punto colocada en `indice - 1`; si no hay, `puntoId: null`.
3. Si esa columna vecina es la del **eje**, `puntoId: null` (el eje no tiene ancho).
4. Por cada fila de datos con progresiva: si la celda es un número distinto de cero → `AnchoLeido` con `Math.abs`. Vacía, texto o cero → nada. Una fila que solo trae distancias **sí** cuenta (no va a «sin lecturas»).
5. Dos columnas de distancia sobre el mismo punto → conflicto, y ninguna de las dos produce anchos, igual que `repartirColumnas`.
6. Una columna de distancia con `puntoId: null` y algún número añade a `conflictos`: «La columna X trae distancias y no se sabe de qué punto son: elige el punto en la vista previa.»

- [ ] **Step 1: Pruebas que fallan en `interpretar.test.ts`** — con hojas construidas como las de ese archivo:

```ts
it('lee la columna DIST como la distancia del punto de su izquierda', …)
  // cabecera: ['', 'BI', 'DIST', 'EJE', 'BD', 'DIST'] ; fila: ['20','1.5','3.75','1.4','1.5','4.1']
  // anchos = [{20,'p-borde-i',3.75},{20,'p-borde-d',4.1}] ; sinAsignar = []
it('una distancia negativa entra en positivo; vacía, texto o cero no entran', …)
it('una columna de distancia pegada al eje queda sin punto y lo dice', …)
it('una columna de distancia sin columna de punto a la izquierda queda sin punto y lo dice', …)
it('con distanciaDe se coloca a mano y entonces sí produce anchos', …)
it('dos columnas de distancia del mismo punto: ninguna entra y se avisa', …)
it('la hoja real de Max, sin distancias, se lee exactamente igual que antes', …)
  // interpretar detras-del-colegio.xlsx: anchos = [], columnasDistancia = [], y lecturas/sinAsignar/conflictos/noImportado
  // toEqual a lo que daba (reutilizar las expectativas que ya tiene ese archivo para esa muestra)
```

- [ ] **Step 2–3: fallar e implementar** siguiendo las seis reglas. La detección va tras `repartirColumnas`; en el bucle de `sinAsignar`, saltar los índices de `columnasDistancia`.

- [ ] **Step 4: Almacén** — pruebas:

```ts
it('importar una hoja con distancias llena la tabla de anchos de la calle', …)
it('no pisa una medida que ya estaba: sin anchosAceptados, la existente gana', …)
it('con anchosAceptados, entran exactamente esos', …)
```

Implementación: en `importarHoja`, tras `agregarTomaComoNivelacion`, reducir los anchos a aplicar con `conAncho` sobre la calle de destino. Sin `anchosAceptados`: `hoja.anchos.filter((a) => distanciaEn(calle, a.puntoId, a.progresiva).origen !== 'medida')`.

- [ ] **Step 5: Vista previa** — en `VistaSubirDatos`:
  - estado local `distanciaDe: Map<number, Id>`, pasado a `interpretarHoja` en el `useMemo`;
  - por cada `columnasDistancia` con `puntoId === null`: bloque «Columna C «DIST» — ¿de qué punto es esta distancia?» con un `<select>` de los puntos (sin el eje). No se puede aceptar mientras quede alguna con números sin colocar (mismo mecanismo y mismo tono de mensaje que `sinColocarMedidas`);
  - **choques**: para cada `AnchoLeido` cuya pareja ya tenga medida en la calle con distinto valor, una fila «0+020 · Borde derecho: tienes 4.00 m, la hoja dice 4.10 m» con dos radios «Conservar la mía» (por defecto) / «Usar la de la hoja». Si coinciden, no se pregunta. Al aceptar, llamar a `importarHoja(..., anchosAceptados)` con los que no chocan más los que eligió usar;
  - en el resumen tras aceptar: «Entraron N anchos medidos.» cuando N > 0.
  - En `VistaPreviaHoja`, las columnas de distancia colocadas se listan junto a su punto: «Borde derecho — lecturas en E, distancia en F».

  Pruebas en `VistaSubirDatos.test.tsx`: colocar a mano una columna de distancia desbloquea el botón de aceptar; un choque sale con las dos cifras y por defecto conserva la existente; elegir «Usar la de la hoja» la sustituye.

- [ ] **Step 6: Verificar todo** → PASS + typecheck. **Step 7: Commit** — `"La hoja de campo puede traer las distancias al eje, y nunca pisa una medida en silencio"`

---

### Task 10: Navegador real y guía de uso

**Files:**
- Create: `packages/app/verificacion/anchos.mjs`
- Modify: `packages/app/verificacion/LEEME.md`, `docs/uso.md`

- [ ] **Step 1: Escribir `anchos.mjs`** con la misma estructura que `rasante.mjs` (mismo arranque de Playwright contra `http://localhost:4173`, mismo contador de comprobaciones y misma carpeta de capturas por argumento). Comprueba, sobre el proyecto de ejemplo:
  1. En **Sección**, aparece «Anchos medidos por progresiva».
  2. Escribir `3.50` en «Borde derecho en 0+000» y `4.20` en «Borde derecho en 0+040»: el campo de `0+020` enseña `(3.85)`.
  3. En **Calle**, amarrar el tramo de calzada «Hasta borde de calzada».
  4. En **Resultados**, el corte transversal de `0+020` dice «ancho estimado», y el de `0+040` tiene su punto de borde derecho más a la derecha que el de `0+000` (comparar el `cx` de los dos círculos).
  5. La cota teórica del borde derecho en `0+040` es `cota del eje − 0.084` (4.20 m al 2 %).
  6. El 3D en modo Capas dibuja caras y ninguna consola de error.
  7. Guardar el `.topo`, recargar, abrirlo: la tabla sigue con sus dos medidas.
  8. Pegar en **Subir datos** una hoja con columna `DIST`: la vista previa la coloca sola y, al aceptar, la tabla de anchos gana esas filas.

- [ ] **Step 2: Ejecutarlo de verdad**

```bash
npm run build --workspace packages/app
npx vite preview --port 4173   # desde packages/app, en segundo plano
node packages/app/verificacion/anchos.mjs <carpeta-de-capturas>
npm run verificar --workspace packages/app
node packages/app/verificacion/importar.mjs <carpeta-de-capturas>
```

Expected: todas las comprobaciones de `anchos.mjs` pasan, y `recorrido.mjs` e `importar.mjs` (las 34 de la hoja real de Max) siguen pasando **sin haberlos tocado**. Mirar las capturas.

- [ ] **Step 3: Documentar** — en `LEEME.md`, una sección «Qué comprueba `anchos.mjs`» con el mismo tono que las otras. En `docs/uso.md`, un apartado «Cuando la calle no tiene el mismo ancho»: cómo anotar las distancias, qué significan los paréntesis, cómo amarrar la rasante, y cómo titular la columna en el Excel.

- [ ] **Step 4: Commit** — `"Guion de navegador y guia para el ancho variable"`

---

## Self-review (hecho al escribir)

- **Cobertura del spec:** §3.1–3.2 → T1; §3.3 → T2 (+T8 para los que no pasan por la grilla); §3.4 → T3, T7; §4 → T6, T7, T8; §5 → T4 (palabras), T9; §6 → T4; §7 → pruebas de cada tarea + T10; §8 (lo que no entra) → nada que hacer. `VistaPreviaHoja`/`interpretar.ts` leen `punto.distancia` solo para saber el **lado** y para las filas de referencia (que no tienen progresiva): ahí la típica es lo correcto y no se cambian, pese a lo que sugiere el spec §3.3.
- **Tipos:** `distanciaEn`, `conAncho`, `sinAncho`, `tramosResueltos`, `amarrarTramos`, `palabrasDistanciaDe`, `AnchoLeido`, `offsetDe` se llaman igual en todas las tareas.
- **Afinado respecto al spec:** campos opcionales (ver Global Constraints).
