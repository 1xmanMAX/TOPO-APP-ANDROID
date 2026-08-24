# Entrada por Excel: plan de implementación

> **Para trabajadores agénticos:** SUB-SKILL REQUERIDA: usa
> superpowers:subagent-driven-development para implementar este plan tarea por
> tarea. Los pasos usan casillas (`- [ ]`) para el seguimiento.

**Objetivo:** que el topógrafo escriba sus lecturas en la hoja de cálculo donde
ya las anota, las meta en la app, y de ahí salgan superficie, perfiles y modelo.

**Arquitectura:** el lector va en **dos piezas separadas**: una convierte el
archivo en una tabla de celdas —sin saber nada de topografía— y otra interpreta
esa tabla. Cambiar el formato de la plantilla toca solo la segunda. El modelo
pasa de «plantilla global + calle con progresivas generadas» a «obra con calles,
cada una con sus puntos y sus distancias». El motor de cálculo no se toca.

**Stack:** TypeScript, React 19, Vite 7, Tailwind v4, Vitest + jsdom + Testing
Library, Zustand, fflate. **Sin dependencias nuevas.**

**Spec:** `docs/superpowers/specs/2026-08-23-entrada-por-excel-design.md`

## Restricciones globales

- Español en identificadores, textos, comentarios y mensajes de commit. **Sin `ñ`
  en identificadores** (`Campania`, no `Campaña`); en textos visibles sí va la ñ.
- **Sin dependencias nuevas.** Un `.xlsx` es un ZIP con XML dentro, y el proyecto
  ya usa `fflate` para el `.topo` y ya genera XML de Excel a mano.
- `packages/core` es motor puro: sin DOM, sin red, sin entrada ni salida. **El
  lector de archivos vive en `packages/app`**; el motor solo recibe datos ya
  interpretados.
- Los datos crudos —las lecturas de mira— no se sobrescriben jamás; las cotas
  siempre se derivan.
- **Importar añade, nunca pisa.**
- Una celda vacía es un punto que no se midió, y eso es información: **no se
  inventa cota**. Confundir el vacío con el cero ha costado tres apariciones del
  mismo defecto en este proyecto.
- Nada de jerga de programador en textos visibles.
- El color nunca es el único portador de significado.
- Un dato calculado sobre una nivelación que no cerró se marca como no
  comprobado, en pantalla y en los archivos.
- La salida de las pruebas queda **sin avisos**.

## La plantilla, para tenerla a mano

```
CALLE          Av. Sol
BM             BM-1        3245.180
VISTA ATRAS    1.425
punto          VER-I  SAR-I  BOR-I    EJE   BOR-D  SAR-D  VER-D
distancia      -5.60  -4.40  -4.20   0.00    4.20   4.40   5.60
0+000          2.045  2.030  1.980  1.955   1.975  2.025  2.040
0+020          2.055  2.031  1.990  1.965   1.985  2.026  2.050
0+040          2.060  2.035  2.001  1.970   1.992  2.030  2.055
CAMBIO         PC-1    1.150
VISTA ATRAS    PC-1    1.630
0+060          2.470  2.445  2.410  2.380   2.400  2.440  2.465
0+080          2.480  2.450  2.420  2.390   2.410  2.445  2.470
CIERRE         BM-1    1.910
```

## Estado de partida

`packages/core/src/modelo/tipos.ts` tiene hoy:

```ts
export interface Plantilla { id: Id; nombre: string; elementos: ElementoPlantilla[] }

export interface Calle {
  id: Id
  nombre: string
  plantillaId: Id
  progresivaInicio: number
  progresivaFin: number
  intervalo: number
  progresivasExtra: number[]
  rasante: Rasante | null
}
```

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `packages/app/src/archivo/leerXlsx.ts` (crear) | De `.xlsx` a tabla de celdas. No sabe de topografía |
| `packages/app/src/archivo/leerCsv.ts` (crear) | De `.csv` a tabla de celdas |
| `packages/app/src/importar/interpretar.ts` (crear) | De tabla de celdas a datos de calle y campaña |
| `packages/core/src/modelo/tipos.ts` (modificar) | `Calle` gana `puntos`; se retira `Plantilla` |
| `packages/core/src/grilla/grilla.ts` (modificar) | La grilla sale de lo medido, no se genera |
| `packages/app/src/archivo/topo.ts` (modificar) | Migrar los proyectos guardados |
| `packages/app/src/componentes/ImportarObra.tsx` (crear) | Elegir archivo, ver lo entendido, confirmar |
| `packages/app/verificacion/plantilla-ejemplo.mjs` (crear) | Genera el `.xlsx` de ejemplo |

