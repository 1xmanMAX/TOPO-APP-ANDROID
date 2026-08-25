# Catálogo, importación y nivelaciones: plan de implementación

> **Para trabajadores agénticos:** SUB-SKILL REQUERIDA: usa
> superpowers:subagent-driven-development para implementar este plan tarea por
> tarea. Los pasos usan casillas (`- [ ]`) para el seguimiento.

**Objetivo:** que el topógrafo suba o pegue su hoja de campo, la app reconozca las
columnas por su código —aprendiéndolas si no las conoce— y agrupe varias tomas en
una misma nivelación.

**Arquitectura:** tres piezas separadas. El **catálogo** traduce códigos a
conceptos y vive en el motor. El **lector** convierte archivo o pegado en una
tabla de celdas, sin saber de topografía. El **intérprete** usa el catálogo para
convertir esa tabla en datos. Cambiar el formato de la hoja toca solo el tercero.

**Stack:** TypeScript, React 19, Vite 7, Tailwind v4, Vitest + jsdom + Testing
Library, Zustand, fflate. **Sin dependencias nuevas.**

**Spec:** `docs/superpowers/specs/2026-08-24-catalogo-y-nivelaciones-design.md`

## Restricciones globales

- Español en identificadores, textos, comentarios y mensajes de commit. **Sin `ñ`
  en identificadores** (`Campania`, no `Campaña`); en textos visibles sí va la ñ.
- **Sin dependencias nuevas.** Un `.xlsx` es un ZIP con XML dentro y el proyecto ya
  usa `fflate`.
- `packages/core` es motor puro: sin DOM, sin red, sin entrada ni salida. **El
  lector de archivos y el portapapeles viven en `packages/app`.**
- Los datos crudos no se sobrescriben jamás; las cotas siempre se derivan.
- **Importar añade, nunca pisa.**
- **Una columna con código desconocido nunca se descarta: se pregunta.**
- Una celda vacía es un punto sin medir, y eso es información: no se inventa cota.
  Confundir el vacío con el cero ha costado tres defectos en este proyecto.
- Nada de jerga de programador en textos visibles.
- El color nunca es el único portador de significado.
- Un dato calculado sobre una nivelación que no cerró se marca como no comprobado.
- La salida de las pruebas queda **sin avisos**.

## Estado de partida

`main` tiene las Entregas 1, 2A, 2B y 3 integradas: 472 pruebas, 71 comprobaciones
en navegador. El modelo actual, en `packages/core/src/modelo/tipos.ts`:

```ts
export interface Plantilla { id: Id; nombre: string; elementos: ElementoPlantilla[] }
export interface Calle {
  id: Id; nombre: string; plantillaId: Id
  progresivaInicio: number; progresivaFin: number; intervalo: number
  progresivasExtra: number[]; rasante: Rasante | null
}
export interface Campania { id: Id; fecha: string; calleId: Id; capaId: Id; bmInicialId: Id; estaciones: Estacion[]; cierre: ... }
```

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `packages/core/src/catalogo/conceptos.ts` (crear) | Los conceptos y los códigos de fábrica |
| `packages/core/src/catalogo/catalogo.ts` (crear) | Normalizar, buscar, aprender, reasignar |
| `packages/app/src/archivo/leerTabla.ts` (crear) | De `.xlsx`, `.csv` o pegado a tabla de celdas |
| `packages/app/src/importar/interpretar.ts` (crear) | De tabla + catálogo a datos de calle y toma |
| `packages/core/src/modelo/tipos.ts` (modificar) | `PuntoCalle`, `Nivelacion`, `Toma`; se retira `Plantilla` |
| `packages/app/src/archivo/topo.ts` (modificar) | Migrar los proyectos guardados |
| `packages/app/src/vistas/VistaSubirDatos.tsx` (crear) | Subir o pegar, vista previa, asignar códigos |
| `packages/app/src/vistas/VistaCatalogo.tsx` (crear) | Ver y editar los códigos aprendidos |

---

## Tarea C1: El catálogo

**Archivos:**
- Crear: `packages/core/src/catalogo/conceptos.ts`
- Crear: `packages/core/src/catalogo/catalogo.ts`
- Test: `packages/core/src/catalogo/catalogo.test.ts`
- Modificar: `packages/core/src/index.ts`

**Interfaces:**
- Produce:
  - `type Concepto = 'progresiva' | 'eje' | 'bordeIzq' | 'bordeDer' | 'sardinelIzq' | 'sardinelDer' | 'veredaIzq' | 'veredaDer'`
  - `const ETIQUETA_CONCEPTO: Record<Concepto, string>`
  - `const CODIGOS_DE_FABRICA: Record<Concepto, string[]>`
  - `interface Catalogo { codigos: Record<string, Concepto> }`
  - `normalizarCodigo(bruto: string): string`
  - `catalogoDeFabrica(): Catalogo`
  - `conceptoDe(catalogo: Catalogo, codigo: string): Concepto | null`
  - `aprenderCodigo(catalogo: Catalogo, codigo: string, concepto: Concepto): Catalogo`
  - `conceptoAnteriorDe(catalogo: Catalogo, codigo: string): Concepto | null`

- [ ] **Paso 1: Escribir las pruebas que fallan**

