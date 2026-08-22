# Entrega 3 — Visor 3D: plan de implementación

> **Para trabajadores agénticos:** SUB-SKILL REQUERIDA: usa
> superpowers:subagent-driven-development para implementar este plan tarea por
> tarea. Los pasos usan casillas (`- [ ]`) para el seguimiento.

**Objetivo:** ver la calle entera en volumen —pintada por su estado, con las
capas apiladas y seccionable con el deslizador— sin añadir ni una dependencia.

**Arquitectura:** la proyección axonométrica y el armado de caras entran en
`packages/core/src/vista3d/` como motor puro, testeable con números. La interfaz
dibuja en SVG, como el corte transversal y el perfil, reutilizando el marco
gráfico, la paleta y los textos de estado que ya existen.

**Stack:** TypeScript, React 19, Vite 7, Tailwind v4, Vitest + jsdom + Testing
Library, Zustand. **Sin dependencias nuevas.**

**Spec:** `docs/superpowers/specs/2026-08-21-visor-3d-design.md`

## Restricciones globales

- Español en identificadores, textos, comentarios y mensajes de commit. **Sin `ñ`
  en identificadores** (`Campania`, no `Campaña`); en textos visibles sí va la ñ.
- `packages/core` es motor puro: sin DOM, sin red, sin entrada ni salida. Nunca
  importa de `packages/app`.
- **Sin dependencias nuevas.** Si una tarea parece necesitar una, para y dilo.
- Los datos crudos no se sobrescriben jamás; todo se deriva.
- Toda cota que se muestre pasa por `formatearCota` (`packages/app/src/formato.ts`).
- Las diferencias se dicen en **milímetros y con signo**.
- Nada de jerga de programador en textos visibles.
- **El color nunca es el único portador de significado.**
- Un dato calculado sobre una nivelación que no cerró se marca como **no
  comprobado**, en pantalla y en los archivos.
- **La campaña de referencia se recibe por parámetro**, nunca leyendo el estado
  global desde el componente. Esta regla costó cuatro rondas de arreglo en la
  entrega anterior: los cuatro componentes de vista la cumplen y el quinto
  también tiene que cumplirla.
- La salida de las pruebas queda **sin avisos**.

## Datos de referencia verificados

La proyección se comprobó ejecutándola antes de escribir este plan. Con giro 45°
e inclinación 35.264° —el isométrico clásico— y exageración 1:

| punto | pantallaX | pantallaY |
|---|---|---|
| `(1, 0, 0)` | `0.707` | `0.408` |
| `(0, 1, 0)` | `−0.707` | `0.408` |
| `(0, 0, 1)` | `0` | `−0.817` |

Los ejes X e Y caen a **30° exactos** de la horizontal; Z queda vertical.

Y la exageración vertical, sobre una calle de 180 m que ocupa 103.9 unidades:

| exageración | 1 m de desnivel | del largo |
|---|---|---|
| 1× | 0.8 | 0.8 % |
| 10× | 8.2 | 7.9 % |
| **25×** | **20.4** | **19.6 %** |
| 50× | 40.8 | 39.3 % |

Por eso el valor de partida es 25×.

## Estructura de archivos

**Motor** (`packages/core/src/`)

| Archivo | Responsabilidad |
|---|---|
| `vista3d/proyeccion.ts` (crear) | `proyectarPunto`: del mundo real a la pantalla |
| `vista3d/malla.ts` (crear) | `armarCaras`, `ordenarPorProfundidad`: de la grilla a caras dibujables |
| `index.ts` (modificar) | Exporta los dos módulos |

**Interfaz** (`packages/app/src/`)

| Archivo | Responsabilidad |
|---|---|
| `componentes/Vista3D.tsx` (crear) | El dibujo y sus modos |
| `componentes/ControlesVista3D.tsx` (crear) | Giro, inclinación, exageración, vistas guardadas |
| `componentes/ResumenVista3D.tsx` (crear) | Lo que el dibujo enseña, en texto |
| `estado/almacen.ts` (modificar) | La cámara: giro, inclinación, exageración, modo |
| `vistas/VistaResultados.tsx` (modificar) | Aloja el visor dentro del grupo de control |

---

## Tarea V1: La proyección

**Archivos:**
- Crear: `packages/core/src/vista3d/proyeccion.ts`
- Test: `packages/core/src/vista3d/proyeccion.test.ts`
- Modificar: `packages/core/src/index.ts`

**Interfaces:**
- Produce:
  - `interface Camara { giro: number; inclinacion: number; exageracion: number }` (grados y factor)
  - `interface PuntoProyectado { x: number; y: number; profundidad: number }`
  - `proyectarPunto(x: number, y: number, z: number, camara: Camara): PuntoProyectado`
  - `const CAMARA_ISOMETRICA: Camara`, `CAMARA_PLANTA: Camara`, `CAMARA_ALZADO: Camara`

- [ ] **Paso 1: Escribir las pruebas que fallan**