---

## Tarea E1: Leer un `.xlsx` a tabla de celdas

Esta pieza **no sabe nada de topografía**. Recibe bytes, devuelve celdas.

**Archivos:**
- Crear: `packages/app/src/archivo/leerXlsx.ts`
- Crear: `packages/app/src/archivo/leerCsv.ts`
- Test: `packages/app/src/archivo/leerXlsx.test.ts`
- Test: `packages/app/src/archivo/leerCsv.test.ts`

**Interfaces:**
- Produce:
  - `interface HojaLeida { nombre: string; celdas: string[][] }`
  - `leerXlsx(datos: Uint8Array): HojaLeida[]`
  - `leerCsv(texto: string, nombreHoja: string): HojaLeida`

- [ ] **Paso 1: Escribir las pruebas que fallan**

```ts
import { describe, expect, it } from 'vitest'
import { armarXlsx } from './xlsx'
import { leerXlsx } from './leerXlsx'

describe('leerXlsx', () => {
  it('lee de vuelta lo que la propia app escribe', () => {
    const tabla = [
      ['CALLE', 'Av. Sol'],
      ['punto', 'BOR-I', 'EJE'],
      ['0+000', '1.980', '1.955'],
    ]

    const hojas = leerXlsx(armarXlsx(tabla, 'Av. Sol'))

    expect(hojas).toHaveLength(1)
    expect(hojas[0]!.nombre).toBe('Av. Sol')
    expect(hojas[0]!.celdas[2]).toEqual(['0+000', '1.980', '1.955'])
  })

  it('una celda vacía en medio no corre las demás de sitio', () => {
    // Es la regla que más ha costado en este proyecto: un hueco es un punto
    // sin medir, y tiene que quedarse donde está.
    const tabla = [
      ['punto', 'BOR-I', 'EJE', 'BOR-D'],
      ['0+000', '1.980', '', '1.975'],
    ]

    const hojas = leerXlsx(armarXlsx(tabla, 'Calle'))

    expect(hojas[0]!.celdas[1]).toEqual(['0+000', '1.980', '', '1.975'])
  })

  it('los números salen como texto, sin redondear ni reformatear', () => {
    const hojas = leerXlsx(armarXlsx([['0+000', '1.955']], 'Calle'))

    expect(hojas[0]!.celdas[0]![1]).toBe('1.955')
  })

  it('un archivo que no es un libro de Excel se rechaza con un mensaje legible', () => {
    expect(() => leerXlsx(new Uint8Array([1, 2, 3]))).toThrow(/no se pudo leer/i)
  })
})
```

```ts
import { describe, expect, it } from 'vitest'
import { leerCsv } from './leerCsv'

describe('leerCsv', () => {
  it('parte por comas y conserva las celdas vacías', () => {
    const hoja = leerCsv('punto,BOR-I,EJE\n0+000,1.980,,\n', 'Av. Sol')

    expect(hoja.celdas[1]).toEqual(['0+000', '1.980', '', ''])
  })

  it('respeta las comas que van dentro de comillas', () => {
    const hoja = leerCsv('CALLE,"Av. Sol, tramo 2"\n', 'x')

    expect(hoja.celdas[0]).toEqual(['CALLE', 'Av. Sol, tramo 2'])
  })

  it('admite finales de línea de Windows', () => {
    const hoja = leerCsv('a,b\r\nc,d\r\n', 'x')

    expect(hoja.celdas).toEqual([['a', 'b'], ['c', 'd']])
  })

  it('se salta las líneas del todo vacías', () => {
    const hoja = leerCsv('a,b\n\nc,d\n', 'x')

    expect(hoja.celdas).toEqual([['a', 'b'], ['c', 'd']])
  })
})
```