```ts
import { describe, expect, it } from 'vitest'
import {
  aprenderCodigo, catalogoDeFabrica, conceptoAnteriorDe, conceptoDe, normalizarCodigo,
} from './catalogo'

describe('normalizarCodigo', () => {
  it('no distingue mayúsculas, tildes ni espacios de sobra', () => {
    expect(normalizarCodigo(' Zkj ')).toBe('zkj')
    expect(normalizarCodigo('ZKJ')).toBe('zkj')
    expect(normalizarCodigo('Bórde-Í')).toBe('borde-i')
  })

  it('deja el código vacío como vacío, sin inventar nada', () => {
    expect(normalizarCodigo('   ')).toBe('')
  })
})

describe('conceptoDe', () => {
  it('reconoce los códigos de fábrica', () => {
    const c = catalogoDeFabrica()

    expect(conceptoDe(c, 'EJE')).toBe('eje')
    expect(conceptoDe(c, 'prog')).toBe('progresiva')
    expect(conceptoDe(c, 'BOR-I')).toBe('bordeIzq')
    expect(conceptoDe(c, 'VER-D')).toBe('veredaDer')
  })

  it('un código que no conoce devuelve null, para que se pueda preguntar', () => {
    expect(conceptoDe(catalogoDeFabrica(), 'ZKJ')).toBeNull()
  })
})

describe('aprenderCodigo', () => {
  it('un código aprendido se reconoce a partir de entonces', () => {
    const c = aprenderCodigo(catalogoDeFabrica(), 'ZKJ', 'eje')

    expect(conceptoDe(c, 'ZKJ')).toBe('eje')
    expect(conceptoDe(c, ' zkj ')).toBe('eje')
  })

  it('no toca el catálogo de partida: devuelve uno nuevo', () => {
    const antes = catalogoDeFabrica()
    aprenderCodigo(antes, 'ZKJ', 'eje')

    expect(conceptoDe(antes, 'ZKJ')).toBeNull()
  })

  it('aprender un código que ya estaba lo mueve al concepto nuevo', () => {
    const c = aprenderCodigo(catalogoDeFabrica(), 'EJE', 'bordeIzq')

    expect(conceptoDe(c, 'EJE')).toBe('bordeIzq')
  })
})

describe('conceptoAnteriorDe', () => {
  it('dice a qué concepto estaba asignado un código, para poder avisar antes de moverlo', () => {
    // Cambiar un código en silencio dejaría mal interpretadas todas las
    // importaciones que ya se hicieron con él.
    const c = catalogoDeFabrica()

    expect(conceptoAnteriorDe(c, 'EJE')).toBe('eje')
    expect(conceptoAnteriorDe(c, 'ZKJ')).toBeNull()
  })
})
```

- [ ] **Paso 2: Ejecutar y ver que falla**

Run: `npm test --workspace packages/core`
Esperado: FALLA, no existen los módulos.

- [ ] **Paso 3: Escribir `conceptos.ts`**

```ts
/** Lo que un punto significa, independientemente de cómo se llame en cada obra. */
export type Concepto =
  | 'progresiva'
  | 'eje'
  | 'bordeIzq'
  | 'bordeDer'
  | 'sardinelIzq'
  | 'sardinelDer'
  | 'veredaIzq'
  | 'veredaDer'

export const ETIQUETA_CONCEPTO: Record<Concepto, string> = {
  progresiva: 'Progresiva',
  eje: 'Eje',
  bordeIzq: 'Borde de calzada izquierdo',
  bordeDer: 'Borde de calzada derecho',
  sardinelIzq: 'Sardinel izquierdo',
  sardinelDer: 'Sardinel derecho',
  veredaIzq: 'Vereda izquierda',
  veredaDer: 'Vereda derecha',
}

/**
 * Un punto de partida, no una imposición: el catálogo se llena con el uso.
 * Max lo eligió así en vez de darnos su lista de códigos por adelantado.
 */
export const CODIGOS_DE_FABRICA: Record<Concepto, string[]> = {
  progresiva: ['PROG', 'PK', 'ABSCISA', 'EST', 'PROGRESIVA'],
  eje: ['EJE', 'CL', 'CENTRO'],
  bordeIzq: ['BI', 'BOR-I', 'BORDE-IZQ'],
  bordeDer: ['BD', 'BOR-D', 'BORDE-DER'],
  sardinelIzq: ['SI', 'SAR-I', 'SARDINEL-IZQ'],
  sardinelDer: ['SD', 'SAR-D', 'SARDINEL-DER'],
  veredaIzq: ['VI', 'VER-I', 'VEREDA-IZQ'],
  veredaDer: ['VD', 'VER-D', 'VEREDA-DER'],
}
```

- [ ] **Paso 4: Escribir `catalogo.ts`**

```ts
import { CODIGOS_DE_FABRICA, type Concepto } from './conceptos'

/**
 * Qué código significa qué. Viaja en el archivo del proyecto, porque sin él
 * reimportar la misma hoja daría otro resultado.
 */
export interface Catalogo {
  /** Del código ya normalizado al concepto. */
  codigos: Record<string, Concepto>
}

/**
 * Deja el código en su forma comparable: sin mayúsculas, sin tildes y sin
 * espacios de sobra. Así `ZKJ`, `zkj` y ` Zkj ` son el mismo código, que es lo
 * que espera cualquiera que escriba a mano en una hoja de cálculo.
 */
export function normalizarCodigo(bruto: string): string {
  return bruto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase()
}

export function catalogoDeFabrica(): Catalogo {
  const codigos: Record<string, Concepto> = {}
  for (const [concepto, lista] of Object.entries(CODIGOS_DE_FABRICA)) {
    for (const codigo of lista) codigos[normalizarCodigo(codigo)] = concepto as Concepto
  }
  return { codigos }
}

/** El concepto de un código, o null si no se conoce — para poder preguntar. */
export function conceptoDe(catalogo: Catalogo, codigo: string): Concepto | null {
  return catalogo.codigos[normalizarCodigo(codigo)] ?? null
}

/** Igual que `conceptoDe`, con nombre propio para leerse bien donde se avisa. */
export function conceptoAnteriorDe(catalogo: Catalogo, codigo: string): Concepto | null {
  return conceptoDe(catalogo, codigo)
}

/** Devuelve un catálogo nuevo: el de entrada no se toca. */
export function aprenderCodigo(catalogo: Catalogo, codigo: string, concepto: Concepto): Catalogo {
  return { codigos: { ...catalogo.codigos, [normalizarCodigo(codigo)]: concepto } }
}
```