Crea `packages/core/src/vista3d/proyeccion.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { CAMARA_ALZADO, CAMARA_ISOMETRICA, CAMARA_PLANTA, proyectarPunto, type Camara } from './proyeccion'

const ISO: Camara = { giro: 45, inclinacion: 35.264, exageracion: 1 }

describe('proyectarPunto', () => {
  it('coloca los ejes del isométrico clásico a 30 grados de la horizontal', () => {
    const ejeX = proyectarPunto(1, 0, 0, ISO)
    const ejeY = proyectarPunto(0, 1, 0, ISO)

    expect(ejeX.x).toBeCloseTo(0.707, 3)
    expect(ejeX.y).toBeCloseTo(0.408, 3)
    expect(ejeY.x).toBeCloseTo(-0.707, 3)
    expect(ejeY.y).toBeCloseTo(0.408, 3)

    // 0.408 / 0.707 = tan(30°)
    const grados = (Math.atan2(ejeX.y, ejeX.x) * 180) / Math.PI
    expect(grados).toBeCloseTo(30, 1)
  })

  it('deja el eje de las cotas vertical, y hacia arriba', () => {
    const ejeZ = proyectarPunto(0, 0, 1, ISO)

    expect(ejeZ.x).toBeCloseTo(0, 6)
    // Negativo porque en pantalla el eje vertical crece hacia abajo:
    // más cota, más arriba.
    expect(ejeZ.y).toBeCloseTo(-0.817, 3)
  })

  it('el origen se proyecta en el origen', () => {
    const origen = proyectarPunto(0, 0, 0, ISO)

    expect(origen.x).toBe(0)
    expect(origen.y).toBe(0)
  })

  it('con la cámara en planta, la cota no mueve el punto en pantalla', () => {
    const abajo = proyectarPunto(3, 7, 0, { giro: 45, inclinacion: 90, exageracion: 1 })
    const arriba = proyectarPunto(3, 7, 5, { giro: 45, inclinacion: 90, exageracion: 1 })

    expect(arriba.x).toBeCloseTo(abajo.x, 6)
    expect(arriba.y).toBeCloseTo(abajo.y, 6)
    // Pero sí cambia la profundidad: sigue estando más cerca de la cámara.
    expect(arriba.profundidad).toBeGreaterThan(abajo.profundidad)
  })

  it('con la cámara en alzado, avanzar de progresiva no sube ni baja el punto', () => {
    const punto = proyectarPunto(0, 7, 0, { giro: 45, inclinacion: 0, exageracion: 1 })

    expect(punto.y).toBeCloseTo(0, 6)
  })

  it('la exageración vertical solo estira las cotas, no las distancias', () => {
    const sinExagerar = proyectarPunto(4.2, 20, 2, { ...ISO, exageracion: 1 })
    const exagerado = proyectarPunto(4.2, 20, 2, { ...ISO, exageracion: 25 })

    expect(exagerado.x).toBeCloseTo(sinExagerar.x, 6)
    // La cota aporta -z·e·cos(inclinacion); con e=25 aporta 25 veces más.
    const aporteSimple = sinExagerar.y - (4.2 * Math.sin((45 * Math.PI) / 180) + 20 * Math.cos((45 * Math.PI) / 180)) * Math.sin((35.264 * Math.PI) / 180)
    const aporteExagerado = exagerado.y - (4.2 * Math.sin((45 * Math.PI) / 180) + 20 * Math.cos((45 * Math.PI) / 180)) * Math.sin((35.264 * Math.PI) / 180)
    expect(aporteExagerado).toBeCloseTo(aporteSimple * 25, 6)
  })

  it('una exageración de 1 deja un metro de desnivel casi invisible frente a la calle', () => {
    // Una calle de 180 m ocupa 103.9 unidades; 1 m de desnivel, 0.8.
    const inicio = proyectarPunto(0, 0, 0, ISO)
    const fin = proyectarPunto(0, 180, 0, ISO)
    const largo = Math.abs(fin.y - inicio.y)
    const desnivel = Math.abs(proyectarPunto(0, 0, 1, ISO).y)

    expect(largo).toBeCloseTo(103.9, 1)
    expect(desnivel / largo).toBeLessThan(0.01)
  })

  it('con la exageración de partida, ese mismo metro sí se ve', () => {
    const camara = { ...ISO, exageracion: 25 }
    const largo = Math.abs(proyectarPunto(0, 180, 0, camara).y)
    const desnivel = Math.abs(proyectarPunto(0, 0, 1, camara).y)

    expect(desnivel / largo).toBeCloseTo(0.196, 2)
  })

  it('las cámaras guardadas son las que dicen ser', () => {
    expect(CAMARA_ISOMETRICA.giro).toBe(45)
    expect(CAMARA_ISOMETRICA.inclinacion).toBeCloseTo(35.264, 3)
    expect(CAMARA_PLANTA.inclinacion).toBe(90)
    expect(CAMARA_ALZADO.inclinacion).toBe(0)
    expect(CAMARA_ISOMETRICA.exageracion).toBe(25)
  })
})
```

- [ ] **Paso 2: Ejecutar y ver que falla**

Run: `npm test --workspace packages/core`
Esperado: FALLA, no encuentra `./proyeccion`.

- [ ] **Paso 3: Escribir la implementación**

Crea `packages/core/src/vista3d/proyeccion.ts`:

```ts
/**
 * Cómo se mira la calle. Los ángulos van en grados porque es lo que se enseña
 * y se escribe en la pantalla; convertir a radianes es cosa de aquí dentro.
 */
export interface Camara {
  /** Vuelta alrededor del eje vertical, en grados. */
  giro: number
  /** Altura de la cámara sobre el horizonte: 90 es planta pura, 0 es alzado. */
  inclinacion: number
  /**
   * Cuánto se estiran las cotas. Sin esto la calle se ve plana: 180 m de calle
   * ocupan 103.9 unidades de pantalla y un metro de desnivel ocupa 0.8, que es
   * el 0.8 %. Con 25 pasa a ser el 20 %, que ya se lee.
   */
  exageracion: number
}

export interface PuntoProyectado {
  x: number
  y: number
  /** Cuanto mayor, más cerca de quien mira. Sirve para tapar lo de atrás. */
  profundidad: number
}

export const CAMARA_ISOMETRICA: Camara = { giro: 45, inclinacion: 35.264, exageracion: 25 }
export const CAMARA_PLANTA: Camara = { giro: 0, inclinacion: 90, exageracion: 25 }
export const CAMARA_ALZADO: Camara = { giro: 0, inclinacion: 0, exageracion: 25 }

const aRadianes = (grados: number): number => (grados * Math.PI) / 180

/**
 * Lleva un punto de la calle a la pantalla, en proyección axonométrica.
 *
 * `x` es el offset transversal en metros (positivo a la derecha del eje), `y`
 * la progresiva, y `z` la cota. En pantalla el eje vertical crece hacia abajo,
 * por eso la cota entra restando: más cota, más arriba.
 */
export function proyectarPunto(x: number, y: number, z: number, camara: Camara): PuntoProyectado {
  const g = aRadianes(camara.giro)
  const i = aRadianes(camara.inclinacion)
  const alto = z * camara.exageracion

  const horizontal = x * Math.cos(g) - y * Math.sin(g)
  const hacia = x * Math.sin(g) + y * Math.cos(g)

  return {
    x: horizontal,
    y: hacia * Math.sin(i) - alto * Math.cos(i),
    profundidad: hacia * Math.cos(i) + alto * Math.sin(i),
  }
}
```

- [ ] **Paso 4: Exportarlo**

En `packages/core/src/index.ts`, añade siguiendo el orden que ya hay:

```ts
export * from './vista3d/proyeccion'
```

- [ ] **Paso 5: Ejecutar y ver que pasa**

Run: `npm test --workspace packages/core`
Esperado: PASA, sin avisos.

- [ ] **Paso 6: Commit**

```bash
git add -A
git commit -m "Proyecta la calle en axonometría, con exageración vertical"
```

---

## Tarea V2: De la grilla a caras dibujables

**Archivos:**
- Crear: `packages/core/src/vista3d/malla.ts`
- Test: `packages/core/src/vista3d/malla.test.ts`
- Modificar: `packages/core/src/index.ts`

**Interfaces:**
- Consume: `Camara`, `PuntoProyectado`, `proyectarPunto` de V1; `claveCelda` de
  `grilla/grilla`.
- Produce:
  - `interface VerticeMalla { progresiva: number; offset: number; cota: number }`
  - `interface CaraMalla { clave: string; esquinas: [VerticeMalla, VerticeMalla, VerticeMalla, VerticeMalla]; progresivaDesde: number; progresivaHasta: number; elementoDesde: string; elementoHasta: string }`
  - `armarCaras(entrada: EntradaMalla): CaraMalla[]`
  - `interface CaraProyectada { cara: CaraMalla; puntos: PuntoProyectado[]; profundidad: number }`
  - `proyectarCaras(caras: CaraMalla[], camara: Camara): CaraProyectada[]`

- [ ] **Paso 1: Escribir las pruebas que fallan**

Crea `packages/core/src/vista3d/malla.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { CAMARA_ISOMETRICA } from './proyeccion'
import { armarCaras, proyectarCaras, type EntradaMalla } from './malla'

/** Tres progresivas por tres elementos, todo medido: cuatro cuadros. */
function entradaCompleta(): EntradaMalla {
  const cotas = new Map<string, number>()
  for (const progresiva of [0, 20, 40]) {
    for (const elemento of ['BOR-I', 'EJE', 'BOR-D']) {
      cotas.set(`${progresiva}|${elemento}`, 3245 - progresiva * 0.01)
    }
  }
  return {
    progresivas: [0, 20, 40],
    elementos: ['BOR-I', 'EJE', 'BOR-D'],
    offsets: new Map([['BOR-I', -4.2], ['EJE', 0], ['BOR-D', 4.2]]),
    cotaDe: (clave) => cotas.get(clave) ?? null,
  }
}

describe('armarCaras', () => {
  it('forma un cuadro entre cada dos progresivas y dos elementos vecinos', () => {
    // 3 progresivas x 3 elementos = 2 x 2 = 4 cuadros
    expect(armarCaras(entradaCompleta())).toHaveLength(4)
  })

  it('cada cara sabe entre qué progresivas y qué elementos está', () => {
    const primera = armarCaras(entradaCompleta())[0]!

    expect(primera.progresivaDesde).toBe(0)
    expect(primera.progresivaHasta).toBe(20)
    expect(primera.elementoDesde).toBe('BOR-I')
    expect(primera.elementoHasta).toBe('EJE')
  })

  it('sin la esquina de la malla cae solo el cuadro que la tocaba', () => {
    const entrada = entradaCompleta()
    const original = entrada.cotaDe
    // 0|BOR-I es una esquina del borde: solo pertenece a un cuadro.
    entrada.cotaDe = (clave) => (clave === '0|BOR-I' ? null : original(clave))

    const caras = armarCaras(entrada)

    expect(caras).toHaveLength(3)
    expect(caras.every((c) => c.esquinas.every((e) => Number.isFinite(e.cota)))).toBe(true)
  })

  it('sin la celda del centro no queda ninguna cara, porque la tocan las cuatro', () => {
    const entrada = entradaCompleta()
    const original = entrada.cotaDe
    // 20|EJE está en la progresiva de en medio y en el elemento de en medio,
    // así que es esquina de los cuatro cuadros a la vez.
    entrada.cotaDe = (clave) => (clave === '20|EJE' ? null : original(clave))

    expect(armarCaras(entrada)).toHaveLength(0)
  })

  it('sin dos progresivas no hay ninguna cara que formar', () => {
    const entrada = { ...entradaCompleta(), progresivas: [0] }

    expect(armarCaras(entrada)).toHaveLength(0)
  })

  it('sin dos elementos tampoco', () => {
    const entrada = { ...entradaCompleta(), elementos: ['EJE'] }

    expect(armarCaras(entrada)).toHaveLength(0)
  })

  it('cada esquina lleva su offset real, no el índice de la columna', () => {
    const primera = armarCaras(entradaCompleta())[0]!
    const offsets = primera.esquinas.map((e) => e.offset).sort((a, b) => a - b)

    expect(offsets).toEqual([-4.2, -4.2, 0, 0])
  })
})

describe('proyectarCaras', () => {
  it('devuelve las caras de atrás primero, para que las de delante las tapen', () => {
    const proyectadas = proyectarCaras(armarCaras(entradaCompleta()), CAMARA_ISOMETRICA)
    const profundidades = proyectadas.map((c) => c.profundidad)

    expect(profundidades).toEqual([...profundidades].sort((a, b) => a - b))
  })

  it('cada cara proyectada conserva sus cuatro puntos', () => {
    const proyectadas = proyectarCaras(armarCaras(entradaCompleta()), CAMARA_ISOMETRICA)

    expect(proyectadas.every((c) => c.puntos.length === 4)).toBe(true)
  })

  it('sin caras que proyectar, devuelve una lista vacía y no revienta', () => {
    expect(proyectarCaras([], CAMARA_ISOMETRICA)).toEqual([])
  })
})
```