- [ ] **Paso 2: Ejecutar y ver que falla**

Run: `npm test --workspace packages/app -- leerXlsx leerCsv`
Esperado: FALLA, no existen los módulos.

- [ ] **Paso 3: Implementar el lector de `.xlsx`**

Un `.xlsx` es un ZIP. Descomprímelo con `unzipSync` de `fflate`, igual que hace
`desempaquetarProyecto` en `topo.ts`.

Dentro hacen falta tres cosas:

- `xl/workbook.xml` — los nombres de las hojas, en el orden en que salen.
- `xl/worksheets/sheetN.xml` — las celdas de cada hoja.
- `xl/sharedStrings.xml` — la tabla de textos, si el archivo la trae.

Cada celda viene como `<c r="B3" t="s"><v>4</v></c>`. La referencia `B3` dice
columna y fila; hay que usarla para **colocar cada celda en su sitio**, no ir
apilándolas: Excel **se salta las celdas vacías**, así que leerlas en orden
correría todo lo demás. Ese es el punto que fija la segunda prueba.

El tipo de la celda decide de dónde sale el valor:

| `t` | De dónde | |
|---|---|---|
| `s` | `sharedStrings`, por índice | texto compartido |
| `inlineStr` | del propio `<is><t>` | texto en línea |
| sin `t` | del `<v>` tal cual | número |

Reutiliza `letraDeColumna` de `xlsx.ts` —ya existe y hace la conversión al
revés— para no escribir dos veces la misma tabla de letras.

- [ ] **Paso 4: Implementar el lector de `.csv`**

Un partidor que respeta comillas y admite `\r\n`. No uses `split(',')` a secas:
la primera prueba de comillas lo tumba.

- [ ] **Paso 5: Ejecutar y ver que pasa**

Run: `npm test --workspace packages/app -- leerXlsx leerCsv`
Esperado: PASA.

- [ ] **Paso 6: Commit**

```bash
git add -A
git commit -m "Lee un libro de Excel y un CSV a tabla de celdas"
```

---

## Tarea E2: El modelo de obra

**Archivos:**
- Modificar: `packages/core/src/modelo/tipos.ts`
- Modificar: `packages/core/src/grilla/grilla.ts`
- Test: `packages/core/src/grilla/grilla.test.ts`

**Interfaces:**
- Produce:
  - `interface PuntoCalle { clave: string; etiqueta: string; distancia: number }`
  - `Calle` con `puntos: PuntoCalle[]`, sin `plantillaId`, `progresivaInicio`,
    `progresivaFin`, `intervalo` ni `progresivasExtra`
  - `construirGrilla(calle: Calle, progresivas: number[]): CeldaGrilla[]`

- [ ] **Paso 1: Escribir las pruebas que fallan**

