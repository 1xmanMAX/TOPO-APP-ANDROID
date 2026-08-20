# Entrega 2A — Capas apiladas y espesor real · Plan de implementación

> **Para trabajadores agénticos:** SUB-SKILL REQUERIDA: usa superpowers:subagent-driven-development para implementar este plan tarea por tarea. Los pasos usan sintaxis de casilla (`- [ ]`) para seguimiento.

**Objetivo:** que el topógrafo pueda ver, sobre la misma calle, las capas que ha ido nivelando —terreno, subrasante, sub-base, base— comparar la que quiera contra la que quiera, y saber **cuánto material se colocó realmente** en cada punto.

**Arquitectura:** se apoya en lo construido en la Entrega 1 sin reestructurarlo. El motor gana el cálculo de comparación entre campañas; la interfaz gana un selector de capas y la superposición en la tabla y en el corte. Cuatro tareas de preparación van primero, porque tocan cimientos que después salen caros de mover.

**Tech Stack:** el mismo. Ninguna dependencia nueva.

**Spec:** [`docs/superpowers/specs/2026-08-19-nivelacion-por-progresivas-design.md`](../specs/2026-08-19-nivelacion-por-progresivas-design.md), sección 2.1 (Entrega 2).

## Decisión de alcance

El diseño juntaba en la Entrega 2 dos cosas que no dependen una de otra:

- **Comparar entre sí las capas que se han medido** → cuánto material se colocó. No necesita nada más que las campañas ya registradas.
- **Comparar contra la cota teórica de proyecto** → cuánto falta cortar o rellenar, y si está en tolerancia. Necesita definir antes la **rasante de proyecto**, que es un sistema propio: por pendientes, por cotas dadas, o importada.

Se separan. Esta entrega es la primera; la rasante y el semáforo de tolerancia van en la **Entrega 2B**, con su propio plan.

Razón: la comparación entre capas medidas ya resuelve una pregunta que el topógrafo se hace todos los días —«¿cuánto material puso el contratista aquí?»— y llega antes si no espera a la rasante.

## Restricciones globales

Las mismas de la Entrega 1. Se repiten porque obligan a todas las tareas:

- **Toda la interfaz en español**, incluidos `aria-label`.
- **Nomenclatura del código en español, sin `ñ` en identificadores**, incluidas variables locales.
- **Funciona sin internet.** Cero llamadas de red.
- **`packages/app` importa `packages/core`. Nunca al revés.**
- **Los datos crudos nunca se sobrescriben.** Se guardan lecturas; las cotas y los espesores se derivan siempre.
- **Cotas y espesores con 3 decimales en la presentación, siempre vía `formatearCota`.** Un `.toFixed(3)` directo sobre una cota es un defecto.
- **Ningún mensaje al usuario dice "error de validación"** ni jerga equivalente: dice qué pasó, dónde y qué hacer.
- **La salida de pruebas queda sin ningún aviso.** Un aviso de React es un hallazgo.
- **`calcularCampania` y sus parientes no lanzan nunca**: devuelven el fallo como dato.
- Cada tarea termina con un commit en español.

## Punto de partida

225 pruebas en verde (81 en el motor, 144 en la interfaz), tipos limpios, build de 275 kB, sin vulnerabilidades, y catorce comprobaciones de punta a punta sobre Chromium real.

---

# PARTE A — Preparación

Cuatro cambios que la revisión final de la Entrega 1 señaló como «baratos ahora, caros después». Ninguno añade función visible: preparan el terreno.

---

### Tarea P1: La clave de celda, en un solo sitio

Hoy la cadena `"20|EJE"` se arma a mano en cinco archivos y se desarma con `split('|')` en un sexto. Funciona por coincidencia. En cuanto la clave gane la capa, se rompen los seis.

**Archivos:**
- Modificar: `packages/core/src/grilla/grilla.ts`
- Modificar: `packages/app/src/componentes/MapaGrilla.tsx`
- Modificar: `packages/app/src/componentes/TablaResultados.tsx`
- Modificar: `packages/app/src/componentes/PanelEstacion.tsx`
- Modificar: `packages/app/src/archivo/exportar.ts`
- Modificar: `packages/app/src/estado/almacen.ts`
- Test: `packages/core/src/grilla/grilla.test.ts`

**Interfaces:**
- Consume: `claveCelda(progresiva, elementoClave)`, que ya existe.
- Produce: `partirClaveCelda(clave: string): { progresiva: number; elementoClave: string } | null`.

- [ ] **Paso 1: Escribir la prueba que falla**