- [ ] **Paso 2: Ejecutar y ver que falla**

Run: `npm test --workspace packages/core`
Esperado: FALLA, no encuentra `./malla`.

- [ ] **Paso 3: Escribir la implementación**

Crea `packages/core/src/vista3d/malla.ts`:

```ts
import { claveCelda } from '../grilla/grilla'
import { proyectarPunto, type Camara, type PuntoProyectado } from './proyeccion'

export interface VerticeMalla {
  progresiva: number
  offset: number
  cota: number
}

export interface CaraMalla {
  clave: string
  esquinas: [VerticeMalla, VerticeMalla, VerticeMalla, VerticeMalla]
  progresivaDesde: number
  progresivaHasta: number
  elementoDesde: string
  elementoHasta: string
}

export interface EntradaMalla {
  /** Ordenadas de menor a mayor. */
  progresivas: number[]
  /** En orden de offset, como los da `armarEsqueletoTabla`. */
  elementos: string[]
  offsets: Map<string, number>
  /** La cota medida de una celda, o null si no se midió. */
  cotaDe: (clave: string) => number | null
}

/**
 * Convierte la grilla en cuadros dibujables: cada cara va entre dos progresivas
 * consecutivas y dos elementos consecutivos.
 *
 * Una cara solo se forma si **sus cuatro esquinas tienen cota**. Es la misma
 * regla que ya rige el sombreado del corte transversal y el relleno entre capas:
 * no se inventa superficie donde no se midió. Un hueco en el modelo es
 * información, no un fallo del dibujo.
 */
export function armarCaras(entrada: EntradaMalla): CaraMalla[] {
  const { progresivas, elementos, offsets, cotaDe } = entrada
  const caras: CaraMalla[] = []

  for (let p = 0; p < progresivas.length - 1; p += 1) {
    for (let e = 0; e < elementos.length - 1; e += 1) {
      const progresivaDesde = progresivas[p]!
      const progresivaHasta = progresivas[p + 1]!
      const elementoDesde = elementos[e]!
      const elementoHasta = elementos[e + 1]!

      const esquinas: VerticeMalla[] = []
      let completa = true

      for (const [progresiva, elemento] of [
        [progresivaDesde, elementoDesde],
        [progresivaDesde, elementoHasta],
        [progresivaHasta, elementoHasta],
        [progresivaHasta, elementoDesde],
      ] as const) {
        const cota = cotaDe(claveCelda(progresiva, elemento))
        if (cota === null) {
          completa = false
          break
        }
        esquinas.push({ progresiva, offset: offsets.get(elemento) ?? 0, cota })
      }

      if (!completa) continue

      caras.push({
        clave: `${claveCelda(progresivaDesde, elementoDesde)}>${claveCelda(progresivaHasta, elementoHasta)}`,
        esquinas: esquinas as CaraMalla['esquinas'],
        progresivaDesde,
        progresivaHasta,
        elementoDesde,
        elementoHasta,
      })
    }
  }

  return caras
}

export interface CaraProyectada {
  cara: CaraMalla
  puntos: PuntoProyectado[]
  profundidad: number
}

/**
 * Proyecta las caras y las devuelve **de atrás hacia delante**, para que quien
 * dibuje en ese orden deje lo cercano encima de lo lejano. La profundidad de una
 * cara es la media de sus esquinas: con cuadros de este tamaño no hace falta
 * nada más fino, y evita el parpadeo de comparar por una sola esquina.
 */
export function proyectarCaras(caras: CaraMalla[], camara: Camara): CaraProyectada[] {
  return caras
    .map((cara) => {
      const puntos = cara.esquinas.map((e) => proyectarPunto(e.offset, e.progresiva, e.cota, camara))
      const profundidad = puntos.reduce((suma, p) => suma + p.profundidad, 0) / puntos.length
      return { cara, puntos, profundidad }
    })
    .sort((a, b) => a.profundidad - b.profundidad)
}
```

- [ ] **Paso 4: Exportarlo**