```ts
it('la grilla sale de las progresivas medidas, no de un intervalo inventado', () => {
  const calle: Calle = {
    id: 'c-1',
    nombre: 'Av. Sol',
    puntos: [
      { clave: 'BOR-I', etiqueta: 'Borde izquierdo', distancia: -4.2 },
      { clave: 'EJE', etiqueta: 'Eje', distancia: 0 },
    ],
    rasante: null,
  }

  // Progresivas irregulares, como salen de una obra real: un buzón a los 47 m.
  const celdas = construirGrilla(calle, [0, 20, 47])

  expect(celdas).toHaveLength(6)
  expect(celdas.map((c) => c.progresiva)).toEqual([0, 0, 20, 20, 47, 47])
})

it('cada celda lleva la distancia real del punto en esa calle', () => {
  const calle = calleDeEjemplo()
  const celdas = construirGrilla(calle, [0])

  expect(celdas.find((c) => c.elementoClave === 'BOR-I')!.offset).toBe(-4.2)
})

it('las columnas salen ordenadas por distancia, no por como se escribieron', () => {
  const calle: Calle = {
    ...calleDeEjemplo(),
    puntos: [
      { clave: 'EJE', etiqueta: 'Eje', distancia: 0 },
      { clave: 'BOR-I', etiqueta: 'Borde izquierdo', distancia: -4.2 },
      { clave: 'BOR-D', etiqueta: 'Borde derecho', distancia: 4.2 },
    ],
  }

  const claves = construirGrilla(calle, [0]).map((c) => c.elementoClave)

  expect(claves).toEqual(['BOR-I', 'EJE', 'BOR-D'])
})

it('una calle sin puntos no arma ninguna celda, y no revienta', () => {
  const calle = { ...calleDeEjemplo(), puntos: [] }

  expect(construirGrilla(calle, [0, 20])).toEqual([])
})

it('sin progresivas medidas tampoco hay celdas', () => {
  expect(construirGrilla(calleDeEjemplo(), [])).toEqual([])
})
```

- [ ] **Paso 2: Ejecutar y ver que falla**

Run: `npm test --workspace packages/core`
Esperado: FALLA.

- [ ] **Paso 3: Cambiar los tipos**

En `tipos.ts`:

```ts
/**
 * Un punto que se mide a lo ancho de esta calle, con su distancia al eje.
 *
 * Las distancias son **de cada calle**, no de una plantilla compartida: la
 * misma obra puede tener una avenida de 4.20 m de media calzada y un jirón de
 * 3.10 m, y los dos usan el nombre `BOR-I`. Antes esto vivía en una plantilla
 * global, y por eso no servía.
 */
export interface PuntoCalle {
  clave: string
  etiqueta: string
  /** Metros desde el eje. Negativo a la izquierda, positivo a la derecha. */
  distancia: number
}
```

Y `Calle` queda:

```ts
export interface Calle {
  id: Id
  nombre: string
  puntos: PuntoCalle[]
  rasante: Rasante | null
}
```

Se retiran `Plantilla` y `ElementoPlantilla`, y de `Proyecto` el arreglo
`plantillas`.

El typecheck va a fallar en cadena. **Esa lista es el inventario de lo que hay
que recolocar**, y es grande: cuenta con ello.

- [ ] **Paso 4: Cambiar `construirGrilla`**

Ya no genera progresivas: las recibe. Ordena los puntos por distancia y produce
una celda por cada par progresiva × punto.

**Las progresivas llegan ya ordenadas y sin repetir** desde quien llame; la
función no las reordena ni las limpia, para que quien la use sepa exactamente qué
va a salir.

- [ ] **Paso 5: Recolocar todo lo que rompió el typecheck**

Cada sitio que usaba `plantilla` pasa a usar `calle.puntos`. Los sitios que
generaban progresivas pasan a recibirlas de las campañas medidas.

**Si una prueba existente afirma algo que ya no es alcanzable, para y dilo** en
vez de borrarla: significaría que se perdió una capacidad.

- [ ] **Paso 6: Ejecutar la batería**

Run: `npm test` y `npm run typecheck --workspaces`
Esperado: en verde, sin avisos.

- [ ] **Paso 7: Commit**

```bash
git add -A
git commit -m "La calle lleva sus propios puntos y la grilla sale de lo medido"
```

---

## Tarea E3: Interpretar la tabla

Aquí sí hay topografía. Esta pieza es la que cambia si la plantilla cambia.

**Archivos:**
- Crear: `packages/app/src/importar/interpretar.ts`
- Test: `packages/app/src/importar/interpretar.test.ts`

**Interfaces:**
- Consume: `HojaLeida` de E1; `PuntoCalle` de E2.
- Produce:
  - `interface CalleImportada { nombre: string; puntos: PuntoCalle[]; bm: { nombre: string; cota: number } | null; estaciones: EstacionImportada[]; avisos: string[] }`
  - `interpretarHoja(hoja: HojaLeida): CalleImportada`