- [ ] **Paso 5: Exportar y ejecutar**

En `packages/core/src/index.ts`, siguiendo el orden que ya hay:

```ts
export * from './catalogo/conceptos'
export * from './catalogo/catalogo'
```

Run: `npm test --workspace packages/core`
Esperado: PASA, sin avisos.

- [ ] **Paso 6: Commit**

```bash
git add -A
git commit -m "Traduce los códigos de columna a lo que significan"
```

---

## Tarea C2: Leer archivo o pegado a tabla de celdas

Esta pieza **no sabe de topografía**. Recibe bytes o texto, devuelve celdas.

**Archivos:**
- Crear: `packages/app/src/archivo/leerTabla.ts`
- Test: `packages/app/src/archivo/leerTabla.test.ts`

**Interfaces:**
- Produce:
  - `interface HojaLeida { nombre: string; celdas: string[][] }`
  - `leerXlsx(datos: Uint8Array): HojaLeida[]`
  - `leerCsv(texto: string, nombreHoja: string): HojaLeida`
  - `leerPegado(texto: string, nombreHoja: string): HojaLeida`

- [ ] **Paso 1: Escribir las pruebas que fallan**

```ts
import { describe, expect, it } from 'vitest'
import { armarXlsx } from './xlsx'
import { leerCsv, leerPegado, leerXlsx } from './leerTabla'

describe('leerXlsx', () => {
  it('lee de vuelta lo que la propia app escribe', () => {
    const tabla = [['PROG', 'EJE'], ['0+000', '1.955']]

    const hojas = leerXlsx(armarXlsx(tabla, 'Av. Sol'))

    expect(hojas[0]!.nombre).toBe('Av. Sol')
    expect(hojas[0]!.celdas[1]).toEqual(['0+000', '1.955'])
  })

  it('una celda vacía en medio no corre las demás de sitio', () => {
    // Excel se salta las celdas vacías al escribirlas: hay que colocar cada una
    // por su referencia, no apilarlas en orden. Un hueco es un punto sin medir.
    const tabla = [['PROG', 'BI', 'EJE', 'BD'], ['0+000', '1.980', '', '1.975']]

    const hojas = leerXlsx(armarXlsx(tabla, 'x'))

    expect(hojas[0]!.celdas[1]).toEqual(['0+000', '1.980', '', '1.975'])
  })

  it('un archivo que no es un libro de Excel se rechaza con un mensaje legible', () => {
    expect(() => leerXlsx(new Uint8Array([1, 2, 3]))).toThrow(/no se pudo leer/i)
  })
})

describe('leerCsv', () => {
  it('parte por comas y conserva las celdas vacías', () => {
    expect(leerCsv('PROG,BI,EJE\n0+000,1.980,,\n', 'x').celdas[1]).toEqual(['0+000', '1.980', '', ''])
  })

  it('respeta las comas que van dentro de comillas', () => {
    expect(leerCsv('CALLE,"Av. Sol, tramo 2"\n', 'x').celdas[0]).toEqual(['CALLE', 'Av. Sol, tramo 2'])
  })

  it('admite finales de línea de Windows', () => {
    expect(leerCsv('a,b\r\nc,d\r\n', 'x').celdas).toEqual([['a', 'b'], ['c', 'd']])
  })
})

describe('leerPegado', () => {
  it('parte por tabuladores, que es como llega lo copiado de Excel', () => {
    const hoja = leerPegado('PROG\tBI\tEJE\n0+000\t1.980\t1.955\n', 'Pegado')

    expect(hoja.celdas[0]).toEqual(['PROG', 'BI', 'EJE'])
    expect(hoja.celdas[1]).toEqual(['0+000', '1.980', '1.955'])
  })

  it('conserva las celdas vacías del pegado', () => {
    expect(leerPegado('a\t\tc\n', 'x').celdas[0]).toEqual(['a', '', 'c'])
  })

  it('se salta las líneas del todo vacías', () => {
    expect(leerPegado('a\tb\n\nc\td\n', 'x').celdas).toEqual([['a', 'b'], ['c', 'd']])
  })

  it('un texto que no parece una tabla se rechaza con un mensaje legible', () => {
    expect(() => leerPegado('hola', 'x')).toThrow(/no parece una tabla/i)
  })
})
```

- [ ] **Paso 2: Ejecutar y ver que falla**

Run: `npm test --workspace packages/app -- leerTabla`
Esperado: FALLA.

- [ ] **Paso 3: Implementar**

Para el `.xlsx`: descomprime con `unzipSync` de `fflate`, igual que
`desempaquetarProyecto` en `topo.ts`. Necesitas `xl/workbook.xml` (nombres de
hojas), `xl/worksheets/sheetN.xml` (celdas) y `xl/sharedStrings.xml` (textos, si
está).