En `packages/core/src/index.ts`:

```ts
export * from './vista3d/malla'
```

- [ ] **Paso 5: Ejecutar la batería**

Run: `npm test` y `npm run typecheck --workspaces`
Esperado: todo en verde, sin avisos.

- [ ] **Paso 6: Commit**

```bash
git add -A
git commit -m "Arma las caras del modelo a partir de la grilla medida"
```

---

## Tarea V3: La cámara en el estado

**Archivos:**
- Modificar: `packages/app/src/estado/almacen.ts`
- Test: `packages/app/src/estado/almacen.test.ts`

**Interfaces:**
- Consume: `Camara`, `CAMARA_ISOMETRICA` de V1.
- Produce: en el estado, `camara: Camara` y `modoVista3D: ModoVista3D`, con
  `type ModoVista3D = 'estado' | 'capas'`; y las acciones
  `girarCamara(grados: number): void`, `fijarCamara(camara: Camara): void`,
  `fijarExageracion(factor: number): void`, `fijarModoVista3D(modo: ModoVista3D): void`.

- [ ] **Paso 1: Escribir las pruebas que fallan**

```ts
it('la cámara arranca en isométrico con la exageración de partida', () => {
  const { camara } = useAlmacen.getState()

  expect(camara.giro).toBe(45)
  expect(camara.exageracion).toBe(25)
})

it('girar suma grados y da la vuelta al pasar de 360', () => {
  useAlmacen.getState().fijarCamara({ giro: 350, inclinacion: 35.264, exageracion: 25 })
  useAlmacen.getState().girarCamara(20)

  expect(useAlmacen.getState().camara.giro).toBe(10)
})

it('girar hacia atrás también da la vuelta', () => {
  useAlmacen.getState().fijarCamara({ giro: 10, inclinacion: 35.264, exageracion: 25 })
  useAlmacen.getState().girarCamara(-20)

  expect(useAlmacen.getState().camara.giro).toBe(350)
})

it('la inclinación no se sale del rango que tiene sentido', () => {
  useAlmacen.getState().fijarCamara({ giro: 0, inclinacion: 140, exageracion: 25 })
  expect(useAlmacen.getState().camara.inclinacion).toBe(90)

  useAlmacen.getState().fijarCamara({ giro: 0, inclinacion: -30, exageracion: 25 })
  expect(useAlmacen.getState().camara.inclinacion).toBe(0)
})

it('la exageración se queda entre 1 y 50', () => {
  useAlmacen.getState().fijarExageracion(200)
  expect(useAlmacen.getState().camara.exageracion).toBe(50)

  useAlmacen.getState().fijarExageracion(0)
  expect(useAlmacen.getState().camara.exageracion).toBe(1)
})

it('la cámara y el modo no viajan en el archivo del proyecto', () => {
  // Son estado de la sesión, como la celda seleccionada: describen lo que se
  // está mirando, no el trabajo del topógrafo.
  const proyecto = useAlmacen.getState().proyecto

  expect('camara' in proyecto).toBe(false)
  expect('modoVista3D' in proyecto).toBe(false)
})
```

- [ ] **Paso 2: Ejecutar y ver que falla**

Run: `npm test --workspace packages/app -- almacen`
Esperado: FALLA, `camara` no existe en el estado.

- [ ] **Paso 3: Implementar**

Añade al estado `camara: CAMARA_ISOMETRICA` y `modoVista3D: 'estado'`, con sus
cuatro acciones. Dos detalles que las pruebas fijan:

- El giro **da la vuelta**: `((grados % 360) + 360) % 360`, para que girar de
  350 a 370 dé 10 y no un número que crece sin fin.
- La inclinación se recorta a `[0, 90]` y la exageración a `[1, 50]`. Recortar,
  no rechazar: un deslizador que se resiste en el extremo se siente roto.

La cámara vive **fuera del proyecto**, junto a `seleccion` y `capasVisibles`.

- [ ] **Paso 4: Ejecutar y ver que pasa**

Run: `npm test --workspace packages/app -- almacen`
Esperado: PASA.

- [ ] **Paso 5: Commit**

```bash
git add -A
git commit -m "Guarda cómo se está mirando el modelo"
```

---

## Tarea V4: El visor, en modo estado

**Archivos:**
- Crear: `packages/app/src/componentes/Vista3D.tsx`
- Test: `packages/app/src/componentes/Vista3D.test.tsx`
- Modificar: `packages/app/src/vistas/VistaResultados.tsx`

**Interfaces:**
- Consume: `armarCaras`, `proyectarCaras` de V2; `armarEsqueletoTabla` de
  `packages/app/src/esqueletoTabla.ts`; `useEvaluacionRasante` de
  `packages/app/src/estado/derivados.ts`; `ETIQUETA_ESTADO` y
  `SIMBOLO_ESTADO_TOLERANCIA` de `packages/app/src/estadoRasante.ts`.
- Produce: `<Vista3D idCampaniaReferencia={...} />`, con la prop **obligatoria**.

- [ ] **Paso 1: Escribir las pruebas que fallan**

