# Entrega 1 — Nivelación por progresivas · Plan de implementación

> **Para trabajadores agénticos:** SUB-SKILL REQUERIDA: usa superpowers:subagent-driven-development (recomendado) o superpowers:executing-plans para implementar este plan tarea por tarea. Los pasos usan sintaxis de casilla (`- [ ]`) para seguimiento.

**Objetivo:** Construir la primera herramienta usable de la app: ingresar lecturas de mira crudas de una calle nivelada por progresivas, calcular cotas, verificar el cierre del circuito contra la tolerancia normativa, compensar el error, y recorrer la calle en cortes transversales interactivos.

**Arquitectura:** Monorepo de dos paquetes con npm workspaces. `packages/core` es el motor de cálculo en TypeScript puro — sin DOM, sin archivos, sin red — cubierto por pruebas desde la primera línea. `packages/app` es la interfaz en React + Vite que consume el motor. `core` no importa nada de `app`; nunca al revés.

**Stack:** TypeScript · Vitest · React 19 · Vite 7 · Tailwind CSS v4 · Zustand · fflate · idb-keyval · SheetJS (carga diferida) · SVG propio para gráficos.

**Spec:** [`docs/superpowers/specs/2026-08-19-nivelacion-por-progresivas-design.md`](../specs/2026-08-19-nivelacion-por-progresivas-design.md)

## Restricciones globales

Estas reglas aplican a **todas** las tareas. No se repiten en cada una.

- **Toda la interfaz en español.** Textos, rótulos, mensajes de error, nombres de botones. Sin excepción.
- **Funciona sin internet.** Cero llamadas de red en tiempo de ejecución. Sin servidor, sin base de datos, sin cuentas.
- **`packages/core` no importa nada de UI ni de IO.** Sin `window`, sin `document`, sin `fetch`, sin `fs`. Si un cálculo necesita un dato del entorno, se pasa como parámetro.
- **`packages/app` importa `packages/core`. Nunca al revés.**
- **Cotas y lecturas en metros con 3 decimales.** El redondeo se aplica **solo en la presentación**; los cálculos intermedios conservan precisión completa.
- **Los datos crudos nunca se sobrescriben.** Las cotas son siempre derivadas y recalculables.
- **Nomenclatura del dominio en español** en el código: `Calle`, `Campania`, `Libreta`, `cotaInstrumento`, `progresiva`. Sin `ñ` en identificadores (`Campania`, no `Campaña`).
- **Node 24 / npm 11.** Ya instalados.
- **Cada tarea termina con un commit** cuyo mensaje va en español.
- **Ningún mensaje de error dirigido al usuario dice "error de validación"** ni jerga equivalente. Dice qué pasó, dónde y qué hacer.

## Ajuste respecto al spec

El spec listaba **uPlot** para gráficos 2D. Este plan usa **SVG propio en React** para el corte transversal y el perfil longitudinal de la Entrega 1. Razón: el corte tiene ~10 puntos y el requisito es que **cada punto sea clicable, resaltable y ligado a la tabla**; en SVG cada punto es un elemento del DOM con sus propios eventos, mientras que en canvas hay que reimplementar la detección de impacto. Menos dependencias, más interactividad. Si el perfil longitudinal llega a miles de puntos, se migra a uPlot sin tocar el resto de la app.

## Libreta de ejemplo — usada en todas las pruebas

Esta libreta aparece en las pruebas de varias tareas. Los números están verificados a mano.

```
BM-1  cota 3245.180

ESTACIÓN 1
  Vista atrás   BM-1          1.425   ->  CI = 3246.605
  Intermedia    0+000 EJE     1.980   ->  3244.625
  Intermedia    0+000 BOR-I   2.045   ->  3244.560
  Vista adelante PC-1         1.150   ->  PC-1 = 3245.455

ESTACIÓN 2
  Vista atrás   PC-1          1.630   ->  CI = 3247.085
  Intermedia    0+020 EJE     2.470   ->  3244.615
  Vista adelante BM-1         1.910   ->  llegada = 3245.175

CIERRE
  error       3245.175 - 3245.180 = -0.005 m = -5.0 mm
  K           calle 0+000 a 0+180, circuito cerrado -> 2 x 180 / 1000 = 0.360 km
  tolerancia  12 x raiz(0.360) = ±7.2 mm
  veredicto   PASA

COMPENSACIÓN (2 estaciones, corrección total +0.005 m)
  acumulada estación 1  +0.0025  ->  0+000 EJE  = 3244.6275  ->  3244.628 (presentación)
  acumulada estación 2  +0.0050  ->  0+020 EJE  = 3244.620
```

---

# PARTE A — Motor de cálculo

---

### Tarea 1: Andamiaje del monorepo y del motor

Deja el repositorio con dos paquetes declarados, TypeScript configurado y Vitest ejecutando una prueba real. Sin esto, ninguna tarea posterior puede correr.

**Archivos:**
- Crear: `package.json`
- Crear: `tsconfig.base.json`
- Crear: `.gitignore` (modificar el existente)
- Crear: `packages/core/package.json`
- Crear: `packages/core/tsconfig.json`
- Crear: `packages/core/vitest.config.ts`
- Crear: `packages/core/src/numero.ts`
- Crear: `packages/core/src/index.ts`
- Test: `packages/core/src/numero.test.ts`

**Interfaces:**
- Consume: nada.
- Produce: `redondear3(valor: number): number` · `aMilimetros(metros: number): number` · `aMetros(milimetros: number): number`, todas exportadas desde `packages/core/src/index.ts`.

- [ ] **Paso 1: Crear el `package.json` raíz**

```json
{
  "name": "topo-app",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "workspaces": ["packages/*"],
  "scripts": {
    "test": "npm run test --workspaces --if-present",
    "dev": "npm run dev --workspace packages/app",
    "build": "npm run build --workspaces --if-present"
  }
}
```

- [ ] **Paso 2: Crear `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "exactOptionalPropertyTypes": false,
    "verbatimModuleSyntax": true,
    "skipLibCheck": true,
    "declaration": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

- [ ] **Paso 3: Añadir al `.gitignore`**

Agrega estas líneas al final del `.gitignore` existente (no lo reemplaces):

```
node_modules/
dist/
*.tsbuildinfo
.vite/
coverage/
```

- [ ] **Paso 4: Crear el paquete del motor**

`packages/core/package.json`:

```json
{
  "name": "@topo/core",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "typescript": "^5.7.0",
    "vitest": "^3.0.0"
  }
}
```

`packages/core/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "rootDir": "./src", "outDir": "./dist" },
  "include": ["src/**/*"]
}
```

`packages/core/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
```

- [ ] **Paso 5: Instalar dependencias**

Ejecuta: `npm install`
Esperado: crea `node_modules/` y `package-lock.json` sin errores.

- [ ] **Paso 6: Escribir la prueba que falla**

`packages/core/src/numero.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { aMetros, aMilimetros, redondear3 } from './numero'

describe('redondear3', () => {
  it('redondea a tres decimales', () => {
    expect(redondear3(3244.6275)).toBe(3244.628)
    expect(redondear3(3244.6274)).toBe(3244.627)
  })

  it('no arrastra error de punto flotante', () => {
    expect(redondear3(1.005)).toBe(1.005)
    expect(redondear3(0.1 + 0.2)).toBe(0.3)
  })

  it('conserva el signo de los negativos', () => {
    expect(redondear3(-0.0125)).toBe(-0.013)
  })
})

describe('conversión de unidades', () => {
  it('pasa metros a milímetros', () => {
    expect(aMilimetros(-0.005)).toBeCloseTo(-5, 9)
    expect(aMilimetros(0.0072)).toBeCloseTo(7.2, 9)
  })

  it('pasa milímetros a metros', () => {
    expect(aMetros(7.2)).toBeCloseTo(0.0072, 9)
  })
})
```

- [ ] **Paso 7: Ejecutar la prueba y verificar que falla**

Ejecuta: `npm test --workspace packages/core`
Esperado: FALLA con "Failed to resolve import './numero'".

- [ ] **Paso 8: Escribir la implementación mínima**

`packages/core/src/numero.ts`:

```ts
/** Redondeo a 3 decimales, estable frente al error de punto flotante. */
export function redondear3(valor: number): number {
  const escalado = Number((Math.abs(valor) * 1000).toPrecision(12))
  const redondeado = Math.round(escalado) / 1000
  return valor < 0 ? -redondeado : redondeado
}

export function aMilimetros(metros: number): number {
  return metros * 1000
}

export function aMetros(milimetros: number): number {
  return milimetros / 1000
}
```

`packages/core/src/index.ts`:

```ts
export * from './numero'
```

- [ ] **Paso 9: Ejecutar las pruebas y verificar que pasan**

Ejecuta: `npm test --workspace packages/core`
Esperado: 5 pruebas en verde.

- [ ] **Paso 10: Commit**

```bash
git add -A
git commit -m "Andamiaje del monorepo y del motor de cálculo con Vitest"
```

---

### Tarea 2: Progresivas — generación y formato

**Archivos:**
- Crear: `packages/core/src/grilla/progresivas.ts`
- Test: `packages/core/src/grilla/progresivas.test.ts`
- Modificar: `packages/core/src/index.ts`

**Interfaces:**
- Consume: nada.
- Produce:
  - `generarProgresivas(inicio: number, fin: number, intervalo: number, extras: number[]): number[]` — ordenadas, sin duplicados.
  - `formatearProgresiva(metros: number): string` — `0+020`, `1+247.50`.
  - `parsearProgresiva(texto: string): number | null` — acepta `0+020`, `20`, `1+247.50`.

- [ ] **Paso 1: Escribir la prueba que falla**

`packages/core/src/grilla/progresivas.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { formatearProgresiva, generarProgresivas, parsearProgresiva } from './progresivas'

describe('generarProgresivas', () => {
  it('genera el intervalo regular incluyendo el final', () => {
    expect(generarProgresivas(0, 180, 20, [])).toEqual([0, 20, 40, 60, 80, 100, 120, 140, 160, 180])
  })

  it('inserta las progresivas extra en orden', () => {
    expect(generarProgresivas(0, 60, 20, [47, 12])).toEqual([0, 12, 20, 40, 47, 60])
  })

  it('no duplica una extra que coincide con el intervalo', () => {
    expect(generarProgresivas(0, 60, 20, [40])).toEqual([0, 20, 40, 60])
  })

  it('incluye el final aunque no caiga en el intervalo', () => {
    expect(generarProgresivas(0, 55, 20, [])).toEqual([0, 20, 40, 55])
  })

  it('ignora extras fuera del tramo', () => {
    expect(generarProgresivas(0, 40, 20, [-5, 100])).toEqual([0, 20, 40])
  })

  it('devuelve solo el inicio si el tramo tiene longitud cero', () => {
    expect(generarProgresivas(0, 0, 20, [])).toEqual([0])
  })

  it('rechaza un intervalo no positivo', () => {
    expect(() => generarProgresivas(0, 100, 0, [])).toThrow('El intervalo debe ser mayor que cero')
  })

  it('rechaza un tramo invertido', () => {
    expect(() => generarProgresivas(100, 0, 20, [])).toThrow(
      'La progresiva final no puede ser menor que la inicial',
    )
  })
})

describe('formatearProgresiva', () => {
  it('usa el formato km+metros con tres dígitos', () => {
    expect(formatearProgresiva(0)).toBe('0+000')
    expect(formatearProgresiva(20)).toBe('0+020')
    expect(formatearProgresiva(180)).toBe('0+180')
    expect(formatearProgresiva(1000)).toBe('1+000')
  })

  it('muestra dos decimales solo cuando los hay', () => {
    expect(formatearProgresiva(1247.5)).toBe('1+247.50')
    expect(formatearProgresiva(47.25)).toBe('0+047.25')
  })

  it('acarrea correctamente cuando la fracción redondea a un metro completo', () => {
    expect(formatearProgresiva(999.995)).toBe('1+000')
    expect(formatearProgresiva(0.995)).toBe('0+001')
    expect(formatearProgresiva(47.996)).toBe('0+048')
  })

  it('sobrevive el viaje de ida y vuelta con parsearProgresiva', () => {
    for (const valor of [0, 20, 180, 1000, 1247.5, 47.25, 2999.99]) {
      expect(parsearProgresiva(formatearProgresiva(valor))).toBeCloseTo(valor, 6)
    }
  })
})

describe('parsearProgresiva', () => {
  it('acepta el formato km+metros', () => {
    expect(parsearProgresiva('0+020')).toBe(20)
    expect(parsearProgresiva('1+247.50')).toBe(1247.5)
  })

  it('acepta metros sueltos', () => {
    expect(parsearProgresiva('20')).toBe(20)
    expect(parsearProgresiva('47.25')).toBe(47.25)
  })

  it('devuelve null si no se entiende', () => {
    expect(parsearProgresiva('abc')).toBeNull()
    expect(parsearProgresiva('')).toBeNull()
  })
})
```

- [ ] **Paso 2: Ejecutar la prueba y verificar que falla**

Ejecuta: `npm test --workspace packages/core`
Esperado: FALLA por no encontrar `./progresivas`.

- [ ] **Paso 3: Escribir la implementación**

`packages/core/src/grilla/progresivas.ts`:

```ts
import { redondear3 } from '../numero'

export function generarProgresivas(
  inicio: number,
  fin: number,
  intervalo: number,
  extras: number[],
): number[] {
  if (intervalo <= 0) throw new Error('El intervalo debe ser mayor que cero')
  if (fin < inicio) throw new Error('La progresiva final no puede ser menor que la inicial')

  const valores = new Set<number>()
  for (let p = inicio; p < fin; p += intervalo) valores.add(redondear3(p))
  valores.add(redondear3(fin))

  for (const extra of extras) {
    const valor = redondear3(extra)
    if (valor >= inicio && valor <= fin) valores.add(valor)
  }

  return [...valores].sort((a, b) => a - b)
}

export function formatearProgresiva(metros: number): string {
  const negativa = metros < 0
  // Se redondea una sola vez, sobre el total en centésimas. Repartir después
  // el resultado entero evita que el acarreo de la fracción se pierda.
  const centesimas = Math.round(redondear3(Math.abs(metros)) * 100)
  const kilometro = Math.floor(centesimas / 100000)
  const restoCentesimas = centesimas - kilometro * 100000
  const entero = Math.floor(restoCentesimas / 100)
  const decimal = restoCentesimas - entero * 100

  const cuerpo =
    decimal > 0
      ? `${String(entero).padStart(3, '0')}.${String(decimal).padStart(2, '0')}`
      : String(entero).padStart(3, '0')

  return `${negativa ? '-' : ''}${kilometro}+${cuerpo}`
}

export function parsearProgresiva(texto: string): number | null {
  const limpio = texto.trim()
  if (limpio === '') return null

  const conMas = /^(-?)(\d+)\+(\d+(?:[.,]\d+)?)$/.exec(limpio)
  if (conMas) {
    const signo = conMas[1] === '-' ? -1 : 1
    const km = Number(conMas[2])
    const metros = Number(conMas[3]!.replace(',', '.'))
    return signo * (km * 1000 + metros)
  }

  const suelto = /^-?\d+(?:[.,]\d+)?$/.exec(limpio)
  if (suelto) return Number(limpio.replace(',', '.'))

  return null
}
```

- [ ] **Paso 4: Exportar desde el índice**

Añade a `packages/core/src/index.ts`:

```ts
export * from './grilla/progresivas'
```

- [ ] **Paso 5: Ejecutar las pruebas y verificar que pasan**

Ejecuta: `npm test --workspace packages/core`
Esperado: todas en verde (17 pruebas).

- [ ] **Paso 6: Commit**

```bash
git add -A
git commit -m "Generación, formato y lectura de progresivas"
```

---

### Tarea 3: Tipos del modelo y construcción de la grilla

**Archivos:**
- Crear: `packages/core/src/modelo/tipos.ts`
- Crear: `packages/core/src/grilla/grilla.ts`
- Test: `packages/core/src/grilla/grilla.test.ts`
- Modificar: `packages/core/src/index.ts`

**Interfaces:**
- Consume: `generarProgresivas` de la Tarea 2.
- Produce: todos los tipos del modelo (abajo), más:
  - `claveCelda(progresiva: number, elementoClave: string): string` — `"20|EJE"`.
  - `construirGrilla(calle: Calle, plantilla: Plantilla): CeldaGrilla[]`.
  - `CeldaGrilla { progresiva: number; elementoClave: string; etiqueta: string; offset: number; clave: string }`.

- [ ] **Paso 1: Escribir los tipos del modelo**

`packages/core/src/modelo/tipos.ts`:

```ts
export type Id = string

// ---------- Banco de nivel ----------

export type TipoBM = 'oficial' | 'auxiliar'

export interface BM {
  id: Id
  nombre: string
  cota: number
  tipo: TipoBM
  descripcion: string
}

// ---------- Plantilla transversal ----------

export type TipoElemento =
  | 'vereda'
  | 'sardinel'
  | 'calzada'
  | 'eje'
  | 'peloAgua'
  | 'existente'
  | 'otro'

export interface ElementoPlantilla {
  clave: string
  etiqueta: string
  /** Metros desde el eje. Negativo = izquierda. */
  offset: number
  tipo: TipoElemento
}

export interface Plantilla {
  id: Id
  nombre: string
  elementos: ElementoPlantilla[]
}

// ---------- Calle ----------

export interface Calle {
  id: Id
  nombre: string
  plantillaId: Id
  progresivaInicio: number
  progresivaFin: number
  intervalo: number
  progresivasExtra: number[]
}

// ---------- Capa ----------

export interface Capa {
  id: Id
  nombre: string
  orden: number
}

// ---------- Destinos de lectura ----------

export interface Celda {
  progresiva: number
  elementoClave: string
}

export interface PuntoSuelto {
  etiqueta: string
  offset: number
  notas: string
}

export type DestinoLectura =
  | { tipo: 'bm'; bmId: Id }
  | { tipo: 'cambio'; nombre: string }
  | { tipo: 'celda'; celda: Celda }
  | { tipo: 'suelto'; punto: PuntoSuelto }

export interface Lectura {
  id: Id
  destino: DestinoLectura
  /** Lectura de mira en metros. */
  valor: number
}

export interface Estacion {
  id: Id
  vistaAtras: Lectura
  intermedias: Lectura[]
  /** Ausente en la última estación de un circuito abierto. */
  vistaAdelante?: Lectura
}

// ---------- Cierre ----------

export type TipoCierre = 'cerrado' | 'enlace' | 'abierto'
export type ClaseNivelacion = 'precision' | 'tercerOrden' | 'personalizada'

export interface ConfigCierre {
  tipo: TipoCierre
  bmFinalId?: Id
  /** Longitud del circuito en kilómetros. */
  longitudK: number
  /** Si es true, longitudK se recalcula desde las progresivas de la calle. */
  longitudKAuto: boolean
  clase: ClaseNivelacion
  /** Coeficiente e de la fórmula T = e·raiz(K), en milímetros. */
  coeficiente: number
}

export const COEFICIENTE_POR_CLASE: Record<Exclude<ClaseNivelacion, 'personalizada'>, number> = {
  precision: 7,
  tercerOrden: 12,
}

// ---------- Campaña ----------

export interface Campania {
  id: Id
  /** Fecha ISO: 2026-08-19 */
  fecha: string
  calleId: Id
  capaId: Id
  bmInicialId: Id
  estaciones: Estacion[]
  cierre: ConfigCierre
  estado: 'abierta' | 'cerrada'
}

// ---------- Proyecto ----------

export interface MetaProyecto {
  nombre: string
  obra: string
  cliente: string
  ubicacion: string
  responsable: string
  creado: string
  modificado: string
}

export interface Proyecto {
  version: 1
  meta: MetaProyecto
  bms: BM[]
  plantillas: Plantilla[]
  calles: Calle[]
  capas: Capa[]
  campanias: Campania[]
}
```

- [ ] **Paso 2: Escribir la prueba que falla**

`packages/core/src/grilla/grilla.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { Calle, Plantilla } from '../modelo/tipos'
import { claveCelda, construirGrilla } from './grilla'

const plantilla: Plantilla = {
  id: 'pl-1',
  nombre: 'Calle con vereda',
  elementos: [
    { clave: 'BOR-I', etiqueta: 'Borde izquierdo', offset: -4.2, tipo: 'calzada' },
    { clave: 'EJE', etiqueta: 'Eje', offset: 0, tipo: 'eje' },
    { clave: 'BOR-D', etiqueta: 'Borde derecho', offset: 4.2, tipo: 'calzada' },
  ],
}

const calle: Calle = {
  id: 'c-1',
  nombre: 'Av. Sol',
  plantillaId: 'pl-1',
  progresivaInicio: 0,
  progresivaFin: 40,
  intervalo: 20,
  progresivasExtra: [],
}

describe('claveCelda', () => {
  it('combina progresiva y elemento', () => {
    expect(claveCelda(20, 'EJE')).toBe('20|EJE')
  })

  it('normaliza decimales para que la clave sea estable', () => {
    expect(claveCelda(20.0, 'EJE')).toBe(claveCelda(20, 'EJE'))
    expect(claveCelda(47.25, 'EJE')).toBe('47.25|EJE')
  })
})

describe('construirGrilla', () => {
  it('genera una celda por progresiva y elemento', () => {
    const grilla = construirGrilla(calle, plantilla)
    expect(grilla).toHaveLength(9)
  })

  it('recorre primero las progresivas y dentro de ellas los elementos', () => {
    const grilla = construirGrilla(calle, plantilla)
    expect(grilla.slice(0, 4).map((c) => c.clave)).toEqual([
      '0|BOR-I',
      '0|EJE',
      '0|BOR-D',
      '20|BOR-I',
    ])
  })

  it('lleva el offset y la etiqueta del elemento', () => {
    const grilla = construirGrilla(calle, plantilla)
    const celda = grilla.find((c) => c.clave === '20|BOR-D')
    expect(celda?.offset).toBe(4.2)
    expect(celda?.etiqueta).toBe('Borde derecho')
  })

  it('devuelve grilla vacía si la plantilla no tiene elementos', () => {
    const vacia: Plantilla = { ...plantilla, elementos: [] }
    expect(construirGrilla(calle, vacia)).toEqual([])
  })
})
```

- [ ] **Paso 3: Ejecutar la prueba y verificar que falla**

Ejecuta: `npm test --workspace packages/core`
Esperado: FALLA por no encontrar `./grilla`.

- [ ] **Paso 4: Escribir la implementación**

`packages/core/src/grilla/grilla.ts`:

```ts
import type { Calle, Plantilla } from '../modelo/tipos'
import { redondear3 } from '../numero'
import { generarProgresivas } from './progresivas'

export interface CeldaGrilla {
  progresiva: number
  elementoClave: string
  etiqueta: string
  offset: number
  clave: string
}

export function claveCelda(progresiva: number, elementoClave: string): string {
  return `${redondear3(progresiva)}|${elementoClave}`
}

export function construirGrilla(calle: Calle, plantilla: Plantilla): CeldaGrilla[] {
  const progresivas = generarProgresivas(
    calle.progresivaInicio,
    calle.progresivaFin,
    calle.intervalo,
    calle.progresivasExtra,
  )

  const celdas: CeldaGrilla[] = []
  for (const progresiva of progresivas) {
    for (const elemento of plantilla.elementos) {
      celdas.push({
        progresiva,
        elementoClave: elemento.clave,
        etiqueta: elemento.etiqueta,
        offset: elemento.offset,
        clave: claveCelda(progresiva, elemento.clave),
      })
    }
  }
  return celdas
}
```

- [ ] **Paso 5: Exportar desde el índice**

Añade a `packages/core/src/index.ts`:

```ts
export * from './modelo/tipos'
export * from './grilla/grilla'
```

- [ ] **Paso 6: Ejecutar las pruebas y verificar que pasan**

Ejecuta: `npm test --workspace packages/core`
Esperado: todas en verde.

- [ ] **Paso 7: Commit**

```bash
git add -A
git commit -m "Tipos del modelo de datos y construcción de la grilla"
```

---

### Tarea 4: Cotas crudas por el método de cota instrumento

**Archivos:**
- Crear: `packages/core/src/nivelacion/cotas.ts`
- Test: `packages/core/src/nivelacion/cotas.test.ts`
- Crear: `packages/core/src/pruebas/libretaEjemplo.ts`
- Modificar: `packages/core/src/index.ts`

**Interfaces:**
- Consume: tipos de la Tarea 3, `claveCelda` de la Tarea 3.
- Produce:
  - `claveDestino(destino: DestinoLectura): string` — `"bm:bm-1"`, `"cambio:PC-1"`, `"20|EJE"`, `"suelto:Buzón"`.
  - `calcularCotas(campania: Campania, bms: BM[]): ResultadoCotas`.
  - `ResultadoCotas { cotasInstrumento: number[]; puntos: PuntoCalculado[]; cotaLlegada: number | null }`.
  - `PuntoCalculado { claveDestino: string; destino: DestinoLectura; estacionIndice: number; lectura: number; cotaInstrumento: number; cotaCruda: number }`.

- [ ] **Paso 1: Crear la libreta de ejemplo compartida**

`packages/core/src/pruebas/libretaEjemplo.ts`:

```ts
import type { BM, Calle, Campania, Capa, Plantilla } from '../modelo/tipos'

export const BM_1: BM = {
  id: 'bm-1',
  nombre: 'BM-1',
  cota: 3245.18,
  tipo: 'oficial',
  descripcion: 'clavo en vereda esq. Av. Sol / Jr. Lima',
}

export const PLANTILLA_EJEMPLO: Plantilla = {
  id: 'pl-1',
  nombre: 'Calle con vereda',
  elementos: [
    { clave: 'BOR-I', etiqueta: 'Borde izquierdo', offset: -4.2, tipo: 'calzada' },
    { clave: 'EJE', etiqueta: 'Eje', offset: 0, tipo: 'eje' },
    { clave: 'BOR-D', etiqueta: 'Borde derecho', offset: 4.2, tipo: 'calzada' },
  ],
}

export const CALLE_EJEMPLO: Calle = {
  id: 'c-1',
  nombre: 'Av. Sol',
  plantillaId: 'pl-1',
  progresivaInicio: 0,
  progresivaFin: 180,
  intervalo: 20,
  progresivasExtra: [],
}

export const CAPA_EJEMPLO: Capa = { id: 'cap-1', nombre: 'SUBRASANTE', orden: 1 }