En `grilla.test.ts`:

```ts
describe('partirClaveCelda', () => {
  it('devuelve la progresiva y el elemento', () => {
    expect(partirClaveCelda('20|EJE')).toEqual({ progresiva: 20, elementoClave: 'EJE' })
  })

  it('admite progresivas con decimales', () => {
    expect(partirClaveCelda('47.25|BOR-I')).toEqual({ progresiva: 47.25, elementoClave: 'BOR-I' })
  })

  it('admite una clave de elemento que contiene el separador', () => {
    expect(partirClaveCelda('20|A|B')).toEqual({ progresiva: 20, elementoClave: 'A|B' })
  })

  it('devuelve null si no se entiende', () => {
    expect(partirClaveCelda('sin-separador')).toBeNull()
    expect(partirClaveCelda('abc|EJE')).toBeNull()
    expect(partirClaveCelda('')).toBeNull()
  })

  it('deshace lo que hace claveCelda', () => {
    for (const [progresiva, elemento] of [[0, 'EJE'], [47.25, 'VER-I'], [1000, 'PA-D']] as const) {
      expect(partirClaveCelda(claveCelda(progresiva, elemento))).toEqual({
        progresiva,
        elementoClave: elemento,
      })
    }
  })
})
```

- [ ] **Paso 2: Ejecutar y ver el fallo**

`npm test --workspace packages/core` — falla por función inexistente.

- [ ] **Paso 3: Implementar**

En `grilla.ts`:

```ts
/**
 * Deshace `claveCelda`. Está aquí, junto a quien la compone, para que el día
 * que la clave cambie de forma no haya que perseguirla por media aplicación.
 */
export function partirClaveCelda(
  clave: string,
): { progresiva: number; elementoClave: string } | null {
  const separador = clave.indexOf('|')
  if (separador <= 0) return null

  const progresiva = Number(clave.slice(0, separador))
  if (!Number.isFinite(progresiva)) return null

  const elementoClave = clave.slice(separador + 1)
  if (elementoClave === '') return null

  return { progresiva, elementoClave }
}
```

- [ ] **Paso 4: Sustituir los usos a mano**

En los cinco archivos de la interfaz, reemplaza cada `` `${progresiva}|${elementoClave}` `` por `claveCelda(progresiva, elementoClave)`, importándola de `@topo/core`.

En `almacen.ts`, la acción `seleccionar` usa `partirClaveCelda` en vez de `split('|')`:

```ts
  seleccionar: (clave) =>
    set(() => {
      if (!clave) return { seleccion: { clave: null, progresiva: null } }
      const partes = partirClaveCelda(clave)
      return { seleccion: { clave, progresiva: partes?.progresiva ?? null } }
    }),
```

- [ ] **Paso 5: Verificar y commit**

Las 225 pruebas siguen en verde, sin avisos. `npm run typecheck --workspaces` limpio.

```bash
git add -A && git commit -m "Centraliza la composición y lectura de la clave de celda"
```

---

### Tarea P2: Calcular cualquier campaña, no solo la activa

`useResultado` calcula únicamente la campaña activa y recalcula ante cualquier cambio del proyecto, aunque sea irrelevante. Comparar capas exige varios resultados a la vez.

**Archivos:**
- Modificar: `packages/app/src/estado/derivados.ts`
- Test: `packages/app/src/estado/derivados.test.tsx` (nuevo)

**Interfaces:**
- Consume: `calcularCampania` de `@topo/core`, `useAlmacen`.
- Produce:
  - `useResultadoDe(campaniaId: Id | null): ResultadoCampania | null`
  - `useResultadosDe(campaniaIds: Id[]): Map<Id, ResultadoCampania>`
  - `useResultado()` se mantiene, ahora como `useResultadoDe(campaniaActivaId)`.

- [ ] **Paso 1: Escribir las pruebas que fallan**

`derivados.test.tsx`:

```tsx
import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useAlmacen } from './almacen'
import { proyectoEjemplo } from './ejemplo'
import { useResultadoDe, useResultadosDe } from './derivados'

describe('useResultadoDe', () => {
  beforeEach(() => {
    useAlmacen.getState().cargarProyecto(proyectoEjemplo())
  })

  it('calcula la campaña que se le pida, sea la activa o no', () => {
    const { result } = renderHook(() => useResultadoDe('camp-1'))

    expect(result.current?.cotasPorCelda.get('0|EJE')?.cota).toBeCloseTo(3244.6275, 6)
  })

  it('devuelve null si esa campaña no existe', () => {
    const { result } = renderHook(() => useResultadoDe('camp-inventada'))

    expect(result.current).toBeNull()
  })

  it('devuelve null si no se le pide ninguna', () => {
    const { result } = renderHook(() => useResultadoDe(null))

    expect(result.current).toBeNull()
  })
})

describe('useResultadosDe', () => {
  beforeEach(() => {
    useAlmacen.getState().cargarProyecto(proyectoEjemplo())
  })

  it('calcula varias campañas de una vez', () => {
    const otra = useAlmacen.getState().agregarCampania({
      fecha: '2026-08-20',
      calleId: 'c-1',
      capaId: 'cap-terreno',
      bmInicialId: 'bm-1',
      estado: 'abierta',
      cierre: {
        tipo: 'cerrado',
        bmFinalId: 'bm-1',
        longitudK: 0,
        longitudKAuto: true,
        clase: 'tercerOrden',
        coeficiente: 12,
      },
    })

    const { result } = renderHook(() => useResultadosDe(['camp-1', otra]))

    expect(result.current.size).toBe(2)
    expect(result.current.get('camp-1')?.celdasLlenas).toBe(3)
    expect(result.current.get(otra)?.celdasLlenas).toBe(0)
  })

  it('omite las campañas que no existen en vez de reventar', () => {
    const { result } = renderHook(() => useResultadosDe(['camp-1', 'camp-inventada']))

    expect(result.current.size).toBe(1)
  })
})
```

- [ ] **Paso 2: Ejecutar y ver el fallo**

- [ ] **Paso 3: Implementar**

En `derivados.ts`:

```ts
/** Datos que una campaña necesita para calcularse. */
function contextoDe(proyecto: Proyecto, campaniaId: Id | null): ContextoCampania | null {
  const campania = proyecto.campanias.find((c) => c.id === campaniaId)
  if (!campania) return null
  const calle = proyecto.calles.find((c) => c.id === campania.calleId)
  if (!calle) return null
  const plantilla = proyecto.plantillas.find((p) => p.id === calle.plantillaId)
  if (!plantilla) return null
  return { campania, calle, plantilla, capa: proyecto.capas.find((c) => c.id === campania.capaId) }
}

export function useResultadoDe(campaniaId: Id | null): ResultadoCampania | null {
  const proyecto = useAlmacen((s) => s.proyecto)

  return useMemo(() => {
    const contexto = contextoDe(proyecto, campaniaId)
    if (!contexto) return null
    return calcularCampania({
      campania: contexto.campania,
      calle: contexto.calle,
      plantilla: contexto.plantilla,
      bms: proyecto.bms,
    })
  }, [proyecto, campaniaId])
}

export function useResultadosDe(campaniaIds: Id[]): Map<Id, ResultadoCampania> {
  const proyecto = useAlmacen((s) => s.proyecto)
  // Se compara por contenido y no por identidad: el llamador arma la lista en
  // cada render y no tiene por qué acordarse de memoizarla.
  const clave = campaniaIds.join(',')

  return useMemo(() => {
    const salida = new Map<Id, ResultadoCampania>()
    for (const id of clave === '' ? [] : clave.split(',')) {
      const contexto = contextoDe(proyecto, id)
      if (!contexto) continue
      salida.set(
        id,
        calcularCampania({
          campania: contexto.campania,
          calle: contexto.calle,
          plantilla: contexto.plantilla,
          bms: proyecto.bms,
        }),
      )
    }
    return salida
  }, [proyecto, clave])
}
```

Reescribe `useContexto` en términos de `contextoDe`, y `useResultado` como `useResultadoDe(campaniaActivaId)`.

- [ ] **Paso 4: Verificar y commit**

```bash
git add -A && git commit -m "Permite calcular cualquier campaña, no solo la activa"
```

---

### Tarea P3: El orden de las capas deja de ser decorativo

`Capa.orden` se asigna y nunca se usa: las listas se pintan en el orden del arreglo, y borrar deja huecos en la numeración. El espesor de esta entrega depende justamente del orden entre capas.

**Archivos:**
- Modificar: `packages/core/src/modelo/tipos.ts` (documentación del campo)
- Crear: `packages/core/src/modelo/capas.ts`
- Test: `packages/core/src/modelo/capas.test.ts`
- Modificar: `packages/app/src/estado/almacen.ts`
- Modificar: `packages/app/src/vistas/VistaProyecto.tsx`
- Test: `packages/app/src/vistas/VistaProyecto.test.tsx`