Cada celda viene como `<c r="B3" t="s"><v>4</v></c>`. **Usa la referencia `B3`
para colocarla en su sitio**, no vayas apilando: Excel se salta las vacías. El
tipo decide de dónde sale el valor: `s` del `sharedStrings`, `inlineStr` del
`<is><t>`, y sin `t` del `<v>` tal cual.

Reutiliza `letraDeColumna` de `xlsx.ts`, que ya hace la conversión al revés.

Para el pegado: partir por líneas y por tabuladores. **Rechaza lo que no tenga
ningún tabulador en ninguna línea**: es texto suelto, no una tabla.

- [ ] **Paso 4: Ejecutar y commit**

Run: `npm test --workspace packages/app -- leerTabla`
Esperado: PASA.

```bash
git add -A
git commit -m "Lee una hoja desde archivo o desde lo pegado de Excel"
```

---

## Tarea C3: El modelo de obra y nivelaciones

**Archivos:**
- Modificar: `packages/core/src/modelo/tipos.ts`
- Modificar: `packages/core/src/grilla/grilla.ts`
- Test: `packages/core/src/grilla/grilla.test.ts`

**Interfaces:**
- Consume: `Concepto` y `Catalogo` de C1.
- Produce:
  - `interface PuntoCalle { concepto: Concepto; codigo: string; distancia: number }`
  - `interface Toma` — lo que hoy es `Campania`, con el mismo contenido
  - `interface Nivelacion { id: Id; nombre: string; color: string; tomas: Toma[] }`
  - `Calle` con `puntos: PuntoCalle[]` y `nivelaciones: Nivelacion[]`, sin
    `plantillaId` ni campos de progresivas
  - `Proyecto` con `catalogo: Catalogo`, sin `plantillas` ni `campanias`
  - `construirGrilla(calle: Calle, progresivas: number[]): CeldaGrilla[]`

- [ ] **Paso 1: Escribir las pruebas que fallan**

```ts
it('la grilla sale de las progresivas medidas, no de un intervalo inventado', () => {
  const calle = calleDeEjemplo()  // puntos: bordeIzq a -4.2, eje a 0

  // Progresivas irregulares, como salen de una obra: un buzón a los 47 m.
  const celdas = construirGrilla(calle, [0, 20, 47])

  expect(celdas).toHaveLength(6)
  expect(celdas.map((c) => c.progresiva)).toEqual([0, 0, 20, 20, 47, 47])
})

it('cada celda lleva la distancia real del punto en esa calle', () => {
  const celdas = construirGrilla(calleDeEjemplo(), [0])

  expect(celdas.find((c) => c.elementoClave === 'BOR-I')!.offset).toBe(-4.2)
})

it('las columnas salen ordenadas por distancia, no por como se escribieron', () => {
  const calle = {
    ...calleDeEjemplo(),
    puntos: [
      { concepto: 'eje' as const, codigo: 'EJE', distancia: 0 },
      { concepto: 'bordeIzq' as const, codigo: 'BOR-I', distancia: -4.2 },
      { concepto: 'bordeDer' as const, codigo: 'BOR-D', distancia: 4.2 },
    ],
  }

  expect(construirGrilla(calle, [0]).map((c) => c.elementoClave))
    .toEqual(['BOR-I', 'EJE', 'BOR-D'])
})

it('una calle sin puntos no arma ninguna celda, y no revienta', () => {
  expect(construirGrilla({ ...calleDeEjemplo(), puntos: [] }, [0, 20])).toEqual([])
})

it('sin progresivas medidas tampoco hay celdas', () => {
  expect(construirGrilla(calleDeEjemplo(), [])).toEqual([])
})

it('una nivelación agrupa varias tomas y conserva sus lecturas', () => {
  const n: Nivelacion = {
    id: 'niv-1',
    nombre: 'Terreno existente',
    color: '#2563eb',
    tomas: [tomaDel20(), tomaDel21()],
  }

  expect(n.tomas).toHaveLength(2)
  expect(n.tomas[0]!.estaciones).toEqual(tomaDel20().estaciones)
})
```

- [ ] **Paso 2: Ejecutar y ver que falla**

Run: `npm test --workspace packages/core`
Esperado: FALLA.

- [ ] **Paso 3: Cambiar los tipos**

```ts
/**
 * Un punto que se mide a lo ancho de esta calle.
 *
 * Las distancias son **de cada calle**, no de una plantilla compartida: la
 * misma obra puede tener una avenida de 4.20 m de media calzada y un jirón de
 * 3.10 m, y las dos usan el mismo código para el borde. Max señaló que atarlas
 * a una plantilla global era justo lo que no servía.
 */
export interface PuntoCalle {
  concepto: Concepto
  /** El código tal como venía en la hoja, para poder enseñarlo igual que se escribió. */
  codigo: string
  /** Metros desde el eje. Negativo a la izquierda, positivo a la derecha. */
  distancia: number
}

/** Una salida a campo. Es lo que hasta ahora se llamaba campaña. */
export interface Toma {
  id: Id
  fecha: string
  capaId: Id
  bmInicialId: Id
  estaciones: Estacion[]
  cierre: ConfiguracionCierre
}

/**
 * Una superficie completa, que puede haber costado varios días de campo.
 *
 * Hoy se mide del 0+000 al 0+100 y mañana del 0+100 al 0+200, enlazando por el
 * punto de cambio que dejó la anterior: las dos tomas son **la misma
 * superficie**. Lo que se compara entre sí son nivelaciones, nunca tomas.
 */
export interface Nivelacion {
  id: Id
  nombre: string
  /** El que la identifica en la lista y en todas las vistas. */
  color: string
  tomas: Toma[]
}
```