- [ ] **Paso 1: Escribir las pruebas que fallan**

```ts
const HOJA = {
  nombre: 'Av. Sol',
  celdas: [
    ['CALLE', 'Av. Sol'],
    ['BM', 'BM-1', '3245.180'],
    ['VISTA ATRAS', '1.425'],
    ['punto', 'BOR-I', 'EJE', 'BOR-D'],
    ['distancia', '-4.20', '0.00', '4.20'],
    ['0+000', '1.980', '1.955', '1.975'],
    ['0+020', '1.990', '', '1.985'],
    ['CIERRE', 'BM-1', '1.910'],
  ],
}

it('saca el nombre de la calle, sus puntos y sus distancias', () => {
  const c = interpretarHoja(HOJA)

  expect(c.nombre).toBe('Av. Sol')
  expect(c.puntos.map((p) => p.clave)).toEqual(['BOR-I', 'EJE', 'BOR-D'])
  expect(c.puntos.map((p) => p.distancia)).toEqual([-4.2, 0, 4.2])
})

it('saca el banco de nivel con su cota', () => {
  expect(interpretarHoja(HOJA).bm).toEqual({ nombre: 'BM-1', cota: 3245.18 })
})

it('una celda vacía es un punto sin medir, y no produce lectura', () => {
  const lecturas = interpretarHoja(HOJA).estaciones[0]!.intermedias

  expect(lecturas.find((l) => l.progresiva === 20 && l.punto === 'EJE')).toBeUndefined()
  expect(lecturas.filter((l) => l.progresiva === 20)).toHaveLength(2)
})

it('reconoce las filas por su primera celda, sin importar tildes ni mayúsculas', () => {
  const hoja = {
    nombre: 'x',
    celdas: [
      ['calle', 'Jr. Lima'],
      ['Punto', 'EJE'],
      ['DISTANCIA', '0.00'],
      ['vista atras', '1.400'],
      ['0+000', '1.500'],
    ],
  }

  expect(interpretarHoja(hoja).nombre).toBe('Jr. Lima')
  expect(interpretarHoja(hoja).puntos).toHaveLength(1)
})

it('admite la progresiva en los dos formatos', () => {
  const conMas = interpretarHoja(HOJA).estaciones[0]!.intermedias
  expect(conMas.some((l) => l.progresiva === 20)).toBe(true)

  const hoja = { ...HOJA, celdas: HOJA.celdas.map((f) => (f[0] === '0+020' ? ['20', ...f.slice(1)] : f)) }
  expect(interpretarHoja(hoja).estaciones[0]!.intermedias.some((l) => l.progresiva === 20)).toBe(true)
})

it('un cambio de estación abre una estación nueva', () => {
  const hoja = {
    nombre: 'x',
    celdas: [
      ['punto', 'EJE'],
      ['distancia', '0.00'],
      ['VISTA ATRAS', '1.425'],
      ['0+000', '1.955'],
      ['CAMBIO', 'PC-1', '1.150'],
      ['VISTA ATRAS', 'PC-1', '1.630'],
      ['0+020', '2.380'],
    ],
  }

  const c = interpretarHoja(hoja)

  expect(c.estaciones).toHaveLength(2)
  expect(c.estaciones[0]!.vistaAdelante).toEqual({ nombre: 'PC-1', valor: 1.15 })
  expect(c.estaciones[1]!.vistaAtras.valor).toBe(1.63)
})

it('una columna sin distancia se salta, y se dice cuál', () => {
  const hoja = {
    nombre: 'x',
    celdas: [
      ['punto', 'BOR-I', 'RARO', 'EJE'],
      ['distancia', '-4.20', '', '0.00'],
      ['0+000', '1.980', '9.999', '1.955'],
    ],
  }

  const c = interpretarHoja(hoja)

  expect(c.puntos.map((p) => p.clave)).toEqual(['BOR-I', 'EJE'])
  expect(c.avisos.join(' ')).toMatch(/RARO/)
})

it('una hoja sin fila de puntos no se interpreta, y lo dice con palabras', () => {
  const c = interpretarHoja({ nombre: 'Hoja3', celdas: [['CALLE', 'x'], ['0+000', '1.9']] })

  expect(c.puntos).toEqual([])
  expect(c.avisos.join(' ')).toMatch(/fila de puntos/i)
})

it('las filas que no reconoce las ignora sin quejarse', () => {
  const hoja = {
    nombre: 'x',
    celdas: [
      ['Levantamiento topográfico — agosto'],
      [],
      ['punto', 'EJE'],
      ['distancia', '0.00'],
      ['0+000', '1.955'],
      ['Revisó: J.P.'],
    ],
  }

  expect(interpretarHoja(hoja).puntos).toHaveLength(1)
})
```