**Interfaces:**
- Produce:
  - `ordenarCapas(capas: Capa[]): Capa[]` — de arriba hacia abajo, como el paquete real.
  - `renumerarCapas(capas: Capa[]): Capa[]` — orden consecutivo desde 0, sin huecos.
  - `capaEnUso(capas: Capa[], campanias: Campania[], capaId: Id): boolean`

- [ ] **Paso 1: Escribir las pruebas que fallan**

`capas.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { Capa } from './tipos'
import { ordenarCapas, renumerarCapas } from './capas'

const capas: Capa[] = [
  { id: 'b', nombre: 'BASE', orden: 2 },
  { id: 't', nombre: 'TERRENO', orden: 0 },
  { id: 's', nombre: 'SUBRASANTE', orden: 1 },
]

describe('ordenarCapas', () => {
  it('ordena de arriba hacia abajo del paquete', () => {
    expect(ordenarCapas(capas).map((c) => c.nombre)).toEqual(['TERRENO', 'SUBRASANTE', 'BASE'])
  })

  it('no altera el arreglo que recibe', () => {
    const copia = [...capas]
    ordenarCapas(capas)
    expect(capas).toEqual(copia)
  })

  it('deja las de igual orden en el orden en que venían', () => {
    const empatadas: Capa[] = [
      { id: 'x', nombre: 'X', orden: 1 },
      { id: 'y', nombre: 'Y', orden: 1 },
    ]
    expect(ordenarCapas(empatadas).map((c) => c.id)).toEqual(['x', 'y'])
  })
})

describe('renumerarCapas', () => {
  it('cierra los huecos que deja un borrado', () => {
    const conHuecos: Capa[] = [
      { id: 't', nombre: 'TERRENO', orden: 0 },
      { id: 'b', nombre: 'BASE', orden: 7 },
    ]
    expect(renumerarCapas(conHuecos).map((c) => c.orden)).toEqual([0, 1])
  })

  it('conserva el orden relativo', () => {
    expect(renumerarCapas(capas).map((c) => c.nombre)).toEqual(['TERRENO', 'SUBRASANTE', 'BASE'])
  })
})
```

Y en `VistaProyecto.test.tsx`:

```tsx
  it('no deja borrar una capa que alguna campaña está usando', async () => {
    const usuario = userEvent.setup()
    render(<VistaProyecto />)

    await usuario.click(screen.getByRole('button', { name: 'Eliminar capa SUBRASANTE' }))

    expect(screen.getByText(/la usa una campaña/i)).toBeInTheDocument()
    expect(useAlmacen.getState().proyecto.capas).toHaveLength(2)
  })
```

- [ ] **Paso 2: Ejecutar y ver los fallos**

- [ ] **Paso 3: Implementar el módulo del core**

`capas.ts`:

```ts
import type { Campania, Capa, Id } from './tipos'

/** De arriba hacia abajo del paquete: terreno primero, carpeta al final. */
export function ordenarCapas(capas: Capa[]): Capa[] {
  return [...capas].sort((a, b) => a.orden - b.orden)
}

/** Orden consecutivo desde cero. Un borrado deja huecos que hay que cerrar. */
export function renumerarCapas(capas: Capa[]): Capa[] {
  return ordenarCapas(capas).map((capa, indice) => ({ ...capa, orden: indice }))
}

export function capaEnUso(campanias: Campania[], capaId: Id): boolean {
  return campanias.some((campania) => campania.capaId === capaId)
}
```

Expórtalo desde `packages/core/src/index.ts`.

- [ ] **Paso 4: Usarlo en el almacén**

`agregarCapa` numera con `capas.length` y luego renumera; `eliminarCapa` **no borra si la capa está en uso** y renumera cuando sí borra:

```ts
  agregarCapa: (nombre) =>
    set((s) => ({
      proyecto: marcarModificado({
        ...s.proyecto,
        capas: renumerarCapas([
          ...s.proyecto.capas,
          { id: nuevoId('cap'), nombre, orden: s.proyecto.capas.length },
        ]),
      }),
    })),

  eliminarCapa: (id) =>
    set((s) => {
      // Borrar una capa en uso dejaría campañas apuntando a algo inexistente,
      // y al comparar capas produciría comparaciones fantasma.
      if (capaEnUso(s.proyecto.campanias, id)) return {}
      return {
        proyecto: marcarModificado({
          ...s.proyecto,
          capas: renumerarCapas(s.proyecto.capas.filter((capa) => capa.id !== id)),
        }),
      }
    }),
```

- [ ] **Paso 5: Decirlo en la pantalla**