`Calle` queda con `puntos` y `nivelaciones`, sin `plantillaId` ni progresivas.
`Proyecto` gana `catalogo` y pierde `plantillas` y `campanias`.

El typecheck fallará en cadena. **Esa lista es el inventario de lo que hay que
recolocar**, y es grande: cuenta con ello.

- [ ] **Paso 4: Cambiar `construirGrilla` y recolocar**

Ya no genera progresivas: las recibe, **ya ordenadas y sin repetir**. Ordena los
puntos por distancia y produce una celda por par progresiva × punto.

Cada sitio que usaba `plantilla` pasa a `calle.puntos`; los que recorrían
`proyecto.campanias` pasan a recorrer las tomas de las nivelaciones.

**Si una prueba existente afirma algo que ya no es alcanzable, para y dilo** en
vez de borrarla: significaría que se perdió una capacidad.

- [ ] **Paso 5: Ejecutar la batería y commit**

Run: `npm test` y `npm run typecheck --workspaces`
Esperado: en verde, sin avisos.

```bash
git add -A
git commit -m "La calle lleva sus puntos y agrupa las tomas en nivelaciones"
```

---

## Tarea C4: Interpretar la hoja con el catálogo

**Archivos:**
- Crear: `packages/app/src/importar/interpretar.ts`
- Test: `packages/app/src/importar/interpretar.test.ts`

**Interfaces:**
- Consume: `HojaLeida` de C2; `Catalogo`, `conceptoDe` de C1; `PuntoCalle` de C3.
- Produce:
  - `interface ColumnaSinReconocer { codigo: string; muestra: string[] }`
  - `interface HojaInterpretada { nombre: string; puntos: PuntoCalle[]; sinReconocer: ColumnaSinReconocer[]; bm: { nombre: string; cota: number } | null; estaciones: EstacionImportada[]; avisos: string[] }`
  - `interpretarHoja(hoja: HojaLeida, catalogo: Catalogo): HojaInterpretada`

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

it('reconoce las columnas por su código, sin importar en qué orden vengan', () => {
  const revuelta = {
    nombre: 'x',
    celdas: [
      ['punto', 'EJE', 'BOR-D', 'BOR-I'],
      ['distancia', '0.00', '4.20', '-4.20'],
      ['0+000', '1.955', '1.975', '1.980'],
    ],
  }

  const c = interpretarHoja(revuelta, catalogoDeFabrica())

  expect(c.puntos.map((p) => p.concepto)).toEqual(['eje', 'bordeDer', 'bordeIzq'])
})

it('una columna con código desconocido NO se descarta: sale para preguntar', () => {
  const hoja = {
    nombre: 'x',
    celdas: [
      ['punto', 'ZKJ', 'BOR-D'],
      ['distancia', '0.00', '4.20'],
      ['0+000', '1.955', '1.975'],
    ],
  }

  const c = interpretarHoja(hoja, catalogoDeFabrica())

  expect(c.sinReconocer).toHaveLength(1)
  expect(c.sinReconocer[0]!.codigo).toBe('ZKJ')
  expect(c.sinReconocer[0]!.muestra).toContain('1.955')
})

it('con el código ya aprendido, esa misma hoja entra sin preguntar', () => {
  const hoja = {
    nombre: 'x',
    celdas: [['punto', 'ZKJ'], ['distancia', '0.00'], ['0+000', '1.955']],
  }

  const c = interpretarHoja(hoja, aprenderCodigo(catalogoDeFabrica(), 'ZKJ', 'eje'))

  expect(c.sinReconocer).toHaveLength(0)
  expect(c.puntos[0]!.concepto).toBe('eje')
})

it('una celda vacía es un punto sin medir, y no produce lectura', () => {
  const lecturas = interpretarHoja(HOJA, catalogoDeFabrica()).estaciones[0]!.intermedias

  expect(lecturas.find((l) => l.progresiva === 20 && l.codigo === 'EJE')).toBeUndefined()
  expect(lecturas.filter((l) => l.progresiva === 20)).toHaveLength(2)
})

it('reconoce las filas por su primera celda, sin importar tildes ni mayúsculas', () => {
  const hoja = {
    nombre: 'x',
    celdas: [['calle', 'Jr. Lima'], ['Punto', 'EJE'], ['DISTANCIA', '0.00'], ['vista atras', '1.400'], ['0+000', '1.500']],
  }

  expect(interpretarHoja(hoja, catalogoDeFabrica()).nombre).toBe('Jr. Lima')
})

it('admite la progresiva escrita como 0+020 o como 20', () => {
  const hoja = { ...HOJA, celdas: HOJA.celdas.map((f) => (f[0] === '0+020' ? ['20', ...f.slice(1)] : f)) }

  expect(interpretarHoja(hoja, catalogoDeFabrica()).estaciones[0]!.intermedias.some((l) => l.progresiva === 20)).toBe(true)
})

it('un cambio de estación abre una estación nueva', () => {
  const hoja = {
    nombre: 'x',
    celdas: [
      ['punto', 'EJE'], ['distancia', '0.00'], ['VISTA ATRAS', '1.425'],
      ['0+000', '1.955'],
      ['CAMBIO', 'PC-1', '1.150'],
      ['VISTA ATRAS', 'PC-1', '1.630'],
      ['0+020', '2.380'],
    ],
  }

  const c = interpretarHoja(hoja, catalogoDeFabrica())

  expect(c.estaciones).toHaveLength(2)
  expect(c.estaciones[0]!.vistaAdelante).toEqual({ nombre: 'PC-1', valor: 1.15 })
  expect(c.estaciones[1]!.vistaAtras.valor).toBe(1.63)
})