**La tercera prueba es la que no se puede perder.** Confundir una celda vacía con
un cero ha causado tres defectos en este proyecto, y aquí es donde entra el dato.

- [ ] **Paso 2: Ejecutar y ver que falla**

Run: `npm test --workspace packages/app -- interpretar`
Esperado: FALLA.

- [ ] **Paso 3: Implementar**

Recorre las filas una vez. Normaliza la primera celda —minúsculas, sin tildes,
sin espacios de sobra— y compárala con las palabras clave. Lo que no reconozca,
lo ignora.

Para las progresivas: `0+020` y `20` son la misma. Ya existe `parsearProgresiva`
en `packages/core/src/grilla/progresivas.ts` — úsala, no escribas otra.

**Los avisos son para el topógrafo**, no para un programador: «la columna RARO no
tiene distancia y se ha dejado fuera», no «columna 2 sin valor numérico».

- [ ] **Paso 4: Ejecutar y ver que pasa**

Run: `npm test --workspace packages/app -- interpretar`
Esperado: PASA.

- [ ] **Paso 5: Commit**

```bash
git add -A
git commit -m "Interpreta la hoja de campo: calle, puntos, estaciones y lecturas"
```

---

## Tarea E4: Migrar los proyectos guardados

**Archivos:**
- Modificar: `packages/app/src/archivo/topo.ts`
- Test: `packages/app/src/archivo/topo.test.ts`

- [ ] **Paso 1: Escribir las pruebas que fallan**

```ts
it('una calle del modelo anterior hereda los puntos de su plantilla', () => {
  const viejo = {
    version: 1,
    meta: { nombre: 'Obra', ubicacion: '', cliente: '' },
    bms: [{ id: 'bm-1', nombre: 'BM-1', cota: 3245.18 }],
    capas: [],
    plantillas: [
      {
        id: 'pl-1',
        nombre: 'Calle con vereda',
        elementos: [
          { clave: 'BOR-I', etiqueta: 'Borde izquierdo', offset: -4.2, tipo: 'calzada' },
          { clave: 'EJE', etiqueta: 'Eje', offset: 0, tipo: 'eje' },
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
        rasante: null,
      },
    ],
    campanias: [],
  } as never

  const recuperado = desempaquetarProyecto(empaquetarProyecto(viejo))

  expect(recuperado.calles[0]!.puntos.map((p) => p.clave)).toEqual(['BOR-I', 'EJE'])
  expect(recuperado.calles[0]!.puntos[0]!.distancia).toBe(-4.2)
})

it('un proyecto migrado conserva sus campañas y sus lecturas intactas', () => {
  const viejo = proyectoAnteriorConLecturas()

  const recuperado = desempaquetarProyecto(empaquetarProyecto(viejo))

  expect(recuperado.campanias).toEqual(viejo.campanias)
})

it('un proyecto que ya trae puntos en la calle no se toca', () => {
  const nuevo = proyectoEjemplo()

  const recuperado = desempaquetarProyecto(empaquetarProyecto(nuevo))

  expect(recuperado.calles[0]!.puntos).toEqual(nuevo.calles[0]!.puntos)
})
```

- [ ] **Paso 2: Ejecutar y ver que falla**

Run: `npm test --workspace packages/app -- topo`
Esperado: FALLA.