/** Libreta verificada a mano. Cierre -5.0 mm, tolerancia ±7.2 mm, PASA. */
export function campaniaEjemplo(): Campania {
  return {
    id: 'camp-1',
    fecha: '2026-08-19',
    calleId: 'c-1',
    capaId: 'cap-1',
    bmInicialId: 'bm-1',
    estado: 'abierta',
    cierre: {
      tipo: 'cerrado',
      bmFinalId: 'bm-1',
      longitudK: 0.36,
      longitudKAuto: true,
      clase: 'tercerOrden',
      coeficiente: 12,
    },
    estaciones: [
      {
        id: 'e-1',
        vistaAtras: { id: 'l-1', destino: { tipo: 'bm', bmId: 'bm-1' }, valor: 1.425 },
        intermedias: [
          {
            id: 'l-2',
            destino: { tipo: 'celda', celda: { progresiva: 0, elementoClave: 'EJE' } },
            valor: 1.98,
          },
          {
            id: 'l-3',
            destino: { tipo: 'celda', celda: { progresiva: 0, elementoClave: 'BOR-I' } },
            valor: 2.045,
          },
        ],
        vistaAdelante: { id: 'l-4', destino: { tipo: 'cambio', nombre: 'PC-1' }, valor: 1.15 },
      },
      {
        id: 'e-2',
        vistaAtras: { id: 'l-5', destino: { tipo: 'cambio', nombre: 'PC-1' }, valor: 1.63 },
        intermedias: [
          {
            id: 'l-6',
            destino: { tipo: 'celda', celda: { progresiva: 20, elementoClave: 'EJE' } },
            valor: 2.47,
          },
        ],
        vistaAdelante: { id: 'l-7', destino: { tipo: 'bm', bmId: 'bm-1' }, valor: 1.91 },
      },
    ],
  }
}
```

- [ ] **Paso 2: Escribir la prueba que falla**

`packages/core/src/nivelacion/cotas.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { BM_1, campaniaEjemplo } from '../pruebas/libretaEjemplo'
import { calcularCotas, claveDestino } from './cotas'

describe('claveDestino', () => {
  it('distingue cada tipo de destino', () => {
    expect(claveDestino({ tipo: 'bm', bmId: 'bm-1' })).toBe('bm:bm-1')
    expect(claveDestino({ tipo: 'cambio', nombre: 'PC-1' })).toBe('cambio:PC-1')
    expect(
      claveDestino({ tipo: 'celda', celda: { progresiva: 20, elementoClave: 'EJE' } }),
    ).toBe('20|EJE')
    expect(
      claveDestino({ tipo: 'suelto', punto: { etiqueta: 'Buzón', offset: 1.2, notas: '' } }),
    ).toBe('suelto:Buzón')
  })
})

describe('calcularCotas', () => {
  it('calcula la cota instrumento de cada estación', () => {
    const resultado = calcularCotas(campaniaEjemplo(), [BM_1])
    expect(resultado.cotasInstrumento[0]).toBeCloseTo(3246.605, 6)
    expect(resultado.cotasInstrumento[1]).toBeCloseTo(3247.085, 6)
  })

  it('calcula la cota cruda de cada punto intermedio', () => {
    const resultado = calcularCotas(campaniaEjemplo(), [BM_1])
    const porClave = new Map(resultado.puntos.map((p) => [p.claveDestino, p.cotaCruda]))
    expect(porClave.get('0|EJE')).toBeCloseTo(3244.625, 6)
    expect(porClave.get('0|BOR-I')).toBeCloseTo(3244.56, 6)
    expect(porClave.get('20|EJE')).toBeCloseTo(3244.615, 6)
  })

  it('calcula la cota del punto de cambio y la usa en la estación siguiente', () => {
    const resultado = calcularCotas(campaniaEjemplo(), [BM_1])
    const pc = resultado.puntos.find((p) => p.claveDestino === 'cambio:PC-1')
    expect(pc?.cotaCruda).toBeCloseTo(3245.455, 6)
  })

  it('devuelve la cota de llegada del circuito', () => {
    const resultado = calcularCotas(campaniaEjemplo(), [BM_1])
    expect(resultado.cotaLlegada).toBeCloseTo(3245.175, 6)
  })

  it('registra a qué estación pertenece cada punto', () => {
    const resultado = calcularCotas(campaniaEjemplo(), [BM_1])
    const punto = resultado.puntos.find((p) => p.claveDestino === '20|EJE')
    expect(punto?.estacionIndice).toBe(1)
  })

  it('recalcula todo cuando cambia la cota del BM', () => {
    const bmCorregido = { ...BM_1, cota: 3245.28 }
    const resultado = calcularCotas(campaniaEjemplo(), [bmCorregido])
    const punto = resultado.puntos.find((p) => p.claveDestino === '0|EJE')
    expect(punto?.cotaCruda).toBeCloseTo(3244.725, 6)
  })

  it('avisa si el BM inicial no existe', () => {
    expect(() => calcularCotas(campaniaEjemplo(), [])).toThrow(
      'No se encontró el banco de nivel inicial de la campaña',
    )
  })

  it('avisa si una vista atrás apunta a un punto de cambio desconocido', () => {
    const campania = campaniaEjemplo()
    campania.estaciones[1]!.vistaAtras.destino = { tipo: 'cambio', nombre: 'PC-9' }
    expect(() => calcularCotas(campania, [BM_1])).toThrow(
      'La estación 2 arranca en PC-9, que no fue medido antes',
    )
  })

  it('avisa si dos puntos de cambio se llaman igual', () => {
    const campania = campaniaEjemplo()
    campania.estaciones[1]!.vistaAdelante!.destino = { tipo: 'cambio', nombre: 'PC-1' }
    expect(() => calcularCotas(campania, [BM_1])).toThrow(
      'El punto de cambio PC-1 está repetido: dos estaciones distintas lo usan como punto de llegada. Renombra uno de los dos.',
    )
  })
})
```

- [ ] **Paso 3: Ejecutar la prueba y verificar que falla**

Ejecuta: `npm test --workspace packages/core`
Esperado: FALLA por no encontrar `./cotas`.

- [ ] **Paso 4: Escribir la implementación**

`packages/core/src/nivelacion/cotas.ts`:

```ts
import { claveCelda } from '../grilla/grilla'
import type { BM, Campania, DestinoLectura } from '../modelo/tipos'

export interface PuntoCalculado {
  claveDestino: string
  destino: DestinoLectura
  estacionIndice: number
  lectura: number
  cotaInstrumento: number
  cotaCruda: number
}

export interface ResultadoCotas {
  cotasInstrumento: number[]
  puntos: PuntoCalculado[]
  cotaLlegada: number | null
}

export function claveDestino(destino: DestinoLectura): string {
  switch (destino.tipo) {
    case 'bm':
      return `bm:${destino.bmId}`
    case 'cambio':
      return `cambio:${destino.nombre}`
    case 'celda':
      return claveCelda(destino.celda.progresiva, destino.celda.elementoClave)
    case 'suelto':
      return `suelto:${destino.punto.etiqueta}`
  }
}

export function calcularCotas(campania: Campania, bms: BM[]): ResultadoCotas {
  const bmInicial = bms.find((bm) => bm.id === campania.bmInicialId)
  if (!bmInicial) throw new Error('No se encontró el banco de nivel inicial de la campaña')

  const cotasConocidas = new Map<string, number>()
  for (const bm of bms) cotasConocidas.set(`bm:${bm.id}`, bm.cota)

  const cotasInstrumento: number[] = []
  const puntos: PuntoCalculado[] = []
  let cotaLlegada: number | null = null

  campania.estaciones.forEach((estacion, indice) => {
    const clavePartida = claveDestino(estacion.vistaAtras.destino)
    const cotaPartida = cotasConocidas.get(clavePartida)

    if (cotaPartida === undefined) {
      const nombre =
        estacion.vistaAtras.destino.tipo === 'cambio'
          ? estacion.vistaAtras.destino.nombre
          : clavePartida
      throw new Error(`La estación ${indice + 1} arranca en ${nombre}, que no fue medido antes`)
    }

    const cotaInstrumento = cotaPartida + estacion.vistaAtras.valor
    cotasInstrumento.push(cotaInstrumento)

    for (const lectura of estacion.intermedias) {
      puntos.push({
        claveDestino: claveDestino(lectura.destino),
        destino: lectura.destino,
        estacionIndice: indice,
        lectura: lectura.valor,
        cotaInstrumento,
        cotaCruda: cotaInstrumento - lectura.valor,
      })
    }

    if (estacion.vistaAdelante) {
      const clave = claveDestino(estacion.vistaAdelante.destino)
      const cota = cotaInstrumento - estacion.vistaAdelante.valor

      puntos.push({
        claveDestino: clave,
        destino: estacion.vistaAdelante.destino,
        estacionIndice: indice,
        lectura: estacion.vistaAdelante.valor,
        cotaInstrumento,
        cotaCruda: cota,
      })

      if (estacion.vistaAdelante.destino.tipo === 'cambio') {
        // Dos puntos de cambio con el mismo nombre harían que la estación
        // siguiente arrancara de la cota equivocada, en silencio.
        if (cotasConocidas.has(clave)) {
          throw new Error(
            `El punto de cambio ${estacion.vistaAdelante.destino.nombre} está repetido: ` +
              'dos estaciones distintas lo usan como punto de llegada. Renombra uno de los dos.',
          )
        }
        cotasConocidas.set(clave, cota)
      }
      if (estacion.vistaAdelante.destino.tipo === 'bm') cotaLlegada = cota
    }
  })

  return { cotasInstrumento, puntos, cotaLlegada }
}
```

- [ ] **Paso 5: Exportar desde el índice**

Añade a `packages/core/src/index.ts`:

```ts
export * from './nivelacion/cotas'
```

- [ ] **Paso 6: Ejecutar las pruebas y verificar que pasan**

Ejecuta: `npm test --workspace packages/core`
Esperado: todas en verde.

- [ ] **Paso 7: Commit**

```bash
git add -A
git commit -m "Cálculo de cotas crudas por el método de cota instrumento"
```

---

### Tarea 5: Cierre del circuito — error, longitud K y tolerancia

**Archivos:**
- Crear: `packages/core/src/nivelacion/cierre.ts`
- Test: `packages/core/src/nivelacion/cierre.test.ts`
- Modificar: `packages/core/src/index.ts`

**Interfaces:**
- Consume: `ResultadoCotas` de la Tarea 4; tipos de la Tarea 3.
- Produce:
  - `calcularToleranciaMm(coeficiente: number, longitudKKm: number): number`.
  - `calcularLongitudKAuto(calle: Calle, tipo: TipoCierre): number` — km.
  - `calcularCierre(campania: Campania, bms: BM[], cotas: ResultadoCotas, longitudKKm: number): ResultadoCierre`.
  - `ResultadoCierre { tipo: TipoCierre; cotaLlegadaCalculada: number | null; cotaLlegadaConocida: number | null; errorMm: number | null; longitudKKm: number; toleranciaMm: number | null; pasa: boolean | null }`.

- [ ] **Paso 1: Escribir la prueba que falla**

`packages/core/src/nivelacion/cierre.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { BM_1, CALLE_EJEMPLO, campaniaEjemplo } from '../pruebas/libretaEjemplo'
import { calcularCotas } from './cotas'
import { calcularCierre, calcularLongitudKAuto, calcularToleranciaMm } from './cierre'

describe('calcularToleranciaMm', () => {
  it('aplica T = e por raiz de K', () => {
    expect(calcularToleranciaMm(12, 0.36)).toBeCloseTo(7.2, 6)
    expect(calcularToleranciaMm(7, 1)).toBeCloseTo(7, 6)
    expect(calcularToleranciaMm(15, 4)).toBeCloseTo(30, 6)
  })

  it('devuelve cero si el circuito tiene longitud cero', () => {
    expect(calcularToleranciaMm(12, 0)).toBe(0)
  })

  it('rechaza una longitud negativa', () => {
    expect(() => calcularToleranciaMm(12, -1)).toThrow('La longitud del circuito no puede ser negativa')
  })
})

describe('calcularLongitudKAuto', () => {
  it('cuenta ida y vuelta en un circuito cerrado', () => {
    expect(calcularLongitudKAuto(CALLE_EJEMPLO, 'cerrado')).toBeCloseTo(0.36, 6)
  })

  it('cuenta un solo recorrido en un enlace', () => {
    expect(calcularLongitudKAuto(CALLE_EJEMPLO, 'enlace')).toBeCloseTo(0.18, 6)
  })

  it('cuenta un solo recorrido en un circuito abierto', () => {
    expect(calcularLongitudKAuto(CALLE_EJEMPLO, 'abierto')).toBeCloseTo(0.18, 6)
  })
})

describe('calcularCierre', () => {
  it('calcula el error del circuito cerrado de ejemplo', () => {
    const campania = campaniaEjemplo()
    const cotas = calcularCotas(campania, [BM_1])
    const cierre = calcularCierre(campania, [BM_1], cotas, 0.36)

    expect(cierre.errorMm).toBeCloseTo(-5, 6)
    expect(cierre.toleranciaMm).toBeCloseTo(7.2, 6)
    expect(cierre.pasa).toBe(true)
  })

  it('marca que no pasa cuando el error supera la tolerancia', () => {
    const campania = campaniaEjemplo()
    campania.estaciones[1]!.vistaAdelante!.valor = 1.887
    const cotas = calcularCotas(campania, [BM_1])
    const cierre = calcularCierre(campania, [BM_1], cotas, 0.36)

    expect(cierre.errorMm).toBeCloseTo(18, 6)
    expect(cierre.pasa).toBe(false)
  })

  it('acepta un error exactamente igual a la tolerancia', () => {
    const campania = campaniaEjemplo()
    campania.estaciones[1]!.vistaAdelante!.valor = 1.9122
    const cotas = calcularCotas(campania, [BM_1])
    const cierre = calcularCierre(campania, [BM_1], cotas, 0.36)

    expect(cierre.errorMm).toBeCloseTo(-7.2, 3)
    expect(cierre.pasa).toBe(true)
  })

  it('cierra por enlace contra un segundo BM', () => {
    const bm2 = { ...BM_1, id: 'bm-2', nombre: 'BM-2', cota: 3245.175 }
    const campania = campaniaEjemplo()
    campania.cierre = { ...campania.cierre, tipo: 'enlace', bmFinalId: 'bm-2' }
    campania.estaciones[1]!.vistaAdelante!.destino = { tipo: 'bm', bmId: 'bm-2' }

    const cotas = calcularCotas(campania, [BM_1, bm2])
    const cierre = calcularCierre(campania, [BM_1, bm2], cotas, 0.18)

    expect(cierre.errorMm).toBeCloseTo(0, 6)
    expect(cierre.pasa).toBe(true)
  })

  it('deja el circuito abierto sin veredicto', () => {
    const campania = campaniaEjemplo()
    campania.cierre = { ...campania.cierre, tipo: 'abierto', bmFinalId: undefined }
    delete campania.estaciones[1]!.vistaAdelante

    const cotas = calcularCotas(campania, [BM_1])
    const cierre = calcularCierre(campania, [BM_1], cotas, 0.18)

    expect(cierre.errorMm).toBeNull()
    expect(cierre.toleranciaMm).toBeNull()
    expect(cierre.pasa).toBeNull()
  })
})
```

- [ ] **Paso 2: Ejecutar la prueba y verificar que falla**

Ejecuta: `npm test --workspace packages/core`
Esperado: FALLA por no encontrar `./cierre`.

- [ ] **Paso 3: Escribir la implementación**

`packages/core/src/nivelacion/cierre.ts`:

```ts
import type { BM, Calle, Campania, TipoCierre } from '../modelo/tipos'
import { aMilimetros } from '../numero'
import type { ResultadoCotas } from './cotas'

export interface ResultadoCierre {
  tipo: TipoCierre
  cotaLlegadaCalculada: number | null
  cotaLlegadaConocida: number | null
  errorMm: number | null
  longitudKKm: number
  toleranciaMm: number | null
  pasa: boolean | null
}

export function calcularToleranciaMm(coeficiente: number, longitudKKm: number): number {
  if (longitudKKm < 0) throw new Error('La longitud del circuito no puede ser negativa')
  return coeficiente * Math.sqrt(longitudKKm)
}

/** Un circuito cerrado recorre la calle de ida y de vuelta; enlace y abierto, una sola vez. */
export function calcularLongitudKAuto(calle: Calle, tipo: TipoCierre): number {
  const longitudMetros = Math.abs(calle.progresivaFin - calle.progresivaInicio)
  const recorridos = tipo === 'cerrado' ? 2 : 1
  return (longitudMetros * recorridos) / 1000
}

export function calcularCierre(
  campania: Campania,
  bms: BM[],
  cotas: ResultadoCotas,
  longitudKKm: number,
): ResultadoCierre {
  const base: ResultadoCierre = {
    tipo: campania.cierre.tipo,
    cotaLlegadaCalculada: cotas.cotaLlegada,
    cotaLlegadaConocida: null,
    errorMm: null,
    longitudKKm,
    toleranciaMm: null,
    pasa: null,
  }

  if (campania.cierre.tipo === 'abierto') return base

  const bmFinal = bms.find((bm) => bm.id === campania.cierre.bmFinalId)
  if (!bmFinal || cotas.cotaLlegada === null) return base

  const errorMm = aMilimetros(cotas.cotaLlegada - bmFinal.cota)
  const toleranciaMm = calcularToleranciaMm(campania.cierre.coeficiente, longitudKKm)

  return {
    ...base,
    cotaLlegadaConocida: bmFinal.cota,
    errorMm,
    toleranciaMm,
    // Una milésima de milímetro de holgura evita que el punto flotante rechace
    // un cierre que es exactamente igual a la tolerancia.
    pasa: Math.abs(errorMm) <= toleranciaMm + 1e-3,
  }
}
```

- [ ] **Paso 4: Exportar desde el índice**

Añade a `packages/core/src/index.ts`:

```ts
export * from './nivelacion/cierre'
```

- [ ] **Paso 5: Ejecutar las pruebas y verificar que pasan**

Ejecuta: `npm test --workspace packages/core`
Esperado: todas en verde.

- [ ] **Paso 6: Commit**

```bash
git add -A
git commit -m "Cierre de circuito: error, longitud K automática y tolerancia"
```

---

### Tarea 6: Compensación proporcional del error

**Archivos:**
- Crear: `packages/core/src/nivelacion/compensacion.ts`
- Test: `packages/core/src/nivelacion/compensacion.test.ts`
- Modificar: `packages/core/src/index.ts`

**Interfaces:**
- Consume: `PuntoCalculado` de la Tarea 4, `ResultadoCierre` de la Tarea 5.
- Produce:
  - `correccionesAcumuladas(errorMm: number, numeroEstaciones: number): number[]` — corrección **acumulada en metros** aplicable a los puntos de cada estación.
  - `compensarPuntos(puntos: PuntoCalculado[], acumuladas: number[]): PuntoCompensado[]`.
  - `PuntoCompensado = PuntoCalculado & { correccion: number; cota: number }`.

- [ ] **Paso 1: Escribir la prueba que falla**

`packages/core/src/nivelacion/compensacion.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { BM_1, campaniaEjemplo } from '../pruebas/libretaEjemplo'
import { calcularCotas } from './cotas'
import { compensarPuntos, correccionesAcumuladas } from './compensacion'

describe('correccionesAcumuladas', () => {
  it('reparte el error en partes iguales y con signo contrario', () => {
    expect(correccionesAcumuladas(-5, 2)).toEqual([0.0025, 0.005])
  })

  it('la última acumulada cancela exactamente el error', () => {
    const acumuladas = correccionesAcumuladas(18, 7)
    expect(acumuladas[6]).toBeCloseTo(-0.018, 12)
  })

  it('devuelve una sola corrección si hay una sola estación', () => {
    expect(correccionesAcumuladas(-5, 1)).toEqual([0.005])
  })

  it('devuelve cero cuando no hay error', () => {
    expect(correccionesAcumuladas(0, 3)).toEqual([0, 0, 0])
  })

  it('devuelve lista vacía si no hay estaciones', () => {
    expect(correccionesAcumuladas(-5, 0)).toEqual([])
  })
})

describe('compensarPuntos', () => {
  it('aplica a cada punto la corrección de su estación', () => {
    const cotas = calcularCotas(campaniaEjemplo(), [BM_1])
    const compensados = compensarPuntos(cotas.puntos, correccionesAcumuladas(-5, 2))
    const porClave = new Map(compensados.map((p) => [p.claveDestino, p.cota]))

    expect(porClave.get('0|EJE')).toBeCloseTo(3244.6275, 9)
    expect(porClave.get('20|EJE')).toBeCloseTo(3244.62, 9)
  })

  it('conserva la cota cruda intacta', () => {
    const cotas = calcularCotas(campaniaEjemplo(), [BM_1])
    const compensados = compensarPuntos(cotas.puntos, correccionesAcumuladas(-5, 2))
    const punto = compensados.find((p) => p.claveDestino === '0|EJE')

    expect(punto?.cotaCruda).toBeCloseTo(3244.625, 9)
    expect(punto?.correccion).toBeCloseTo(0.0025, 9)
  })

  it('deja las cotas sin tocar cuando no hay correcciones', () => {
    const cotas = calcularCotas(campaniaEjemplo(), [BM_1])
    const compensados = compensarPuntos(cotas.puntos, [])
    const punto = compensados.find((p) => p.claveDestino === '0|EJE')

    expect(punto?.cota).toBeCloseTo(3244.625, 9)
    expect(punto?.correccion).toBe(0)
  })
})
```

- [ ] **Paso 2: Ejecutar la prueba y verificar que falla**

Ejecuta: `npm test --workspace packages/core`
Esperado: FALLA por no encontrar `./compensacion`.

- [ ] **Paso 3: Escribir la implementación**

`packages/core/src/nivelacion/compensacion.ts`:

```ts
import { aMetros } from '../numero'
import type { PuntoCalculado } from './cotas'

export type PuntoCompensado = PuntoCalculado & {
  /** Corrección aplicada, en metros. */
  correccion: number
  /** Cota compensada, en metros. */
  cota: number
}

/**
 * Reparte el error de cierre proporcionalmente entre estaciones.
 * Devuelve la corrección ACUMULADA en metros aplicable a los puntos de cada
 * estación: el índice i lleva la suma de las correcciones de las estaciones 0..i.
 * Por construcción, la última acumulada cancela exactamente el error.
 */
export function correccionesAcumuladas(errorMm: number, numeroEstaciones: number): number[] {
  if (numeroEstaciones <= 0) return []

  const correccionTotal = aMetros(-errorMm)
  const acumuladas: number[] = []
  for (let i = 0; i < numeroEstaciones; i += 1) {
    acumuladas.push((correccionTotal * (i + 1)) / numeroEstaciones)
  }
  return acumuladas
}

export function compensarPuntos(
  puntos: PuntoCalculado[],
  acumuladas: number[],
): PuntoCompensado[] {
  return puntos.map((punto) => {
    const correccion = acumuladas[punto.estacionIndice] ?? 0
    return { ...punto, correccion, cota: punto.cotaCruda + correccion }
  })
}
```

- [ ] **Paso 4: Exportar desde el índice**

Añade a `packages/core/src/index.ts`:

```ts
export * from './nivelacion/compensacion'
```

- [ ] **Paso 5: Ejecutar las pruebas y verificar que pasan**

Ejecuta: `npm test --workspace packages/core`
Esperado: todas en verde.

- [ ] **Paso 6: Commit**

```bash
git add -A
git commit -m "Compensación proporcional del error de cierre"
```

---

### Tarea 7: Orquestador de campaña — cotas finales, duplicados y avisos

Junta todo lo anterior en la única función que la interfaz necesita llamar.

**Archivos:**
- Crear: `packages/core/src/nivelacion/calcularCampania.ts`
- Test: `packages/core/src/nivelacion/calcularCampania.test.ts`
- Modificar: `packages/core/src/index.ts`

**Interfaces:**
- Consume: todo lo de las Tareas 3 a 6.
- Produce:
  - `calcularCampania(entrada: EntradaCalculo): ResultadoCampania`.
  - `EntradaCalculo { campania: Campania; calle: Calle; plantilla: Plantilla; bms: BM[] }`.
  - `ResultadoCampania { cotasPorCelda: Map<string, CotaCelda>; cotasInstrumento: number[]; cierre: ResultadoCierre; avisos: Aviso[]; celdasTotales: number; celdasLlenas: number; error: string | null }`.
  - `CotaCelda { clave: string; progresiva: number; elementoClave: string; offset: number; cota: number; cotaCruda: number; correccion: number; lecturas: number[] }`.
  - `Aviso { nivel: 'informacion' | 'advertencia' | 'error'; clave: string | null; mensaje: string }`.

- [ ] **Paso 1: Escribir la prueba que falla**

`packages/core/src/nivelacion/calcularCampania.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  BM_1,
  CALLE_EJEMPLO,
  PLANTILLA_EJEMPLO,
  campaniaEjemplo,
} from '../pruebas/libretaEjemplo'
import { calcularCampania } from './calcularCampania'

function entrada(campania = campaniaEjemplo()) {
  return { campania, calle: CALLE_EJEMPLO, plantilla: PLANTILLA_EJEMPLO, bms: [BM_1] }
}