it('una columna sin distancia se salta, y se dice cuál', () => {
  const hoja = {
    nombre: 'x',
    celdas: [['punto', 'BOR-I', 'EJE'], ['distancia', '-4.20', ''], ['0+000', '1.980', '1.955']],
  }

  const c = interpretarHoja(hoja, catalogoDeFabrica())

  expect(c.puntos).toHaveLength(1)
  expect(c.avisos.join(' ')).toMatch(/EJE/)
})

it('una hoja sin fila de puntos no se interpreta, y lo dice con palabras', () => {
  const c = interpretarHoja({ nombre: 'Hoja3', celdas: [['CALLE', 'x'], ['0+000', '1.9']] }, catalogoDeFabrica())

  expect(c.puntos).toEqual([])
  expect(c.avisos.join(' ')).toMatch(/fila de puntos/i)
})

it('las filas que no reconoce las ignora sin quejarse', () => {
  const hoja = {
    nombre: 'x',
    celdas: [['Levantamiento — agosto'], [], ['punto', 'EJE'], ['distancia', '0.00'], ['0+000', '1.955'], ['Revisó: J.P.']],
  }

  expect(interpretarHoja(hoja, catalogoDeFabrica()).puntos).toHaveLength(1)
})
```

**La segunda y la tercera son el corazón de esta tarea.** Una columna
desconocida que se descartara en silencio perdería lecturas que nadie echaría de
menos hasta comparar contra obra.

- [ ] **Paso 2: Ejecutar y ver que falla**

Run: `npm test --workspace packages/app -- interpretar`
Esperado: FALLA.

- [ ] **Paso 3: Implementar**

Recorre las filas una vez. Normaliza la primera celda y compárala con las
palabras clave: `CALLE`, `BM`, `VISTA ATRAS`, `punto`, `distancia`, `CAMBIO`,
`CIERRE`. Lo que no reconozca, lo ignora.

Para cada columna de la fila `punto`, busca su concepto con `conceptoDe`. Si no
lo encuentra, **añádela a `sinReconocer` con una muestra de sus valores**, no la
tires.

Para las progresivas usa `parsearProgresiva`, que ya existe en
`packages/core/src/grilla/progresivas.ts`.

**Los avisos los lee un topógrafo**: «la columna EJE no tiene distancia y se ha
dejado fuera», no «columna 2 sin valor numérico».

- [ ] **Paso 4: Ejecutar y commit**

Run: `npm test --workspace packages/app -- interpretar`
Esperado: PASA.

```bash
git add -A
git commit -m "Interpreta la hoja de campo usando el catálogo de códigos"
```

---

## Tarea C5: Migrar los proyectos guardados

**Archivos:**
- Modificar: `packages/app/src/archivo/topo.ts`
- Test: `packages/app/src/archivo/topo.test.ts`

- [ ] **Paso 1: Escribir las pruebas que fallan**

```ts
it('una calle del modelo anterior hereda los puntos de su plantilla', () => {
  const recuperado = desempaquetarProyecto(empaquetarProyecto(proyectoAnterior()))

  expect(recuperado.calles[0]!.puntos.map((p) => p.codigo)).toEqual(['BOR-I', 'EJE'])
  expect(recuperado.calles[0]!.puntos[0]!.distancia).toBe(-4.2)
  expect(recuperado.calles[0]!.puntos[0]!.concepto).toBe('bordeIzq')
})

it('cada campaña se convierte en una nivelación de una sola toma', () => {
  // Agrupar tomas es decisión de Max, no de una migración que no sabe qué se
  // midió cada día.
  const viejo = proyectoAnteriorConDosCampanias()

  const recuperado = desempaquetarProyecto(empaquetarProyecto(viejo))

  expect(recuperado.calles[0]!.nivelaciones).toHaveLength(2)
  expect(recuperado.calles[0]!.nivelaciones[0]!.tomas).toHaveLength(1)
})

it('las lecturas sobreviven intactas a la migración', () => {
  const viejo = proyectoAnteriorConDosCampanias()

  const recuperado = desempaquetarProyecto(empaquetarProyecto(viejo))

  expect(recuperado.calles[0]!.nivelaciones[0]!.tomas[0]!.estaciones)
    .toEqual(viejo.campanias[0]!.estaciones)
})

it('el catálogo nace con los códigos de fábrica más los de las plantillas', () => {
  const recuperado = desempaquetarProyecto(empaquetarProyecto(proyectoAnterior()))

  expect(conceptoDe(recuperado.catalogo, 'EJE')).toBe('eje')
})

it('cada nivelación migrada recibe un color distinto', () => {
  const recuperado = desempaquetarProyecto(empaquetarProyecto(proyectoAnteriorConDosCampanias()))
  const colores = recuperado.calles[0]!.nivelaciones.map((n) => n.color)

  expect(new Set(colores).size).toBe(colores.length)
})