En `VistaProyecto`, la lista de capas se pinta con `ordenarCapas`, y al intentar borrar una en uso se explica en vez de no hacer nada:

```tsx
              <button
                type="button"
                onClick={() => {
                  if (capaEnUso(campanias, capa.id)) {
                    setAvisoCapa(`No se puede borrar ${capa.nombre}: la usa una campaña. Cámbiala de capa primero.`)
                    return
                  }
                  if (porEliminar === capa.id) {
                    eliminarCapa(capa.id)
                    setPorEliminar(null)
                  } else {
                    setPorEliminar(capa.id)
                  }
                }}
```

con `const [avisoCapa, setAvisoCapa] = useState<string | null>(null)` y su párrafo debajo de la lista.

- [ ] **Paso 6: Verificar y commit**

```bash
git add -A && git commit -m "El orden de las capas manda, y no se borra una capa en uso"
```

---

### Tarea P4: Un solo marco para los dos gráficos

`PerfilLongitudinal` reproduce casi entero el andamiaje de `CorteTransversal`: constantes, escalas, marcas, rejilla y rótulos. Esta entrega mete series superpuestas en **ambos**. Se extrae ahora, mientras son dos implementaciones idénticas y no dos divergentes.

**Archivos:**
- Crear: `packages/app/src/grafico/MarcoGrafico.tsx`
- Test: `packages/app/src/grafico/MarcoGrafico.test.tsx`
- Modificar: `packages/app/src/componentes/CorteTransversal.tsx`
- Modificar: `packages/app/src/componentes/PerfilLongitudinal.tsx`

**Interfaces:**
- Consume: `escalaLineal`, `extension`, `marcas` de `../grafico/escala`; `formatearCota` de `../formato`.
- Produce:

```tsx
interface PropsMarco {
  valoresX: number[]
  valoresY: number[]
  rotuloX: string
  formatearX: (valor: number) => string
  alto?: number
  etiqueta: string
  children: (escalas: { x: (v: number) => number; y: (v: number) => number }) => ReactNode
}
```

El marco calcula dominios y escalas, dibuja ejes, rejilla y rótulos, y entrega las escalas a quien dibuja las series.

- [ ] **Paso 1: Escribir la prueba que falla**

```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import MarcoGrafico from './MarcoGrafico'

describe('MarcoGrafico', () => {
  it('dibuja los ejes y entrega escalas utilizables a las series', () => {
    render(
      <MarcoGrafico
        valoresX={[0, 10]}
        valoresY={[3244.5, 3245.1]}
        rotuloX="distancia al eje (m)"
        formatearX={(v) => v.toFixed(1)}
        etiqueta="Gráfico de prueba"
      >
        {({ x, y }) => <circle data-testid="punto" cx={x(5)} cy={y(3244.8)} r={3} />}
      </MarcoGrafico>,
    )

    expect(screen.getByRole('img', { name: 'Gráfico de prueba' })).toBeInTheDocument()
    expect(screen.getByText('distancia al eje (m)')).toBeInTheDocument()

    const punto = screen.getByTestId('punto')
    expect(Number(punto.getAttribute('cx'))).toBeGreaterThan(0)
    expect(Number(punto.getAttribute('cy'))).toBeGreaterThan(0)
  })

  it('rotula el eje vertical con cotas de tres decimales', () => {
    render(
      <MarcoGrafico
        valoresX={[0, 10]}
        valoresY={[3244.5, 3245.1]}
        rotuloX="x"
        formatearX={(v) => String(v)}
        etiqueta="Gráfico"
      >
        {() => null}
      </MarcoGrafico>,
    )

    expect(screen.getByText(/^3244\.\d{3}$/)).toBeInTheDocument()
  })
})
```

- [ ] **Paso 2: Ejecutar y ver el fallo**

- [ ] **Paso 3: Implementar el marco**

Toma el andamiaje que hoy tiene `CorteTransversal` —constantes `ANCHO`, `ALTO`, `MARGEN`, el cálculo de dominios con `extension`, las escalas, las líneas de rejilla y las etiquetas de ambos ejes— y muévelo aquí, sustituyendo lo específico del corte por las props. Las etiquetas del eje vertical usan `formatearCota`. El `alto` es opcional para que el perfil pueda ser más bajo que el corte.

- [ ] **Paso 4: Reescribir los dos gráficos sobre el marco**

Cada uno conserva **solo** su parte propia: el trazo de la polilínea, sus puntos con sus `aria-label`, el manejo del clic y del teclado, y su mensaje de «todavía no tiene lecturas». Todo lo demás sale del marco.