describe('calcularCampania', () => {
  it('entrega las cotas compensadas por celda', () => {
    const resultado = calcularCampania(entrada())
    expect(resultado.cotasPorCelda.get('0|EJE')?.cota).toBeCloseTo(3244.6275, 9)
    expect(resultado.cotasPorCelda.get('20|EJE')?.cota).toBeCloseTo(3244.62, 9)
  })

  it('lleva el offset de cada celda desde la plantilla', () => {
    const resultado = calcularCampania(entrada())
    expect(resultado.cotasPorCelda.get('0|BOR-I')?.offset).toBe(-4.2)
  })

  it('calcula la longitud K automáticamente cuando está en automático', () => {
    const resultado = calcularCampania(entrada())
    expect(resultado.cierre.longitudKKm).toBeCloseTo(0.36, 9)
    expect(resultado.cierre.pasa).toBe(true)
  })

  it('respeta la longitud K escrita a mano', () => {
    const campania = campaniaEjemplo()
    campania.cierre = { ...campania.cierre, longitudKAuto: false, longitudK: 1 }
    const resultado = calcularCampania(entrada(campania))
    expect(resultado.cierre.longitudKKm).toBe(1)
    expect(resultado.cierre.toleranciaMm).toBeCloseTo(12, 9)
  })

  it('cuenta celdas llenas y totales', () => {
    const resultado = calcularCampania(entrada())
    expect(resultado.celdasTotales).toBe(30)
    expect(resultado.celdasLlenas).toBe(3)
  })

  it('no compensa cuando el cierre no pasa', () => {
    const campania = campaniaEjemplo()
    campania.estaciones[1]!.vistaAdelante!.valor = 1.887
    const resultado = calcularCampania(entrada(campania))

    expect(resultado.cierre.pasa).toBe(false)
    expect(resultado.cotasPorCelda.get('0|EJE')?.cota).toBeCloseTo(3244.625, 9)
    expect(resultado.cotasPorCelda.get('0|EJE')?.correccion).toBe(0)
  })

  it('avisa cuando el cierre no pasa', () => {
    const campania = campaniaEjemplo()
    campania.estaciones[1]!.vistaAdelante!.valor = 1.887
    const resultado = calcularCampania(entrada(campania))
    const aviso = resultado.avisos.find((a) => a.nivel === 'error')

    expect(aviso?.mensaje).toContain('Cierre fuera de tolerancia')
    expect(aviso?.mensaje).toContain('18.0 mm')
    expect(aviso?.mensaje).toContain('±7.2 mm')
  })

  it('avisa cuando el circuito quedó abierto', () => {
    const campania = campaniaEjemplo()
    campania.cierre = { ...campania.cierre, tipo: 'abierto', bmFinalId: undefined }
    delete campania.estaciones[1]!.vistaAdelante
    const resultado = calcularCampania(entrada(campania))

    expect(resultado.avisos.some((a) => a.mensaje.includes('sin verificación'))).toBe(true)
  })

  it('guarda todas las lecturas de una celda medida dos veces y usa la última', () => {
    const campania = campaniaEjemplo()
    campania.estaciones[1]!.intermedias.push({
      id: 'l-8',
      destino: { tipo: 'celda', celda: { progresiva: 0, elementoClave: 'EJE' } },
      valor: 2.462,
    })
    const resultado = calcularCampania(entrada(campania))
    const celda = resultado.cotasPorCelda.get('0|EJE')

    expect(celda?.lecturas).toEqual([1.98, 2.462])
    expect(celda?.cotaCruda).toBeCloseTo(3244.623, 9)
  })

  it('advierte cuando dos lecturas de la misma celda difieren más de 5 mm', () => {
    const campania = campaniaEjemplo()
    campania.estaciones[1]!.intermedias.push({
      id: 'l-8',
      destino: { tipo: 'celda', celda: { progresiva: 0, elementoClave: 'EJE' } },
      valor: 2.47,
    })
    const resultado = calcularCampania(entrada(campania))
    const aviso = resultado.avisos.find((a) => a.clave === '0|EJE')

    expect(aviso?.nivel).toBe('advertencia')
    expect(aviso?.mensaje).toContain('se midió 2 veces')
  })

  it('avisa de una lectura que se aparta de sus vecinas de la misma progresiva', () => {
    const campania = campaniaEjemplo()
    campania.estaciones[0]!.intermedias.push({
      id: 'l-9',
      destino: { tipo: 'celda', celda: { progresiva: 0, elementoClave: 'BOR-D' } },
      valor: 2.45,
    })
    const resultado = calcularCampania(entrada(campania))
    const aviso = resultado.avisos.find((a) => a.clave === '0|BOR-D')

    expect(aviso?.nivel).toBe('advertencia')
    expect(aviso?.mensaje).toContain('se aparta')
  })

  it('expone la cota instrumento de cada estación', () => {
    const resultado = calcularCampania(entrada())
    expect(resultado.cotasInstrumento[0]).toBeCloseTo(3246.605, 6)
    expect(resultado.cotasInstrumento[1]).toBeCloseTo(3247.085, 6)
  })

  it('devuelve el error legible en vez de reventar si el BM no existe', () => {
    const resultado = calcularCampania({ ...entrada(), bms: [] })
    expect(resultado.error).toBe('No se encontró el banco de nivel inicial de la campaña')
    expect(resultado.cotasPorCelda.size).toBe(0)
    expect(resultado.cotasInstrumento).toEqual([])
  })
})
```

- [ ] **Paso 2: Ejecutar la prueba y verificar que falla**

Ejecuta: `npm test --workspace packages/core`
Esperado: FALLA por no encontrar `./calcularCampania`.

- [ ] **Paso 3: Escribir la implementación**

`packages/core/src/nivelacion/calcularCampania.ts`:

```ts
import { construirGrilla } from '../grilla/grilla'
import { formatearProgresiva } from '../grilla/progresivas'
import type { BM, Calle, Campania, Plantilla } from '../modelo/tipos'
import { aMilimetros, redondear3 } from '../numero'
import { calcularCierre, calcularLongitudKAuto, type ResultadoCierre } from './cierre'
import { compensarPuntos, correccionesAcumuladas } from './compensacion'
import { calcularCotas } from './cotas'

/** Diferencia a partir de la cual dos lecturas de la misma celda merecen advertencia. */
const TOLERANCIA_REPETICION_MM = 5
/** Cuánto puede apartarse una cota de la mediana de su progresiva antes de avisar. */
const APARTAMIENTO_MAXIMO_M = 0.3

export interface CotaCelda {
  clave: string
  progresiva: number
  elementoClave: string
  offset: number
  cota: number
  cotaCruda: number
  correccion: number
  lecturas: number[]
}

export interface Aviso {
  nivel: 'informacion' | 'advertencia' | 'error'
  clave: string | null
  mensaje: string
}

export interface EntradaCalculo {
  campania: Campania
  calle: Calle
  plantilla: Plantilla
  bms: BM[]
}

export interface ResultadoCampania {
  cotasPorCelda: Map<string, CotaCelda>
  /** Cota instrumento de cada estación, en el orden de la libreta. */
  cotasInstrumento: number[]
  cierre: ResultadoCierre
  avisos: Aviso[]
  celdasTotales: number
  celdasLlenas: number
  error: string | null
}

export function calcularCampania(entrada: EntradaCalculo): ResultadoCampania {
  const { campania, calle, plantilla, bms } = entrada

  // Todo el cuerpo va dentro del try: construirGrilla rechaza intervalos y
  // tramos inválidos, y calcularCierre rechaza una longitud K negativa. La
  // interfaz nunca debe reventar por datos malos de un archivo o del teclado.
  let grilla: CeldaGrilla[] = []
  let longitudKKm = campania.cierre.longitudK

  try {
    grilla = construirGrilla(calle, plantilla)
    const offsetPorClave = new Map(grilla.map((celda) => [celda.clave, celda.offset]))

    longitudKKm = campania.cierre.longitudKAuto
      ? calcularLongitudKAuto(calle, campania.cierre.tipo)
      : campania.cierre.longitudK

    const cotas = calcularCotas(campania, bms)
    const cierre = calcularCierre(campania, bms, cotas, longitudKKm)

    const acumuladas =
      cierre.pasa === true && cierre.errorMm !== null
        ? correccionesAcumuladas(cierre.errorMm, campania.estaciones.length)
        : []
    const compensados = compensarPuntos(cotas.puntos, acumuladas)

    const avisos: Aviso[] = []
    const cotasPorCelda = new Map<string, CotaCelda>()

    for (const punto of compensados) {
      if (punto.destino.tipo !== 'celda') continue

      const existente = cotasPorCelda.get(punto.claveDestino)
      const lecturas = existente ? [...existente.lecturas, punto.lectura] : [punto.lectura]

      cotasPorCelda.set(punto.claveDestino, {
        clave: punto.claveDestino,
        progresiva: punto.destino.celda.progresiva,
        elementoClave: punto.destino.celda.elementoClave,
        offset: offsetPorClave.get(punto.claveDestino) ?? 0,
        cota: punto.cota,
        cotaCruda: punto.cotaCruda,
        correccion: punto.correccion,
        lecturas,
      })
    }

    agregarAvisosDeRepeticion(cotasPorCelda, compensados, avisos)
    agregarAvisosDeApartamiento(cotasPorCelda, avisos)
    agregarAvisosDeCierre(cierre, campania, bms, avisos)

    return {
      cotasPorCelda,
      cotasInstrumento: cotas.cotasInstrumento,
      cierre,
      avisos,
      celdasTotales: grilla.length,
      celdasLlenas: cotasPorCelda.size,
      error: null,
    }
  } catch (fallo) {
    const mensaje = (fallo as Error).message
    return {
      cotasPorCelda: new Map(),
      cotasInstrumento: [],
      cierre: {
        tipo: campania.cierre.tipo,
        cotaLlegadaCalculada: null,
        cotaLlegadaConocida: null,
        errorMm: null,
        longitudKKm,
        toleranciaMm: null,
        pasa: null,
      },
      avisos: [{ nivel: 'error', clave: null, mensaje }],
      celdasTotales: grilla.length,
      celdasLlenas: 0,
      error: mensaje,
    }
  }
}

function agregarAvisosDeRepeticion(
  cotasPorCelda: Map<string, CotaCelda>,
  compensados: { claveDestino: string; cota: number; destino: { tipo: string } }[],
  avisos: Aviso[],
): void {
  // Guarda las cotas FINALES (compensadas), no las crudas: la diferencia que
  // le importa al topógrafo es entre los dos resultados, no entre las lecturas.
  const cotasFinalesPorClave = new Map<string, number[]>()
  for (const punto of compensados) {
    if (punto.destino.tipo !== 'celda') continue
    const lista = cotasFinalesPorClave.get(punto.claveDestino) ?? []
    lista.push(punto.cota)
    cotasFinalesPorClave.set(punto.claveDestino, lista)
  }

  for (const [clave, celda] of cotasPorCelda) {
    if (celda.lecturas.length < 2) continue

    const valores = cotasFinalesPorClave.get(clave) ?? []
    const diferenciaMm = Math.abs(aMilimetros(Math.max(...valores) - Math.min(...valores)))
    const nivel = diferenciaMm > TOLERANCIA_REPETICION_MM ? 'advertencia' : 'informacion'

    avisos.push({
      nivel,
      clave,
      mensaje:
        `${formatearProgresiva(celda.progresiva)} ${celda.elementoClave}: ` +
        `se midió ${celda.lecturas.length} veces, con ${diferenciaMm.toFixed(1)} mm de diferencia. ` +
        'Vale la última lectura.',
    })
  }
}

function agregarAvisosDeApartamiento(
  cotasPorCelda: Map<string, CotaCelda>,
  avisos: Aviso[],
): void {
  const porProgresiva = new Map<number, CotaCelda[]>()
  for (const celda of cotasPorCelda.values()) {
    const lista = porProgresiva.get(celda.progresiva) ?? []
    lista.push(celda)
    porProgresiva.set(celda.progresiva, lista)
  }

  for (const celdas of porProgresiva.values()) {
    if (celdas.length < 3) continue

    const ordenadas = celdas.map((c) => c.cota).sort((a, b) => a - b)
    const mediana = ordenadas[Math.floor(ordenadas.length / 2)]!

    for (const celda of celdas) {
      const desvio = Math.abs(celda.cota - mediana)
      if (desvio <= APARTAMIENTO_MAXIMO_M) continue

      const ultima = celda.lecturas[celda.lecturas.length - 1]!
      avisos.push({
        nivel: 'advertencia',
        clave: celda.clave,
        mensaje:
          `${formatearProgresiva(celda.progresiva)} ${celda.elementoClave} — lectura ${ultima.toFixed(3)}: ` +
          `se aparta ${redondear3(desvio).toFixed(3)} m de sus vecinas de la misma progresiva. ` +
          '¿La anotaste bien?',
      })
    }
  }
}

function agregarAvisosDeCierre(
  cierre: ResultadoCierre,
  campania: Campania,
  bms: BM[],
  avisos: Aviso[],
): void {
  // Un BM de cierre borrado deja el circuito sin veredicto. Sin este aviso, la
  // barra de cierre quedaría en blanco sin explicar por qué. Ojo: la libreta
  // que todavía no cerró es estado normal de trabajo y NO genera aviso.
  const bmFinalId = campania.cierre.bmFinalId
  if (cierre.tipo !== 'abierto' && bmFinalId && !bms.some((bm) => bm.id === bmFinalId)) {
    avisos.push({
      nivel: 'advertencia',
      clave: null,
      mensaje:
        'El banco de nivel de cierre de esta campaña ya no existe en el proyecto. ' +
        'Elige otro para poder verificar el circuito.',
    })
  }

  if (cierre.tipo === 'abierto') {
    avisos.push({
      nivel: 'advertencia',
      clave: null,
      mensaje:
        'Circuito abierto: sin verificación. Las cotas quedan marcadas como NO COMPROBADAS.',
    })
    return
  }

  if (cierre.pasa === false && cierre.errorMm !== null && cierre.toleranciaMm !== null) {
    avisos.push({
      nivel: 'error',
      clave: null,
      mensaje:
        `Cierre fuera de tolerancia: ${cierre.errorMm > 0 ? '+' : ''}${cierre.errorMm.toFixed(1)} mm ` +
        `(máximo ±${cierre.toleranciaMm.toFixed(1)} mm). Revisa la libreta o repite el circuito. ` +
        'Las cotas quedan marcadas como NO COMPROBADAS.',
    })
  }
}
```

- [ ] **Paso 4: Exportar desde el índice**

Añade a `packages/core/src/index.ts`:

```ts
export * from './nivelacion/calcularCampania'
```

- [ ] **Paso 5: Ejecutar las pruebas y verificar que pasan**

Ejecuta: `npm test --workspace packages/core`
Esperado: todas en verde.

- [ ] **Paso 6: Verificar los tipos**

Ejecuta: `npm run typecheck --workspace packages/core`
Esperado: sin errores.

- [ ] **Paso 7: Commit**

```bash
git add -A
git commit -m "Orquestador de campaña con avisos de repetición, apartamiento y cierre"
```

---

# PARTE B — Interfaz

---

### Tarea 8: Andamiaje de la aplicación

**Archivos:**
- Crear: `packages/app/package.json`
- Crear: `packages/app/tsconfig.json`
- Crear: `packages/app/vite.config.ts`
- Crear: `packages/app/vitest.config.ts`
- Crear: `packages/app/index.html`
- Crear: `packages/app/src/main.tsx`
- Crear: `packages/app/src/App.tsx`
- Crear: `packages/app/src/estilos.css`
- Test: `packages/app/src/App.test.tsx`

**Interfaces:**
- Consume: `@topo/core` (cualquier export de las tareas 1–7).
- Produce: aplicación React arrancable con `npm run dev`; componente `App` exportado por defecto desde `src/App.tsx`.

- [ ] **Paso 1: Crear el paquete**

`packages/app/package.json`:

```json
{
  "name": "@topo/app",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@topo/core": "*",
    "fflate": "^0.8.2",
    "idb-keyval": "^6.2.1",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "zustand": "^5.0.0"
  },
  "devDependencies": {
    "@tailwindcss/vite": "^4.0.0",
    "@testing-library/jest-dom": "^6.6.0",
    "@testing-library/react": "^16.1.0",
    "@testing-library/user-event": "^14.5.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.3.0",
    "jsdom": "^25.0.0",
    "tailwindcss": "^4.0.0",
    "typescript": "^5.7.0",
    "vite": "^7.0.0",
    "vitest": "^3.0.0"
  }
}
```

- [ ] **Paso 2: Crear la configuración**

`packages/app/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "types": ["vitest/globals", "@testing-library/jest-dom"],
    "noEmit": true
  },
  "include": ["src/**/*"]
}
```

`packages/app/vite.config.ts`:

```ts
import tailwind from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwind()],
})
```

`packages/app/vitest.config.ts`:

```ts
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/pruebas/preparacion.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
```

`packages/app/src/pruebas/preparacion.ts`:

```ts
import '@testing-library/jest-dom/vitest'
```

- [ ] **Paso 3: Crear el punto de entrada**

`packages/app/index.html`:

```html
<!doctype html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>TOPO — Nivelación</title>
  </head>
  <body>
    <div id="raiz"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`packages/app/src/estilos.css`:

```css
@import 'tailwindcss';

@theme {
  --color-marca: oklch(0.55 0.16 250);
  --color-pasa: oklch(0.65 0.17 145);
  --color-falla: oklch(0.6 0.21 25);
  --color-aviso: oklch(0.75 0.15 80);
}

html,
body,
#raiz {
  height: 100%;
}

body {
  @apply bg-white text-slate-900 antialiased dark:bg-slate-950 dark:text-slate-100;
}

/* Números de cota y lectura: siempre tabulares, para que las columnas cuadren. */
.numerico {
  font-variant-numeric: tabular-nums;
  @apply font-mono;
}
```

`packages/app/src/main.tsx`:

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './estilos.css'