it('un proyecto que ya trae el modelo nuevo no se toca', () => {
  const nuevo = proyectoEjemplo()

  expect(desempaquetarProyecto(empaquetarProyecto(nuevo)).calles).toEqual(nuevo.calles)
})
```

- [ ] **Paso 2: Ejecutar y ver que falla**

Run: `npm test --workspace packages/app -- topo`
Esperado: FALLA.

- [ ] **Paso 3: Implementar**

Encadénala con las migraciones que ya hay en `migrarProyecto`.

Cada calle busca su plantilla por `plantillaId` y copia sus elementos como
puntos. El concepto de cada uno sale de buscar su clave en el catálogo de
fábrica; si no aparece, **el punto se queda sin concepto reconocido y se anota**,
en vez de adivinar uno.

Si la plantilla no aparece, la calle se queda **sin puntos** y con un aviso: una
distancia inventada movería todas las cotas teóricas de esa calle.

Cada campaña se convierte en una nivelación de una toma, con el nombre de su capa
y su fecha, y un color de una paleta con suficientes valores para no repetir en
proyectos normales.

**Las estaciones, lecturas, bancos de nivel, capas y rasantes no se tocan.**

- [ ] **Paso 4: Ejecutar la batería y commit**

Run: `npm test` y `npm run typecheck --workspaces`

```bash
git add -A
git commit -m "Migra los proyectos guardados al modelo de nivelaciones"
```

---

## Tarea C6: La pantalla de subir datos

**Archivos:**
- Crear: `packages/app/src/vistas/VistaSubirDatos.tsx`
- Modificar: `packages/app/src/estado/almacen.ts`
- Modificar: `packages/app/src/App.tsx` y `componentes/BarraSuperior.tsx`
- Test: `packages/app/src/vistas/VistaSubirDatos.test.tsx`

**Interfaces:**
- Consume: `leerXlsx`, `leerCsv`, `leerPegado` de C2; `interpretarHoja` de C4.
- Produce: acciones `aprenderCodigoEnCatalogo(codigo: string, concepto: Concepto): void`
  e `importarHojas(hojas: HojaInterpretada[]): void`.

- [ ] **Paso 1: Escribir las pruebas que fallan**

```tsx
it('acepta un archivo y enseña lo que ha entendido antes de aceptarlo', async () => {
  render(<VistaSubirDatos />)
  await elegirArchivo(archivoDeEjemplo())

  expect(screen.getByText(/Av\. Sol/)).toBeInTheDocument()
  expect(screen.getByText(/3 progresivas/)).toBeInTheDocument()
})

it('acepta datos pegados igual que un archivo', async () => {
  render(<VistaSubirDatos />)

  await userEvent.click(screen.getByLabelText(/pega aquí/i))
  await pegarTexto('punto\tEJE\ndistancia\t0.00\n0+000\t1.955\n')

  expect(screen.getByText(/1 progresiva/)).toBeInTheDocument()
})

it('una columna desconocida se pregunta, con sus valores a la vista', async () => {
  render(<VistaSubirDatos />)
  await elegirArchivo(archivoConCodigoDesconocido())

  expect(screen.getByText('ZKJ')).toBeInTheDocument()
  expect(screen.getByText(/1\.955/)).toBeInTheDocument()
  expect(screen.getByLabelText(/qué es la columna ZKJ/i)).toBeInTheDocument()
})

it('al asignarla con recordar marcado, el código queda aprendido', async () => {
  render(<VistaSubirDatos />)
  await elegirArchivo(archivoConCodigoDesconocido())

  await userEvent.selectOptions(screen.getByLabelText(/qué es la columna ZKJ/i), 'eje')
  await userEvent.click(screen.getByLabelText(/recordar/i))
  await userEvent.click(screen.getByRole('button', { name: /importar/i }))

  expect(conceptoDe(useAlmacen.getState().proyecto.catalogo, 'ZKJ')).toBe('eje')
})

it('nada entra en el proyecto hasta que se confirma', async () => {
  render(<VistaSubirDatos />)
  const antes = useAlmacen.getState().proyecto

  await elegirArchivo(archivoDeEjemplo())

  expect(useAlmacen.getState().proyecto).toBe(antes)
})

it('importar sobre una calle que ya existe añade una toma, no la pisa', async () => {
  conCalleYaImportada()
  const tomasAntes = tomasDe('Av. Sol').length

  render(<VistaSubirDatos />)
  await elegirArchivo(archivoDeEjemplo())
  await userEvent.click(screen.getByRole('button', { name: /importar/i }))

  expect(callesLlamadas('Av. Sol')).toHaveLength(1)
  expect(tomasDe('Av. Sol').length).toBe(tomasAntes + 1)
})

it('un archivo ilegible se dice con palabras y no deja el proyecto a medias', async () => {
  const antes = useAlmacen.getState().proyecto
  render(<VistaSubirDatos />)

  await elegirArchivo(new File([new Uint8Array([1, 2, 3])], 'roto.xlsx'))

  expect(screen.getByText(/no se pudo leer/i)).toBeInTheDocument()
  expect(useAlmacen.getState().proyecto).toBe(antes)
})
```

- [ ] **Paso 2: Ejecutar y ver que falla**

Run: `npm test --workspace packages/app -- VistaSubirDatos`
Esperado: FALLA.

- [ ] **Paso 3: Implementar**

Dos entradas: un campo de archivo que acepta `.xlsx` y `.csv`, y un área donde
pegar. **Las dos acaban en el mismo camino**: leer a celdas, interpretar,
previsualizar.

La vista previa, por hoja: nombre de la calle, cuántos puntos, cuántas
progresivas, cuántas lecturas, los avisos, y **las columnas sin reconocer con un
desplegable de conceptos y una casilla de recordar**.

El botón de importar queda deshabilitado mientras haya columnas sin asignar, y se
dice por qué: importar dejando fuera una columna medida es perder trabajo de
campo en silencio.

Añade la pestaña a la barra superior.

- [ ] **Paso 4: Ejecutar la batería y commit**

Run: `npm test` y `npm run typecheck --workspaces`

```bash
git add -A
git commit -m "Sube o pega la hoja de campo, con vista previa y códigos"
```

---

## Tarea C7: La pantalla del catálogo

**Archivos:**
- Crear: `packages/app/src/vistas/VistaCatalogo.tsx`
- Test: `packages/app/src/vistas/VistaCatalogo.test.tsx`

- [ ] **Paso 1: Escribir las pruebas que fallan**

```tsx
it('enseña cada concepto con los códigos que reconoce', () => {
  render(<VistaCatalogo />)

  expect(screen.getByText('Eje')).toBeInTheDocument()
  expect(screen.getByText(/EJE/)).toBeInTheDocument()
})