Comprueba que las pruebas de ambos componentes siguen pasando **sin modificarlas**: sus `aria-label` y textos no deben cambiar. Si alguna falla, párate y repórtalo.

- [ ] **Paso 5: Verificar y commit**

```bash
git add -A && git commit -m "Extrae el marco común de los dos gráficos"
```

---

# PARTE B — Capas y espesores

---

### Tarea E1: Comparar dos campañas

El cálculo que responde «¿cuánto material se puso aquí?».

**Archivos:**
- Crear: `packages/core/src/capas/comparar.ts`
- Test: `packages/core/src/capas/comparar.test.ts`
- Modificar: `packages/core/src/index.ts`

**Interfaces:**
- Consume: `ResultadoCampania`, `CotaCelda`.
- Produce:

```ts
export interface CeldaComparada {
  clave: string
  progresiva: number
  elementoClave: string
  offset: number
  /** Cota de la capa de abajo, o null si esa celda no se midió en ella. */
  cotaInferior: number | null
  /** Cota de la capa de arriba, o null. */
  cotaSuperior: number | null
  /** Superior − inferior. Null si falta alguna de las dos. */
  espesor: number | null
}

export interface ResultadoComparacion {
  celdas: Map<string, CeldaComparada>
  /** Celdas con espesor calculable. */
  comparables: number
  /** Medidas en una capa pero no en la otra. */
  sinPareja: number
  espesorMinimo: number | null
  espesorMaximo: number | null
  espesorMedio: number | null
  avisos: Aviso[]
}

export function compararCapas(
  inferior: ResultadoCampania,
  superior: ResultadoCampania,
): ResultadoComparacion
```

- [ ] **Paso 1: Escribir las pruebas que fallan**

```ts
import { describe, expect, it } from 'vitest'
import type { CotaCelda, ResultadoCampania } from '../nivelacion/calcularCampania'
import { compararCapas } from './comparar'

function celda(clave: string, progresiva: number, elemento: string, cota: number): CotaCelda {
  return {
    clave,
    progresiva,
    elementoClave: elemento,
    offset: 0,
    cota,
    cotaCruda: cota,
    correccion: 0,
    lecturas: [1],
  }
}

function resultado(celdas: CotaCelda[]): ResultadoCampania {
  return {
    cotasPorCelda: new Map(celdas.map((c) => [c.clave, c])),
    cotasInstrumento: [],
    cierre: {
      tipo: 'cerrado',
      cotaLlegadaCalculada: null,
      cotaLlegadaConocida: null,
      errorMm: null,
      longitudKKm: 0,
      toleranciaMm: null,
      pasa: true,
    },
    avisos: [],
    celdasTotales: 10,
    celdasLlenas: celdas.length,
    error: null,
  }
}

describe('compararCapas', () => {
  it('el espesor es la diferencia entre la capa de arriba y la de abajo', () => {
    const inferior = resultado([celda('0|EJE', 0, 'EJE', 3244.625)])
    const superior = resultado([celda('0|EJE', 0, 'EJE', 3244.873)])

    const comparacion = compararCapas(inferior, superior)

    expect(comparacion.celdas.get('0|EJE')?.espesor).toBeCloseTo(0.248, 9)
    expect(comparacion.comparables).toBe(1)
  })

  it('no inventa espesor donde falta una de las dos medidas', () => {
    const inferior = resultado([celda('0|EJE', 0, 'EJE', 3244.625)])
    const superior = resultado([celda('20|EJE', 20, 'EJE', 3244.873)])

    const comparacion = compararCapas(inferior, superior)

    expect(comparacion.celdas.get('0|EJE')?.espesor).toBeNull()
    expect(comparacion.celdas.get('20|EJE')?.espesor).toBeNull()
    expect(comparacion.comparables).toBe(0)
    expect(comparacion.sinPareja).toBe(2)
  })

  it('resume el espesor mínimo, máximo y medio', () => {
    const inferior = resultado([
      celda('0|EJE', 0, 'EJE', 3244.600),
      celda('20|EJE', 20, 'EJE', 3244.600),
    ])
    const superior = resultado([
      celda('0|EJE', 0, 'EJE', 3244.800),
      celda('20|EJE', 20, 'EJE', 3244.900),
    ])

    const comparacion = compararCapas(inferior, superior)

    expect(comparacion.espesorMinimo).toBeCloseTo(0.2, 9)
    expect(comparacion.espesorMaximo).toBeCloseTo(0.3, 9)
    expect(comparacion.espesorMedio).toBeCloseTo(0.25, 9)
  })

  it('avisa cuando la capa de arriba queda por debajo de la de abajo', () => {
    const inferior = resultado([celda('0|EJE', 0, 'EJE', 3244.900)])
    const superior = resultado([celda('0|EJE', 0, 'EJE', 3244.625)])

    const comparacion = compararCapas(inferior, superior)

    const aviso = comparacion.avisos.find((a) => a.clave === '0|EJE')
    expect(aviso?.nivel).toBe('advertencia')
    expect(aviso?.mensaje).toContain('por debajo')
    expect(comparacion.celdas.get('0|EJE')?.espesor).toBeCloseTo(-0.275, 9)
  })

  it('devuelve un resumen vacío sin celdas comparables', () => {
    const comparacion = compararCapas(resultado([]), resultado([]))

    expect(comparacion.comparables).toBe(0)
    expect(comparacion.espesorMedio).toBeNull()
    expect(comparacion.avisos).toEqual([])
  })
})
```