createRoot(document.getElementById('raiz')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

`packages/app/src/App.tsx`:

```tsx
export default function App() {
  return (
    <main className="grid min-h-full place-items-center p-8">
      <h1 className="text-2xl font-semibold">TOPO — Nivelación por progresivas</h1>
    </main>
  )
}
```

- [ ] **Paso 4: Instalar dependencias**

Ejecuta: `npm install`
Esperado: instala sin errores y enlaza `@topo/core` desde el workspace.

- [ ] **Paso 5: Escribir la prueba que falla**

`packages/app/src/App.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import App from './App'

describe('App', () => {
  it('muestra el título de la herramienta', () => {
    render(<App />)
    expect(screen.getByText(/Nivelación por progresivas/i)).toBeInTheDocument()
  })
})
```

- [ ] **Paso 6: Ejecutar las pruebas**

Ejecuta: `npm test --workspace packages/app`
Esperado: 1 prueba en verde.

- [ ] **Paso 7: Verificar que la app arranca**

Ejecuta: `npm run dev`
Esperado: Vite sirve en `http://localhost:5173` y se ve el título. Ciérralo con Ctrl+C.

- [ ] **Paso 8: Commit**

```bash
git add -A
git commit -m "Andamiaje de la aplicación con React, Vite y Tailwind"
```

---

### Tarea 9: Estado del proyecto y cálculo derivado

**Archivos:**
- Crear: `packages/app/src/estado/almacen.ts`
- Crear: `packages/app/src/estado/ejemplo.ts`
- Crear: `packages/app/src/estado/derivados.ts`
- Test: `packages/app/src/estado/almacen.test.ts`

**Interfaces:**
- Consume: tipos y `calcularCampania` de `@topo/core`.
- Produce:
  - `useAlmacen` — store de Zustand con el estado y las acciones listadas abajo.
  - `proyectoEjemplo(): Proyecto` · `proyectoVacio(): Proyecto`.
  - `useResultado(): ResultadoCampania | null` — cálculo memoizado de la campaña activa.
  - `useContexto(): { campania, calle, plantilla, capa } | null`.
  - `nuevoId(prefijo: string): string`.

- [ ] **Paso 1: Escribir la prueba que falla**

`packages/app/src/estado/almacen.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { useAlmacen } from './almacen'
import { proyectoEjemplo } from './ejemplo'

describe('almacén', () => {
  beforeEach(() => {
    useAlmacen.getState().cargarProyecto(proyectoEjemplo())
  })

  it('arranca con el proyecto de ejemplo cargado', () => {
    const { proyecto } = useAlmacen.getState()
    expect(proyecto.calles).toHaveLength(1)
    expect(proyecto.bms[0]?.nombre).toBe('BM-1')
  })

  it('agrega un banco de nivel con id propio', () => {
    useAlmacen.getState().agregarBM({
      nombre: 'BM-2',
      cota: 3246.402,
      tipo: 'auxiliar',
      descripcion: '',
    })
    const { proyecto } = useAlmacen.getState()
    expect(proyecto.bms).toHaveLength(2)
    expect(proyecto.bms[1]?.id).toMatch(/^bm-/)
  })

  it('corregir la cota de un BM recalcula las cotas de la campaña', () => {
    const antes = useAlmacen.getState().calcular()!
    const bmId = useAlmacen.getState().proyecto.bms[0]!.id
    useAlmacen.getState().actualizarBM(bmId, { cota: 3245.28 })
    const despues = useAlmacen.getState().calcular()!

    expect(antes.cotasPorCelda.get('0|EJE')!.cota).toBeCloseTo(3244.6275, 6)
    expect(despues.cotasPorCelda.get('0|EJE')!.cota).toBeCloseTo(3244.7275, 6)
  })

  it('agrega una lectura intermedia a la estación indicada', () => {
    const campaniaId = useAlmacen.getState().campaniaActivaId!
    useAlmacen.getState().agregarIntermedia(campaniaId, 1, {
      destino: { tipo: 'celda', celda: { progresiva: 40, elementoClave: 'EJE' } },
      valor: 2.5,
    })
    const resultado = useAlmacen.getState().calcular()!
    expect(resultado.cotasPorCelda.has('40|EJE')).toBe(true)
  })

  it('cambiar una lectura recalcula sin tocar el resto', () => {
    const campaniaId = useAlmacen.getState().campaniaActivaId!
    const lecturaId = useAlmacen.getState().proyecto.campanias[0]!.estaciones[0]!.intermedias[0]!.id
    useAlmacen.getState().actualizarLectura(campaniaId, lecturaId, 1.88)
    const resultado = useAlmacen.getState().calcular()!
    expect(resultado.cotasPorCelda.get('0|EJE')!.cotaCruda).toBeCloseTo(3244.725, 6)
  })

  it('elimina una lectura', () => {
    const campaniaId = useAlmacen.getState().campaniaActivaId!
    const lecturaId = useAlmacen.getState().proyecto.campanias[0]!.estaciones[0]!.intermedias[0]!.id
    useAlmacen.getState().eliminarLectura(campaniaId, lecturaId)
    const resultado = useAlmacen.getState().calcular()!
    expect(resultado.cotasPorCelda.has('0|EJE')).toBe(false)
  })

  it('guarda la selección compartida entre vistas', () => {
    useAlmacen.getState().seleccionar('20|EJE')
    expect(useAlmacen.getState().seleccion.clave).toBe('20|EJE')
    expect(useAlmacen.getState().seleccion.progresiva).toBe(20)
  })

  it('un proyecto vacío no tiene campaña activa', () => {
    useAlmacen.getState().nuevoProyecto()
    expect(useAlmacen.getState().campaniaActivaId).toBeNull()
    expect(useAlmacen.getState().calcular()).toBeNull()
  })
})
```

- [ ] **Paso 2: Ejecutar la prueba y verificar que falla**

Ejecuta: `npm test --workspace packages/app`
Esperado: FALLA por no encontrar `./almacen`.

- [ ] **Paso 3: Escribir el proyecto de ejemplo**

`packages/app/src/estado/ejemplo.ts`:

```ts
import type { Proyecto } from '@topo/core'

export function nuevoId(prefijo: string): string {
  return `${prefijo}-${Math.random().toString(36).slice(2, 10)}`
}

const AHORA = () => new Date().toISOString()

export function proyectoVacio(): Proyecto {
  return {
    version: 1,
    meta: {
      nombre: 'Proyecto nuevo',
      obra: '',
      cliente: '',
      ubicacion: '',
      responsable: '',
      creado: AHORA(),
      modificado: AHORA(),
    },
    bms: [],
    plantillas: [],
    calles: [],
    capas: [
      { id: 'cap-terreno', nombre: 'TERRENO EXISTENTE', orden: 0 },
      { id: 'cap-subrasante', nombre: 'SUBRASANTE', orden: 1 },
    ],
    campanias: [],
  }
}

/** Proyecto de demostración con la libreta verificada a mano del plan. */
export function proyectoEjemplo(): Proyecto {
  return {
    version: 1,
    meta: {
      nombre: 'Av. Sol — ejemplo',
      obra: 'Pavimentación Av. Sol',
      cliente: 'Municipalidad',
      ubicacion: 'Perú',
      responsable: 'Max',
      creado: AHORA(),
      modificado: AHORA(),
    },
    bms: [
      {
        id: 'bm-1',
        nombre: 'BM-1',
        cota: 3245.18,
        tipo: 'oficial',
        descripcion: 'clavo en vereda esq. Av. Sol / Jr. Lima',
      },
    ],
    plantillas: [
      {
        id: 'pl-1',
        nombre: 'Calle con vereda',
        elementos: [
          { clave: 'VER-I', etiqueta: 'Vereda izquierda', offset: -5.6, tipo: 'vereda' },
          { clave: 'SAR-I', etiqueta: 'Sardinel izquierdo', offset: -4.4, tipo: 'sardinel' },
          { clave: 'BOR-I', etiqueta: 'Borde izquierdo', offset: -4.2, tipo: 'calzada' },
          { clave: 'EJE', etiqueta: 'Eje', offset: 0, tipo: 'eje' },
          { clave: 'BOR-D', etiqueta: 'Borde derecho', offset: 4.2, tipo: 'calzada' },
          { clave: 'SAR-D', etiqueta: 'Sardinel derecho', offset: 4.4, tipo: 'sardinel' },
          { clave: 'VER-D', etiqueta: 'Vereda derecha', offset: 5.6, tipo: 'vereda' },
        ],
      },
    ],
    calles: [
      {
        id: 'c-1',
        nombre: 'Av. Sol',
        plantillaId: 'pl-1',
        progresivaInicio: 0,
        progresivaFin: 180,
        intervalo: 20,
        progresivasExtra: [],
      },
    ],
    capas: [
      { id: 'cap-terreno', nombre: 'TERRENO EXISTENTE', orden: 0 },
      { id: 'cap-subrasante', nombre: 'SUBRASANTE', orden: 1 },
    ],
    campanias: [
      {
        id: 'camp-1',
        fecha: '2026-08-19',
        calleId: 'c-1',
        capaId: 'cap-subrasante',
        bmInicialId: 'bm-1',
        estado: 'abierta',
        cierre: {
          tipo: 'cerrado',
          bmFinalId: 'bm-1',
          longitudK: 0.36,
          longitudKAuto: true,
          clase: 'tercerOrden',
          coeficiente: 12,
        },
        estaciones: [
          {
            id: 'e-1',
            vistaAtras: { id: 'l-1', destino: { tipo: 'bm', bmId: 'bm-1' }, valor: 1.425 },
            intermedias: [
              {
                id: 'l-2',
                destino: { tipo: 'celda', celda: { progresiva: 0, elementoClave: 'EJE' } },
                valor: 1.98,
              },
              {
                id: 'l-3',
                destino: { tipo: 'celda', celda: { progresiva: 0, elementoClave: 'BOR-I' } },
                valor: 2.045,
              },
            ],
            vistaAdelante: { id: 'l-4', destino: { tipo: 'cambio', nombre: 'PC-1' }, valor: 1.15 },
          },
          {
            id: 'e-2',
            vistaAtras: { id: 'l-5', destino: { tipo: 'cambio', nombre: 'PC-1' }, valor: 1.63 },
            intermedias: [
              {
                id: 'l-6',
                destino: { tipo: 'celda', celda: { progresiva: 20, elementoClave: 'EJE' } },
                valor: 2.47,
              },
            ],
            vistaAdelante: { id: 'l-7', destino: { tipo: 'bm', bmId: 'bm-1' }, valor: 1.91 },
          },
        ],
      },
    ],
  }
}
```

- [ ] **Paso 4: Escribir el almacén**

`packages/app/src/estado/almacen.ts`:

```ts
import {
  calcularCampania,
  type BM,
  type Calle,
  type Campania,
  type Capa,
  type DestinoLectura,
  type Id,
  type Plantilla,
  type Proyecto,
  type ResultadoCampania,
} from '@topo/core'
import { create } from 'zustand'
import { nuevoId, proyectoEjemplo, proyectoVacio } from './ejemplo'

export type Vista = 'inicio' | 'proyecto' | 'plantilla' | 'calle' | 'libreta' | 'resultados'

export interface Seleccion {
  clave: string | null
  progresiva: number | null
}

interface EstadoApp {
  proyecto: Proyecto
  vista: Vista
  campaniaActivaId: Id | null
  plantillaEnEdicionId: Id | null
  seleccion: Seleccion

  cargarProyecto(proyecto: Proyecto): void
  nuevoProyecto(): void
  irA(vista: Vista): void

  actualizarMeta(cambios: Partial<Proyecto['meta']>): void

  agregarBM(datos: Omit<BM, 'id'>): void
  actualizarBM(id: Id, cambios: Partial<Omit<BM, 'id'>>): void
  eliminarBM(id: Id): void

  agregarCapa(nombre: string): void
  eliminarCapa(id: Id): void

  agregarPlantilla(nombre: string): Id
  actualizarPlantilla(id: Id, cambios: Partial<Omit<Plantilla, 'id'>>): void
  eliminarPlantilla(id: Id): void
  editarPlantilla(id: Id | null): void

  agregarCalle(datos: Omit<Calle, 'id'>): Id
  actualizarCalle(id: Id, cambios: Partial<Omit<Calle, 'id'>>): void
  eliminarCalle(id: Id): void

  agregarCampania(datos: Omit<Campania, 'id' | 'estaciones'>): Id
  actualizarCampania(id: Id, cambios: Partial<Omit<Campania, 'id'>>): void
  activarCampania(id: Id | null): void
  agregarEstacion(campaniaId: Id, vistaAtras: { destino: DestinoLectura; valor: number }): void
  agregarIntermedia(
    campaniaId: Id,
    estacionIndice: number,
    lectura: { destino: DestinoLectura; valor: number },
  ): void
  actualizarLectura(campaniaId: Id, lecturaId: Id, valor: number): void
  eliminarLectura(campaniaId: Id, lecturaId: Id): void

  seleccionar(clave: string | null): void
  irAProgresiva(progresiva: number | null): void

  calcular(): ResultadoCampania | null
}

function marcarModificado(proyecto: Proyecto): Proyecto {
  return { ...proyecto, meta: { ...proyecto.meta, modificado: new Date().toISOString() } }
}

export const useAlmacen = create<EstadoApp>((set, get) => ({
  proyecto: proyectoEjemplo(),
  vista: 'inicio',
  campaniaActivaId: 'camp-1',
  plantillaEnEdicionId: null,
  seleccion: { clave: null, progresiva: null },

  cargarProyecto: (proyecto) =>
    set({
      proyecto,
      campaniaActivaId: proyecto.campanias[0]?.id ?? null,
      seleccion: { clave: null, progresiva: null },
    }),

  nuevoProyecto: () =>
    set({
      proyecto: proyectoVacio(),
      campaniaActivaId: null,
      vista: 'proyecto',
      seleccion: { clave: null, progresiva: null },
    }),

  irA: (vista) => set({ vista }),

  actualizarMeta: (cambios) =>
    set((s) => ({ proyecto: marcarModificado({ ...s.proyecto, meta: { ...s.proyecto.meta, ...cambios } }) })),

  agregarBM: (datos) =>
    set((s) => ({
      proyecto: marcarModificado({
        ...s.proyecto,
        bms: [...s.proyecto.bms, { ...datos, id: nuevoId('bm') }],
      }),
    })),

  actualizarBM: (id, cambios) =>
    set((s) => ({
      proyecto: marcarModificado({
        ...s.proyecto,
        bms: s.proyecto.bms.map((bm) => (bm.id === id ? { ...bm, ...cambios } : bm)),
      }),
    })),

  eliminarBM: (id) =>
    set((s) => ({
      proyecto: marcarModificado({
        ...s.proyecto,
        bms: s.proyecto.bms.filter((bm) => bm.id !== id),
      }),
    })),

  agregarCapa: (nombre) =>
    set((s) => ({
      proyecto: marcarModificado({
        ...s.proyecto,
        capas: [
          ...s.proyecto.capas,
          { id: nuevoId('cap'), nombre, orden: s.proyecto.capas.length } as Capa,
        ],
      }),
    })),

  eliminarCapa: (id) =>
    set((s) => ({
      proyecto: marcarModificado({
        ...s.proyecto,
        capas: s.proyecto.capas.filter((capa) => capa.id !== id),
      }),
    })),

  agregarPlantilla: (nombre) => {
    const id = nuevoId('pl')
    set((s) => ({
      proyecto: marcarModificado({
        ...s.proyecto,
        plantillas: [...s.proyecto.plantillas, { id, nombre, elementos: [] }],
      }),
      plantillaEnEdicionId: id,
    }))
    return id
  },

  actualizarPlantilla: (id, cambios) =>
    set((s) => ({
      proyecto: marcarModificado({
        ...s.proyecto,
        plantillas: s.proyecto.plantillas.map((p) => (p.id === id ? { ...p, ...cambios } : p)),
      }),
    })),

  eliminarPlantilla: (id) =>
    set((s) => ({
      proyecto: marcarModificado({
        ...s.proyecto,
        plantillas: s.proyecto.plantillas.filter((p) => p.id !== id),
      }),
    })),

  editarPlantilla: (id) => set({ plantillaEnEdicionId: id }),

  agregarCalle: (datos) => {
    const id = nuevoId('c')
    set((s) => ({
      proyecto: marcarModificado({ ...s.proyecto, calles: [...s.proyecto.calles, { ...datos, id }] }),
    }))
    return id
  },

  actualizarCalle: (id, cambios) =>
    set((s) => ({
      proyecto: marcarModificado({
        ...s.proyecto,
        calles: s.proyecto.calles.map((c) => (c.id === id ? { ...c, ...cambios } : c)),
      }),
    })),

  eliminarCalle: (id) =>
    set((s) => ({
      proyecto: marcarModificado({
        ...s.proyecto,
        calles: s.proyecto.calles.filter((c) => c.id !== id),
      }),
    })),

  agregarCampania: (datos) => {
    const id = nuevoId('camp')
    set((s) => ({
      proyecto: marcarModificado({
        ...s.proyecto,
        campanias: [...s.proyecto.campanias, { ...datos, id, estaciones: [] }],
      }),
      campaniaActivaId: id,
    }))
    return id
  },

  actualizarCampania: (id, cambios) =>
    set((s) => ({
      proyecto: marcarModificado({
        ...s.proyecto,
        campanias: s.proyecto.campanias.map((c) => (c.id === id ? { ...c, ...cambios } : c)),
      }),
    })),

  activarCampania: (id) => set({ campaniaActivaId: id }),

  agregarEstacion: (campaniaId, vistaAtras) =>
    set((s) => ({
      proyecto: marcarModificado({
        ...s.proyecto,
        campanias: s.proyecto.campanias.map((c) =>
          c.id === campaniaId
            ? {
                ...c,
                estaciones: [
                  ...c.estaciones,
                  {
                    id: nuevoId('e'),
                    vistaAtras: { id: nuevoId('l'), ...vistaAtras },
                    intermedias: [],
                  },
                ],
              }
            : c,
        ),
      }),
    })),

  agregarIntermedia: (campaniaId, estacionIndice, lectura) =>
    set((s) => ({
      proyecto: marcarModificado({
        ...s.proyecto,
        campanias: s.proyecto.campanias.map((c) =>
          c.id === campaniaId
            ? {
                ...c,
                estaciones: c.estaciones.map((e, i) =>
                  i === estacionIndice
                    ? { ...e, intermedias: [...e.intermedias, { id: nuevoId('l'), ...lectura }] }
                    : e,
                ),
              }
            : c,
        ),
      }),
    })),

  actualizarLectura: (campaniaId, lecturaId, valor) =>
    set((s) => ({
      proyecto: marcarModificado({
        ...s.proyecto,
        campanias: s.proyecto.campanias.map((c) =>
          c.id === campaniaId
            ? {
                ...c,
                estaciones: c.estaciones.map((e) => ({
                  ...e,
                  vistaAtras:
                    e.vistaAtras.id === lecturaId ? { ...e.vistaAtras, valor } : e.vistaAtras,
                  intermedias: e.intermedias.map((l) => (l.id === lecturaId ? { ...l, valor } : l)),
                  vistaAdelante:
                    e.vistaAdelante && e.vistaAdelante.id === lecturaId
                      ? { ...e.vistaAdelante, valor }
                      : e.vistaAdelante,
                })),
              }
            : c,
        ),
      }),
    })),

  eliminarLectura: (campaniaId, lecturaId) =>
    set((s) => ({
      proyecto: marcarModificado({
        ...s.proyecto,
        campanias: s.proyecto.campanias.map((c) =>
          c.id === campaniaId
            ? {
                ...c,
                estaciones: c.estaciones.map((e) => ({
                  ...e,
                  intermedias: e.intermedias.filter((l) => l.id !== lecturaId),
                })),
              }
            : c,
        ),
      }),
    })),

  seleccionar: (clave) =>
    set(() => {
      if (!clave) return { seleccion: { clave: null, progresiva: null } }
      const progresiva = Number(clave.split('|')[0])
      return {
        seleccion: { clave, progresiva: Number.isFinite(progresiva) ? progresiva : null },
      }
    }),

  irAProgresiva: (progresiva) => set((s) => ({ seleccion: { ...s.seleccion, progresiva } })),

  calcular: () => {
    const { proyecto, campaniaActivaId } = get()
    const campania = proyecto.campanias.find((c) => c.id === campaniaActivaId)
    if (!campania) return null

    const calle = proyecto.calles.find((c) => c.id === campania.calleId)
    if (!calle) return null

    const plantilla = proyecto.plantillas.find((p) => p.id === calle.plantillaId)
    if (!plantilla) return null

    return calcularCampania({ campania, calle, plantilla, bms: proyecto.bms })
  },
}))
```

- [ ] **Paso 5: Escribir los derivados memoizados**

`packages/app/src/estado/derivados.ts`:

```ts
import { calcularCampania, type Calle, type Campania, type Capa, type Plantilla, type ResultadoCampania } from '@topo/core'
import { useMemo } from 'react'
import { useAlmacen } from './almacen'

export interface ContextoCampania {
  campania: Campania
  calle: Calle
  plantilla: Plantilla
  capa: Capa | undefined
}

export function useContexto(): ContextoCampania | null {
  const proyecto = useAlmacen((s) => s.proyecto)
  const campaniaActivaId = useAlmacen((s) => s.campaniaActivaId)

  return useMemo(() => {
    const campania = proyecto.campanias.find((c) => c.id === campaniaActivaId)
    if (!campania) return null
    const calle = proyecto.calles.find((c) => c.id === campania.calleId)
    if (!calle) return null
    const plantilla = proyecto.plantillas.find((p) => p.id === calle.plantillaId)
    if (!plantilla) return null
    return { campania, calle, plantilla, capa: proyecto.capas.find((c) => c.id === campania.capaId) }
  }, [proyecto, campaniaActivaId])
}

/** Recalcula solo cuando cambian el proyecto o la campaña activa. */
export function useResultado(): ResultadoCampania | null {
  const bms = useAlmacen((s) => s.proyecto.bms)
  const contexto = useContexto()

  return useMemo(() => {
    if (!contexto) return null
    return calcularCampania({
      campania: contexto.campania,
      calle: contexto.calle,
      plantilla: contexto.plantilla,
      bms,
    })
  }, [contexto, bms])
}
```

- [ ] **Paso 6: Ejecutar las pruebas y verificar que pasan**

Ejecuta: `npm test --workspace packages/app`
Esperado: todas en verde.

- [ ] **Paso 7: Commit**

```bash
git add -A
git commit -m "Estado del proyecto con Zustand y cálculo derivado memoizado"
```

---

### Tarea 10: Pantalla de proyecto — datos de obra, bancos de nivel y capas

**Archivos:**
- Crear: `packages/app/src/componentes/CampoTexto.tsx`
- Crear: `packages/app/src/componentes/CampoNumero.tsx`
- Crear: `packages/app/src/componentes/BarraSuperior.tsx`
- Crear: `packages/app/src/vistas/VistaProyecto.tsx`
- Modificar: `packages/app/src/App.tsx`
- Test: `packages/app/src/vistas/VistaProyecto.test.tsx`

**Interfaces:**
- Consume: `useAlmacen` de la Tarea 9.
- Produce:
  - `CampoTexto({ etiqueta, valor, alCambiar, ancho? })`.
  - `CampoNumero({ etiqueta, valor, alCambiar, decimales?, sufijo?, ancho? })` — acepta coma o punto decimal, no pierde el foco al escribir.
  - `BarraSuperior()` — navegación entre vistas.
  - `VistaProyecto()`.

- [ ] **Paso 1: Escribir la prueba que falla**

`packages/app/src/vistas/VistaProyecto.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { useAlmacen } from '../estado/almacen'
import { proyectoEjemplo } from '../estado/ejemplo'
import VistaProyecto from './VistaProyecto'

describe('VistaProyecto', () => {
  beforeEach(() => {
    useAlmacen.getState().cargarProyecto(proyectoEjemplo())
  })

  it('lista los bancos de nivel del proyecto', () => {
    render(<VistaProyecto />)
    expect(screen.getByDisplayValue('BM-1')).toBeInTheDocument()
    expect(screen.getByDisplayValue('3245.180')).toBeInTheDocument()
  })

  it('agrega un banco de nivel', async () => {
    const usuario = userEvent.setup()
    render(<VistaProyecto />)
    await usuario.click(screen.getByRole('button', { name: /agregar banco de nivel/i }))
    expect(useAlmacen.getState().proyecto.bms).toHaveLength(2)
  })

  it('corrige la cota de un banco de nivel', async () => {
    const usuario = userEvent.setup()
    render(<VistaProyecto />)
    const campo = screen.getByDisplayValue('3245.180')
    await usuario.clear(campo)
    await usuario.type(campo, '3245.280')
    expect(useAlmacen.getState().proyecto.bms[0]!.cota).toBeCloseTo(3245.28, 6)
  })

  it('acepta la coma como separador decimal', async () => {
    const usuario = userEvent.setup()
    render(<VistaProyecto />)
    const campo = screen.getByDisplayValue('3245.180')
    await usuario.clear(campo)
    await usuario.type(campo, '3245,5')
    expect(useAlmacen.getState().proyecto.bms[0]!.cota).toBeCloseTo(3245.5, 6)
  })

  it('lista las capas del proyecto', () => {
    render(<VistaProyecto />)
    expect(screen.getByText('SUBRASANTE')).toBeInTheDocument()
  })
})
```

- [ ] **Paso 2: Ejecutar la prueba y verificar que falla**

Ejecuta: `npm test --workspace packages/app`
Esperado: FALLA por no encontrar `./VistaProyecto`.

- [ ] **Paso 3: Escribir los campos reutilizables**

`packages/app/src/componentes/CampoTexto.tsx`:

```tsx
interface Props {
  etiqueta: string
  valor: string
  alCambiar: (valor: string) => void
  marcador?: string
  ancho?: string
}

export default function CampoTexto({ etiqueta, valor, alCambiar, marcador, ancho }: Props) {
  return (
    <label className={`flex flex-col gap-1 ${ancho ?? ''}`}>
      <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{etiqueta}</span>
      <input
        type="text"
        value={valor}
        placeholder={marcador}
        onChange={(evento) => alCambiar(evento.target.value)}
        className="rounded border border-slate-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-marca focus:ring-1 focus:ring-marca dark:border-slate-700 dark:bg-slate-900"
      />
    </label>
  )
}
```

`packages/app/src/componentes/CampoNumero.tsx`:

```tsx
import { useEffect, useState } from 'react'

interface Props {
  etiqueta?: string
  valor: number
  alCambiar: (valor: number) => void
  decimales?: number
  sufijo?: string
  ancho?: string
  alPresionarEnter?: () => void
}

/**
 * Campo numérico que mantiene el texto que el usuario está escribiendo.
 * Sin esto, escribir "3245," reformatearía el valor y movería el cursor.
 */
export default function CampoNumero({
  etiqueta,
  valor,
  alCambiar,
  decimales = 3,
  sufijo,
  ancho,
  alPresionarEnter,
}: Props) {
  const [texto, setTexto] = useState(valor.toFixed(decimales))
  const [editando, setEditando] = useState(false)

  useEffect(() => {
    if (!editando) setTexto(valor.toFixed(decimales))
  }, [valor, decimales, editando])

  function manejarCambio(entrada: string) {
    setTexto(entrada)
    const numero = Number(entrada.replace(',', '.'))
    if (entrada.trim() !== '' && Number.isFinite(numero)) alCambiar(numero)
  }

  return (
    <label className={`flex flex-col gap-1 ${ancho ?? ''}`}>
      {etiqueta && (
        <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{etiqueta}</span>
      )}
      <div className="flex items-center gap-1">
        <input
          type="text"
          inputMode="decimal"
          value={texto}
          onFocus={() => setEditando(true)}
          onBlur={() => {
            setEditando(false)
            setTexto(valor.toFixed(decimales))
          }}
          onChange={(evento) => manejarCambio(evento.target.value)}
          onKeyDown={(evento) => {
            if (evento.key === 'Enter') alPresionarEnter?.()
          }}
          className="numerico w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-right text-sm outline-none focus:border-marca focus:ring-1 focus:ring-marca dark:border-slate-700 dark:bg-slate-900"
        />
        {sufijo && <span className="text-xs text-slate-500">{sufijo}</span>}
      </div>
    </label>
  )
}
```

- [ ] **Paso 4: Escribir la barra superior**

`packages/app/src/componentes/BarraSuperior.tsx`:

```tsx
import { useAlmacen, type Vista } from '../estado/almacen'

const PESTANAS: { vista: Vista; texto: string }[] = [
  { vista: 'proyecto', texto: 'Proyecto' },
  { vista: 'calle', texto: 'Calle' },
  { vista: 'libreta', texto: 'Libreta' },
  { vista: 'resultados', texto: 'Resultados' },
]

export default function BarraSuperior() {
  const vista = useAlmacen((s) => s.vista)
  const irA = useAlmacen((s) => s.irA)
  const nombre = useAlmacen((s) => s.proyecto.meta.nombre)

  return (
    <header className="flex items-center gap-6 border-b border-slate-200 px-4 py-2 dark:border-slate-800">
      <span className="text-sm font-semibold">{nombre}</span>
      <nav className="flex gap-1">
        {PESTANAS.map((pestana) => (
          <button
            key={pestana.vista}
            type="button"
            onClick={() => irA(pestana.vista)}
            className={`rounded px-3 py-1.5 text-sm ${
              vista === pestana.vista
                ? 'bg-marca font-medium text-white'
                : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
            }`}
          >
            {pestana.texto}
          </button>
        ))}
      </nav>
    </header>
  )
}
```

- [ ] **Paso 5: Escribir la vista de proyecto**

`packages/app/src/vistas/VistaProyecto.tsx`:

```tsx
import CampoNumero from '../componentes/CampoNumero'
import CampoTexto from '../componentes/CampoTexto'
import { useAlmacen } from '../estado/almacen'

export default function VistaProyecto() {
  const meta = useAlmacen((s) => s.proyecto.meta)
  const bms = useAlmacen((s) => s.proyecto.bms)
  const capas = useAlmacen((s) => s.proyecto.capas)
  const actualizarMeta = useAlmacen((s) => s.actualizarMeta)
  const agregarBM = useAlmacen((s) => s.agregarBM)
  const actualizarBM = useAlmacen((s) => s.actualizarBM)
  const eliminarBM = useAlmacen((s) => s.eliminarBM)
  const agregarCapa = useAlmacen((s) => s.agregarCapa)
  const eliminarCapa = useAlmacen((s) => s.eliminarCapa)

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-8 p-6">
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Datos de la obra</h2>
        <div className="grid grid-cols-2 gap-3">
          <CampoTexto etiqueta="Nombre del proyecto" valor={meta.nombre} alCambiar={(v) => actualizarMeta({ nombre: v })} />
          <CampoTexto etiqueta="Obra" valor={meta.obra} alCambiar={(v) => actualizarMeta({ obra: v })} />
          <CampoTexto etiqueta="Cliente" valor={meta.cliente} alCambiar={(v) => actualizarMeta({ cliente: v })} />
          <CampoTexto etiqueta="Ubicación" valor={meta.ubicacion} alCambiar={(v) => actualizarMeta({ ubicacion: v })} />
          <CampoTexto etiqueta="Responsable" valor={meta.responsable} alCambiar={(v) => actualizarMeta({ responsable: v })} />
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Bancos de nivel</h2>
          <button
            type="button"
            onClick={() =>
              agregarBM({
                nombre: `BM-${bms.length + 1}`,
                cota: 0,
                tipo: 'auxiliar',
                descripcion: '',
              })
            }
            className="rounded bg-marca px-3 py-1.5 text-sm font-medium text-white"
          >
            Agregar banco de nivel
          </button>
        </div>

        {bms.length === 0 && (
          <p className="text-sm text-slate-500">
            Todavía no hay bancos de nivel. Agrega al menos uno para poder nivelar.
          </p>
        )}

        <div className="flex flex-col gap-2">
          {bms.map((bm) => (
            <div key={bm.id} className="grid grid-cols-[8rem_9rem_8rem_1fr_auto] items-end gap-2">
              <CampoTexto etiqueta="Nombre" valor={bm.nombre} alCambiar={(v) => actualizarBM(bm.id, { nombre: v })} />
              <CampoNumero etiqueta="Cota" valor={bm.cota} alCambiar={(v) => actualizarBM(bm.id, { cota: v })} sufijo="m" />
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Tipo</span>
                <select
                  value={bm.tipo}
                  onChange={(evento) => actualizarBM(bm.id, { tipo: evento.target.value as 'oficial' | 'auxiliar' })}
                  className="rounded border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"
                >
                  <option value="oficial">Oficial</option>
                  <option value="auxiliar">Auxiliar</option>
                </select>
              </label>
              <CampoTexto
                etiqueta="Descripción"
                valor={bm.descripcion}
                alCambiar={(v) => actualizarBM(bm.id, { descripcion: v })}
                marcador="dónde está el clavo"
              />
              <button
                type="button"
                onClick={() => eliminarBM(bm.id)}
                aria-label={`Eliminar ${bm.nombre}`}
                className="rounded px-2 py-1.5 text-sm text-falla hover:bg-red-50 dark:hover:bg-red-950"
              >
                Eliminar
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Capas</h2>
          <button
            type="button"
            onClick={() => agregarCapa('CAPA NUEVA')}
            className="rounded bg-marca px-3 py-1.5 text-sm font-medium text-white"
          >
            Agregar capa
          </button>
        </div>
        <ul className="flex flex-wrap gap-2">
          {capas.map((capa) => (
            <li key={capa.id} className="flex items-center gap-2 rounded border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-700">
              <span>{capa.nombre}</span>
              <button
                type="button"
                onClick={() => eliminarCapa(capa.id)}
                aria-label={`Eliminar capa ${capa.nombre}`}
                className="text-slate-400 hover:text-falla"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
```

- [ ] **Paso 6: Conectar en `App.tsx`**

```tsx
import BarraSuperior from './componentes/BarraSuperior'
import { useAlmacen } from './estado/almacen'
import VistaProyecto from './vistas/VistaProyecto'

export default function App() {
  const vista = useAlmacen((s) => s.vista)

  return (
    <div className="flex h-full flex-col">
      <BarraSuperior />
      <div className="flex-1 overflow-auto">
        {vista === 'proyecto' ? (
          <VistaProyecto />
        ) : (
          <p className="p-6 text-sm text-slate-500">
            Pantalla en construcción. Abre «Proyecto» mientras tanto.
          </p>
        )}
      </div>
    </div>
  )
}
```

Actualiza `App.test.tsx` para que verifique la barra en lugar del título antiguo:

```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import App from './App'

describe('App', () => {
  it('muestra la navegación principal', () => {
    render(<App />)
    expect(screen.getByRole('button', { name: 'Libreta' })).toBeInTheDocument()
  })
})
```

- [ ] **Paso 7: Ejecutar las pruebas y verificar que pasan**

Ejecuta: `npm test --workspace packages/app`
Esperado: todas en verde.

- [ ] **Paso 8: Commit**

```bash
git add -A
git commit -m "Pantalla de proyecto con datos de obra, bancos de nivel y capas"
```

---

### Tarea 11: Editor de plantilla transversal

**Archivos:**
- Crear: `packages/app/src/componentes/EditorPlantilla.tsx`
- Crear: `packages/app/src/vistas/VistaPlantilla.tsx`
- Modificar: `packages/app/src/App.tsx`
- Test: `packages/app/src/componentes/EditorPlantilla.test.tsx`

**Interfaces:**
- Consume: `useAlmacen`, `CampoTexto`, `CampoNumero`.
- Produce: `EditorPlantilla({ plantillaId })` · `VistaPlantilla()`.

- [ ] **Paso 1: Escribir la prueba que falla**

`packages/app/src/componentes/EditorPlantilla.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { useAlmacen } from '../estado/almacen'
import { proyectoEjemplo } from '../estado/ejemplo'
import EditorPlantilla from './EditorPlantilla'

describe('EditorPlantilla', () => {
  beforeEach(() => {
    useAlmacen.getState().cargarProyecto(proyectoEjemplo())
  })

  it('muestra los elementos ordenados por offset, de izquierda a derecha', () => {
    render(<EditorPlantilla plantillaId="pl-1" />)
    const claves = screen.getAllByLabelText('Clave').map((campo) => (campo as HTMLInputElement).value)
    expect(claves).toEqual(['VER-I', 'SAR-I', 'BOR-I', 'EJE', 'BOR-D', 'SAR-D', 'VER-D'])
  })

  it('agrega un elemento', async () => {
    const usuario = userEvent.setup()
    render(<EditorPlantilla plantillaId="pl-1" />)
    await usuario.click(screen.getByRole('button', { name: /agregar elemento/i }))
    const plantilla = useAlmacen.getState().proyecto.plantillas[0]!
    expect(plantilla.elementos).toHaveLength(8)
  })

  it('quita un elemento', async () => {
    const usuario = userEvent.setup()
    render(<EditorPlantilla plantillaId="pl-1" />)
    await usuario.click(screen.getByLabelText('Quitar VER-I'))
    const plantilla = useAlmacen.getState().proyecto.plantillas[0]!
    expect(plantilla.elementos.map((e) => e.clave)).not.toContain('VER-I')
  })

  it('avisa si dos elementos tienen la misma clave', async () => {
    const usuario = userEvent.setup()
    render(<EditorPlantilla plantillaId="pl-1" />)
    const campoClave = screen.getAllByLabelText('Clave')[0]!
    await usuario.clear(campoClave)
    await usuario.type(campoClave, 'EJE')
    expect(screen.getByText(/La clave EJE está repetida/i)).toBeInTheDocument()
  })
})
```

- [ ] **Paso 2: Ejecutar la prueba y verificar que falla**

Ejecuta: `npm test --workspace packages/app`
Esperado: FALLA por no encontrar `./EditorPlantilla`.

- [ ] **Paso 3: Escribir el editor**

`packages/app/src/componentes/EditorPlantilla.tsx`:

```tsx
import type { ElementoPlantilla, TipoElemento } from '@topo/core'
import { useAlmacen } from '../estado/almacen'
import CampoNumero from './CampoNumero'

const TIPOS: { valor: TipoElemento; texto: string }[] = [
  { valor: 'eje', texto: 'Eje' },
  { valor: 'calzada', texto: 'Calzada' },
  { valor: 'sardinel', texto: 'Sardinel' },
  { valor: 'vereda', texto: 'Vereda' },
  { valor: 'peloAgua', texto: 'Pelo de agua' },
  { valor: 'existente', texto: 'Punto existente' },
  { valor: 'otro', texto: 'Otro' },
]

interface Props {
  plantillaId: string
}

export default function EditorPlantilla({ plantillaId }: Props) {
  const plantilla = useAlmacen((s) => s.proyecto.plantillas.find((p) => p.id === plantillaId))
  const actualizarPlantilla = useAlmacen((s) => s.actualizarPlantilla)

  if (!plantilla) return <p className="p-6 text-sm text-slate-500">Esa plantilla ya no existe.</p>

  const ordenados = [...plantilla.elementos].sort((a, b) => a.offset - b.offset)
  const repetidas = ordenados
    .map((e) => e.clave)
    .filter((clave, i, todas) => clave !== '' && todas.indexOf(clave) !== i)

  function cambiar(clave: string, cambios: Partial<ElementoPlantilla>) {
    actualizarPlantilla(plantillaId, {
      elementos: plantilla!.elementos.map((e) => (e.clave === clave ? { ...e, ...cambios } : e)),
    })
  }

  function agregar() {
    const maximo = Math.max(0, ...plantilla!.elementos.map((e) => e.offset))
    actualizarPlantilla(plantillaId, {
      elementos: [
        ...plantilla!.elementos,
        {
          clave: `E-${plantilla!.elementos.length + 1}`,
          etiqueta: 'Elemento nuevo',
          offset: maximo + 1,
          tipo: 'otro',
        },
      ],
    })
  }

  function quitar(clave: string) {
    actualizarPlantilla(plantillaId, {
      elementos: plantilla!.elementos.filter((e) => e.clave !== clave),
    })
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">{plantilla.nombre}</h3>
        <button type="button" onClick={agregar} className="rounded bg-marca px-3 py-1.5 text-sm font-medium text-white">
          Agregar elemento
        </button>
      </div>

      <p className="text-xs text-slate-500">
        La distancia se mide desde el eje. Negativa hacia la izquierda, positiva hacia la derecha.
      </p>

      {repetidas.length > 0 && (
        <p className="rounded border border-falla px-3 py-2 text-sm text-falla">
          La clave {repetidas[0]} está repetida. Cada elemento necesita una clave distinta.
        </p>
      )}

      <div className="flex flex-col gap-2">
        {ordenados.map((elemento) => (
          <div key={elemento.clave} className="grid grid-cols-[7rem_1fr_7rem_9rem_auto] items-end gap-2">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-slate-500">Clave</span>
              <input
                aria-label="Clave"
                value={elemento.clave}
                onChange={(evento) => cambiar(elemento.clave, { clave: evento.target.value.toUpperCase() })}
                className="rounded border border-slate-300 px-2 py-1.5 text-sm uppercase dark:border-slate-700 dark:bg-slate-900"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-slate-500">Etiqueta</span>
              <input
                aria-label={`Etiqueta de ${elemento.clave}`}
                value={elemento.etiqueta}
                onChange={(evento) => cambiar(elemento.clave, { etiqueta: evento.target.value })}
                className="rounded border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"
              />
            </label>
            <CampoNumero
              etiqueta="Distancia"
              valor={elemento.offset}
              alCambiar={(v) => cambiar(elemento.clave, { offset: v })}
              decimales={2}
              sufijo="m"
            />
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-slate-500">Tipo</span>
              <select
                aria-label={`Tipo de ${elemento.clave}`}
                value={elemento.tipo}
                onChange={(evento) => cambiar(elemento.clave, { tipo: evento.target.value as TipoElemento })}
                className="rounded border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"
              >
                {TIPOS.map((tipo) => (
                  <option key={tipo.valor} value={tipo.valor}>
                    {tipo.texto}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              aria-label={`Quitar ${elemento.clave}`}
              onClick={() => quitar(elemento.clave)}
              className="rounded px-2 py-1.5 text-sm text-falla hover:bg-red-50 dark:hover:bg-red-950"
            >
              Quitar
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Paso 4: Escribir la vista contenedora**

`packages/app/src/vistas/VistaPlantilla.tsx`:

```tsx
import EditorPlantilla from '../componentes/EditorPlantilla'
import { useAlmacen } from '../estado/almacen'

export default function VistaPlantilla() {
  const plantillas = useAlmacen((s) => s.proyecto.plantillas)
  const enEdicionId = useAlmacen((s) => s.plantillaEnEdicionId)
  const editarPlantilla = useAlmacen((s) => s.editarPlantilla)
  const agregarPlantilla = useAlmacen((s) => s.agregarPlantilla)

  const activaId = enEdicionId ?? plantillas[0]?.id ?? null

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 p-6">
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-semibold">Plantillas transversales</h2>
        <button
          type="button"
          onClick={() => agregarPlantilla('Plantilla nueva')}
          className="ml-auto rounded bg-marca px-3 py-1.5 text-sm font-medium text-white"
        >
          Nueva plantilla
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {plantillas.map((plantilla) => (
          <button
            key={plantilla.id}
            type="button"
            onClick={() => editarPlantilla(plantilla.id)}
            className={`rounded px-3 py-1.5 text-sm ${
              plantilla.id === activaId
                ? 'bg-marca text-white'
                : 'border border-slate-300 dark:border-slate-700'
            }`}
          >
            {plantilla.nombre}
          </button>
        ))}
      </div>

      {activaId ? (
        <EditorPlantilla plantillaId={activaId} />
      ) : (
        <p className="text-sm text-slate-500">Crea una plantilla para definir la sección de la calle.</p>
      )}
    </div>
  )
}
```

- [ ] **Paso 5: Conectar en `App.tsx`**

Añade `plantilla` al enrutado y una pestaña en `BarraSuperior` (`{ vista: 'plantilla', texto: 'Plantilla' }`, entre Proyecto y Calle):

```tsx
{vista === 'plantilla' && <VistaPlantilla />}
```

- [ ] **Paso 6: Ejecutar las pruebas y verificar que pasan**

Ejecuta: `npm test --workspace packages/app`
Esperado: todas en verde.

- [ ] **Paso 7: Commit**

```bash
git add -A
git commit -m "Editor de plantilla transversal configurable"
```

---

### Tarea 12: Pantalla de calle — progresivas y vista previa de la grilla

**Archivos:**
- Crear: `packages/app/src/vistas/VistaCalle.tsx`
- Modificar: `packages/app/src/App.tsx`
- Test: `packages/app/src/vistas/VistaCalle.test.tsx`

**Interfaces:**
- Consume: `useAlmacen`, `construirGrilla` y `formatearProgresiva` de `@topo/core`.
- Produce: `VistaCalle()`.

- [ ] **Paso 1: Escribir la prueba que falla**

`packages/app/src/vistas/VistaCalle.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { useAlmacen } from '../estado/almacen'
import { proyectoEjemplo } from '../estado/ejemplo'
import VistaCalle from './VistaCalle'