- [ ] **Paso 3: Implementar la migración**

Encadénala con las que ya hay en `migrarProyecto`. Cada calle busca su plantilla
por `plantillaId` y copia sus elementos como puntos: `clave` y `etiqueta` tal
cual, y `offset` pasa a ser `distancia`.

Si la plantilla no aparece, la calle se queda **sin puntos** y con un aviso, en
vez de inventar distancias. Una distancia inventada movería todas las cotas
teóricas de esa calle sin que nadie lo decidiera.

Los campos de progresivas se retiran. **Las campañas, lecturas, bancos de nivel,
capas y rasantes no se tocan.**

- [ ] **Paso 4: Ejecutar la batería**

Run: `npm test` y `npm run typecheck --workspaces`
Esperado: en verde, sin avisos.

- [ ] **Paso 5: Commit**

```bash
git add -A
git commit -m "Migra los proyectos guardados al modelo de obra"
```

---

## Tarea E5: La pantalla de importación

**Archivos:**
- Crear: `packages/app/src/componentes/ImportarObra.tsx`
- Modificar: `packages/app/src/estado/almacen.ts`
- Modificar: `packages/app/src/vistas/VistaProyecto.tsx`
- Test: `packages/app/src/componentes/ImportarObra.test.tsx`

**Interfaces:**
- Consume: `leerXlsx`, `leerCsv` de E1; `interpretarHoja` de E3.
- Produce: acción `importarCalles(calles: CalleImportada[]): void`.

- [ ] **Paso 1: Escribir las pruebas que fallan**

```tsx
it('antes de aceptar, enseña lo que ha entendido del archivo', async () => {
  render(<ImportarObra />)
  await elegirArchivo(archivoDeEjemplo())

  expect(screen.getByText(/Av\. Sol/)).toBeInTheDocument()
  expect(screen.getByText(/3 progresivas/)).toBeInTheDocument()
  expect(screen.getByText(/7 puntos/)).toBeInTheDocument()
})

it('enseña también lo que no supo interpretar', async () => {
  render(<ImportarObra />)
  await elegirArchivo(archivoConColumnaSinDistancia())

  expect(screen.getByText(/RARO/)).toBeInTheDocument()
})

it('nada entra en el proyecto hasta que se confirma', async () => {
  render(<ImportarObra />)
  const antes = useAlmacen.getState().proyecto.calles.length

  await elegirArchivo(archivoDeEjemplo())

  expect(useAlmacen.getState().proyecto.calles.length).toBe(antes)
})

it('al confirmar, la calle y su campaña entran en el proyecto', async () => {
  render(<ImportarObra />)
  await elegirArchivo(archivoDeEjemplo())

  await userEvent.click(screen.getByRole('button', { name: /importar/i }))

  const calle = useAlmacen.getState().proyecto.calles.find((c) => c.nombre === 'Av. Sol')
  expect(calle).toBeDefined()
  expect(calle!.puntos).toHaveLength(7)
})

it('importar sobre una calle que ya existe añade una campaña, no la pisa', async () => {
  conCalleYaImportada()
  const campaniasAntes = useAlmacen.getState().proyecto.campanias.length

  render(<ImportarObra />)
  await elegirArchivo(archivoDeEjemplo())
  await userEvent.click(screen.getByRole('button', { name: /importar/i }))

  expect(useAlmacen.getState().proyecto.calles.filter((c) => c.nombre === 'Av. Sol')).toHaveLength(1)
  expect(useAlmacen.getState().proyecto.campanias.length).toBe(campaniasAntes + 1)
})

it('un archivo ilegible se dice con palabras y no deja el proyecto a medias', async () => {
  const antes = useAlmacen.getState().proyecto
  render(<ImportarObra />)

  await elegirArchivo(new File([new Uint8Array([1, 2, 3])], 'roto.xlsx'))

  expect(screen.getByText(/no se pudo leer/i)).toBeInTheDocument()
  expect(useAlmacen.getState().proyecto).toBe(antes)
})
```