it('se puede añadir un código a un concepto', async () => {
  render(<VistaCatalogo />)

  await userEvent.type(screen.getByLabelText(/código nuevo para Eje/i), 'ZKJ')
  await userEvent.click(screen.getByRole('button', { name: /añadir a Eje/i }))

  expect(conceptoDe(useAlmacen.getState().proyecto.catalogo, 'ZKJ')).toBe('eje')
})

it('mover un código que ya estaba en otro concepto pide confirmación', async () => {
  render(<VistaCatalogo />)

  await userEvent.type(screen.getByLabelText(/código nuevo para Vereda izquierda/i), 'EJE')
  await userEvent.click(screen.getByRole('button', { name: /añadir a Vereda izquierda/i }))

  // Cambiarlo en silencio dejaría mal interpretadas las importaciones anteriores.
  expect(screen.getByText(/ya está asignado a Eje/i)).toBeInTheDocument()
  expect(conceptoDe(useAlmacen.getState().proyecto.catalogo, 'EJE')).toBe('eje')
})

it('confirmando, el código se mueve', async () => {
  render(<VistaCatalogo />)
  await intentarMoverEjeAVereda()

  await userEvent.click(screen.getByRole('button', { name: /moverlo igualmente/i }))

  expect(conceptoDe(useAlmacen.getState().proyecto.catalogo, 'EJE')).toBe('veredaIzq')
})

it('se puede quitar un código', async () => {
  render(<VistaCatalogo />)

  await userEvent.click(screen.getByRole('button', { name: /quitar el código CL/i }))

  expect(conceptoDe(useAlmacen.getState().proyecto.catalogo, 'CL')).toBeNull()
})
```

- [ ] **Paso 2: Ejecutar y ver que falla**

Run: `npm test --workspace packages/app -- VistaCatalogo`
Esperado: FALLA.

- [ ] **Paso 3: Implementar**

Un bloque por concepto, con sus códigos y un campo para añadir. Al añadir uno que
ya está en otro concepto, **avisa nombrando dónde estaba** y ofrece moverlo o
dejarlo.

Cuélgalo de la pantalla de subir datos o de la de obra, según encaje; no hace
falta pestaña propia.

- [ ] **Paso 4: Ejecutar la batería y commit**

Run: `npm test` y `npm run typecheck --workspaces`

```bash
git add -A
git commit -m "Deja ver y editar los códigos aprendidos"
```

---

## Tarea C8: Cierre

- [ ] **Paso 1: Batería completa**

```
npm test
npm run typecheck --workspaces
npm run build --workspace packages/app
npm audit --omit=dev
```

Todo sin avisos. Anota el tamaño del paquete.

- [ ] **Paso 2: La plantilla de ejemplo**

Un guion `packages/app/verificacion/plantilla-ejemplo.mjs` que escribe
`docs/plantilla-de-campo.xlsx` con `armarXlsx`: una hoja llena, `Av. Sol`, con
cabecera, puntos, distancias, progresivas, un cambio de estación y el cierre; y
una hoja vacía, `Calle nueva`, con solo la cabecera.

Que se pueda volver a ejecutar cuando la plantilla cambie.

- [ ] **Paso 3: Verificación en navegador real**

`packages/app/verificacion/importar.mjs`, siguiendo el patrón de los seis que ya
existen: importar `docs/plantilla-de-campo.xlsx` de verdad, comprobar la vista
previa, asignar un código desconocido, confirmar, y comprobar que después hay
cotas, perfil y modelo. **Y el camino del pegado**, que es el que más fácil se
queda sin probar.

**No lo ejecutes** (necesita servidor). Déjalo listo y dilo en el informe.

Los otros seis guiones navegan por pestañas que cambian: léelos y di qué ajustar.

- [ ] **Paso 4: Documentación**

`docs/uso.md`: cómo se empieza pasa a ser **llenar la plantilla e importarla**,
con la tabla de filas especiales, el catálogo de códigos y cómo agrupar tomas en
nivelaciones. Quita lo de definir plantillas y calles a mano.

README con la cuenta de pruebas. Y `docs/decisiones-catalogo-nivelaciones.md`,
con el formato de `docs/decisiones-entrega-2b.md`.

- [ ] **Paso 5: Commit**

```bash
git add -A
git commit -m "Cierre: plantilla de campo, verificación y guía"
```

---

## Lo que queda fuera

El **bloque B**, con su propio diseño: el panel de comparación con colores, las
diferencias entre nivelaciones, las pendientes entre progresivas y las vistas
afinadas.

Y los tres bloques del replanteamiento que siguen pendientes: movimiento de
tierras, material con esponjamiento, y el recomendador de pendientes.