describe('VistaCalle', () => {
  beforeEach(() => {
    useAlmacen.getState().cargarProyecto(proyectoEjemplo())
  })

  it('muestra el conteo de celdas de la grilla', () => {
    render(<VistaCalle />)
    expect(screen.getByText(/70 celdas/)).toBeInTheDocument()
  })

  it('lista las progresivas generadas', () => {
    render(<VistaCalle />)
    expect(screen.getByText('0+000')).toBeInTheDocument()
    expect(screen.getByText('0+180')).toBeInTheDocument()
  })

  it('recalcula la grilla al cambiar el intervalo', async () => {
    const usuario = userEvent.setup()
    render(<VistaCalle />)
    const campo = screen.getByLabelText('Intervalo')
    await usuario.clear(campo)
    await usuario.type(campo, '10')
    expect(screen.getByText(/133 celdas/)).toBeInTheDocument()
  })

  it('agrega una progresiva extra', async () => {
    const usuario = userEvent.setup()
    render(<VistaCalle />)
    await usuario.type(screen.getByLabelText('Progresiva extra'), '0+047')
    await usuario.click(screen.getByRole('button', { name: /agregar progresiva/i }))
    expect(screen.getByText('0+047')).toBeInTheDocument()
  })
})
```

- [ ] **Paso 2: Ejecutar la prueba y verificar que falla**

Ejecuta: `npm test --workspace packages/app`
Esperado: FALLA por no encontrar `./VistaCalle`.

- [ ] **Paso 3: Escribir la vista**

`packages/app/src/vistas/VistaCalle.tsx`:

```tsx
import { construirGrilla, formatearProgresiva, generarProgresivas, parsearProgresiva } from '@topo/core'
import { useMemo, useState } from 'react'
import CampoNumero from '../componentes/CampoNumero'
import CampoTexto from '../componentes/CampoTexto'
import { useAlmacen } from '../estado/almacen'
import { useContexto } from '../estado/derivados'