```tsx
it('dibuja una cara por cada cuadro con sus cuatro esquinas medidas', () => {
  conRasanteYMedidas()
  const { container } = render(<Vista3D idCampaniaReferencia="camp-1" />)

  expect(container.querySelectorAll('[data-cara]').length).toBeGreaterThan(0)
})

it('cada cara dice entre qué puntos está y en qué estado, sin depender del color', () => {
  conRasanteYMedidas()
  render(<Vista3D idCampaniaReferencia="camp-1" />)

  expect(
    screen.getByLabelText(/Entre 0\+000 y 0\+020, de BOR-I a EJE: .*tolerancia/),
  ).toBeInTheDocument()
})

it('escribe en pantalla cuánto se están exagerando las alturas', () => {
  conRasanteYMedidas()
  render(<Vista3D idCampaniaReferencia="camp-1" />)

  expect(screen.getByText(/Alturas exageradas 25×/)).toBeInTheDocument()
})

it('sin dos progresivas medidas no hay modelo, y se dice con palabras', () => {
  conUnaSolaProgresivaMedida()
  render(<Vista3D idCampaniaReferencia="camp-1" />)

  expect(screen.getByText(/hacen falta al menos dos progresivas/i)).toBeInTheDocument()
})

it('sin rasante definida, el modo estado lo dice en vez de dibujar un modelo sin color', () => {
  sinRasante()
  render(<Vista3D idCampaniaReferencia="camp-1" />)

  expect(screen.getByText(/Define la rasante/i)).toBeInTheDocument()
})

it('no lee la campaña del almacén: la recibe por parámetro', () => {
  conDosCampanias()
  render(<Vista3D idCampaniaReferencia="camp-2" />)

  // camp-2 midió una celda que camp-1 no tiene: su cara solo puede salir
  // si el componente usó de verdad la campaña que se le pasó.
  expect(screen.getByLabelText(/Entre 0\+020 y 0\+040/)).toBeInTheDocument()
})
```

**La última prueba es la que más importa.** Que la campaña llegue por parámetro y
no del estado global costó cuatro rondas de arreglo en la entrega anterior, entre
los cuatro componentes de vista. Este es el quinto.

- [ ] **Paso 2: Ejecutar y ver que falla**

Run: `npm test --workspace packages/app -- Vista3D`
Esperado: FALLA, no existe el componente.

- [ ] **Paso 3: Implementar**

Un `<svg>` con un `<polygon>` por cara, dibujadas en el orden que devuelve
`proyectarCaras` —de atrás hacia delante—, con `data-cara` y el `aria-label` que
fijan las pruebas.

El color de relleno sale del estado de la celda de la esquina inicial, con la
misma paleta que la tabla y el mapa. **El color no basta**: cada cara lleva su
estado escrito en el `aria-label`, y la leyenda de los cinco estados va debajo,
reutilizando `ETIQUETA_ESTADO` y `SIMBOLO_ESTADO_TOLERANCIA`.

El dibujo se encaja en su caja calculando los extremos de los puntos proyectados
y escalando; no uses un `viewBox` fijo, porque el modelo cambia de tamaño al
girar.

La línea de la exageración va **pegada al dibujo**, no al pie de la pantalla.

- [ ] **Paso 4: Colgarlo de VistaResultados**

Dentro del grupo «Control contra el proyecto», que ya existe, para que quede bajo
el mismo aviso de nivelación comprobada que las otras cuatro vistas. Pásale
`idCampaniaReferencia` como se lo pasa a las demás.

- [ ] **Paso 5: Ejecutar la batería**

Run: `npm test` y `npm run typecheck --workspaces`
Esperado: todo en verde, sin avisos.

- [ ] **Paso 6: Commit**

```bash
git add -A
git commit -m "Dibuja la calle en volumen, pintada por su estado"
```

---

## Tarea V5: Los controles

**Archivos:**
- Crear: `packages/app/src/componentes/ControlesVista3D.tsx`
- Test: `packages/app/src/componentes/ControlesVista3D.test.tsx`
- Modificar: `packages/app/src/componentes/Vista3D.tsx`

- [ ] **Paso 1: Escribir las pruebas que fallan**

```tsx
it('las tres vistas guardadas colocan la cámara donde dicen', async () => {
  render(<ControlesVista3D />)

  await userEvent.click(screen.getByRole('button', { name: 'Planta' }))
  expect(useAlmacen.getState().camara.inclinacion).toBe(90)

  await userEvent.click(screen.getByRole('button', { name: 'Alzado' }))
  expect(useAlmacen.getState().camara.inclinacion).toBe(0)

  await userEvent.click(screen.getByRole('button', { name: 'Isométrico' }))
  expect(useAlmacen.getState().camara.giro).toBe(45)
})

it('las vistas guardadas conservan la exageración que hubiera puesta', async () => {
  useAlmacen.getState().fijarExageracion(10)
  render(<ControlesVista3D />)

  await userEvent.click(screen.getByRole('button', { name: 'Planta' }))

  expect(useAlmacen.getState().camara.exageracion).toBe(10)
})

it('el deslizador de exageración cambia la cámara y se ve su valor', async () => {
  render(<ControlesVista3D />)

  fireEvent.change(screen.getByLabelText(/exageración/i), { target: { value: '10' } })

  expect(useAlmacen.getState().camara.exageracion).toBe(10)
  expect(screen.getByText(/10×/)).toBeInTheDocument()
})

it('se puede girar con el teclado, sin ratón', async () => {
  render(<ControlesVista3D />)
  const giro = useAlmacen.getState().camara.giro

  await userEvent.click(screen.getByRole('button', { name: /girar a la derecha/i }))

  expect(useAlmacen.getState().camara.giro).not.toBe(giro)
})

it('la inclinación se ajusta de forma continua, no solo con las vistas guardadas', () => {
  render(<ControlesVista3D />)

  fireEvent.change(screen.getByLabelText(/inclinación/i), { target: { value: '60' } })

  expect(useAlmacen.getState().camara.inclinacion).toBe(60)
})

it('la inclinación llega a los dos extremos sin resistirse', () => {
  render(<ControlesVista3D />)
  const control = screen.getByLabelText(/inclinación/i)

  fireEvent.change(control, { target: { value: '90' } })
  expect(useAlmacen.getState().camara.inclinacion).toBe(90)

  fireEvent.change(control, { target: { value: '0' } })
  expect(useAlmacen.getState().camara.inclinacion).toBe(0)
})
```