- [ ] **Paso 2: Ejecutar y ver el fallo**

- [ ] **Paso 3: Implementar**

Recorre la unión de las claves de ambos resultados. Para cada una compone la celda comparada con lo que haya; el espesor solo si están las dos cotas. Un espesor negativo genera aviso de advertencia con el texto:

```
`${formatearProgresiva(progresiva)} ${elementoClave}: la capa de arriba quedó ${Math.abs(espesor * 1000).toFixed(0)} mm por debajo de la de abajo. Revisa cuál es cuál, o si hubo una excavación.`
```

Sin redondear nada por el camino: los espesores se redondean solo al mostrarse.

- [ ] **Paso 4: Verificar y commit**

```bash
git add -A && git commit -m "Compara dos capas y calcula el espesor real colocado"
```

---

### Tarea E2: Elegir qué capas se ven y cuáles se comparan

El selector que el usuario pidió expresamente: *«que aparezca un selector con todas las capas y pueda seleccionar cuáles comparar o cuáles plasmar»*.

**Archivos:**
- Crear: `packages/app/src/componentes/SelectorCapas.tsx`
- Test: `packages/app/src/componentes/SelectorCapas.test.tsx`
- Modificar: `packages/app/src/estado/almacen.ts`

**Interfaces:**
- Estado nuevo en el almacén:
  - `capasVisibles: Id[]` — campañas que se dibujan.
  - `comparacion: { inferior: Id | null; superior: Id | null }`
  - `alternarCapaVisible(campaniaId: Id): void`
  - `fijarComparacion(inferior: Id | null, superior: Id | null): void`
- Produce: `SelectorCapas()`, que lista las campañas **de la calle activa**, agrupadas por capa y ordenadas por el orden de la capa.

- [ ] **Paso 1: Escribir las pruebas que fallan**

Cubre: que lista solo las campañas de la calle activa; que marcar y desmarcar cambia `capasVisibles`; que elegir inferior y superior fija la comparación; que no deja comparar una campaña consigo misma; y que al cambiar de calle se limpia lo que ya no aplica.

- [ ] **Paso 2: Ejecutar y ver los fallos**

- [ ] **Paso 3: Implementar**

Cada campaña de la calle activa aparece con su capa, su fecha y una casilla para dibujarla. Dos desplegables eligen cuál va abajo y cuál arriba en la comparación, con la opción vacía «—» para no comparar. Al elegir la misma en ambos, el segundo desplegable se limpia y se explica: *«Una capa no se compara consigo misma»*.

- [ ] **Paso 4: Verificar y commit**

```bash
git add -A && git commit -m "Selector de capas para dibujar y comparar"
```

---

### Tarea E3: La tabla de espesores

**Archivos:**
- Crear: `packages/app/src/componentes/TablaEspesores.tsx`
- Test: `packages/app/src/componentes/TablaEspesores.test.tsx`
- Modificar: `packages/app/src/vistas/VistaResultados.tsx`

- [ ] **Paso 1: Escribir las pruebas que fallan**

Cubre: que muestra el espesor en la celda cuando hay ambas cotas; que muestra un guion largo cuando falta una; que el resumen dice el mínimo, el máximo y el medio; que las celdas son clicables como las de la tabla de cotas; y que sin comparación elegida invita a elegirla en vez de quedarse en blanco.

- [ ] **Paso 2: Ejecutar y ver los fallos**

- [ ] **Paso 3: Implementar**