export default function VistaCalle() {
  const contexto = useContexto()
  const plantillas = useAlmacen((s) => s.proyecto.plantillas)
  const actualizarCalle = useAlmacen((s) => s.actualizarCalle)
  const [textoExtra, setTextoExtra] = useState('')

  const progresivas = useMemo(() => {
    if (!contexto) return []
    const { calle } = contexto
    try {
      return generarProgresivas(
        calle.progresivaInicio,
        calle.progresivaFin,
        calle.intervalo,
        calle.progresivasExtra,
      )
    } catch {
      return []
    }
  }, [contexto])

  const celdas = useMemo(
    () => (contexto ? construirGrilla(contexto.calle, contexto.plantilla) : []),
    [contexto],
  )

  if (!contexto) {
    return <p className="p-6 text-sm text-slate-500">Crea una calle y una campaña para empezar.</p>
  }

  const { calle, plantilla } = contexto

  function agregarExtra() {
    const valor = parsearProgresiva(textoExtra)
    if (valor === null) return
    actualizarCalle(calle.id, { progresivasExtra: [...calle.progresivasExtra, valor] })
    setTextoExtra('')
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 p-6">
      <h2 className="text-lg font-semibold">Calle</h2>

      <div className="grid grid-cols-2 gap-3">
        <CampoTexto etiqueta="Nombre" valor={calle.nombre} alCambiar={(v) => actualizarCalle(calle.id, { nombre: v })} />
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-slate-500">Plantilla transversal</span>
          <select
            value={calle.plantillaId}
            onChange={(evento) => actualizarCalle(calle.id, { plantillaId: evento.target.value })}
            className="rounded border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"
          >
            {plantillas.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <CampoNumero
          etiqueta="Progresiva inicial"
          valor={calle.progresivaInicio}
          alCambiar={(v) => actualizarCalle(calle.id, { progresivaInicio: v })}
          decimales={2}
          sufijo="m"
        />
        <CampoNumero
          etiqueta="Progresiva final"
          valor={calle.progresivaFin}
          alCambiar={(v) => actualizarCalle(calle.id, { progresivaFin: v })}
          decimales={2}
          sufijo="m"
        />
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-slate-500">Intervalo</span>
          <input
            aria-label="Intervalo"
            inputMode="decimal"
            value={String(calle.intervalo)}
            onChange={(evento) => {
              const numero = Number(evento.target.value.replace(',', '.'))
              if (Number.isFinite(numero) && numero > 0) actualizarCalle(calle.id, { intervalo: numero })
            }}
            className="numerico rounded border border-slate-300 px-2 py-1.5 text-right text-sm dark:border-slate-700 dark:bg-slate-900"
          />
        </label>
      </div>

      <section className="flex flex-col gap-2">
        <h3 className="font-semibold">Progresivas extra</h3>
        <div className="flex items-end gap-2">
          <CampoTexto
            etiqueta="Progresiva extra"
            valor={textoExtra}
            alCambiar={setTextoExtra}
            marcador="0+047 o 47"
            ancho="w-40"
          />
          <button
            type="button"
            onClick={agregarExtra}
            className="rounded bg-marca px-3 py-1.5 text-sm font-medium text-white"
          >
            Agregar progresiva
          </button>
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="font-semibold">
          Grilla: {progresivas.length} progresivas × {plantilla.elementos.length} elementos ={' '}
          <span className="text-marca">{celdas.length} celdas</span>
        </h3>
        <ul className="flex flex-wrap gap-1.5">
          {progresivas.map((progresiva) => {
            const esExtra = calle.progresivasExtra.includes(progresiva)
            return (
              <li
                key={progresiva}
                className={`numerico rounded px-2 py-1 text-xs ${
                  esExtra
                    ? 'bg-marca/10 text-marca'
                    : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                }`}
              >
                {formatearProgresiva(progresiva)}
                {esExtra && (
                  <button
                    type="button"
                    aria-label={`Quitar ${formatearProgresiva(progresiva)}`}
                    onClick={() =>
                      actualizarCalle(calle.id, {
                        progresivasExtra: calle.progresivasExtra.filter((p) => p !== progresiva),
                      })
                    }
                    className="ml-1 text-slate-400 hover:text-falla"
                  >
                    ×
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      </section>
    </div>
  )
}
```

- [ ] **Paso 4: Conectar en `App.tsx`**

```tsx
{vista === 'calle' && <VistaCalle />}
```

- [ ] **Paso 5: Ejecutar las pruebas y verificar que pasan**

Ejecuta: `npm test --workspace packages/app`
Esperado: todas en verde.

- [ ] **Paso 6: Commit**

```bash
git add -A
git commit -m "Pantalla de calle con progresivas y vista previa de la grilla"
```

---

### Tarea 13: Navegación de la libreta — lógica pura

Separada de la interfaz porque es donde vive el comportamiento de "Enter salta a la siguiente celda pendiente", y eso merece pruebas.

**Archivos:**
- Crear: `packages/app/src/libreta/navegacion.ts`
- Test: `packages/app/src/libreta/navegacion.test.ts`

**Interfaces:**
- Consume: `CeldaGrilla` de `@topo/core`.
- Produce:
  - `siguienteCeldaPendiente(grilla: CeldaGrilla[], llenas: Set<string>, desdeClave: string | null): CeldaGrilla | null`.
  - `progresivasPendientes(grilla: CeldaGrilla[], llenas: Set<string>): number[]`.
  - `resumenPendientes(grilla: CeldaGrilla[], llenas: Set<string>): string` — texto listo para mostrar.

- [ ] **Paso 1: Escribir la prueba que falla**

`packages/app/src/libreta/navegacion.test.ts`:

```ts
import { construirGrilla } from '@topo/core'
import { describe, expect, it } from 'vitest'
import { progresivasPendientes, resumenPendientes, siguienteCeldaPendiente } from './navegacion'

const plantilla = {
  id: 'pl-1',
  nombre: 'P',
  elementos: [
    { clave: 'BOR-I', etiqueta: 'Borde izq', offset: -4.2, tipo: 'calzada' as const },
    { clave: 'EJE', etiqueta: 'Eje', offset: 0, tipo: 'eje' as const },
  ],
}

const calle = {
  id: 'c-1',
  nombre: 'Av. Sol',
  plantillaId: 'pl-1',
  progresivaInicio: 0,
  progresivaFin: 40,
  intervalo: 20,
  progresivasExtra: [],
}

const grilla = construirGrilla(calle, plantilla)

describe('siguienteCeldaPendiente', () => {
  it('empieza por la primera celda cuando no hay nada llenado', () => {
    expect(siguienteCeldaPendiente(grilla, new Set(), null)?.clave).toBe('0|BOR-I')
  })

  it('avanza a la siguiente celda vacía después de la actual', () => {
    expect(siguienteCeldaPendiente(grilla, new Set(['0|BOR-I']), '0|BOR-I')?.clave).toBe('0|EJE')
  })

  it('se salta las celdas ya llenadas', () => {
    const llenas = new Set(['0|BOR-I', '0|EJE', '20|BOR-I'])
    expect(siguienteCeldaPendiente(grilla, llenas, '0|BOR-I')?.clave).toBe('20|EJE')
  })

  it('vuelve al principio cuando llega al final', () => {
    const llenas = new Set(['40|BOR-I', '40|EJE'])
    expect(siguienteCeldaPendiente(grilla, llenas, '40|EJE')?.clave).toBe('0|BOR-I')
  })

  it('devuelve null cuando la grilla está completa', () => {
    const llenas = new Set(grilla.map((c) => c.clave))
    expect(siguienteCeldaPendiente(grilla, llenas, '0|EJE')).toBeNull()
  })
})

describe('progresivasPendientes', () => {
  it('lista las progresivas con alguna celda vacía', () => {
    const llenas = new Set(['0|BOR-I', '0|EJE'])
    expect(progresivasPendientes(grilla, llenas)).toEqual([20, 40])
  })
})

describe('resumenPendientes', () => {
  it('describe cuántas celdas faltan y dónde', () => {
    const llenas = new Set(['0|BOR-I', '0|EJE', '20|BOR-I'])
    expect(resumenPendientes(grilla, llenas)).toBe('Faltan 3 celdas por llenar en 0+020 y 0+040.')
  })

  it('usa singular con una sola celda', () => {
    const llenas = new Set(grilla.map((c) => c.clave).filter((c) => c !== '40|EJE'))
    expect(resumenPendientes(grilla, llenas)).toBe('Falta 1 celda por llenar en 0+040.')
  })

  it('felicita cuando no falta nada', () => {
    const llenas = new Set(grilla.map((c) => c.clave))
    expect(resumenPendientes(grilla, llenas)).toBe('Grilla completa.')
  })
})
```

- [ ] **Paso 2: Ejecutar la prueba y verificar que falla**

Ejecuta: `npm test --workspace packages/app`
Esperado: FALLA por no encontrar `./navegacion`.

- [ ] **Paso 3: Escribir la implementación**

`packages/app/src/libreta/navegacion.ts`:

```ts
import { formatearProgresiva, type CeldaGrilla } from '@topo/core'

export function siguienteCeldaPendiente(
  grilla: CeldaGrilla[],
  llenas: Set<string>,
  desdeClave: string | null,
): CeldaGrilla | null {
  if (grilla.length === 0) return null

  const indiceActual = desdeClave ? grilla.findIndex((c) => c.clave === desdeClave) : -1

  for (let salto = 1; salto <= grilla.length; salto += 1) {
    const celda = grilla[(indiceActual + salto + grilla.length) % grilla.length]!
    if (!llenas.has(celda.clave)) return celda
  }
  return null
}

export function progresivasPendientes(grilla: CeldaGrilla[], llenas: Set<string>): number[] {
  const pendientes = new Set<number>()
  for (const celda of grilla) if (!llenas.has(celda.clave)) pendientes.add(celda.progresiva)
  return [...pendientes].sort((a, b) => a - b)
}

export function resumenPendientes(grilla: CeldaGrilla[], llenas: Set<string>): string {
  const faltantes = grilla.filter((celda) => !llenas.has(celda.clave))
  if (faltantes.length === 0) return 'Grilla completa.'

  const progresivas = progresivasPendientes(grilla, llenas).map(formatearProgresiva)
  const lista =
    progresivas.length === 1
      ? progresivas[0]!
      : `${progresivas.slice(0, -1).join(', ')} y ${progresivas[progresivas.length - 1]}`

  const sustantivo = faltantes.length === 1 ? 'Falta 1 celda' : `Faltan ${faltantes.length} celdas`
  return `${sustantivo} por llenar en ${lista}.`
}
```

- [ ] **Paso 4: Ejecutar las pruebas y verificar que pasan**

Ejecuta: `npm test --workspace packages/app`
Esperado: todas en verde.

- [ ] **Paso 5: Commit**

```bash
git add -A
git commit -m "Navegación de la libreta: siguiente celda pendiente y resumen de faltantes"
```

---

### Tarea 14: Pantalla de libreta — entrada rápida y barra de cierre

La pantalla donde se pasa el tiempo. Entrada por teclado: escribes la lectura, Enter, y salta sola a la siguiente celda pendiente.

**Archivos:**
- Crear: `packages/app/src/componentes/MapaGrilla.tsx`
- Crear: `packages/app/src/componentes/BarraCierre.tsx`
- Crear: `packages/app/src/componentes/ListaAvisos.tsx`
- Crear: `packages/app/src/vistas/VistaLibreta.tsx`
- Modificar: `packages/app/src/App.tsx`
- Test: `packages/app/src/vistas/VistaLibreta.test.tsx`

**Interfaces:**
- Consume: `useAlmacen`, `useContexto`, `useResultado`, `siguienteCeldaPendiente`, `resumenPendientes`.
- Produce:
  - `MapaGrilla({ celdas, llenas, claveActiva, alElegir })`.
  - `BarraCierre()` — lee el resultado del almacén.
  - `ListaAvisos()`.
  - `VistaLibreta()`.

- [ ] **Paso 1: Escribir la prueba que falla**

`packages/app/src/vistas/VistaLibreta.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { useAlmacen } from '../estado/almacen'
import { proyectoEjemplo } from '../estado/ejemplo'
import VistaLibreta from './VistaLibreta'

describe('VistaLibreta', () => {
  beforeEach(() => {
    useAlmacen.getState().cargarProyecto(proyectoEjemplo())
  })

  it('muestra la cota instrumento de la estación', () => {
    render(<VistaLibreta />)
    expect(screen.getByText('3246.605')).toBeInTheDocument()
  })

  it('muestra el veredicto del cierre en verde cuando pasa', () => {
    render(<VistaLibreta />)
    expect(screen.getByText(/PASA/)).toBeInTheDocument()
    expect(screen.getByText(/−5.0 mm|-5.0 mm/)).toBeInTheDocument()
    expect(screen.getByText(/±7.2 mm/)).toBeInTheDocument()
  })

  it('registra una lectura y salta a la siguiente celda pendiente', async () => {
    const usuario = userEvent.setup()
    render(<VistaLibreta />)

    const campo = screen.getByLabelText(/lectura de mira/i)
    await usuario.type(campo, '2.100{Enter}')

    const resultado = useAlmacen.getState().calcular()!
    expect(resultado.celdasLlenas).toBe(4)
    expect(screen.getByText(/celda activa/i).textContent).not.toContain('0+000 VER-I')
  })

  it('muestra cuántas celdas faltan', () => {
    render(<VistaLibreta />)
    expect(screen.getByText(/llenadas 3 de 70/i)).toBeInTheDocument()
  })

  it('muestra el aviso de cierre fuera de tolerancia', async () => {
    const campaniaId = useAlmacen.getState().campaniaActivaId!
    const lecturaId = useAlmacen.getState().proyecto.campanias[0]!.estaciones[1]!.vistaAdelante!.id
    useAlmacen.getState().actualizarLectura(campaniaId, lecturaId, 1.887)

    render(<VistaLibreta />)
    expect(screen.getByText(/Cierre fuera de tolerancia/i)).toBeInTheDocument()
  })
})
```

- [ ] **Paso 2: Ejecutar la prueba y verificar que falla**

Ejecuta: `npm test --workspace packages/app`
Esperado: FALLA por no encontrar `./VistaLibreta`.

- [ ] **Paso 3: Escribir el mapa de la grilla**

`packages/app/src/componentes/MapaGrilla.tsx`:

```tsx
import { formatearProgresiva, type CeldaGrilla } from '@topo/core'
import { useMemo } from 'react'

interface Props {
  celdas: CeldaGrilla[]
  llenas: Set<string>
  claveActiva: string | null
  alElegir: (clave: string) => void
}

export default function MapaGrilla({ celdas, llenas, claveActiva, alElegir }: Props) {
  const { progresivas, elementos } = useMemo(() => {
    const progresivas = [...new Set(celdas.map((c) => c.progresiva))].sort((a, b) => a - b)
    const vistos = new Map<string, number>()
    for (const celda of celdas) if (!vistos.has(celda.elementoClave)) vistos.set(celda.elementoClave, celda.offset)
    const elementos = [...vistos.entries()].sort((a, b) => a[1] - b[1]).map(([clave]) => clave)
    return { progresivas, elementos }
  }, [celdas])

  return (
    <div className="overflow-auto rounded border border-slate-200 dark:border-slate-800">
      <table className="w-full border-collapse text-xs">
        <thead className="sticky top-0 bg-slate-50 dark:bg-slate-900">
          <tr>
            <th className="px-2 py-1.5 text-left font-medium text-slate-500">Progresiva</th>
            {elementos.map((clave) => (
              <th key={clave} className="px-2 py-1.5 font-medium text-slate-500">
                {clave}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {progresivas.map((progresiva) => (
            <tr key={progresiva} className="border-t border-slate-100 dark:border-slate-800">
              <td className="numerico px-2 py-1 text-slate-600 dark:text-slate-300">
                {formatearProgresiva(progresiva)}
              </td>
              {elementos.map((elementoClave) => {
                const clave = `${progresiva}|${elementoClave}`
                const llena = llenas.has(clave)
                const activa = clave === claveActiva
                return (
                  <td key={clave} className="p-0.5 text-center">
                    <button
                      type="button"
                      aria-label={`${formatearProgresiva(progresiva)} ${elementoClave}`}
                      onClick={() => alElegir(clave)}
                      className={`h-6 w-full rounded text-xs ${
                        activa
                          ? 'bg-marca text-white'
                          : llena
                            ? 'bg-pasa/20 text-pasa'
                            : 'bg-slate-100 text-slate-400 dark:bg-slate-800'
                      }`}
                    >
                      {llena ? '✓' : '·'}
                    </button>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Paso 4: Escribir la barra de cierre y la lista de avisos**

`packages/app/src/componentes/BarraCierre.tsx`:

```tsx
import { useAlmacen } from '../estado/almacen'
import { useContexto, useResultado } from '../estado/derivados'

function formatearMm(valor: number): string {
  const signo = valor > 0 ? '+' : valor < 0 ? '−' : ''
  return `${signo}${Math.abs(valor).toFixed(1)} mm`
}

export default function BarraCierre() {
  const resultado = useResultado()
  const contexto = useContexto()
  const actualizarCampania = useAlmacen((s) => s.actualizarCampania)

  if (!resultado || !contexto) return null

  const { cierre } = resultado
  const config = contexto.campania.cierre

  const fondo =
    cierre.pasa === true
      ? 'bg-pasa/10 border-pasa text-pasa'
      : cierre.pasa === false
        ? 'bg-falla/10 border-falla text-falla'
        : 'bg-aviso/10 border-aviso text-aviso'

  return (
    <div className={`flex flex-wrap items-center gap-4 rounded border px-3 py-2 text-sm ${fondo}`}>
      <span className="font-semibold">CIERRE</span>

      <label className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
        K
        <input
          aria-label="Longitud K"
          inputMode="decimal"
          value={cierre.longitudKKm.toFixed(3)}
          readOnly={config.longitudKAuto}
          onChange={(evento) => {
            const numero = Number(evento.target.value.replace(',', '.'))
            if (Number.isFinite(numero)) {
              actualizarCampania(contexto.campania.id, {
                cierre: { ...config, longitudK: numero, longitudKAuto: false },
              })
            }
          }}
          className="numerico w-20 rounded border border-slate-300 bg-white px-1.5 py-0.5 text-right dark:border-slate-700 dark:bg-slate-900"
        />
        km
      </label>

      <label className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
        <input
          type="checkbox"
          checked={config.longitudKAuto}
          onChange={(evento) =>
            actualizarCampania(contexto.campania.id, {
              cierre: { ...config, longitudKAuto: evento.target.checked },
            })
          }
        />
        calcular sola
      </label>

      <select
        aria-label="Clase de nivelación"
        value={config.coeficiente}
        onChange={(evento) =>
          actualizarCampania(contexto.campania.id, {
            cierre: { ...config, coeficiente: Number(evento.target.value) },
          })
        }
        className="rounded border border-slate-300 bg-white px-1.5 py-0.5 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
      >
        <option value={7}>Precisión · e = 7 mm</option>
        <option value={12}>Tercer orden · e = 12 mm</option>
        <option value={15}>Tercer orden · e = 15 mm</option>
      </select>

      {cierre.toleranciaMm !== null && (
        <span className="numerico">tolerancia ±{cierre.toleranciaMm.toFixed(1)} mm</span>
      )}

      {cierre.errorMm !== null ? (
        <span className="numerico font-semibold">
          error {formatearMm(cierre.errorMm)} {cierre.pasa ? '✓ PASA' : '✗ FUERA DE TOLERANCIA'}
        </span>
      ) : (
        <span className="font-medium">circuito abierto — sin verificación</span>
      )}
    </div>
  )
}
```

`packages/app/src/componentes/ListaAvisos.tsx`:

```tsx
import { useAlmacen } from '../estado/almacen'
import { useResultado } from '../estado/derivados'

const ESTILO = {
  error: 'border-falla text-falla',
  advertencia: 'border-aviso text-aviso',
  informacion: 'border-slate-300 text-slate-500 dark:border-slate-700',
} as const

export default function ListaAvisos() {
  const resultado = useResultado()
  const seleccionar = useAlmacen((s) => s.seleccionar)

  if (!resultado || resultado.avisos.length === 0) return null

  return (
    <ul className="flex flex-col gap-1.5">
      {resultado.avisos.map((aviso, indice) => (
        <li key={`${aviso.clave ?? 'general'}-${indice}`}>
          <button
            type="button"
            onClick={() => aviso.clave && seleccionar(aviso.clave)}
            className={`w-full rounded border px-3 py-2 text-left text-sm ${ESTILO[aviso.nivel]}`}
          >
            {aviso.mensaje}
          </button>
        </li>
      ))}
    </ul>
  )
}
```

- [ ] **Paso 5: Escribir la vista de libreta**

`packages/app/src/vistas/VistaLibreta.tsx`:

```tsx
import { construirGrilla, formatearProgresiva } from '@topo/core'
import { useEffect, useMemo, useState } from 'react'
import BarraCierre from '../componentes/BarraCierre'
import ListaAvisos from '../componentes/ListaAvisos'
import MapaGrilla from '../componentes/MapaGrilla'
import { useAlmacen } from '../estado/almacen'
import { useContexto, useResultado } from '../estado/derivados'
import { resumenPendientes, siguienteCeldaPendiente } from '../libreta/navegacion'

export default function VistaLibreta() {
  const contexto = useContexto()
  const resultado = useResultado()
  const agregarIntermedia = useAlmacen((s) => s.agregarIntermedia)
  const seleccionar = useAlmacen((s) => s.seleccionar)

  const [estacionIndice, setEstacionIndice] = useState(0)
  const [claveActiva, setClaveActiva] = useState<string | null>(null)
  const [texto, setTexto] = useState('')

  const celdas = useMemo(
    () => (contexto ? construirGrilla(contexto.calle, contexto.plantilla) : []),
    [contexto],
  )
  const llenas = useMemo(
    () => new Set(resultado ? [...resultado.cotasPorCelda.keys()] : []),
    [resultado],
  )

  useEffect(() => {
    if (claveActiva === null && celdas.length > 0) {
      setClaveActiva(siguienteCeldaPendiente(celdas, llenas, null)?.clave ?? null)
    }
  }, [celdas, llenas, claveActiva])

  if (!contexto || !resultado) {
    return <p className="p-6 text-sm text-slate-500">Crea una campaña para abrir la libreta.</p>
  }

  const estacion = contexto.campania.estaciones[estacionIndice]
  const celdaActiva = celdas.find((c) => c.clave === claveActiva) ?? null

  function registrarLectura() {
    const valor = Number(texto.replace(',', '.'))
    if (!celdaActiva || !Number.isFinite(valor) || texto.trim() === '') return

    agregarIntermedia(contexto!.campania.id, estacionIndice, {
      destino: {
        tipo: 'celda',
        celda: { progresiva: celdaActiva.progresiva, elementoClave: celdaActiva.elementoClave },
      },
      valor,
    })

    const siguientes = new Set(llenas)
    siguientes.add(celdaActiva.clave)
    setClaveActiva(siguienteCeldaPendiente(celdas, siguientes, celdaActiva.clave)?.clave ?? null)
    setTexto('')
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <header className="flex flex-wrap items-baseline gap-3">
        <h2 className="text-lg font-semibold">{contexto.calle.nombre}</h2>
        <span className="text-sm text-slate-500">
          {contexto.capa?.nombre ?? 'Sin capa'} · {contexto.campania.fecha}
        </span>
      </header>

      <div className="grid gap-4 lg:grid-cols-[22rem_1fr]">
        <section className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold">Estación {estacionIndice + 1}</h3>
            <div className="ml-auto flex gap-1">
              {contexto.campania.estaciones.map((_, indice) => (
                <button
                  key={indice}
                  type="button"
                  onClick={() => setEstacionIndice(indice)}
                  className={`h-7 w-7 rounded text-xs ${
                    indice === estacionIndice
                      ? 'bg-marca text-white'
                      : 'bg-slate-100 dark:bg-slate-800'
                  }`}
                >
                  {indice + 1}
                </button>
              ))}
            </div>
          </div>

          {estacion && (
            <dl className="rounded border border-slate-200 p-3 text-sm dark:border-slate-800">
              <div className="flex justify-between">
                <dt className="text-slate-500">Vista atrás</dt>
                <dd className="numerico">{estacion.vistaAtras.valor.toFixed(3)}</dd>
              </div>
              <div className="flex justify-between font-semibold">
                <dt>Cota instrumento</dt>
                <dd className="numerico">
                  {resultado.cotasInstrumento[estacionIndice]?.toFixed(3) ?? '—'}
                </dd>
              </div>
            </dl>
          )}

          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-slate-500">
              Celda activa:{' '}
              <strong>
                {celdaActiva
                  ? `${formatearProgresiva(celdaActiva.progresiva)} ${celdaActiva.elementoClave}`
                  : 'grilla completa'}
              </strong>
            </span>
            <input
              aria-label="Lectura de mira"
              inputMode="decimal"
              autoFocus
              value={texto}
              onChange={(evento) => setTexto(evento.target.value)}
              onKeyDown={(evento) => {
                if (evento.key === 'Enter') registrarLectura()
              }}
              placeholder="escribe y Enter"
              className="numerico rounded border-2 border-marca px-3 py-2 text-right text-lg dark:bg-slate-900"
            />
          </label>

          <p className="text-xs text-slate-500">{resumenPendientes(celdas, llenas)}</p>
        </section>

        <section className="flex flex-col gap-3">
          <p className="text-sm text-slate-500">
            llenadas {resultado.celdasLlenas} de {resultado.celdasTotales}
          </p>
          <MapaGrilla
            celdas={celdas}
            llenas={llenas}
            claveActiva={claveActiva}
            alElegir={(clave) => {
              setClaveActiva(clave)
              seleccionar(clave)
            }}
          />
        </section>
      </div>

      <BarraCierre />
      <ListaAvisos />
    </div>
  )
}
```

La cota instrumento sale del motor (`resultado.cotasInstrumento`, definido en la Tarea 7). No la recalcules en la interfaz.

- [ ] **Paso 6: Conectar en `App.tsx`**

```tsx
{vista === 'libreta' && <VistaLibreta />}
```

- [ ] **Paso 7: Ejecutar las pruebas y verificar que pasan**

Ejecuta: `npm test`
Esperado: motor y aplicación en verde.

- [ ] **Paso 8: Verificar a mano en el navegador**

Ejecuta: `npm run dev`, abre «Libreta».
Comprueba: escribes `2.100` y Enter → la celda se marca ✓, el contador sube, y el foco queda listo para la siguiente. La barra de cierre está verde con `−5.0 mm ✓ PASA`.

- [ ] **Paso 9: Commit**

```bash
git add -A
git commit -m "Pantalla de libreta con entrada rápida, mapa de grilla y barra de cierre"
```

---

### Tarea 14A: Campañas — la lista que crece día a día

Sin esta pantalla no se puede registrar la nivelación de mañana ni la de la siguiente capa. Es la que hace que los datos se apilen en vez de pisarse.

**Archivos:**
- Crear: `packages/app/src/vistas/VistaCampanias.tsx`
- Modificar: `packages/app/src/componentes/BarraSuperior.tsx` (pestaña «Campañas», entre Calle y Libreta)
- Modificar: `packages/app/src/estado/almacen.ts` (añadir `'campanias'` al tipo `Vista`)
- Modificar: `packages/app/src/App.tsx`
- Test: `packages/app/src/vistas/VistaCampanias.test.tsx`

**Interfaces:**
- Consume: `useAlmacen` (`agregarCampania`, `activarCampania`, `actualizarCampania`), `formatearProgresiva`.
- Produce: `VistaCampanias()`.

- [ ] **Paso 1: Escribir la prueba que falla**

`packages/app/src/vistas/VistaCampanias.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { useAlmacen } from '../estado/almacen'
import { proyectoEjemplo } from '../estado/ejemplo'
import VistaCampanias from './VistaCampanias'

describe('VistaCampanias', () => {
  beforeEach(() => {
    useAlmacen.getState().cargarProyecto(proyectoEjemplo())
  })

  it('lista las campañas con su fecha, calle y capa', () => {
    render(<VistaCampanias />)
    expect(screen.getByText(/2026-08-19/)).toBeInTheDocument()
    expect(screen.getByText(/Av\. Sol/)).toBeInTheDocument()
    expect(screen.getByText(/SUBRASANTE/)).toBeInTheDocument()
  })

  it('marca cuál es la campaña activa', () => {
    render(<VistaCampanias />)
    expect(screen.getByRole('button', { name: /abrir campaña del 2026-08-19/i })).toHaveAttribute(
      'data-activa',
      'true',
    )
  })

  it('crea una campaña nueva y la deja activa', async () => {
    const usuario = userEvent.setup()
    render(<VistaCampanias />)
    await usuario.click(screen.getByRole('button', { name: /nueva campaña/i }))

    const { proyecto, campaniaActivaId } = useAlmacen.getState()
    expect(proyecto.campanias).toHaveLength(2)
    expect(campaniaActivaId).toBe(proyecto.campanias[1]!.id)
  })

  it('la campaña nueva arranca vacía, sin pisar la anterior', async () => {
    const usuario = userEvent.setup()
    render(<VistaCampanias />)
    await usuario.click(screen.getByRole('button', { name: /nueva campaña/i }))

    const resultado = useAlmacen.getState().calcular()!
    expect(resultado.celdasLlenas).toBe(0)
    expect(useAlmacen.getState().proyecto.campanias[0]!.estaciones).toHaveLength(2)
  })

  it('cambia la capa de una campaña', async () => {
    const usuario = userEvent.setup()
    render(<VistaCampanias />)
    await usuario.selectOptions(screen.getByLabelText(/capa de la campaña/i), 'cap-terreno')
    expect(useAlmacen.getState().proyecto.campanias[0]!.capaId).toBe('cap-terreno')
  })

  it('vuelve a activar una campaña anterior', async () => {
    const usuario = userEvent.setup()
    render(<VistaCampanias />)
    await usuario.click(screen.getByRole('button', { name: /nueva campaña/i }))
    await usuario.click(screen.getByRole('button', { name: /abrir campaña del 2026-08-19/i }))
    expect(useAlmacen.getState().campaniaActivaId).toBe('camp-1')
  })
})
```

- [ ] **Paso 2: Ejecutar la prueba y verificar que falla**

Ejecuta: `npm test --workspace packages/app`
Esperado: FALLA por no encontrar `./VistaCampanias`.

- [ ] **Paso 3: Añadir `'campanias'` al tipo `Vista`**

En `almacen.ts`:

```ts
export type Vista = 'inicio' | 'proyecto' | 'plantilla' | 'calle' | 'campanias' | 'libreta' | 'resultados'
```

- [ ] **Paso 4: Escribir la vista**

`packages/app/src/vistas/VistaCampanias.tsx`:

```tsx
import { useAlmacen } from '../estado/almacen'

function hoyISO(): string {
  return new Date().toISOString().slice(0, 10)
}

export default function VistaCampanias() {
  const proyecto = useAlmacen((s) => s.proyecto)
  const campaniaActivaId = useAlmacen((s) => s.campaniaActivaId)
  const agregarCampania = useAlmacen((s) => s.agregarCampania)
  const activarCampania = useAlmacen((s) => s.activarCampania)
  const actualizarCampania = useAlmacen((s) => s.actualizarCampania)
  const irA = useAlmacen((s) => s.irA)

  const calle = proyecto.calles[0]
  const bm = proyecto.bms[0]

  function nombreDe(lista: { id: string; nombre: string }[], id: string): string {
    return lista.find((elemento) => elemento.id === id)?.nombre ?? '—'
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5 p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Campañas de nivelación</h2>
        <button
          type="button"
          disabled={!calle || !bm}
          onClick={() => {
            if (!calle || !bm) return
            agregarCampania({
              fecha: hoyISO(),
              calleId: calle.id,
              capaId: proyecto.capas[0]?.id ?? '',
              bmInicialId: bm.id,
              estado: 'abierta',
              cierre: {
                tipo: 'cerrado',
                bmFinalId: bm.id,
                longitudK: 0,
                longitudKAuto: true,
                clase: 'tercerOrden',
                coeficiente: 12,
              },
            })
            irA('libreta')
          }}
          className="rounded bg-marca px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
        >
          Nueva campaña
        </button>
      </div>

      <p className="text-sm text-slate-500">
        Cada campaña es una jornada de nivelación: una fecha, una calle y una capa. Nunca pisa a las
        anteriores; se apilan.
      </p>

      {proyecto.campanias.length === 0 && (
        <p className="text-sm text-slate-500">Todavía no hay campañas. Crea la primera.</p>
      )}

      <ul className="flex flex-col gap-2">
        {[...proyecto.campanias]
          .sort((a, b) => b.fecha.localeCompare(a.fecha))
          .map((campania) => {
            const activa = campania.id === campaniaActivaId
            const lecturas = campania.estaciones.reduce((suma, e) => suma + e.intermedias.length, 0)

            return (
              <li
                key={campania.id}
                className={`grid grid-cols-[1fr_10rem_10rem_auto] items-center gap-3 rounded border px-3 py-2 ${
                  activa ? 'border-marca bg-marca/5' : 'border-slate-200 dark:border-slate-800'
                }`}
              >
                <button
                  type="button"
                  data-activa={activa}
                  aria-label={`Abrir campaña del ${campania.fecha}`}
                  onClick={() => {
                    activarCampania(campania.id)
                    irA('libreta')
                  }}
                  className="text-left text-sm"
                >
                  <span className="numerico font-medium">{campania.fecha}</span>
                  <span className="text-slate-500">
                    {' '}
                    · {nombreDe(proyecto.calles, campania.calleId)} ·{' '}
                    {nombreDe(proyecto.capas, campania.capaId)}
                  </span>
                  <span className="block text-xs text-slate-400">
                    {lecturas} lecturas · {campania.estaciones.length} estaciones
                  </span>
                </button>

                <label className="flex flex-col gap-1">
                  <span className="text-xs text-slate-500">Capa de la campaña</span>
                  <select
                    aria-label={`Capa de la campaña del ${campania.fecha}`}
                    value={campania.capaId}
                    onChange={(evento) =>
                      actualizarCampania(campania.id, { capaId: evento.target.value })
                    }
                    className="rounded border border-slate-300 px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-900"
                  >
                    {proyecto.capas.map((capa) => (
                      <option key={capa.id} value={capa.id}>
                        {capa.nombre}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="flex flex-col gap-1">
                  <span className="text-xs text-slate-500">BM de arranque</span>
                  <select
                    aria-label={`BM de la campaña del ${campania.fecha}`}
                    value={campania.bmInicialId}
                    onChange={(evento) =>
                      actualizarCampania(campania.id, { bmInicialId: evento.target.value })
                    }
                    className="rounded border border-slate-300 px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-900"
                  >
                    {proyecto.bms.map((banco) => (
                      <option key={banco.id} value={banco.id}>
                        {banco.nombre}
                      </option>
                    ))}
                  </select>
                </label>

                <input
                  type="date"
                  aria-label={`Fecha de la campaña ${campania.id}`}
                  value={campania.fecha}
                  onChange={(evento) => actualizarCampania(campania.id, { fecha: evento.target.value })}
                  className="rounded border border-slate-300 px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-900"
                />
              </li>
            )
          })}
      </ul>
    </div>
  )
}
```

- [ ] **Paso 5: Conectar en `App.tsx` y en la barra**

```tsx
{vista === 'campanias' && <VistaCampanias />}
```

Y en `BarraSuperior`, añade `{ vista: 'campanias', texto: 'Campañas' }` entre Calle y Libreta.

- [ ] **Paso 6: Ejecutar las pruebas y verificar que pasan**

Ejecuta: `npm test --workspace packages/app`
Esperado: todas en verde.

- [ ] **Paso 7: Commit**

```bash
git add -A
git commit -m "Pantalla de campañas: la nivelación se apila por fecha, calle y capa"
```

---

### Tarea 14B: Estaciones, puntos de cambio y corrección de lecturas

Completa la libreta: trasladar el instrumento, cerrar el circuito, y corregir o borrar una lectura ya escrita — con recálculo inmediato, que es el requisito de interactividad del spec.

**Archivos:**
- Modificar: `packages/app/src/estado/almacen.ts` (nueva acción `fijarVistaAdelante`)
- Crear: `packages/app/src/componentes/PanelEstacion.tsx`
- Modificar: `packages/app/src/vistas/VistaLibreta.tsx`
- Test: `packages/app/src/componentes/PanelEstacion.test.tsx`
- Test: modificar `packages/app/src/estado/almacen.test.ts`

**Interfaces:**
- Consume: `useAlmacen`, `useContexto`, `useResultado`, `formatearProgresiva`.
- Produce:
  - Acción `fijarVistaAdelante(campaniaId: Id, estacionIndice: number, lectura: { destino: DestinoLectura; valor: number }): void`.
  - `PanelEstacion({ estacionIndice, alCambiarEstacion })`.

- [ ] **Paso 1: Escribir las pruebas que fallan**

Añade a `packages/app/src/estado/almacen.test.ts`:

```ts
it('fija la vista adelante de una estación', () => {
  const campaniaId = useAlmacen.getState().campaniaActivaId!
  useAlmacen.getState().fijarVistaAdelante(campaniaId, 0, {
    destino: { tipo: 'cambio', nombre: 'PC-2' },
    valor: 1.2,
  })
  const estacion = useAlmacen.getState().proyecto.campanias[0]!.estaciones[0]!
  expect(estacion.vistaAdelante?.valor).toBe(1.2)
})

it('agregar una estación la encadena al último punto de cambio', () => {
  const campaniaId = useAlmacen.getState().campaniaActivaId!
  useAlmacen.getState().agregarEstacion(campaniaId, {
    destino: { tipo: 'cambio', nombre: 'PC-1' },
    valor: 1.5,
  })
  const campania = useAlmacen.getState().proyecto.campanias[0]!
  expect(campania.estaciones).toHaveLength(3)
  expect(campania.estaciones[2]!.vistaAtras.valor).toBe(1.5)
})
```

`packages/app/src/componentes/PanelEstacion.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAlmacen } from '../estado/almacen'
import { proyectoEjemplo } from '../estado/ejemplo'
import PanelEstacion from './PanelEstacion'

describe('PanelEstacion', () => {
  beforeEach(() => {
    useAlmacen.getState().cargarProyecto(proyectoEjemplo())
  })

  it('lista las lecturas intermedias de la estación con su cota', () => {
    render(<PanelEstacion estacionIndice={0} alCambiarEstacion={vi.fn()} />)
    expect(screen.getByLabelText('Lectura de 0+000 EJE')).toHaveValue('1.980')
    expect(screen.getByText('3244.628')).toBeInTheDocument()
  })

  it('corregir una lectura recalcula la cota al instante', async () => {
    const usuario = userEvent.setup()
    render(<PanelEstacion estacionIndice={0} alCambiarEstacion={vi.fn()} />)

    const campo = screen.getByLabelText('Lectura de 0+000 EJE')
    await usuario.clear(campo)
    await usuario.type(campo, '1.880')

    const resultado = useAlmacen.getState().calcular()!
    expect(resultado.cotasPorCelda.get('0|EJE')!.cotaCruda).toBeCloseTo(3244.725, 6)
  })

  it('borra una lectura', async () => {
    const usuario = userEvent.setup()
    render(<PanelEstacion estacionIndice={0} alCambiarEstacion={vi.fn()} />)
    await usuario.click(screen.getByLabelText('Borrar lectura de 0+000 EJE'))

    const resultado = useAlmacen.getState().calcular()!
    expect(resultado.cotasPorCelda.has('0|EJE')).toBe(false)
  })

  it('traslada el instrumento creando punto de cambio y estación nueva', async () => {
    const usuario = userEvent.setup()
    const alCambiarEstacion = vi.fn()
    render(<PanelEstacion estacionIndice={1} alCambiarEstacion={alCambiarEstacion} />)

    await usuario.click(screen.getByRole('button', { name: /trasladar el instrumento/i }))

    const campania = useAlmacen.getState().proyecto.campanias[0]!
    expect(campania.estaciones).toHaveLength(3)
    expect(campania.estaciones[2]!.vistaAtras.destino).toEqual({ tipo: 'cambio', nombre: 'PC-2' })
    expect(alCambiarEstacion).toHaveBeenCalledWith(2)
  })
})
```

- [ ] **Paso 2: Ejecutar las pruebas y verificar que fallan**

Ejecuta: `npm test --workspace packages/app`
Esperado: FALLAN por `fijarVistaAdelante` inexistente y por no encontrar `./PanelEstacion`.

- [ ] **Paso 3: Añadir la acción al almacén**

En la interfaz `EstadoApp`, junto a `agregarIntermedia`:

```ts
fijarVistaAdelante(
  campaniaId: Id,
  estacionIndice: number,
  lectura: { destino: DestinoLectura; valor: number },
): void
```

Y su implementación:

```ts
fijarVistaAdelante: (campaniaId, estacionIndice, lectura) =>
  set((s) => ({
    proyecto: marcarModificado({
      ...s.proyecto,
      campanias: s.proyecto.campanias.map((c) =>
        c.id === campaniaId
          ? {
              ...c,
              estaciones: c.estaciones.map((e, i) =>
                i === estacionIndice
                  ? {
                      ...e,
                      vistaAdelante: { id: e.vistaAdelante?.id ?? nuevoId('l'), ...lectura },
                    }
                  : e,
              ),
            }
          : c,
      ),
    }),
  })),
```

- [ ] **Paso 4: Escribir el panel de estación**

`packages/app/src/componentes/PanelEstacion.tsx`:

```tsx
import { formatearProgresiva, type DestinoLectura } from '@topo/core'
import { useAlmacen } from '../estado/almacen'
import { useContexto, useResultado } from '../estado/derivados'
import CampoNumero from './CampoNumero'

function describirDestino(destino: DestinoLectura): string {
  switch (destino.tipo) {
    case 'bm':
      return 'BM'
    case 'cambio':
      return destino.nombre
    case 'celda':
      return `${formatearProgresiva(destino.celda.progresiva)} ${destino.celda.elementoClave}`
    case 'suelto':
      return destino.punto.etiqueta
  }
}

function claveDe(destino: DestinoLectura): string | null {
  return destino.tipo === 'celda'
    ? `${destino.celda.progresiva}|${destino.celda.elementoClave}`
    : null
}

interface Props {
  estacionIndice: number
  alCambiarEstacion: (indice: number) => void
}

export default function PanelEstacion({ estacionIndice, alCambiarEstacion }: Props) {
  const contexto = useContexto()
  const resultado = useResultado()
  const actualizarLectura = useAlmacen((s) => s.actualizarLectura)
  const eliminarLectura = useAlmacen((s) => s.eliminarLectura)
  const fijarVistaAdelante = useAlmacen((s) => s.fijarVistaAdelante)
  const agregarEstacion = useAlmacen((s) => s.agregarEstacion)
  const seleccionar = useAlmacen((s) => s.seleccionar)

  if (!contexto || !resultado) return null

  const campania = contexto.campania
  const estacion = campania.estaciones[estacionIndice]
  if (!estacion) return null

  const esUltima = estacionIndice === campania.estaciones.length - 1

  function trasladarInstrumento() {
    const nombrePC = `PC-${campania.estaciones.length}`
    fijarVistaAdelante(campania.id, estacionIndice, {
      destino: { tipo: 'cambio', nombre: nombrePC },
      valor: 0,
    })
    agregarEstacion(campania.id, { destino: { tipo: 'cambio', nombre: nombrePC }, valor: 0 })
    alCambiarEstacion(estacionIndice + 1)
  }

  function cerrarCircuito() {
    const bmFinalId = campania.cierre.bmFinalId ?? campania.bmInicialId
    fijarVistaAdelante(campania.id, estacionIndice, {
      destino: { tipo: 'bm', bmId: bmFinalId },
      valor: 0,
    })
  }

  return (
    <div className="flex flex-col gap-3 rounded border border-slate-200 p-3 dark:border-slate-800">
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-semibold">Estación {estacionIndice + 1}</span>
        <span className="numerico text-slate-500">
          CI {resultado.cotasInstrumento[estacionIndice]?.toFixed(3) ?? '—'}
        </span>
      </div>

      <div className="grid grid-cols-[1fr_6rem] items-center gap-2 text-sm">
        <span className="text-slate-500">Vista atrás · {describirDestino(estacion.vistaAtras.destino)}</span>
        <CampoNumero
          valor={estacion.vistaAtras.valor}
          alCambiar={(v) => actualizarLectura(campania.id, estacion.vistaAtras.id, v)}
        />
      </div>

      <ul className="flex flex-col gap-1">
        {estacion.intermedias.map((lectura) => {
          const clave = claveDe(lectura.destino)
          const cota = clave ? resultado.cotasPorCelda.get(clave)?.cota : undefined

          return (
            <li key={lectura.id} className="grid grid-cols-[1fr_6rem_5rem_auto] items-center gap-2 text-sm">
              <button
                type="button"
                onClick={() => clave && seleccionar(clave)}
                className="text-left text-slate-600 hover:text-marca dark:text-slate-300"
              >
                {describirDestino(lectura.destino)}
              </button>
              <input
                aria-label={`Lectura de ${describirDestino(lectura.destino)}`}
                inputMode="decimal"
                defaultValue={lectura.valor.toFixed(3)}
                onChange={(evento) => {
                  const numero = Number(evento.target.value.replace(',', '.'))
                  if (Number.isFinite(numero)) actualizarLectura(campania.id, lectura.id, numero)
                }}
                className="numerico rounded border border-slate-300 px-2 py-1 text-right dark:border-slate-700 dark:bg-slate-900"
              />
              <span className="numerico text-right text-slate-500">{cota?.toFixed(3) ?? '—'}</span>
              <button
                type="button"
                aria-label={`Borrar lectura de ${describirDestino(lectura.destino)}`}
                onClick={() => eliminarLectura(campania.id, lectura.id)}
                className="px-1 text-slate-400 hover:text-falla"
              >
                ×
              </button>
            </li>
          )
        })}
      </ul>

      {estacion.vistaAdelante && (
        <div className="grid grid-cols-[1fr_6rem] items-center gap-2 text-sm">
          <span className="text-slate-500">
            Vista adelante · {describirDestino(estacion.vistaAdelante.destino)}
          </span>
          <CampoNumero
            valor={estacion.vistaAdelante.valor}
            alCambiar={(v) => actualizarLectura(campania.id, estacion.vistaAdelante!.id, v)}
          />
        </div>
      )}

      {esUltima && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={trasladarInstrumento}
            className="rounded border border-slate-300 px-2 py-1 text-sm dark:border-slate-700"
          >
            Trasladar el instrumento
          </button>
          <button
            type="button"
            onClick={cerrarCircuito}
            className="rounded border border-slate-300 px-2 py-1 text-sm dark:border-slate-700"
          >
            Cerrar el circuito
          </button>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Paso 5: Reemplazar el bloque de estación en `VistaLibreta`**

Sustituye el `<dl>` de la Tarea 14 por `<PanelEstacion estacionIndice={estacionIndice} alCambiarEstacion={setEstacionIndice} />`, conservando los botones numerados de estación que ya estaban arriba.

- [ ] **Paso 6: Ejecutar las pruebas y verificar que pasan**

Ejecuta: `npm test --workspace packages/app`
Esperado: todas en verde.

- [ ] **Paso 7: Verificar a mano**

Con `npm run dev`: corrige la lectura de 0+000 EJE y observa que la cota, el corte y la barra de cierre cambian sin tocar ningún botón de actualizar.

- [ ] **Paso 8: Commit**

```bash
git add -A
git commit -m "Estaciones, puntos de cambio y corrección de lecturas con recálculo inmediato"
```

---

### Tarea 15: Escalas de gráfico — lógica pura

**Archivos:**
- Crear: `packages/app/src/grafico/escala.ts`
- Test: `packages/app/src/grafico/escala.test.ts`

**Interfaces:**
- Consume: nada.
- Produce:
  - `escalaLineal(dominio: [number, number], rango: [number, number]): (valor: number) => number`.
  - `extension(valores: number[], margenRelativo: number): [number, number]`.
  - `marcas(dominio: [number, number], cantidadObjetivo: number): number[]`.

- [ ] **Paso 1: Escribir la prueba que falla**

`packages/app/src/grafico/escala.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { escalaLineal, extension, marcas } from './escala'

describe('escalaLineal', () => {
  it('mapea el dominio al rango', () => {
    const escala = escalaLineal([0, 10], [0, 100])
    expect(escala(0)).toBe(0)
    expect(escala(5)).toBe(50)
    expect(escala(10)).toBe(100)
  })

  it('admite un rango invertido, como el eje Y de la pantalla', () => {
    const escala = escalaLineal([3244, 3245], [200, 0])
    expect(escala(3244)).toBe(200)
    expect(escala(3245)).toBe(0)
  })

  it('devuelve el centro del rango si el dominio es un punto', () => {
    const escala = escalaLineal([5, 5], [0, 100])
    expect(escala(5)).toBe(50)
  })
})

describe('extension', () => {
  it('agrega margen proporcional arriba y abajo', () => {
    expect(extension([10, 20], 0.1)).toEqual([9, 21])
  })

  it('abre un margen fijo cuando todos los valores son iguales', () => {
    expect(extension([3244.625, 3244.625], 0.1)).toEqual([3244.575, 3244.675])
  })

  it('devuelve cero a uno con una lista vacía', () => {
    expect(extension([], 0.1)).toEqual([0, 1])
  })
})

describe('marcas', () => {
  it('genera valores redondos dentro del dominio', () => {
    expect(marcas([0, 10], 5)).toEqual([0, 2.5, 5, 7.5, 10])
  })

  it('usa pasos legibles con cotas', () => {
    const valores = marcas([3244.5, 3245.1], 4)
    expect(valores[0]).toBeCloseTo(3244.6, 6)
    expect(valores[valores.length - 1]).toBeLessThanOrEqual(3245.1)
  })

  it('devuelve un solo valor si el dominio es un punto', () => {
    expect(marcas([5, 5], 4)).toEqual([5])
  })
})
```

- [ ] **Paso 2: Ejecutar la prueba y verificar que falla**

Ejecuta: `npm test --workspace packages/app`
Esperado: FALLA por no encontrar `./escala`.

- [ ] **Paso 3: Escribir la implementación**

`packages/app/src/grafico/escala.ts`:

```ts
export function escalaLineal(
  dominio: [number, number],
  rango: [number, number],
): (valor: number) => number {
  const [d0, d1] = dominio
  const [r0, r1] = rango
  const amplitud = d1 - d0

  if (amplitud === 0) return () => (r0 + r1) / 2
  return (valor) => r0 + ((valor - d0) / amplitud) * (r1 - r0)
}

export function extension(valores: number[], margenRelativo: number): [number, number] {
  if (valores.length === 0) return [0, 1]

  const minimo = Math.min(...valores)
  const maximo = Math.max(...valores)

  if (minimo === maximo) return [minimo - 0.05, maximo + 0.05]

  const margen = (maximo - minimo) * margenRelativo
  return [minimo - margen, maximo + margen]
}

export function marcas(dominio: [number, number], cantidadObjetivo: number): number[] {
  const [minimo, maximo] = dominio
  if (minimo === maximo) return [minimo]

  const paso = pasoLegible((maximo - minimo) / Math.max(1, cantidadObjetivo))
  const primera = Math.ceil(minimo / paso) * paso

  const salida: number[] = []
  for (let valor = primera; valor <= maximo + paso / 1e6; valor += paso) {
    salida.push(Number(valor.toPrecision(12)))
  }
  return salida
}

/** Redondea un paso al 1, 2, 2.5 o 5 más cercano dentro de su potencia de diez. */
function pasoLegible(bruto: number): number {
  const potencia = 10 ** Math.floor(Math.log10(bruto))
  const normalizado = bruto / potencia

  if (normalizado <= 1) return potencia
  if (normalizado <= 2) return 2 * potencia
  if (normalizado <= 2.5) return 2.5 * potencia
  if (normalizado <= 5) return 5 * potencia
  return 10 * potencia
}
```

- [ ] **Paso 4: Ejecutar las pruebas y verificar que pasan**

Ejecuta: `npm test --workspace packages/app`
Esperado: todas en verde.

- [ ] **Paso 5: Commit**

```bash
git add -A
git commit -m "Escalas, extensión y marcas para los gráficos"
```

---

### Tarea 16: Corte transversal con deslizador

**Archivos:**
- Crear: `packages/app/src/componentes/CorteTransversal.tsx`
- Crear: `packages/app/src/componentes/DeslizadorProgresiva.tsx`
- Modificar: `packages/app/src/vistas/VistaLibreta.tsx`
- Test: `packages/app/src/componentes/CorteTransversal.test.tsx`

**Interfaces:**
- Consume: `useResultado`, `useContexto`, `escalaLineal`, `extension`, `marcas`, `seleccionar` e `irAProgresiva` del almacén.
- Produce:
  - `CorteTransversal({ progresiva })`.
  - `DeslizadorProgresiva({ progresivas, valor, alCambiar })` — arrastre, flechas del teclado y botón de reproducir.

- [ ] **Paso 1: Escribir la prueba que falla**

`packages/app/src/componentes/CorteTransversal.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { useAlmacen } from '../estado/almacen'
import { proyectoEjemplo } from '../estado/ejemplo'
import CorteTransversal from './CorteTransversal'

describe('CorteTransversal', () => {
  beforeEach(() => {
    useAlmacen.getState().cargarProyecto(proyectoEjemplo())
  })

  it('dibuja un punto por cada celda medida de la progresiva', () => {
    render(<CorteTransversal progresiva={0} />)
    expect(screen.getAllByRole('button', { name: /^0\+000 / })).toHaveLength(2)
  })

  it('avisa cuando la progresiva no tiene lecturas', () => {
    render(<CorteTransversal progresiva={60} />)
    expect(screen.getByText(/todavía no tiene lecturas/i)).toBeInTheDocument()
  })

  it('selecciona la celda al hacer clic en un punto', async () => {
    const usuario = userEvent.setup()
    render(<CorteTransversal progresiva={0} />)
    await usuario.click(screen.getByRole('button', { name: /0\+000 EJE/ }))
    expect(useAlmacen.getState().seleccion.clave).toBe('0|EJE')
  })

  it('marca el punto seleccionado', () => {
    useAlmacen.getState().seleccionar('0|EJE')
    render(<CorteTransversal progresiva={0} />)
    expect(screen.getByRole('button', { name: /0\+000 EJE/ })).toHaveAttribute('data-activo', 'true')
  })
})
```

- [ ] **Paso 2: Ejecutar la prueba y verificar que falla**

Ejecuta: `npm test --workspace packages/app`
Esperado: FALLA por no encontrar `./CorteTransversal`.

- [ ] **Paso 3: Escribir el deslizador**

`packages/app/src/componentes/DeslizadorProgresiva.tsx`:

```tsx
import { formatearProgresiva } from '@topo/core'
import { useEffect, useRef, useState } from 'react'

interface Props {
  progresivas: number[]
  valor: number
  alCambiar: (progresiva: number) => void
}

export default function DeslizadorProgresiva({ progresivas, valor, alCambiar }: Props) {
  const [reproduciendo, setReproduciendo] = useState(false)
  const temporizador = useRef<number | null>(null)
  const indice = Math.max(0, progresivas.indexOf(valor))

  useEffect(() => {
    if (!reproduciendo) return

    temporizador.current = window.setInterval(() => {
      const siguiente = (progresivas.indexOf(valor) + 1) % progresivas.length
      alCambiar(progresivas[siguiente]!)
    }, 700)

    return () => {
      if (temporizador.current) window.clearInterval(temporizador.current)
    }
  }, [reproduciendo, valor, progresivas, alCambiar])

  if (progresivas.length === 0) return null

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        aria-label={reproduciendo ? 'Detener recorrido' : 'Reproducir recorrido'}
        onClick={() => setReproduciendo((antes) => !antes)}
        className="rounded border border-slate-300 px-2 py-1 text-sm dark:border-slate-700"
      >
        {reproduciendo ? '⏸' : '▶'}
      </button>

      <span className="numerico w-20 text-sm font-semibold">{formatearProgresiva(valor)}</span>

      <input
        type="range"
        aria-label="Progresiva"
        min={0}
        max={progresivas.length - 1}
        step={1}
        value={indice}
        onChange={(evento) => alCambiar(progresivas[Number(evento.target.value)]!)}
        className="flex-1 accent-marca"
      />

      <span className="text-xs text-slate-500">
        {formatearProgresiva(progresivas[0]!)} → {formatearProgresiva(progresivas[progresivas.length - 1]!)}
      </span>
    </div>
  )
}
```

- [ ] **Paso 4: Escribir el corte**

`packages/app/src/componentes/CorteTransversal.tsx`:

```tsx
import { formatearProgresiva } from '@topo/core'
import { useMemo } from 'react'
import { useAlmacen } from '../estado/almacen'
import { useResultado } from '../estado/derivados'
import { escalaLineal, extension, marcas } from '../grafico/escala'

const ANCHO = 720
const ALTO = 260
const MARGEN = { arriba: 16, derecha: 16, abajo: 34, izquierda: 62 }

interface Props {
  progresiva: number
}

export default function CorteTransversal({ progresiva }: Props) {
  const resultado = useResultado()
  const seleccion = useAlmacen((s) => s.seleccion)
  const seleccionar = useAlmacen((s) => s.seleccionar)

  const puntos = useMemo(() => {
    if (!resultado) return []
    return [...resultado.cotasPorCelda.values()]
      .filter((celda) => celda.progresiva === progresiva)
      .sort((a, b) => a.offset - b.offset)
  }, [resultado, progresiva])

  if (puntos.length === 0) {
    return (
      <p className="rounded border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500 dark:border-slate-700">
        {formatearProgresiva(progresiva)} todavía no tiene lecturas.
      </p>
    )
  }

  const dominioX = extension(puntos.map((p) => p.offset), 0.08)
  const dominioY = extension(puntos.map((p) => p.cota), 0.25)

  const x = escalaLineal(dominioX, [MARGEN.izquierda, ANCHO - MARGEN.derecha])
  const y = escalaLineal(dominioY, [ALTO - MARGEN.abajo, MARGEN.arriba])

  const trazo = puntos.map((p) => `${x(p.offset).toFixed(1)},${y(p.cota).toFixed(1)}`).join(' ')

  return (
    <svg
      viewBox={`0 0 ${ANCHO} ${ALTO}`}
      role="img"
      aria-label={`Corte transversal en ${formatearProgresiva(progresiva)}`}
      className="w-full rounded border border-slate-200 dark:border-slate-800"
    >
      {marcas(dominioY, 4).map((cota) => (
        <g key={`y-${cota}`}>
          <line
            x1={MARGEN.izquierda}
            x2={ANCHO - MARGEN.derecha}
            y1={y(cota)}
            y2={y(cota)}
            className="stroke-slate-200 dark:stroke-slate-800"
          />
          <text
            x={MARGEN.izquierda - 6}
            y={y(cota) + 4}
            textAnchor="end"
            className="fill-slate-500 text-[10px]"
            style={{ fontVariantNumeric: 'tabular-nums' }}
          >
            {cota.toFixed(3)}
          </text>
        </g>
      ))}

      {marcas(dominioX, 6).map((offset) => (
        <text
          key={`x-${offset}`}
          x={x(offset)}
          y={ALTO - MARGEN.abajo + 16}
          textAnchor="middle"
          className="fill-slate-500 text-[10px]"
        >
          {offset.toFixed(1)}
        </text>
      ))}

      <text
        x={(MARGEN.izquierda + ANCHO - MARGEN.derecha) / 2}
        y={ALTO - 6}
        textAnchor="middle"
        className="fill-slate-400 text-[10px]"
      >
        distancia al eje (m)
      </text>

      <polyline points={trazo} fill="none" className="stroke-marca" strokeWidth={2} />

      {puntos.map((punto) => {
        const activo = seleccion.clave === punto.clave
        return (
          <g key={punto.clave}>
            <circle
              cx={x(punto.offset)}
              cy={y(punto.cota)}
              r={activo ? 7 : 4.5}
              className={activo ? 'fill-falla' : 'fill-marca'}
            />
            <text
              x={x(punto.offset)}
              y={y(punto.cota) - 12}
              textAnchor="middle"
              className="fill-slate-500 text-[9px]"
            >
              {punto.elementoClave}
            </text>
            <circle
              cx={x(punto.offset)}
              cy={y(punto.cota)}
              r={14}
              fill="transparent"
              role="button"
              tabIndex={0}
              data-activo={activo}
              aria-label={`${formatearProgresiva(punto.progresiva)} ${punto.elementoClave} · cota ${punto.cota.toFixed(3)}`}
              onClick={() => seleccionar(punto.clave)}
              onKeyDown={(evento) => {
                if (evento.key === 'Enter' || evento.key === ' ') seleccionar(punto.clave)
              }}
              className="cursor-pointer outline-none"
            >
              <title>
                {punto.elementoClave} · offset {punto.offset.toFixed(2)} m · cota{' '}
                {punto.cota.toFixed(3)} m
              </title>
            </circle>
          </g>
        )
      })}
    </svg>
  )
}
```

- [ ] **Paso 5: Añadirlo a la libreta**

En `VistaLibreta.tsx`, debajo de `<BarraCierre />`, agrega una sección con el deslizador y el corte, alimentada por la progresiva seleccionada:

```tsx
const progresivas = useMemo(() => [...new Set(celdas.map((c) => c.progresiva))].sort((a, b) => a - b), [celdas])
const progresivaActiva = useAlmacen((s) => s.seleccion.progresiva) ?? progresivas[0] ?? 0
const irAProgresiva = useAlmacen((s) => s.irAProgresiva)

// ...

<section className="flex flex-col gap-2">
  <h3 className="font-semibold">Corte transversal</h3>
  <CorteTransversal progresiva={progresivaActiva} />
  <DeslizadorProgresiva progresivas={progresivas} valor={progresivaActiva} alCambiar={irAProgresiva} />
</section>
```

- [ ] **Paso 6: Añadir el manejo de flechas del teclado**

En `VistaLibreta.tsx`, dentro del componente:

```tsx
useEffect(() => {
  function alPresionar(evento: KeyboardEvent) {
    const enCampo = evento.target instanceof HTMLInputElement || evento.target instanceof HTMLSelectElement
    if (enCampo) return

    const indice = progresivas.indexOf(progresivaActiva)
    if (evento.key === 'ArrowRight' && indice < progresivas.length - 1) {
      irAProgresiva(progresivas[indice + 1]!)
    }
    if (evento.key === 'ArrowLeft' && indice > 0) {
      irAProgresiva(progresivas[indice - 1]!)
    }
  }

  window.addEventListener('keydown', alPresionar)
  return () => window.removeEventListener('keydown', alPresionar)
}, [progresivas, progresivaActiva, irAProgresiva])
```

- [ ] **Paso 7: Ejecutar las pruebas y verificar que pasan**

Ejecuta: `npm test --workspace packages/app`
Esperado: todas en verde.

- [ ] **Paso 8: Verificar a mano**

Ejecuta `npm run dev`. Arrastra el deslizador: el corte se redibuja. Pulsa ← y →: avanza de progresiva en progresiva. Clic en un punto: se pone rojo.

- [ ] **Paso 9: Commit**

```bash
git add -A
git commit -m "Corte transversal interactivo con deslizador de progresivas"
```

---

### Tarea 17: Tabla de resultados y perfil longitudinal

**Archivos:**
- Crear: `packages/app/src/componentes/TablaResultados.tsx`
- Crear: `packages/app/src/componentes/PerfilLongitudinal.tsx`
- Crear: `packages/app/src/vistas/VistaResultados.tsx`
- Modificar: `packages/app/src/App.tsx`
- Test: `packages/app/src/componentes/TablaResultados.test.tsx`
- Test: `packages/app/src/componentes/PerfilLongitudinal.test.tsx`

**Interfaces:**
- Consume: `useResultado`, `useContexto`, escalas de la Tarea 15.
- Produce:
  - `TablaResultados()` — grilla completa de cotas compensadas, con la celda seleccionada resaltada.
  - `PerfilLongitudinal({ elementoClave })`.
  - `VistaResultados()`.

- [ ] **Paso 1: Escribir las pruebas que fallan**

`packages/app/src/componentes/TablaResultados.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { useAlmacen } from '../estado/almacen'
import { proyectoEjemplo } from '../estado/ejemplo'
import TablaResultados from './TablaResultados'

describe('TablaResultados', () => {
  beforeEach(() => {
    useAlmacen.getState().cargarProyecto(proyectoEjemplo())
  })

  it('muestra las cotas compensadas con tres decimales', () => {
    render(<TablaResultados />)
    expect(screen.getByText('3244.628')).toBeInTheDocument()
    expect(screen.getByText('3244.620')).toBeInTheDocument()
  })

  it('deja vacías las celdas sin medir', () => {
    render(<TablaResultados />)
    expect(screen.getByLabelText('0+040 EJE').textContent).toBe('—')
  })

  it('selecciona la celda al hacer clic', async () => {
    const usuario = userEvent.setup()
    render(<TablaResultados />)
    await usuario.click(screen.getByLabelText('0+020 EJE'))
    expect(useAlmacen.getState().seleccion.clave).toBe('20|EJE')
    expect(useAlmacen.getState().seleccion.progresiva).toBe(20)
  })
})
```

`packages/app/src/componentes/PerfilLongitudinal.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useAlmacen } from '../estado/almacen'
import { proyectoEjemplo } from '../estado/ejemplo'
import PerfilLongitudinal from './PerfilLongitudinal'

describe('PerfilLongitudinal', () => {
  beforeEach(() => {
    useAlmacen.getState().cargarProyecto(proyectoEjemplo())
  })

  it('dibuja un punto por progresiva medida del elemento', () => {
    render(<PerfilLongitudinal elementoClave="EJE" />)
    expect(screen.getAllByRole('button', { name: /cota/ })).toHaveLength(2)
  })

  it('avisa cuando el elemento no tiene lecturas', () => {
    render(<PerfilLongitudinal elementoClave="VER-D" />)
    expect(screen.getByText(/no tiene lecturas/i)).toBeInTheDocument()
  })
})
```

- [ ] **Paso 2: Ejecutar las pruebas y verificar que fallan**

Ejecuta: `npm test --workspace packages/app`
Esperado: FALLAN por módulos no encontrados.

- [ ] **Paso 3: Escribir la tabla**

`packages/app/src/componentes/TablaResultados.tsx`:

```tsx
import { construirGrilla, formatearProgresiva } from '@topo/core'
import { useMemo } from 'react'
import { useAlmacen } from '../estado/almacen'
import { useContexto, useResultado } from '../estado/derivados'

export default function TablaResultados() {
  const contexto = useContexto()
  const resultado = useResultado()
  const seleccion = useAlmacen((s) => s.seleccion)
  const seleccionar = useAlmacen((s) => s.seleccionar)

  const celdas = useMemo(
    () => (contexto ? construirGrilla(contexto.calle, contexto.plantilla) : []),
    [contexto],
  )

  const { progresivas, elementos } = useMemo(() => {
    const progresivas = [...new Set(celdas.map((c) => c.progresiva))].sort((a, b) => a - b)
    const vistos = new Map<string, number>()
    for (const celda of celdas) if (!vistos.has(celda.elementoClave)) vistos.set(celda.elementoClave, celda.offset)
    const elementos = [...vistos.entries()].sort((a, b) => a[1] - b[1]).map(([clave]) => clave)
    return { progresivas, elementos }
  }, [celdas])

  if (!resultado || !contexto) return null

  return (
    <div className="overflow-auto rounded border border-slate-200 dark:border-slate-800">
      <table className="w-full border-collapse text-sm">
        <thead className="sticky top-0 bg-slate-50 dark:bg-slate-900">
          <tr>
            <th className="px-3 py-2 text-left font-medium text-slate-500">Progresiva</th>
            {elementos.map((clave) => (
              <th key={clave} className="px-3 py-2 text-right font-medium text-slate-500">
                {clave}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {progresivas.map((progresiva) => (
            <tr key={progresiva} className="border-t border-slate-100 dark:border-slate-800">
              <td className="numerico px-3 py-1.5 text-slate-600 dark:text-slate-300">
                {formatearProgresiva(progresiva)}
              </td>
              {elementos.map((elementoClave) => {
                const clave = `${progresiva}|${elementoClave}`
                const celda = resultado.cotasPorCelda.get(clave)
                const activa = seleccion.clave === clave
                return (
                  <td key={clave} className="p-0.5">
                    <button
                      type="button"
                      aria-label={`${formatearProgresiva(progresiva)} ${elementoClave}`}
                      onClick={() => seleccionar(clave)}
                      className={`numerico w-full rounded px-2 py-1 text-right ${
                        activa
                          ? 'bg-marca text-white'
                          : celda
                            ? 'hover:bg-slate-100 dark:hover:bg-slate-800'
                            : 'text-slate-300 dark:text-slate-700'
                      }`}
                    >
                      {celda ? celda.cota.toFixed(3) : '—'}
                    </button>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Paso 4: Escribir el perfil longitudinal**

`packages/app/src/componentes/PerfilLongitudinal.tsx`:

```tsx
import { formatearProgresiva } from '@topo/core'
import { useMemo } from 'react'
import { useAlmacen } from '../estado/almacen'
import { useResultado } from '../estado/derivados'
import { escalaLineal, extension, marcas } from '../grafico/escala'

const ANCHO = 720
const ALTO = 240
const MARGEN = { arriba: 16, derecha: 16, abajo: 34, izquierda: 62 }

interface Props {
  elementoClave: string
}

export default function PerfilLongitudinal({ elementoClave }: Props) {
  const resultado = useResultado()
  const seleccion = useAlmacen((s) => s.seleccion)
  const seleccionar = useAlmacen((s) => s.seleccionar)

  const puntos = useMemo(() => {
    if (!resultado) return []
    return [...resultado.cotasPorCelda.values()]
      .filter((celda) => celda.elementoClave === elementoClave)
      .sort((a, b) => a.progresiva - b.progresiva)
  }, [resultado, elementoClave])

  if (puntos.length === 0) {
    return (
      <p className="rounded border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500 dark:border-slate-700">
        {elementoClave} no tiene lecturas todavía.
      </p>
    )
  }

  const dominioX = extension(puntos.map((p) => p.progresiva), 0.05)
  const dominioY = extension(puntos.map((p) => p.cota), 0.25)
  const x = escalaLineal(dominioX, [MARGEN.izquierda, ANCHO - MARGEN.derecha])
  const y = escalaLineal(dominioY, [ALTO - MARGEN.abajo, MARGEN.arriba])

  const trazo = puntos.map((p) => `${x(p.progresiva).toFixed(1)},${y(p.cota).toFixed(1)}`).join(' ')

  return (
    <svg
      viewBox={`0 0 ${ANCHO} ${ALTO}`}
      role="img"
      aria-label={`Perfil longitudinal de ${elementoClave}`}
      className="w-full rounded border border-slate-200 dark:border-slate-800"
    >
      {marcas(dominioY, 4).map((cota) => (
        <g key={`y-${cota}`}>
          <line
            x1={MARGEN.izquierda}
            x2={ANCHO - MARGEN.derecha}
            y1={y(cota)}
            y2={y(cota)}
            className="stroke-slate-200 dark:stroke-slate-800"
          />
          <text
            x={MARGEN.izquierda - 6}
            y={y(cota) + 4}
            textAnchor="end"
            className="fill-slate-500 text-[10px]"
            style={{ fontVariantNumeric: 'tabular-nums' }}
          >
            {cota.toFixed(3)}
          </text>
        </g>
      ))}

      {marcas(dominioX, 6).map((progresiva) => (
        <text
          key={`x-${progresiva}`}
          x={x(progresiva)}
          y={ALTO - MARGEN.abajo + 16}
          textAnchor="middle"
          className="fill-slate-500 text-[10px]"
        >
          {formatearProgresiva(progresiva)}
        </text>
      ))}

      <polyline points={trazo} fill="none" className="stroke-marca" strokeWidth={2} />

      {puntos.map((punto) => {
        const activo = seleccion.clave === punto.clave
        return (
          <circle
            key={punto.clave}
            cx={x(punto.progresiva)}
            cy={y(punto.cota)}
            r={activo ? 7 : 4.5}
            role="button"
            tabIndex={0}
            data-activo={activo}
            aria-label={`${formatearProgresiva(punto.progresiva)} ${punto.elementoClave} · cota ${punto.cota.toFixed(3)}`}
            onClick={() => seleccionar(punto.clave)}
            onKeyDown={(evento) => {
              if (evento.key === 'Enter' || evento.key === ' ') seleccionar(punto.clave)
            }}
            className={`cursor-pointer outline-none ${activo ? 'fill-falla' : 'fill-marca'}`}
          />
        )
      })}
    </svg>
  )
}
```

- [ ] **Paso 5: Escribir la vista de resultados**

`packages/app/src/vistas/VistaResultados.tsx`:

```tsx
import { useMemo, useState } from 'react'
import CorteTransversal from '../componentes/CorteTransversal'
import DeslizadorProgresiva from '../componentes/DeslizadorProgresiva'
import PerfilLongitudinal from '../componentes/PerfilLongitudinal'
import TablaResultados from '../componentes/TablaResultados'
import { useAlmacen } from '../estado/almacen'
import { useContexto, useResultado } from '../estado/derivados'

export default function VistaResultados() {
  const contexto = useContexto()
  const resultado = useResultado()
  const seleccion = useAlmacen((s) => s.seleccion)
  const irAProgresiva = useAlmacen((s) => s.irAProgresiva)
  const [elementoPerfil, setElementoPerfil] = useState('EJE')

  const progresivas = useMemo(() => {
    if (!resultado) return []
    return [...new Set([...resultado.cotasPorCelda.values()].map((c) => c.progresiva))].sort(
      (a, b) => a - b,
    )
  }, [resultado])

  if (!contexto || !resultado) {
    return <p className="p-6 text-sm text-slate-500">No hay una campaña abierta.</p>
  }

  const progresivaActiva = seleccion.progresiva ?? progresivas[0] ?? 0

  return (
    <div className="flex flex-col gap-6 p-4">
      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Cotas compensadas</h2>
        <TablaResultados />
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Corte transversal</h2>
        <CorteTransversal progresiva={progresivaActiva} />
        <DeslizadorProgresiva progresivas={progresivas} valor={progresivaActiva} alCambiar={irAProgresiva} />
      </section>

      <section className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold">Perfil longitudinal</h2>
          <select
            aria-label="Elemento del perfil"
            value={elementoPerfil}
            onChange={(evento) => setElementoPerfil(evento.target.value)}
            className="rounded border border-slate-300 px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-900"
          >
            {contexto.plantilla.elementos.map((elemento) => (
              <option key={elemento.clave} value={elemento.clave}>
                {elemento.etiqueta}
              </option>
            ))}
          </select>
        </div>
        <PerfilLongitudinal elementoClave={elementoPerfil} />
      </section>
    </div>
  )
}
```

- [ ] **Paso 6: Conectar en `App.tsx`**

```tsx
{vista === 'resultados' && <VistaResultados />}
```

- [ ] **Paso 7: Ejecutar las pruebas y verificar que pasan**

Ejecuta: `npm test --workspace packages/app`
Esperado: todas en verde.

- [ ] **Paso 8: Commit**

```bash
git add -A
git commit -m "Tabla de resultados y perfil longitudinal interactivos"
```

---

### Tarea 18: Archivo `.topo` y autoguardado

**Archivos:**
- Crear: `packages/app/src/archivo/topo.ts`
- Crear: `packages/app/src/archivo/autoguardado.ts`
- Crear: `packages/app/src/componentes/BarraArchivo.tsx`
- Modificar: `packages/app/src/componentes/BarraSuperior.tsx`
- Modificar: `packages/app/src/App.tsx`
- Test: `packages/app/src/archivo/topo.test.ts`

**Interfaces:**
- Consume: `Proyecto` de `@topo/core`, `fflate`, `idb-keyval`.
- Produce:
  - `empaquetarProyecto(proyecto: Proyecto): Uint8Array` — ZIP con `proyecto.json`.
  - `desempaquetarProyecto(datos: Uint8Array): Proyecto` — lanza `Error` con mensaje en español si está dañado.
  - `descargarTopo(proyecto: Proyecto): void`.
  - `abrirTopo(archivo: File): Promise<Proyecto>`.
  - `guardarBorrador(proyecto: Proyecto): Promise<void>` · `leerBorrador(): Promise<{ proyecto: Proyecto; guardado: string } | null>` · `borrarBorrador(): Promise<void>`.

- [ ] **Paso 1: Escribir la prueba que falla**

`packages/app/src/archivo/topo.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { proyectoEjemplo } from '../estado/ejemplo'
import { desempaquetarProyecto, empaquetarProyecto } from './topo'

describe('archivo .topo', () => {
  it('empaqueta y desempaqueta sin perder datos', () => {
    const original = proyectoEjemplo()
    const recuperado = desempaquetarProyecto(empaquetarProyecto(original))
    expect(recuperado).toEqual(original)
  })

  it('conserva las lecturas crudas exactas', () => {
    const recuperado = desempaquetarProyecto(empaquetarProyecto(proyectoEjemplo()))
    expect(recuperado.campanias[0]!.estaciones[0]!.intermedias[0]!.valor).toBe(1.98)
  })

  it('avisa en cristiano si el archivo está dañado', () => {
    expect(() => desempaquetarProyecto(new Uint8Array([1, 2, 3]))).toThrow(
      'No se pudo leer el archivo .topo: parece estar dañado o no ser un archivo de la app.',
    )
  })

  it('avisa si el archivo trae una versión que no conoce', () => {
    const proyecto = { ...proyectoEjemplo(), version: 99 } as never
    const datos = empaquetarProyecto(proyecto)
    expect(() => desempaquetarProyecto(datos)).toThrow(
      'Este archivo fue creado con una versión más nueva de la app.',
    )
  })
})
```

- [ ] **Paso 2: Ejecutar la prueba y verificar que falla**

Ejecuta: `npm test --workspace packages/app`
Esperado: FALLA por no encontrar `./topo`.

- [ ] **Paso 3: Escribir el formato de archivo**

`packages/app/src/archivo/topo.ts`:

```ts
import type { Proyecto } from '@topo/core'
import { unzipSync, zipSync } from 'fflate'

const NOMBRE_INTERNO = 'proyecto.json'
const VERSION_SOPORTADA = 1

export function empaquetarProyecto(proyecto: Proyecto): Uint8Array {
  const json = new TextEncoder().encode(JSON.stringify(proyecto, null, 2))
  return zipSync({ [NOMBRE_INTERNO]: json }, { level: 6 })
}

export function desempaquetarProyecto(datos: Uint8Array): Proyecto {
  let contenido: Record<string, Uint8Array>
  try {
    contenido = unzipSync(datos)
  } catch {
    throw new Error(
      'No se pudo leer el archivo .topo: parece estar dañado o no ser un archivo de la app.',
    )
  }

  const json = contenido[NOMBRE_INTERNO]
  if (!json) {
    throw new Error(
      'No se pudo leer el archivo .topo: parece estar dañado o no ser un archivo de la app.',
    )
  }

  let proyecto: Proyecto
  try {
    proyecto = JSON.parse(new TextDecoder().decode(json)) as Proyecto
  } catch {
    throw new Error('El archivo .topo está dañado: los datos del proyecto no se entienden.')
  }

  if (proyecto.version > VERSION_SOPORTADA) {
    throw new Error('Este archivo fue creado con una versión más nueva de la app.')
  }

  return proyecto
}

export function descargarTopo(proyecto: Proyecto): void {
  const datos = empaquetarProyecto(proyecto)
  const enlace = document.createElement('a')
  const url = URL.createObjectURL(new Blob([datos], { type: 'application/zip' }))

  enlace.href = url
  enlace.download = `${proyecto.meta.nombre.replace(/[^\w\s-]/g, '').trim() || 'proyecto'}.topo`
  enlace.click()
  URL.revokeObjectURL(url)
}

export async function abrirTopo(archivo: File): Promise<Proyecto> {
  const datos = new Uint8Array(await archivo.arrayBuffer())
  return desempaquetarProyecto(datos)
}
```

- [ ] **Paso 4: Escribir el autoguardado**

`packages/app/src/archivo/autoguardado.ts`:

```ts
import type { Proyecto } from '@topo/core'
import { del, get, set } from 'idb-keyval'

const CLAVE = 'topo:borrador'

interface Borrador {
  proyecto: Proyecto
  guardado: string
}

export async function guardarBorrador(proyecto: Proyecto): Promise<void> {
  await set(CLAVE, { proyecto, guardado: new Date().toISOString() } satisfies Borrador)
}

export async function leerBorrador(): Promise<Borrador | null> {
  return (await get<Borrador>(CLAVE)) ?? null
}

export async function borrarBorrador(): Promise<void> {
  await del(CLAVE)
}

/** Cuenta lecturas para el mensaje de recuperación. */
export function contarLecturas(proyecto: Proyecto): number {
  return proyecto.campanias.reduce(
    (total, campania) =>
      total +
      campania.estaciones.reduce(
        (suma, estacion) =>
          suma + estacion.intermedias.length + 1 + (estacion.vistaAdelante ? 1 : 0),
        0,
      ),
    0,
  )
}
```

- [ ] **Paso 5: Escribir la barra de archivo**

`packages/app/src/componentes/BarraArchivo.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react'
import { guardarBorrador } from '../archivo/autoguardado'
import { abrirTopo, descargarTopo } from '../archivo/topo'
import { useAlmacen } from '../estado/almacen'

export default function BarraArchivo() {
  const proyecto = useAlmacen((s) => s.proyecto)
  const cargarProyecto = useAlmacen((s) => s.cargarProyecto)
  const nuevoProyecto = useAlmacen((s) => s.nuevoProyecto)
  const entradaArchivo = useRef<HTMLInputElement>(null)
  const [mensaje, setMensaje] = useState<string | null>(null)

  // Autoguardado: cada cambio del proyecto se guarda, como mucho una vez por segundo.
  useEffect(() => {
    const temporizador = window.setTimeout(() => {
      void guardarBorrador(proyecto)
    }, 1000)
    return () => window.clearTimeout(temporizador)
  }, [proyecto])

  async function abrir(archivo: File) {
    try {
      cargarProyecto(await abrirTopo(archivo))
      setMensaje(null)
    } catch (fallo) {
      setMensaje((fallo as Error).message)
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button type="button" onClick={nuevoProyecto} className="rounded px-2 py-1 text-sm hover:bg-slate-100 dark:hover:bg-slate-800">
        Nuevo
      </button>
      <button
        type="button"
        onClick={() => entradaArchivo.current?.click()}
        className="rounded px-2 py-1 text-sm hover:bg-slate-100 dark:hover:bg-slate-800"
      >
        Abrir
      </button>
      <button
        type="button"
        onClick={() => descargarTopo(proyecto)}
        className="rounded px-2 py-1 text-sm hover:bg-slate-100 dark:hover:bg-slate-800"
      >
        Guardar
      </button>
      <input
        ref={entradaArchivo}
        type="file"
        accept=".topo,application/zip"
        aria-label="Abrir archivo .topo"
        className="hidden"
        onChange={(evento) => {
          const archivo = evento.target.files?.[0]
          if (archivo) void abrir(archivo)
        }}
      />
      {mensaje && <span className="text-xs text-falla">{mensaje}</span>}
    </div>
  )
}
```

- [ ] **Paso 6: Ofrecer la recuperación al arrancar**

En `App.tsx`, antes de renderizar las vistas:

```tsx
const [borrador, setBorrador] = useState<{ proyecto: Proyecto; guardado: string } | null>(null)
const cargarProyecto = useAlmacen((s) => s.cargarProyecto)

useEffect(() => {
  void leerBorrador().then(setBorrador)
}, [])

// ...

{borrador && (
  <div className="flex items-center gap-3 border-b border-aviso bg-aviso/10 px-4 py-2 text-sm">
    <span>
      Recuperé tu trabajo del{' '}
      {new Date(borrador.guardado).toLocaleString('es-PE', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })}{' '}
      — {borrador.proyecto.meta.nombre}, {contarLecturas(borrador.proyecto)} lecturas.
    </span>
    <button
      type="button"
      onClick={() => {
        cargarProyecto(borrador.proyecto)
        setBorrador(null)
      }}
      className="rounded bg-marca px-2 py-1 text-white"
    >
      Recuperar
    </button>
    <button type="button" onClick={() => { void borrarBorrador(); setBorrador(null) }} className="rounded px-2 py-1">
      Descartar
    </button>
  </div>
)}
```

Añade `<BarraArchivo />` a la derecha de `BarraSuperior` (dentro del `<header>`, con `className="ml-auto"`).

- [ ] **Paso 7: Ejecutar las pruebas y verificar que pasan**

Ejecuta: `npm test --workspace packages/app`
Esperado: todas en verde.

- [ ] **Paso 8: Verificar a mano**

Ejecuta `npm run dev`. Guarda, recarga la página, comprueba que aparece la barra de recuperación. Abre el `.topo` descargado y verifica que las cotas coinciden.

- [ ] **Paso 9: Commit**

```bash
git add -A
git commit -m "Archivo .topo portable y autoguardado con recuperación"
```

---

### Tarea 19: Exportar a Excel, CSV y portapapeles

**Archivos:**
- Crear: `packages/app/src/archivo/exportar.ts`
- Modificar: `packages/app/src/vistas/VistaResultados.tsx`
- Test: `packages/app/src/archivo/exportar.test.ts`
- Modificar: `packages/app/package.json` (agrega `xlsx`)

**Interfaces:**
- Consume: `ResultadoCampania`, `Calle`, `Plantilla` de `@topo/core`.
- Produce:
  - `armarTabla(resultado, calle, plantilla): string[][]` — encabezado más una fila por progresiva.
  - `aTextoSeparado(tabla: string[][], separador: string): string`.
  - `copiarAlPortapapeles(tabla: string[][]): Promise<void>` — TSV, listo para pegar en Excel.
  - `descargarCsv(tabla: string[][], nombre: string): void`.
  - `descargarXlsx(tabla: string[][], nombre: string): Promise<void>` — carga SheetJS solo al usarse.

- [ ] **Paso 1: Agregar la dependencia**

En `packages/app/package.json`, dentro de `dependencies`: `"xlsx": "^0.18.5"`. Luego `npm install`.

- [ ] **Paso 2: Escribir la prueba que falla**

`packages/app/src/archivo/exportar.test.ts`:

```ts
import { calcularCampania } from '@topo/core'
import { describe, expect, it } from 'vitest'
import { proyectoEjemplo } from '../estado/ejemplo'
import { aTextoSeparado, armarTabla } from './exportar'

function resultadoEjemplo() {
  const proyecto = proyectoEjemplo()
  const campania = proyecto.campanias[0]!
  const calle = proyecto.calles[0]!
  const plantilla = proyecto.plantillas[0]!
  return {
    resultado: calcularCampania({ campania, calle, plantilla, bms: proyecto.bms }),
    calle,
    plantilla,
  }
}

describe('armarTabla', () => {
  it('pone las progresivas en la primera columna y los elementos en el encabezado', () => {
    const { resultado, calle, plantilla } = resultadoEjemplo()
    const tabla = armarTabla(resultado, calle, plantilla)

    expect(tabla[0]).toEqual(['Progresiva', 'VER-I', 'SAR-I', 'BOR-I', 'EJE', 'BOR-D', 'SAR-D', 'VER-D'])
    expect(tabla[1]![0]).toBe('0+000')
  })

  it('escribe las cotas con tres decimales', () => {
    const { resultado, calle, plantilla } = resultadoEjemplo()
    const tabla = armarTabla(resultado, calle, plantilla)
    const fila = tabla.find((f) => f[0] === '0+000')!
    expect(fila[4]).toBe('3244.628')
  })

  it('deja vacías las celdas sin medir', () => {
    const { resultado, calle, plantilla } = resultadoEjemplo()
    const tabla = armarTabla(resultado, calle, plantilla)
    const fila = tabla.find((f) => f[0] === '0+040')!
    expect(fila[4]).toBe('')
  })

  it('incluye una fila por cada progresiva de la calle', () => {
    const { resultado, calle, plantilla } = resultadoEjemplo()
    expect(armarTabla(resultado, calle, plantilla)).toHaveLength(11)
  })
})

describe('aTextoSeparado', () => {
  it('une con tabulaciones para pegar en Excel', () => {
    expect(aTextoSeparado([['a', 'b'], ['1', '2']], '\t')).toBe('a\tb\n1\t2')
  })

  it('entrecomilla los valores que contienen el separador', () => {
    expect(aTextoSeparado([['a;b', 'c']], ';')).toBe('"a;b";c')
  })
})
```

- [ ] **Paso 3: Ejecutar la prueba y verificar que falla**

Ejecuta: `npm test --workspace packages/app`
Esperado: FALLA por no encontrar `./exportar`.

- [ ] **Paso 4: Escribir la implementación**

`packages/app/src/archivo/exportar.ts`:

```ts
import {
  construirGrilla,
  formatearProgresiva,
  type Calle,
  type Plantilla,
  type ResultadoCampania,
} from '@topo/core'

export function armarTabla(
  resultado: ResultadoCampania,
  calle: Calle,
  plantilla: Plantilla,
): string[][] {
  const celdas = construirGrilla(calle, plantilla)
  const progresivas = [...new Set(celdas.map((c) => c.progresiva))].sort((a, b) => a - b)

  const vistos = new Map<string, number>()
  for (const celda of celdas) if (!vistos.has(celda.elementoClave)) vistos.set(celda.elementoClave, celda.offset)
  const elementos = [...vistos.entries()].sort((a, b) => a[1] - b[1]).map(([clave]) => clave)

  const filas: string[][] = [['Progresiva', ...elementos]]

  for (const progresiva of progresivas) {
    filas.push([
      formatearProgresiva(progresiva),
      ...elementos.map((elementoClave) => {
        const celda = resultado.cotasPorCelda.get(`${progresiva}|${elementoClave}`)
        return celda ? celda.cota.toFixed(3) : ''
      }),
    ])
  }

  return filas
}

export function aTextoSeparado(tabla: string[][], separador: string): string {
  return tabla
    .map((fila) =>
      fila
        .map((valor) =>
          valor.includes(separador) || valor.includes('"') || valor.includes('\n')
            ? `"${valor.replace(/"/g, '""')}"`
            : valor,
        )
        .join(separador),
    )
    .join('\n')
}

export async function copiarAlPortapapeles(tabla: string[][]): Promise<void> {
  await navigator.clipboard.writeText(aTextoSeparado(tabla, '\t'))
}

export function descargarCsv(tabla: string[][], nombre: string): void {
  // El BOM hace que Excel en Windows abra el archivo con acentos correctos.
  const contenido = `﻿${aTextoSeparado(tabla, ';')}`
  const url = URL.createObjectURL(new Blob([contenido], { type: 'text/csv;charset=utf-8' }))
  const enlace = document.createElement('a')

  enlace.href = url
  enlace.download = `${nombre}.csv`
  enlace.click()
  URL.revokeObjectURL(url)
}

/** SheetJS pesa; se carga solo cuando el usuario exporta de verdad. */
export async function descargarXlsx(tabla: string[][], nombre: string): Promise<void> {
  const XLSX = await import('xlsx')
  const hoja = XLSX.utils.aoa_to_sheet(tabla)
  const libro = XLSX.utils.book_new()

  XLSX.utils.book_append_sheet(libro, hoja, 'Cotas')
  XLSX.writeFile(libro, `${nombre}.xlsx`)
}
```

- [ ] **Paso 5: Añadir los botones a la vista de resultados**

En `VistaResultados.tsx`, encima de la tabla:

```tsx
const tabla = useMemo(
  () => (resultado && contexto ? armarTabla(resultado, contexto.calle, contexto.plantilla) : []),
  [resultado, contexto],
)
const [copiado, setCopiado] = useState(false)
const nombreArchivo = `${contexto?.calle.nombre ?? 'cotas'} — ${contexto?.capa?.nombre ?? ''}`.trim()

// ...

<div className="flex gap-2">
  <button
    type="button"
    onClick={() => void descargarXlsx(tabla, nombreArchivo)}
    className="rounded bg-marca px-3 py-1.5 text-sm font-medium text-white"
  >
    Exportar a Excel
  </button>
  <button
    type="button"
    onClick={() => descargarCsv(tabla, nombreArchivo)}
    className="rounded border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-700"
  >
    Exportar a CSV
  </button>
  <button
    type="button"
    onClick={() => {
      void copiarAlPortapapeles(tabla).then(() => {
        setCopiado(true)
        window.setTimeout(() => setCopiado(false), 2000)
      })
    }}
    className="rounded border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-700"
  >
    {copiado ? 'Copiado ✓' : 'Copiar tabla'}
  </button>
</div>
```

- [ ] **Paso 6: Ejecutar las pruebas y verificar que pasan**

Ejecuta: `npm test --workspace packages/app`
Esperado: todas en verde.

- [ ] **Paso 7: Verificar a mano**

Ejecuta `npm run dev`, exporta a Excel y abre el archivo. Las cotas deben verse con 3 decimales y las columnas en el orden de la plantilla.

- [ ] **Paso 8: Commit**

```bash
git add -A
git commit -m "Exportación a Excel, CSV y portapapeles"
```

---

### Tarea 20: Modo claro y oscuro

**Archivos:**
- Crear: `packages/app/src/componentes/BotonTema.tsx`
- Modificar: `packages/app/src/componentes/BarraSuperior.tsx`
- Modificar: `packages/app/src/estilos.css`
- Test: `packages/app/src/componentes/BotonTema.test.tsx`

**Interfaces:**
- Consume: nada del almacén; guarda la preferencia en `localStorage` bajo `topo:tema`.
- Produce: `BotonTema()` — alterna entre `claro`, `oscuro` y `sistema`.

- [ ] **Paso 1: Escribir la prueba que falla**

`packages/app/src/componentes/BotonTema.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import BotonTema from './BotonTema'

describe('BotonTema', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.classList.remove('dark')
  })

  it('arranca siguiendo al sistema', () => {
    render(<BotonTema />)
    expect(screen.getByRole('button', { name: /tema/i })).toHaveTextContent('Sistema')
  })

  it('pasa a oscuro y aplica la clase al documento', async () => {
    const usuario = userEvent.setup()
    render(<BotonTema />)
    await usuario.click(screen.getByRole('button', { name: /tema/i }))
    expect(document.documentElement).toHaveClass('dark')
    expect(localStorage.getItem('topo:tema')).toBe('oscuro')
  })

  it('vuelve a claro en el tercer clic', async () => {
    const usuario = userEvent.setup()
    render(<BotonTema />)
    const boton = screen.getByRole('button', { name: /tema/i })
    await usuario.click(boton)
    await usuario.click(boton)
    expect(document.documentElement).not.toHaveClass('dark')
    expect(localStorage.getItem('topo:tema')).toBe('claro')
  })
})
```

- [ ] **Paso 2: Ejecutar la prueba y verificar que falla**

Ejecuta: `npm test --workspace packages/app`
Esperado: FALLA por no encontrar `./BotonTema`.

- [ ] **Paso 3: Escribir el componente**

`packages/app/src/componentes/BotonTema.tsx`:

```tsx
import { useEffect, useState } from 'react'

type Tema = 'sistema' | 'oscuro' | 'claro'

const CLAVE = 'topo:tema'
const SIGUIENTE: Record<Tema, Tema> = { sistema: 'oscuro', oscuro: 'claro', claro: 'sistema' }
const TEXTO: Record<Tema, string> = { sistema: 'Sistema', oscuro: 'Oscuro', claro: 'Claro' }

function aplicar(tema: Tema): void {
  const oscuroDelSistema = window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false
  const oscuro = tema === 'oscuro' || (tema === 'sistema' && oscuroDelSistema)
  document.documentElement.classList.toggle('dark', oscuro)
}

export default function BotonTema() {
  const [tema, setTema] = useState<Tema>(() => (localStorage.getItem(CLAVE) as Tema) ?? 'sistema')

  useEffect(() => {
    aplicar(tema)
    if (tema === 'sistema') localStorage.removeItem(CLAVE)
    else localStorage.setItem(CLAVE, tema)
  }, [tema])

  return (
    <button
      type="button"
      aria-label="Cambiar tema"
      onClick={() => setTema(SIGUIENTE[tema])}
      className="rounded px-2 py-1 text-sm hover:bg-slate-100 dark:hover:bg-slate-800"
    >
      {TEXTO[tema]}
    </button>
  )
}
```

- [ ] **Paso 4: Activar el modo oscuro por clase en Tailwind v4**

Añade al principio de `estilos.css`, después del `@import`:

```css
@custom-variant dark (&:where(.dark, .dark *));
```

Y coloca `<BotonTema />` dentro del `<header>` de `BarraSuperior`, junto a `BarraArchivo`.

- [ ] **Paso 5: Ejecutar las pruebas y verificar que pasan**

Ejecuta: `npm test --workspace packages/app`
Esperado: todas en verde.

- [ ] **Paso 6: Commit**

```bash
git add -A
git commit -m "Modo claro, oscuro y automático según el sistema"
```

---

### Tarea 21: Cierre de la Entrega 1 — verificación completa y documentación

**Archivos:**
- Modificar: `README.md`
- Crear: `docs/uso-entrega-1.md`

- [ ] **Paso 1: Ejecutar toda la batería de pruebas**

Ejecuta: `npm test`
Esperado: motor y aplicación, todo en verde. Anota el total de pruebas.

- [ ] **Paso 2: Verificar tipos en los dos paquetes**

Ejecuta: `npm run typecheck --workspaces --if-present`
Esperado: sin errores.

- [ ] **Paso 3: Verificar que la aplicación compila para producción**

Ejecuta: `npm run build --workspace packages/app`
Esperado: build exitoso. Anota el tamaño del paquete generado.

- [ ] **Paso 4: Recorrido manual completo**

Con `npm run dev`, verifica una por una:

1. Proyecto → cambiar la cota de BM-1 → las cotas de la tabla se mueven solas.
2. Plantilla → quitar VER-D → la grilla y la tabla pierden esa columna.
3. Calle → cambiar el intervalo a 10 → la grilla pasa a 133 celdas.
4. Libreta → escribir una lectura y Enter → celda ✓, contador sube, salta a la siguiente.
5. Libreta → cambiar la vista adelante a 1.887 → la barra de cierre se pone roja y aparece el aviso.
6. Resultados → clic en una celda → el corte salta a esa progresiva y marca el punto.
7. Deslizador → arrastrar y pulsar ← → → el corte se redibuja.
8. Exportar a Excel → abrir el archivo → cotas con 3 decimales.
9. Campañas → Nueva campaña → la libreta abre vacía y la campaña anterior conserva sus 3 lecturas.
10. Campañas → volver a abrir la campaña del 19/08 → sus cotas siguen ahí.
11. Guardar `.topo` → Nuevo → Abrir el archivo → todo vuelve igual.
12. Recargar la página sin guardar → aparece la barra de recuperación.

- [ ] **Paso 5: Escribir la guía de uso**

`docs/uso-entrega-1.md`, con: cómo arrancar la app (`npm install`, `npm run dev`), el orden de trabajo (proyecto → plantilla → calle → libreta → resultados), qué significa cada color de la barra de cierre, y qué hacer cuando el cierre no pasa.

- [ ] **Paso 6: Actualizar el README**

Cambia el estado a «Entrega 1 funcionando», añade la sección de cómo ejecutar y enlaza `docs/uso-entrega-1.md`.

- [ ] **Paso 7: Commit**

```bash
git add -A
git commit -m "Cierre de la Entrega 1: verificación completa y guía de uso"
```

---

## Qué queda para la Entrega 2

Del spec, sin empezar: varias campañas por capa sobre la misma calle, selector de capas, espesor real colocado, cota teórica de proyecto, semáforo de tolerancia, y cortes con capas superpuestas y rellenas. El modelo de datos ya las contempla — `Campania` lleva `capaId` desde la Tarea 3 — así que la Entrega 2 agrega vistas, no reestructura datos.