**La segunda prueba fija algo que es fácil de romper:** las vistas guardadas
mueven la cámara, **no** la exageración. Si al pulsar «Planta» se perdiera el
ajuste vertical, habría que volver a buscarlo cada vez.

- [ ] **Paso 2: Ejecutar y ver que falla**

Run: `npm test --workspace packages/app -- ControlesVista3D`
Esperado: FALLA.

- [ ] **Paso 3: Implementar los controles**

Tres botones de vista guardada, deslizadores para la **exageración** y la
**inclinación** con su valor al lado, y botones de girar a izquierda y derecha
con nombres accesibles claros.

La inclinación va de 0 a 90 grados: 90 es la vista en planta y 0 el alzado. Los
dos extremos son válidos y el control tiene que llegar a ellos sin resistirse.

Al aplicar una vista guardada, conserva `exageracion` de la cámara actual.

- [ ] **Paso 4: Girar arrastrando**

En `Vista3D`, arrastrar sobre el dibujo gira la cámara: la diferencia horizontal
del puntero se traduce en grados. Usa eventos de puntero, que cubren ratón y
dedo con el mismo código.

Que arrastrar **no** seleccione texto por accidente, y que el dibujo tenga
`touch-action: none` para que en el móvil no compita con el desplazamiento de la
página.

- [ ] **Paso 5: Ejecutar la batería**

Run: `npm test` y `npm run typecheck --workspaces`
Esperado: todo en verde, sin avisos.

- [ ] **Paso 6: Commit**

```bash
git add -A
git commit -m "Deja girar el modelo y ajustar la exageración"
```

---

## Tarea V6: El resumen en texto

**Archivos:**
- Crear: `packages/app/src/componentes/ResumenVista3D.tsx`
- Test: `packages/app/src/componentes/ResumenVista3D.test.tsx`
- Modificar: `packages/app/src/componentes/Vista3D.tsx`

- [ ] **Paso 1: Escribir las pruebas que fallan**

```tsx
it('cuenta las caras de cada estado', () => {
  conRasanteYMedidas()
  render(<ResumenVista3D idCampaniaReferencia="camp-1" />)

  expect(screen.getByText(/El modelo dibuja \d+ tramos/)).toBeInTheDocument()
})

it('nombra la peor zona por progresiva y elemento', () => {
  conRasanteYMedidasConUnBache()
  render(<ResumenVista3D idCampaniaReferencia="camp-1" />)

  expect(screen.getByText(/La mayor diferencia está en 0\+000 BOR-I: \+46 mm/)).toBeInTheDocument()
})

it('cuando todo está conforme, lo dice y no inventa una peor zona', () => {
  conTodoConforme()
  render(<ResumenVista3D idCampaniaReferencia="camp-1" />)

  expect(screen.getByText(/todo dentro de tolerancia/i)).toBeInTheDocument()
  expect(screen.queryByText(/La mayor diferencia/)).toBeNull()
})
```

**Por qué existe este componente.** Un dibujo en volumen es el sitio más fácil
para dejar fuera a quien no lo ve. El resumen dice **con palabras** lo mismo que
el dibujo enseña con formas: cuántos tramos hay de cada estado y **dónde está el
problema**. Quien no vea el modelo tiene que poder enterarse igual de que hay algo
en `0+040 BOR-I`.

- [ ] **Paso 2: Ejecutar y ver que falla**

Run: `npm test --workspace packages/app -- ResumenVista3D`
Esperado: FALLA.

- [ ] **Paso 3: Implementar**

Un párrafo con el conteo por estado y, si hay alguna celda fuera o al límite, la
de mayor diferencia absoluta nombrada por progresiva y elemento, con su cifra en
milímetros y signo.

Usa `formatearDiferencia` de `estadoRasante.ts`; no compongas la cifra a mano.

- [ ] **Paso 4: Colgarlo del visor**

Debajo del dibujo, siempre visible. No detrás de un botón: si hay que pulsarlo
para enterarse, no cumple su función.

- [ ] **Paso 5: Ejecutar la batería**

Run: `npm test` y `npm run typecheck --workspaces`
Esperado: todo en verde, sin avisos.

- [ ] **Paso 6: Commit**

```bash
git add -A
git commit -m "Cuenta con palabras lo que el modelo enseña con formas"
```

---

## Tarea V7: Capas apiladas y corte vivo

**Archivos:**
- Modificar: `packages/app/src/componentes/Vista3D.tsx`
- Modificar: `packages/app/src/componentes/ControlesVista3D.tsx`
- Test: `packages/app/src/componentes/Vista3D.test.tsx`

- [ ] **Paso 1: Escribir las pruebas que fallan**