**La quinta prueba es la regla que rige toda la app:** los datos no se pisan
nunca. Una campaña nueva se suma a las que ya había.

- [ ] **Paso 2: Ejecutar y ver que falla**

Run: `npm test --workspace packages/app -- ImportarObra`
Esperado: FALLA.

- [ ] **Paso 3: Implementar**

Un campo de archivo que acepta `.xlsx` y `.csv`, la vista previa de lo entendido,
y dos botones: importar y descartar.

La vista previa, por hoja: nombre de la calle, cuántos puntos, cuántas
progresivas, cuántas lecturas, y los avisos. **Los avisos se ven sin tener que
abrir nada**: son lo que evita importar un archivo corrido.

Cuélgalo de la pantalla de proyecto, junto a los datos de la obra.

- [ ] **Paso 4: Ejecutar la batería**

Run: `npm test` y `npm run typecheck --workspaces`
Esperado: en verde, sin avisos.

- [ ] **Paso 5: Commit**

```bash
git add -A
git commit -m "Importa una obra desde la hoja de campo, con vista previa"
```

---

## Tarea E6: La plantilla de ejemplo y el cierre

**Archivos:**
- Crear: `packages/app/verificacion/plantilla-ejemplo.mjs`
- Crear: `packages/app/verificacion/importar.mjs`
- Modificar: `docs/uso.md`, `README.md`
- Crear: `docs/decisiones-entrada-por-excel.md`

- [ ] **Paso 1: Batería completa**

```
npm test
npm run typecheck --workspaces
npm run build --workspace packages/app
npm audit --omit=dev
```

Todo sin avisos. Anota el tamaño del paquete.

- [ ] **Paso 2: Generar la plantilla de ejemplo**

Un guion que escribe `docs/plantilla-de-campo.xlsx` usando `armarXlsx`, con:

- **Una hoja llena**, `Av. Sol`, con la plantilla completa del principio de este
  plan: cabecera, puntos, distancias, progresivas, un cambio de estación y el
  cierre.
- **Una hoja vacía**, `Calle nueva`, con solo las filas de cabecera y los títulos
  `punto` y `distancia`, lista para llenar.

Que el guion se pueda volver a ejecutar cuando la plantilla cambie, en vez de que
el archivo sea un binario que nadie sabe regenerar.

- [ ] **Paso 3: Verificación en navegador real**

`packages/app/verificacion/importar.mjs`, siguiendo el patrón de los tres que ya
existen: abrir la app, importar `docs/plantilla-de-campo.xlsx` de verdad,
comprobar que la vista previa dice lo que debe, confirmar, y comprobar que
después hay cotas, perfil y modelo.

**No lo ejecutes** (necesita servidor). Déjalo listo y dilo en el informe.

Los otros tres guiones navegan por pestañas que quizá cambien: léelos y di qué
hay que ajustar.

- [ ] **Paso 4: Documentación**

`docs/uso.md`: la sección de cómo se empieza pasa a ser **«llena la plantilla y
la importas»**, con la tabla de filas especiales y un ejemplo. Quita lo que diga
de definir plantillas y calles a mano.

README: qué hace la app hoy y la cuenta de pruebas.

`docs/decisiones-entrada-por-excel.md`, con el formato de
`docs/decisiones-entrega-2b.md`: qué se decidió, por qué, y qué costaría si
resulta equivocado.

- [ ] **Paso 5: Commit**

```bash
git add -A
git commit -m "Plantilla de campo de ejemplo, verificación y guía"
```

---

## Lo que queda fuera

Los otros cuatro bloques del replanteamiento, cada uno con su propio diseño:

| | |
|---|---|
| **Movimiento de tierras** | Cuánta tierra hay que mover entre la superficie medida y la que se busca |
| **Material con esponjamiento** | Cuánto material entra por capa, contando lo que crece al removerlo |
| **Recomendador de pendientes** | Qué pendientes minimizan el movimiento sin salirse de lo admisible |
| **Limpieza de pestañas** | Y el fallo del visor 3D sobre el diseño de la pantalla |