Misma forma que `TablaResultados` —progresivas en filas, elementos en columnas ordenados por distancia al eje— pero mostrando espesores. Los valores se muestran con `formatearCota`. Bajo la tabla, una línea de resumen:

```
Espesor colocado: mínimo 0.192 m · medio 0.248 m · máximo 0.301 m · 42 de 70 celdas comparables
```

- [ ] **Paso 4: Verificar y commit**

```bash
git add -A && git commit -m "Tabla de espesores reales entre dos capas"
```

---

### Tarea E4: El corte con las capas superpuestas

**Archivos:**
- Modificar: `packages/app/src/componentes/CorteTransversal.tsx`
- Test: `packages/app/src/componentes/CorteTransversal.test.tsx`

- [ ] **Paso 1: Escribir las pruebas que fallan**

Cubre: que con dos capas visibles se dibujan dos trazos; que el relleno entre ellas aparece solo donde ambas tienen cota; que cada capa lleva su nombre; y que con una sola capa visible se ve igual que antes — las pruebas existentes deben seguir pasando sin tocarlas.

- [ ] **Paso 2: Ejecutar y ver los fallos**

- [ ] **Paso 3: Implementar**

El corte pasa a recibir las campañas visibles del almacén y dibuja una serie por cada una, sobre el `MarcoGrafico` de la Tarea P4, cuyos dominios ahora abarcan todas las series. Entre dos capas consecutivas visibles, un relleno translúcido que **solo cubre los tramos donde ambas tienen cota**: rellenar sobre una capa incompleta dibujaría material que nadie midió.

Cada serie lleva su nombre de capa junto al primer punto.

- [ ] **Paso 4: Verificar y commit**

```bash
git add -A && git commit -m "Corte transversal con las capas apiladas y su relleno"
```

---

### Tarea E5: Exportar la comparación

**Archivos:**
- Modificar: `packages/app/src/archivo/exportar.ts`
- Test: `packages/app/src/archivo/exportar.test.ts`
- Modificar: `packages/app/src/vistas/VistaResultados.tsx`

- [ ] **Paso 1: Escribir las pruebas que fallan**

Cubre: que la tabla exportada de espesores lleva su cabecera con las dos capas comparadas, sus fechas y el resumen; que las celdas sin pareja salen vacías y no como cero; y que el estado de verificación de **ambas** campañas aparece en la cabecera — porque un espesor calculado sobre una nivelación no comprobada tampoco está comprobado.

- [ ] **Paso 2: Ejecutar y ver los fallos**

- [ ] **Paso 3: Implementar**

`armarTablaEspesores(comparacion, calle, plantilla)` con la misma forma que `armarTabla`, y `armarCabeceraComparacion(...)` con las dos capas, sus fechas, sus veredictos de cierre y el resumen de espesores. Si cualquiera de las dos campañas no está verificada, el estado dice `ESPESORES NO COMPROBADOS` y explica cuál de las dos falla.

- [ ] **Paso 4: Verificar y commit**

```bash
git add -A && git commit -m "Exporta la comparación de capas con su cabecera"
```

---

### Tarea E6: Cierre de la Entrega 2A

- [ ] **Paso 1: Batería completa**

`npm test` en ambos paquetes, sin avisos. `npm run typecheck --workspaces`. `npm run build --workspace packages/app`, anotando el tamaño. `npm audit --omit=dev`.

- [ ] **Paso 2: Verificación en navegador real**

Amplía `packages/app/verificacion/recorrido.mjs` con el flujo nuevo: crear una segunda campaña sobre la misma calle con otra capa, escribir alguna lectura, elegir las dos capas en el selector, y comprobar que la tabla de espesores muestra la diferencia y que el corte dibuja dos trazos. Ejecútalo y deja las capturas.

- [ ] **Paso 3: Documentación**

Amplía `docs/uso-entrega-1.md` —o crea la guía de la Entrega 2A— con el flujo de capas: cómo registrar la campaña de la capa siguiente, cómo elegir qué comparar, y cómo leer la tabla de espesores. Actualiza el README.

- [ ] **Paso 4: Commit**

```bash
git add -A && git commit -m "Cierre de la Entrega 2A: verificación completa y guía"
```

---

## Lo que queda para la Entrega 2B

La **rasante de proyecto** y todo lo que depende de ella: cota teórica por punto, corte y relleno contra proyecto, y el semáforo de tolerancia por capa. Necesita definir antes cómo se introduce la rasante —por pendientes, por cotas dadas en puntos, o importada— y eso merece su propia conversación con el usuario, porque el expediente técnico de cada obra la da de una forma distinta.