```tsx
it('en modo capas dibuja una superficie por cada campaña marcada', () => {
  conDosCapasMedidas()
  useAlmacen.getState().fijarModoVista3D('capas')
  const { container } = render(<Vista3D idCampaniaReferencia="camp-1" />)

  const capas = new Set(
    [...container.querySelectorAll('[data-capa-id]')].map((n) => n.getAttribute('data-capa-id')),
  )
  expect(capas.size).toBe(2)
})

it('en modo capas cada superficie dice de qué capa es', () => {
  conDosCapasMedidas()
  useAlmacen.getState().fijarModoVista3D('capas')
  render(<Vista3D idCampaniaReferencia="camp-1" />)

  expect(screen.getByText('SUBRASANTE')).toBeInTheDocument()
  expect(screen.getByText('BASE')).toBeInTheDocument()
})

it('una capa sin medidas en un tramo deja el hueco, no lo rellena', () => {
  conCapaMedidaSoloAlPrincipio()
  useAlmacen.getState().fijarModoVista3D('capas')
  const { container } = render(<Vista3D idCampaniaReferencia="camp-1" />)

  const caras = [...container.querySelectorAll('[data-capa-id="camp-2"]')]
  expect(caras.length).toBeGreaterThan(0)
  expect(caras.every((c) => Number(c.getAttribute('data-progresiva-hasta')) <= 20)).toBe(true)
})

it('el deslizador de progresiva secciona el modelo', () => {
  conRasanteYMedidas()
  useAlmacen.getState().irAProgresiva(20)
  const { container } = render(<Vista3D idCampaniaReferencia="camp-1" />)

  const caras = [...container.querySelectorAll('[data-cara]')]
  expect(caras.length).toBeGreaterThan(0)
  expect(caras.every((c) => Number(c.getAttribute('data-progresiva-desde')) <= 20)).toBe(true)
})

it('con el deslizador al final del tramo se ve la calle entera', () => {
  conRasanteYMedidas()
  useAlmacen.getState().irAProgresiva(180)
  const { container } = render(<Vista3D idCampaniaReferencia="camp-1" />)

  expect(container.querySelectorAll('[data-cara]').length).toBeGreaterThan(0)
})
```

- [ ] **Paso 2: Ejecutar y ver que falla**

Run: `npm test --workspace packages/app -- Vista3D`
Esperado: FALLA.

- [ ] **Paso 3: Implementar el modo capas**

Un interruptor entre «Estado» y «Capas» en los controles. En modo capas se dibuja
una superficie por cada campaña marcada en el selector que ya existe, cada una
con su color, y **todas las caras se ordenan juntas por profundidad** — si se
dibujara una capa entera y luego la otra, la de abajo taparía a la de arriba en
los tramos donde va por delante.

Cada cara lleva `data-capa-id` y el nombre de la capa se rotula junto a su
superficie.

- [ ] **Paso 4: Implementar el corte vivo**

Las caras cuya `progresivaDesde` sea mayor que la progresiva del deslizador **no
se dibujan**. Es filtrar antes de proyectar.

Marca cada cara con `data-progresiva-desde` y `data-progresiva-hasta`, que es lo
que las pruebas comprueban y además ayuda a depurar.

- [ ] **Paso 5: Ejecutar la batería**

Run: `npm test` y `npm run typecheck --workspaces`
Esperado: todo en verde, sin avisos.

- [ ] **Paso 6: Commit**

```bash
git add -A
git commit -m "Apila las capas y secciona el modelo con el deslizador"
```

---

## Tarea V8: Cierre de la Entrega 3

- [ ] **Paso 1: Batería completa**

```
npm test
npm run typecheck --workspaces
npm run build --workspace packages/app
npm audit --omit=dev
```

Anota el tamaño del paquete. **Tiene que seguir en el mismo orden de magnitud
que antes de esta entrega (315 kB): si creció mucho, algo se coló.** Todo sin
avisos.

- [ ] **Paso 2: Verificación en navegador real**

Crea `packages/app/verificacion/vista3d.mjs`, siguiendo el patrón de
`rasante.mjs`. El recorrido: definir la rasante, ir a Resultados, y comprobar
que el modelo se dibuja, que **girar arrastrando cambia el dibujo**, que el
deslizador secciona, que la exageración aparece escrita y que el resumen nombra
la peor zona.

Lo de girar arrastrando **solo se puede comprobar en un navegador real**: en un
entorno simulado no hay eventos de puntero de verdad. Compara las coordenadas de
los polígonos antes y después de arrastrar.

Añade el guion al README junto a los otros tres.

- [ ] **Paso 3: Documentación**

En `docs/uso.md`, una sección sobre el visor: para qué sirve cada modo, qué
significa la exageración vertical —**y que las alturas que se ven no son las
reales**—, y cómo girar y seccionar.

Actualiza el README con lo que la app hace ahora y la cuenta de pruebas.

Escribe `docs/decisiones-entrega-3.md` con las decisiones tomadas durante la
ejecución, siguiendo el formato de `docs/decisiones-entrega-2b.md`: qué se
decidió, por qué, y qué costaría si resulta equivocado. Incluye la decisión de
no usar un motor 3D, con sus razones y su riesgo.

- [ ] **Paso 4: Commit**

```bash
git add -A
git commit -m "Cierre de la Entrega 3: verificación completa y guía"
```

---

## Lo que queda fuera y por qué

| Fuera | Cuándo entra |
|---|---|
| Sombras, luces, texturas | Necesitan un motor 3D. El valor está en la forma, no en el brillo. |
| Medición sobre el modelo | Las cotas y diferencias se leen en la tabla con más precisión. |
| Breaklines sobre el 3D | Es edición, y Max rechazó el editor CAD: «para eso usaría AutoCAD». |
| Drenaje: charcos, rutas de flujo | Necesita superficie triangulada, no la grilla regular. |
| Volúmenes de corte y relleno | Cabe después, sobre este mismo modelo. |
| Captura en imagen | Se decide al cerrar la entrega: el SVG se puede guardar tal cual. |
