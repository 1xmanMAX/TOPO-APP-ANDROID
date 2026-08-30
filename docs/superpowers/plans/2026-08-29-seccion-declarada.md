# La sección declarada: plan de implementación

> **Para trabajadores agénticos:** SUB-SKILL REQUERIDA: usa
> superpowers:subagent-driven-development para implementar este plan tarea por
> tarea. Los pasos usan casillas (`- [ ]`) para el seguimiento.

**Objetivo:** que Max declare una vez la sección de su calle —con dibujo, con la
distancia de cada punto y con las palabras que él escribe en el Excel— y que a
partir de ahí su hoja real entre sola, enseñando antes de aceptar todo lo que no
entendió.

**Arquitectura:** tres piezas separadas, igual que antes. La **sección** vive en
el motor y traduce palabras a puntos con rol y distancia. El **lector** convierte
archivo o pegado en una tabla de celdas, sin saber de topografía — ya está hecho
y no se toca. El **intérprete** usa la sección para convertir esa tabla en
lecturas. Cambiar el formato de la hoja toca solo el tercero.

**Stack:** TypeScript, React 19, Vite 7, Tailwind v4, Vitest + jsdom + Testing
Library, Zustand, fflate. **Sin dependencias nuevas.**

**Spec:** `docs/superpowers/specs/2026-08-29-seccion-declarada-y-lectura-real-design.md`,
que enmienda `2026-08-24-catalogo-y-nivelaciones-design.md`. **Los dos se leen.**

**Enmienda** del plan `2026-08-24-catalogo-y-nivelaciones.md`. Aquel iba por la
tarea C4; C1, C2 y C3 están hechas y commiteadas (`4ca7d14`). Este plan
**sustituye a C4, C6 y C7**, amplía lo que C1 dejó, y se lleva C5 y C8 tal cual
estaban salvo por lo que aquí se dice. Las tareas de este plan se llaman D para
no confundirlas con las del anterior.

## Restricciones globales

Las del plan anterior, sin quitar ninguna:

- Español en identificadores, textos, comentarios y mensajes de commit. **Sin `ñ`
  en identificadores** (`Campania`, no `Campaña`); en textos visibles sí va la ñ.
- **Sin dependencias nuevas.**
- `packages/core` es motor puro: sin DOM, sin red, sin entrada ni salida. **El
  lector de archivos y el portapapeles viven en `packages/app`.**
- Los datos crudos no se sobrescriben jamás; las cotas siempre se derivan.
- **Importar añade, nunca pisa.**
- **Una columna que no casa con ninguna palabra nunca se descarta en silencio: se
  enseña con sus valores y se puede asignar ahí mismo.** Esta regla sobrevive al
  cambio de diseño; lo que cambia es cuándo se declara, no que se pueda perder.
- Una celda vacía es un punto sin medir, y eso es información: no se inventa cota.
  Confundir el vacío con el cero ha costado tres defectos en este proyecto.
- Nada de jerga de programador en textos visibles.
- El color nunca es el único portador de significado.
- Un dato calculado sobre una nivelación que no cerró se marca como no comprobado.
- La salida de las pruebas queda **sin avisos**.
- **Ninguna prueba se borra sin justificarla.** La que deje de tener sentido se
  reescribe apuntando al sitio nuevo; si una capacidad ya no es alcanzable, **se
  dice en voz alta** en vez de borrar la prueba.

## Tres decisiones que tomó el que escribe el plan, no Max

Están aquí para que se puedan revocar sabiendo de quién son:

1. **`peloAgua` entra en la lista de roles**, porque Max lo ha nombrado antes como
   algo que a veces mide. La lista es ampliable con `otro`.
2. **`existente` es la palabra de fábrica que marca una fila de referencia**, y es
   la que él usa en su archivo.
3. **Primero se elige la calle y después se lee la hoja**, porque la sección es de
   la calle. Al importar se propone el nombre del archivo como nombre de calle.

## Estado de partida

Rama `catalogo-nivelaciones`, en `6828516`. 513 pruebas verdes (175 motor + 338
app), typecheck limpio en los dos paquetes.

El modelo actual, en `packages/core/src/modelo/tipos.ts`, ya trae de C3:

```ts
export interface PuntoCalle { concepto: Concepto; codigo: string; distancia: number }
export interface Calle { id: Id; nombre: string; puntos: PuntoCalle[]; nivelaciones: Nivelacion[]; rasante: Rasante | null }
export interface Proyecto { version: 1; meta: MetaProyecto; catalogo: Catalogo; bms: BM[]; calles: Calle[]; capas: Capa[] }
```

Lo que hay que cambiar y por qué:

| Hoy | Problema con la hoja real | Queda |
|---|---|---|
| `Concepto` mete el lado dentro (`bordeIzq`, `veredaDer`) | La palabra de Max (`vereda`) no lleva lado; el lado sale de la posición | `Rol` sin lado (`vereda`), y el lado lo da el signo de `distancia` |
| `PuntoCalle.codigo`, uno solo | Un punto se escribe de varias formas | `PuntoSeccion.palabras: string[]` |
| `Catalogo` global del proyecto, `codigo → concepto` | Las distancias y las palabras son de la calle | `Calle.seccion: Seccion` |
| Nada dice si una distancia la puso Max o la app | El bombeo saldría con cara de medido | `PuntoSeccion.distanciaDeFabrica: boolean` |

**Las referencias no necesitan tipo nuevo.** `DestinoLectura` ya tiene
`{ tipo: 'suelto'; punto: PuntoSuelto }` con `etiqueta`, `offset` y `notas`, que
es exactamente lo que es una lectura sobre una cuneta existente. Se reutiliza.

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `packages/core/src/modelo/ids.ts` (crear) | `Id`, sacado de `tipos.ts` para que `seccion` no dependa del modelo entero |
| `packages/core/src/seccion/roles.ts` (crear) | `Rol`, sus etiquetas en español |
| `packages/core/src/seccion/palabras.ts` (crear) | Normalizar y comparar palabras. Hereda `normalizarCodigo` de C1 |
| `packages/core/src/seccion/seccion.ts` (crear) | `PuntoSeccion`, `Seccion`, la de fábrica, buscar por palabra y lado |
| `packages/core/src/catalogo/` (borrar) | `conceptos.ts`, `catalogo.ts` y su prueba, con sus afirmaciones recolocadas |
| `packages/core/src/modelo/tipos.ts` (modificar) | `Calle.seccion`; se retiran `PuntoCalle` y `Proyecto.catalogo` |
| `packages/app/src/importar/interpretar.ts` (crear) | De tabla de celdas + sección a lecturas, referencias y lo no importado |
| `packages/app/src/pruebas/muestras.ts` (crear) | Carga el `.xlsx` real de Max para las pruebas |
| `packages/app/src/vistas/VistaSeccion.tsx` (crear) | La sección dibujada, editable |
| `packages/app/src/vistas/VistaSubirDatos.tsx` (crear) | Subir o pegar, vista previa, asignar columnas sueltas |
| `packages/app/src/archivo/topo.ts` (modificar) | Migrar los proyectos guardados a la sección |

## Orden y paralelismo

```
D1  el modelo de la sección          (sola, bloquea todo)
     |
D2  reponer la red del modelo        (cuatro lotes EN PARALELO)
     |
     +--> D3  el intérprete          -+
     +--> D4  la pantalla de sección  |  LAS TRES EN PARALELO
     +--> D5  la migración           -+
              |
D6  la pantalla de subir datos       (necesita D3 y D4)
     |
D7  cierre                           (sola)
```

---

## Tarea D1: El modelo de la sección

**Archivos:**
- Crear: `packages/core/src/modelo/ids.ts`
- Crear: `packages/core/src/seccion/roles.ts`
- Crear: `packages/core/src/seccion/palabras.ts`, `packages/core/src/seccion/palabras.test.ts`
- Crear: `packages/core/src/seccion/seccion.ts`, `packages/core/src/seccion/seccion.test.ts`
- Borrar: `packages/core/src/catalogo/conceptos.ts`, `catalogo.ts`, `catalogo.test.ts`
- Modificar: `packages/core/src/modelo/tipos.ts`, `packages/core/src/index.ts`

**Interfaces:**
- Consume: nada.
- Produce: todo lo de abajo. Es lo que leen D2, D3, D4, D5 y D6.

```ts
export type Id = string                                    // ids.ts
export type Rol = 'eje' | 'bordeCalzada' | 'sardinel' | 'vereda' | 'cuneta' | 'peloAgua' | 'otro'
export type Lado = 'izquierda' | 'eje' | 'derecha'
export const ETIQUETA_ROL: Record<Rol, string>
export const ROLES: readonly Rol[]

export function normalizarPalabra(bruta: string): string
export function mismaPalabra(a: string, b: string): boolean

export interface PuntoSeccion {
  id: Id
  rol: Rol
  nombre: string
  distancia: number
  distanciaDeFabrica: boolean
  palabras: string[]
}
export interface Seccion {
  puntos: PuntoSeccion[]
  palabrasProgresiva: string[]
  palabrasPuntoControl: string[]
  palabrasReferencia: string[]
}

export function seccionDeFabrica(): Seccion
export function ladoDe(distancia: number): Lado
export function esPalabraDe(palabras: string[], texto: string): boolean
export function puntosConPalabra(seccion: Seccion, palabra: string): PuntoSeccion[]
export function puntoPorPalabraYLado(seccion: Seccion, palabra: string, lado: Lado): PuntoSeccion | null
export function anadirPalabra(seccion: Seccion, puntoId: Id, palabra: string): Seccion
/** true si QUEDA alguna distancia sin medir. Basta una para que el bombeo no sea de fiar. */
export function hayDistanciasDeFabrica(seccion: Seccion): boolean
```

- [ ] **Paso 1: Escribir las pruebas que fallan**

`packages/core/src/seccion/palabras.test.ts` — **recoloca** las cuatro
afirmaciones vivas de `catalogo.test.ts` sobre normalización. No se inventan
nuevas ni se pierde ninguna:

```ts
import { describe, expect, it } from 'vitest'
import { mismaPalabra, normalizarPalabra } from './palabras'

describe('normalizarPalabra', () => {
  it('no distingue mayúsculas, tildes ni espacios de sobra', () => {
    expect(normalizarPalabra(' Bórde-Í ')).toBe('borde-i')
    expect(normalizarPalabra('ZKJ')).toBe('zkj')
    expect(normalizarPalabra(' Zkj ')).toBe('zkj')
  })

  it('deja igual lo que ya está normalizado', () => {
    expect(normalizarPalabra('eje')).toBe('eje')
  })

  it('mismaPalabra compara ya normalizado por los dos lados', () => {
    expect(mismaPalabra('vereda ', 'VEREDA')).toBe(true)
    expect(mismaPalabra('vereda', 'veredas')).toBe(false)
  })
})
```

`packages/core/src/seccion/seccion.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  anadirPalabra, esPalabraDe, hayDistanciasDeFabrica, ladoDe,
  puntoPorPalabraYLado, puntosConPalabra, seccionDeFabrica,
} from './seccion'

describe('la sección de fábrica', () => {
  it('trae los siete puntos de una calle urbana, del eje hacia afuera', () => {
    const puntos = seccionDeFabrica().puntos

    expect(puntos.map((p) => p.distancia)).toEqual([-5.15, -3.65, -3.5, 0, 3.5, 3.65, 5.15])
    expect(puntos.map((p) => p.rol)).toEqual([
      'vereda', 'sardinel', 'bordeCalzada', 'eje', 'bordeCalzada', 'sardinel', 'vereda',
    ])
  })

  it('marca todas sus distancias como de fábrica', () => {
    // Sin esto, el bombeo saldría con cara de medido cuando lo puso la app.
    expect(seccionDeFabrica().puntos.every((p) => p.distanciaDeFabrica)).toBe(true)
    expect(hayDistanciasDeFabrica(seccionDeFabrica())).toBe(true)
  })

  it('conoce las palabras de la progresiva, del punto de control y de las referencias', () => {
    const s = seccionDeFabrica()

    expect(esPalabraDe(s.palabrasProgresiva, 'PROG')).toBe(true)
    expect(esPalabraDe(s.palabrasPuntoControl, 'pc')).toBe(true)
    expect(esPalabraDe(s.palabrasReferencia, 'existente ')).toBe(true)
  })

  it('cada punto tiene un nombre que se lee, con su lado dentro', () => {
    const nombres = seccionDeFabrica().puntos.map((p) => p.nombre)

    expect(nombres).toContain('Vereda izquierda')
    expect(nombres).toContain('Eje')
  })
})

describe('buscar por palabra', () => {
  it('una misma palabra puede estar en los dos lados', () => {
    // Es el caso de Max: escribe «vereda» dos veces, una a cada lado del eje.
    const conVereda = puntosConPalabra(seccionDeFabrica(), 'VEREDA')

    expect(conVereda).toHaveLength(2)
    expect(conVereda.map((p) => ladoDe(p.distancia))).toEqual(['izquierda', 'derecha'])
  })

  it('con el lado, la palabra repetida da un solo punto', () => {
    const punto = puntoPorPalabraYLado(seccionDeFabrica(), 'vereda', 'derecha')

    expect(punto?.distancia).toBe(5.15)
  })

  it('una palabra que nadie declara no da ningún punto', () => {
    expect(puntosConPalabra(seccionDeFabrica(), 'ZKJ')).toEqual([])
    expect(puntoPorPalabraYLado(seccionDeFabrica(), 'ZKJ', 'izquierda')).toBeNull()
  })
})

describe('ladoDe', () => {
  it('el signo de la distancia da el lado, y el cero es el eje', () => {
    expect(ladoDe(-3.5)).toBe('izquierda')
    expect(ladoDe(0)).toBe('eje')
    expect(ladoDe(3.5)).toBe('derecha')
  })
})

describe('anadirPalabra', () => {
  it('devuelve una sección nueva: la de entrada no se toca', () => {
    const antes = seccionDeFabrica()
    const eje = antes.puntos.find((p) => p.rol === 'eje')!

    const despues = anadirPalabra(antes, eje.id, 'ejito')

    expect(puntosConPalabra(despues, 'ejito')).toHaveLength(1)
    expect(puntosConPalabra(antes, 'ejito')).toEqual([])
  })

  it('no duplica una palabra que ya estaba, aunque venga escrita distinto', () => {
    const s = seccionDeFabrica()
    const eje = s.puntos.find((p) => p.rol === 'eje')!

    const despues = anadirPalabra(s, eje.id, ' Eje ')

    expect(despues.puntos.find((p) => p.id === eje.id)!.palabras).toEqual(
      s.puntos.find((p) => p.id === eje.id)!.palabras,
    )
  })
})
```

- [ ] **Paso 2: Ejecutar y ver que falla**

Run: `npm test --workspace packages/core -- seccion`
Esperado: FALLA, «no se encuentra el módulo `./seccion`».

- [ ] **Paso 3: Implementar el motor de la sección**

`ids.ts` es una línea: `export type Id = string`. En `tipos.ts`, sustituye la
declaración por `export type { Id } from './ids'` para que nadie tenga que
cambiar sus importaciones.

`palabras.ts` se lleva el cuerpo de `normalizarCodigo` de `catalogo.ts` **tal
cual**, con el rango de combinantes en escapes Unicode (`/[̀-ͯ]/g`),
que ya está probado y no se toca.

`roles.ts`:

```ts
export type Rol = 'eje' | 'bordeCalzada' | 'sardinel' | 'vereda' | 'cuneta' | 'peloAgua' | 'otro'

export const ROLES: readonly Rol[] = ['eje', 'bordeCalzada', 'sardinel', 'vereda', 'cuneta', 'peloAgua', 'otro']

export const ETIQUETA_ROL: Record<Rol, string> = {
  eje: 'Eje',
  bordeCalzada: 'Borde de calzada',
  sardinel: 'Sardinel',
  vereda: 'Vereda',
  cuneta: 'Cuneta',
  peloAgua: 'Pelo de agua',
  otro: 'Otro',
}
```

`seccionDeFabrica()` devuelve los siete puntos en el orden de la prueba, con ids
estables (`'p-vereda-i'`, `'p-sardinel-i'`, `'p-borde-i'`, `'p-eje'`,
`'p-borde-d'`, `'p-sardinel-d'`, `'p-vereda-d'` — así una prueba puede nombrarlos
sin depender de un generador) y estas palabras:

| Punto | Palabras |
|---|---|
| Vereda izquierda | `VI`, `VER-I`, `VEREDA-IZQ`, `VEREDA` |
| Sardinel izquierdo | `SI`, `SAR-I`, `SARDINEL-IZQ`, `SARDINEL` |
| Borde izquierdo | `BI`, `BOR-I`, `BORDE-IZQ`, `BORDE` |
| Eje | `EJE`, `CL`, `CENTRO` |
| Borde derecho | `BD`, `BOR-D`, `BORDE-DER`, `BORDE` |
| Sardinel derecho | `SD`, `SAR-D`, `SARDINEL-DER`, `SARDINEL` |
| Vereda derecha | `VD`, `VER-D`, `VEREDA-DER`, `VEREDA` |

Y `palabrasProgresiva: ['PROG', 'PK', 'ABSCISA', 'EST', 'PROGRESIVA']`,
`palabrasPuntoControl: ['PC', 'BM', 'PUNTO DE CONTROL']`,
`palabrasReferencia: ['EXISTENTE', 'EXIST', 'REF']`.

**`IZQ` y `DER` no van de fábrica a propósito.** Son etiquetas de lado y nadie
sabe si en la hoja de alguien significan el borde o el sardinel. Se asignan en la
vista previa la primera vez (D6), que es justo el caso que esa pantalla existe
para resolver.

- [ ] **Paso 4: Ejecutar y ver que pasa**

Run: `npm test --workspace packages/core -- seccion palabras`
Esperado: PASA.

- [ ] **Paso 5: Retirar el catálogo y cambiar el modelo**

Borra `packages/core/src/catalogo/`. De sus 4 afirmaciones vivas, 3 se
recolocaron en `palabras.test.ts` en el paso 1. **La cuarta —«un código
pertenece a un solo concepto, y reasignarlo avisa»— ya no es alcanzable: el spec
del 2026-08-29 la deroga**, porque una palabra vale para los dos lados. Escríbelo
en el informe con esas palabras; no la borres en silencio.

En `tipos.ts`: retira `PuntoCalle`, cambia `Calle.puntos` por
`Calle.seccion: Seccion` y retira `Proyecto.catalogo`. Actualiza `index.ts` para
exportar lo de `seccion/` en lugar de lo de `catalogo/`.

**El typecheck va a fallar en cadena, y eso es el inventario de la tarea D2.**
Guarda su salida completa en el informe: es la lista de lo que hay que reponer.

- [ ] **Paso 6: Commit**

```bash
git add -A
git commit -m "El modelo de la seccion: rol sin lado, palabras y distancia por punto"
```

**No ejecutes la batería completa aquí**: va a estar roja por el cambio de
modelo, y repararla es D2. Di en el informe cuántas fallan y por qué.

---

## Tarea D2: Reponer la red del modelo

**Cuatro lotes que van EN PARALELO.** Cada uno toca archivos que ningún otro
toca. Ninguno inventa afirmaciones nuevas: recolocan las que hay sobre el modelo
nuevo. Regla que manda en los cuatro: **si una prueba afirma algo que ya no es
alcanzable, para y dilo** en vez de borrarla o de cambiar lo que afirma. Cambiar
el número que una prueba espera está permitido; cambiar lo que afirma, no.

| Lote | Archivos |
|---|---|
| **A** | `packages/core/src/pruebas/libretaEjemplo.ts`, `packages/core/src/grilla/grilla.test.ts`, `packages/core/src/rasante/evaluar.test.ts` |
| **B** | `packages/app/src/estado/ejemplo.ts`, `packages/app/src/libreta/navegacion.test.ts` |
| **C** | `packages/app/src/componentes/CorteTransversal.test.tsx`, `packages/app/src/componentes/EditorRasante.test.tsx` |
| **D** | `packages/app/src/componentes/Vista3D.test.tsx` |

- [ ] **Paso 1: Traducir los conceptos a roles y distancias**

La traducción es mecánica y es la misma en los cuatro lotes:

| Antes | Ahora |
|---|---|
| `{ concepto: 'bordeIzq', codigo: 'BI', distancia: -4.2 }` | `{ id: 'p-borde-i', rol: 'bordeCalzada', nombre: 'Borde izquierdo', distancia: -4.2, distanciaDeFabrica: false, palabras: ['BI'] }` |
| `{ concepto: 'eje', codigo: 'EJE', distancia: 0 }` | `{ id: 'p-eje', rol: 'eje', nombre: 'Eje', distancia: 0, distanciaDeFabrica: false, palabras: ['EJE'] }` |
| `calle.puntos` | `calle.seccion.puntos` |
| `proyecto.catalogo` | se retira de la construcción del proyecto |

`distanciaDeFabrica: false` en todos los fixtures **a propósito**: son calles con
sus medidas puestas, y si fueran de fábrica saldría el aviso en pantallas cuyas
pruebas no lo esperan.

- [ ] **Paso 2: Ejecutar lo del lote y ver que pasa**

Run, según el lote: `npm test --workspace packages/core` o
`npm test --workspace packages/app -- <archivo>`

Esperado: PASA, **sin haber tocado ningún archivo de producción**. Si para que
pase hace falta cambiar producción, para y dilo: eso sería un defecto de D1, no
del fixture.

- [ ] **Paso 3: Commit del lote**

```bash
git add -A
git commit -m "Recoloca las pruebas del lote <X> sobre la seccion"
```

- [ ] **Paso 4: El controlador cierra D2**

Corre la batería entera **él mismo, no por informe**:

Run: `npm test` y `npm run typecheck --workspaces`
Esperado: verde en los dos paquetes, 0 errores de tipos.

Si el total de pruebas bajó, **audita cada una que falta** antes de seguir, con el
veredicto de siempre: LEGÍTIMA, CUBIERTA (nombrando cuál la cubre) o PERDIDA.

---

## Tarea D3: El intérprete

**Archivos:**
- Crear: `packages/app/src/importar/interpretar.ts`, `packages/app/src/importar/interpretar.test.ts`
- Crear: `packages/app/src/pruebas/muestras.ts`
- Ya existe: `packages/app/src/pruebas/muestras/detras-del-colegio.xlsx`

**Interfaces:**
- Consume: `HojaLeida`, `leerXlsx` de `packages/app/src/archivo/leerTabla.ts`;
  `Seccion`, `seccionDeFabrica`, `puntoPorPalabraYLado`, `esPalabraDe`,
  `ladoDe`, `normalizarPalabra` de D1; `parsearProgresiva` de
  `packages/core/src/grilla/progresivas.ts`.
- Produce:

```ts
export interface ColumnaLeida { indice: number; palabra: string; puntoId: Id; lado: Lado }
export interface LecturaLeida { progresiva: number; puntoId: Id; valor: number }
export interface ReferenciaLeida { elemento: string; distancia: number; valor: number }
export interface ColumnaSinAsignar { indice: number; palabra: string; muestra: string[] }
export interface NoImportado { que: string; contenido: string[] }
export interface Conflicto { que: string }

export interface HojaInterpretada {
  columnas: ColumnaLeida[]
  columnaProgresiva: number | null
  vistaAtras: number | null
  lecturas: LecturaLeida[]
  referencias: ReferenciaLeida[]
  sinAsignar: ColumnaSinAsignar[]
  noImportado: NoImportado[]
  conflictos: Conflicto[]
}

export function interpretarHoja(hoja: HojaLeida, seccion: Seccion): HojaInterpretada
```

- [ ] **Paso 1: El cargador de la muestra**

`packages/app/src/pruebas/muestras.ts`:

```ts
import { readFileSync } from 'node:fs'
import { anadirPalabra, seccionDeFabrica, type Seccion } from '@topo/core'
import { leerXlsx, type HojaLeida } from '../archivo/leerTabla'

/**
 * El archivo real que Max mandó el 2026-08-29, tal como salió de Google Sheets.
 * Es la prueba de que la app lee su hoja y no una hoja de laboratorio.
 */
export function hojaDetrasDelColegio(): HojaLeida {
  const ruta = new URL('./muestras/detras-del-colegio.xlsx', import.meta.url)
  return leerXlsx(new Uint8Array(readFileSync(ruta)))[0]!
}

/** La sección que Max habría declarado para esa calle: sus palabras sobre la de fábrica. */
export function seccionDeMax(): Seccion {
  let s = seccionDeFabrica()
  s = anadirPalabra(s, 'p-borde-i', 'IZQ')
  s = anadirPalabra(s, 'p-borde-d', 'DER')
  return s
}
```

(`VEREDA` y `EJE` ya vienen de fábrica; solo hacen falta `IZQ` y `DER`.)

- [ ] **Paso 2: Escribir las pruebas que fallan**

**Las tres primeras son el corazón de la tarea.** Las dos de «lo que no entró»
importan tanto como la de «lo que entró»: una prueba que solo compruebe lo que
entró deja pasar justo el defecto que este proyecto más teme.

```ts
import { describe, expect, it } from 'vitest'
import { seccionDeFabrica } from '@topo/core'
import { leerPegado } from '../archivo/leerTabla'
import { hojaDetrasDelColegio, seccionDeMax } from '../pruebas/muestras'
import { interpretarHoja } from './interpretar'

describe('el archivo real de Max', () => {
  it('entra entero: 7 progresivas por 5 puntos, con el lado correcto', () => {
    const c = interpretarHoja(hojaDetrasDelColegio(), seccionDeMax())

    expect([...new Set(c.lecturas.map((l) => l.progresiva))]).toEqual([6, 10, 20, 30, 40, 50, 60])
    expect(c.columnas.map((col) => col.puntoId)).toEqual([
      'p-vereda-i', 'p-borde-i', 'p-eje', 'p-borde-d', 'p-vereda-d',
    ])
    expect(c.lecturas).toHaveLength(35)
  })

  it('saca la vista atrás del preámbulo, junto a la palabra PC', () => {
    expect(interpretarHoja(hojaDetrasDelColegio(), seccionDeMax()).vistaAtras).toBe(1.45)
  })

  it('encuentra la columna de progresivas aunque no tenga título', () => {
    const c = interpretarHoja(hojaDetrasDelColegio(), seccionDeMax())

    expect(c.columnaProgresiva).toBe(1) // la B
  })

  it('lee las dos filas de referencia con su lado', () => {
    const c = interpretarHoja(hojaDetrasDelColegio(), seccionDeMax())

    expect(c.referencias).toContainEqual({ elemento: 'cuneta', distancia: -3.5, valor: 2.185 })
    expect(c.referencias).toContainEqual({ elemento: 'cuneta', distancia: 3.5, valor: 1.955 })
    expect(c.referencias).toContainEqual({ elemento: 'calzada', distancia: -3.5, valor: 2.41 })
    expect(c.referencias).toContainEqual({ elemento: 'calzada', distancia: 3.5, valor: 2.06 })
  })

  it('NO se traga la columna de cálculo, y dice que estaba', () => {
    const c = interpretarHoja(hojaDetrasDelColegio(), seccionDeMax())

    expect(c.lecturas.some((l) => l.valor === 0.125)).toBe(false)
    expect(c.noImportado.map((n) => n.que).join(' ')).toMatch(/columna/i)
    expect(c.noImportado.flatMap((n) => n.contenido)).toContain('0.125')
  })

  it('NO inventa puntos con las filas de ceros arrastrados', () => {
    const c = interpretarHoja(hojaDetrasDelColegio(), seccionDeMax())

    // Las filas 12 a 19 solo tienen el cero de la resta: no son puntos medidos.
    expect(c.lecturas.filter((l) => l.valor === 0)).toEqual([])
    expect([...new Set(c.lecturas.map((l) => l.progresiva))]).toHaveLength(7)
  })

  it('el 2.11 del preámbulo no entra, pero se enseña', () => {
    const c = interpretarHoja(hojaDetrasDelColegio(), seccionDeMax())

    expect(c.lecturas.some((l) => l.valor === 2.11)).toBe(false)
    expect(c.noImportado.flatMap((n) => n.contenido)).toContain('2.11')
  })

  it('señala el 0.23 como conflicto: dos lecturas del mismo lado en una referencia', () => {
    const c = interpretarHoja(hojaDetrasDelColegio(), seccionDeMax())

    expect(c.conflictos.map((x) => x.que).join(' ')).toMatch(/cuneta/i)
    expect(c.referencias.some((r) => r.valor === 0.23)).toBe(false)
  })

  it('con la sección de fábrica, IZQ y DER salen para asignar y NO se pierden', () => {
    // Esta es la primera importación de Max, antes de declarar nada.
    const c = interpretarHoja(hojaDetrasDelColegio(), seccionDeFabrica())

    expect(c.sinAsignar.map((s) => s.palabra)).toEqual(['IZQ', 'DER'])
    expect(c.sinAsignar[0]!.muestra).toContain('2.24')
  })

  it('pegado da exactamente lo mismo que subido', () => {
    // Es la prueba que garantiza que pegar no es un camino de segunda. La
    // simetría ya está probada al nivel de la tabla de celdas; aquí se
    // comprueba que tampoco se rompe al interpretarla.
    const subida = hojaDetrasDelColegio()
    const pegada = leerPegado(subida.celdas.map((f) => f.join('\t')).join('\n'), subida.nombre)

    expect(interpretarHoja(pegada, seccionDeMax())).toEqual(
      interpretarHoja(subida, seccionDeMax()),
    )
  })
})

describe('reglas generales', () => {
  const conCabecera = (filas: string[][]) => ({ nombre: 'x', celdas: filas })

  it('el lado sale de la posición respecto al eje, no del nombre', () => {
    const hoja = conCabecera([
      ['', 'VEREDA', 'EJE', 'VEREDA'],
      ['0', '1.10', '1.20', '1.30'],
    ])

    const c = interpretarHoja(hoja, seccionDeFabrica())

    expect(c.columnas.map((col) => col.puntoId)).toEqual(['p-vereda-i', 'p-eje', 'p-vereda-d'])
  })

  it('sin columna de eje no adivina el lado: lo dice', () => {
    const hoja = conCabecera([['', 'VEREDA', 'VEREDA'], ['0', '1.10', '1.30']])

    const c = interpretarHoja(hoja, seccionDeFabrica())

    expect(c.columnas).toEqual([])
    expect(c.conflictos.map((x) => x.que).join(' ')).toMatch(/eje/i)
  })

  it('la misma palabra dos veces del mismo lado no se reparte a ciegas', () => {
    const hoja = conCabecera([
      ['', 'VEREDA', 'VEREDA', 'EJE'],
      ['0', '1.10', '1.15', '1.20'],
    ])

    const c = interpretarHoja(hoja, seccionDeFabrica())

    expect(c.conflictos.map((x) => x.que).join(' ')).toMatch(/vereda/i)
  })

  it('una celda vacía es un punto sin medir y no produce lectura', () => {
    const hoja = conCabecera([
      ['', 'VEREDA', 'EJE'],
      ['0', '1.10', '1.20'],
      ['10', '', '1.25'],
    ])

    const c = interpretarHoja(hoja, seccionDeFabrica())

    expect(c.lecturas.filter((l) => l.progresiva === 10)).toHaveLength(1)
  })

  it('admite la progresiva escrita 0+020 o 20', () => {
    const hoja = conCabecera([['', 'EJE'], ['0+020', '1.20']])

    expect(interpretarHoja(hoja, seccionDeFabrica()).lecturas[0]!.progresiva).toBe(20)
  })

  it('una hoja sin ninguna palabra conocida no se interpreta, y lo dice con palabras', () => {
    const c = interpretarHoja(conCabecera([['nada', 'de', 'nada'], ['1', '2', '3']]), seccionDeFabrica())

    expect(c.columnas).toEqual([])
    expect(c.conflictos.map((x) => x.que).join(' ')).toMatch(/no encontr/i)
  })
})
```

- [ ] **Paso 3: Ejecutar y ver que falla**

Run: `npm test --workspace packages/app -- interpretar`
Esperado: FALLA.

- [ ] **Paso 4: Implementar**

El orden es el del apartado 4 del spec, y conviene seguirlo tal cual:

1. **Cabecera:** la primera fila que contenga alguna palabra de algún punto de la
   sección. Todo lo de encima es preámbulo.
2. **Vista atrás:** en el preámbulo, busca una celda que case con
   `palabrasPuntoControl` y toma el número de la celda siguiente.
3. **Preámbulo restante:** cada celda con contenido que no sea eso va a
   `noImportado`, con su contenido.
4. **Columna de progresivas:** la que lleve una palabra de `palabrasProgresiva`;
   si ninguna, la columna numérica **más cercana por la izquierda** a la primera
   columna de puntos. Si no hay ninguna, `columnaProgresiva: null` y un conflicto.
5. **Columnas de puntos:** para cada celda de la cabecera, `puntosConPalabra`. El
   lado sale de comparar su índice con el de la columna del eje. Sin columna de
   eje, ninguna columna entra y se añade el conflicto.
6. **Columnas que no casan** y tienen algún valor debajo: van a `sinAsignar` con
   hasta tres valores de muestra. Las que no tienen ni título ni palabra van a
   `noImportado`, también con sus valores.
7. **Filas:** una fila entra solo si tiene progresiva **y** al menos un valor bajo
   una columna de puntos. Las demás, a `noImportado`.
8. **Filas de referencia:** primera celda que case con `palabrasReferencia`. El
   elemento es la segunda celda, **texto libre**. Cada valor bajo una columna de
   puntos da una referencia con la distancia de esa columna. Dos valores del mismo
   lado en la misma fila → conflicto, y **ninguno de los dos entra**.

Para las progresivas usa `parsearProgresiva`, que ya existe.

**Los textos los lee un topógrafo:** «la columna H no lleva título y se ha dejado
fuera», no «columna 7 sin cabecera».

- [ ] **Paso 5: Ejecutar y commit**

Run: `npm test --workspace packages/app -- interpretar`
Esperado: PASA, sin avisos.

```bash
git add -A
git commit -m "Interpreta la hoja real con la seccion declarada"
```

---

## Tarea D4: La pantalla de la sección

**Archivos:**
- Crear: `packages/app/src/vistas/VistaSeccion.tsx`, `packages/app/src/vistas/VistaSeccion.test.tsx`
- Modificar: `packages/app/src/estado/almacen.ts`

**Interfaces:**
- Consume: `Seccion`, `PuntoSeccion`, `ROLES`, `ETIQUETA_ROL`, `anadirPalabra`,
  `ladoDe` de D1.
- Produce: acciones del almacén
  `cambiarDistancia(calleId: Id, puntoId: Id, distancia: number): void`,
  `anadirPalabraAPunto(calleId: Id, puntoId: Id, palabra: string): void`,
  `quitarPalabraDePunto(calleId: Id, puntoId: Id, palabra: string): void`,
  `anadirPunto(calleId: Id, rol: Rol, distancia: number): void`,
  `quitarPunto(calleId: Id, puntoId: Id): void`.

- [ ] **Paso 1: Escribir las pruebas que fallan**

```tsx
it('dibuja la sección con sus puntos colocados por distancia', () => {
  render(<VistaSeccion calleId="c1" />)

  expect(screen.getByRole('img', { name: /sección de la calle/i })).toBeInTheDocument()
  expect(screen.getByText('Eje')).toBeInTheDocument()
  expect(screen.getByText('Vereda izquierda')).toBeInTheDocument()
})

it('avisa mientras las distancias sean las de fábrica', () => {
  render(<VistaSeccion calleId="c1" />)

  expect(screen.getByText(/las distancias son las de fábrica/i)).toBeInTheDocument()
  expect(screen.getByText(/orientativ/i)).toBeInTheDocument()
})

it('al cambiar una distancia, ese punto deja de ser de fábrica', async () => {
  render(<VistaSeccion calleId="c1" />)

  await userEvent.clear(screen.getByLabelText(/distancia de Vereda izquierda/i))
  await userEvent.type(screen.getByLabelText(/distancia de Vereda izquierda/i), '-6.5')
  await userEvent.tab()

  expect(puntoDe('c1', 'p-vereda-i').distancia).toBe(-6.5)
  expect(puntoDe('c1', 'p-vereda-i').distanciaDeFabrica).toBe(false)
})

it('el aviso sigue mientras QUEDE una distancia de fábrica', async () => {
  // El bombeo entre dos puntos solo vale si los dos están medidos: que Max
  // corrija una vereda no hace fiable la pendiente contra un borde que sigue
  // puesto por la app.
  render(<VistaSeccion calleId="c1" />)
  await cambiarDistanciaDe('Vereda izquierda', '-6.5')

  expect(screen.getByText(/las distancias son las de fábrica/i)).toBeInTheDocument()
})

it('cuando ya no queda ninguna de fábrica, el aviso desaparece', async () => {
  render(<VistaSeccion calleId="c1" />)
  await cambiarTodasLasDistancias()

  expect(screen.queryByText(/las distancias son las de fábrica/i)).not.toBeInTheDocument()
})

it('se le añade a un punto la palabra con la que Max lo escribe', async () => {
  render(<VistaSeccion calleId="c1" />)

  await userEvent.type(screen.getByLabelText(/palabra nueva para Eje/i), 'ejito')
  await userEvent.click(screen.getByRole('button', { name: /añadir a Eje/i }))

  expect(puntoDe('c1', 'p-eje').palabras).toContain('ejito')
})

it('la misma palabra puede estar en los dos lados sin quejarse', async () => {
  render(<VistaSeccion calleId="c1" />)

  await anadirPalabraA('Borde izquierdo', 'bobo')
  await anadirPalabraA('Borde derecho', 'bobo')

  expect(puntoDe('c1', 'p-borde-i').palabras).toContain('bobo')
  expect(puntoDe('c1', 'p-borde-d').palabras).toContain('bobo')
})

it('se puede quitar una palabra', async () => {
  render(<VistaSeccion calleId="c1" />)

  await userEvent.click(screen.getByRole('button', { name: /quitar la palabra CL/i }))

  expect(puntoDe('c1', 'p-eje').palabras).not.toContain('CL')
})

it('se puede añadir un punto que no venía de fábrica', async () => {
  render(<VistaSeccion calleId="c1" />)

  await userEvent.selectOptions(screen.getByLabelText(/qué es el punto nuevo/i), 'peloAgua')
  await userEvent.type(screen.getByLabelText(/a qué distancia/i), '-2.8')
  await userEvent.click(screen.getByRole('button', { name: /añadir punto/i }))

  expect(seccionDe('c1').puntos.some((p) => p.rol === 'peloAgua' && p.distancia === -2.8)).toBe(true)
})

it('los puntos se enseñan ordenados de izquierda a derecha', () => {
  render(<VistaSeccion calleId="c1" />)

  const nombres = screen.getAllByRole('listitem').map((n) => n.textContent)
  expect(nombres[0]).toMatch(/Vereda izquierda/)
})
```

- [ ] **Paso 2: Ejecutar y ver que falla**

Run: `npm test --workspace packages/app -- VistaSeccion`
Esperado: FALLA.

- [ ] **Paso 3: Implementar**

Un SVG con el eje al centro y los puntos colocados por su distancia, a escala,
con su nombre. **El dibujo no es el único portador de significado**: debajo va la
lista de puntos con sus campos, y la lista sola basta para trabajar.

Cada punto: nombre, rol, distancia (con `CampoNumero`, que ya existe y ya tiene
red), y sus palabras como fichas con una equis para quitarlas más un campo para
añadir.

El aviso de distancias de fábrica va arriba, visible, con `hayDistanciasDeFabrica`.

Sigue el patrón de las vistas que ya hay; no inventes navegación nueva.

- [ ] **Paso 4: Ejecutar la batería y commit**

Run: `npm test --workspace packages/app` y `npm run typecheck --workspaces`

```bash
git add -A
git commit -m "La seccion de la calle, dibujada y editable"
```

---

## Tarea D5: Migrar los proyectos guardados

Es la C5 del plan anterior, corregida al modelo de la sección. Su texto original
sigue valiendo para las nivelaciones, los colores y las lecturas; **lo que cambia
es a qué se migran los puntos**.

**Archivos:**
- Modificar: `packages/app/src/archivo/topo.ts`
- Test: `packages/app/src/archivo/topo.test.ts`

- [ ] **Paso 1: Escribir las pruebas que fallan**

```ts
it('una calle del modelo anterior estrena sección con los puntos de su plantilla', () => {
  const recuperado = desempaquetarProyecto(empaquetarProyecto(proyectoAnterior()))
  const puntos = recuperado.calles[0]!.seccion.puntos

  expect(puntos.map((p) => p.rol)).toEqual(['bordeCalzada', 'eje'])
  expect(puntos[0]!.distancia).toBe(-4.2)
  expect(puntos[0]!.palabras).toContain('BOR-I')
})

it('las distancias que venían de la plantilla NO se marcan como de fábrica', () => {
  // Son medidas que Max puso; decir que las puso la app sería mentir en pantalla.
  const recuperado = desempaquetarProyecto(empaquetarProyecto(proyectoAnterior()))

  expect(recuperado.calles[0]!.seccion.puntos.every((p) => p.distanciaDeFabrica)).toBe(false)
})

it('una calle sin plantilla estrena la sección de fábrica y se anota', () => {
  // Antes se quedaba sin puntos. Ahora puede arrancar de fábrica porque el aviso
  // de «distancias de fábrica» impide que se lean como medidas.
  const recuperado = desempaquetarProyecto(empaquetarProyecto(proyectoAnteriorSinPlantilla()))

  expect(recuperado.calles[0]!.seccion.puntos).toHaveLength(7)
  expect(recuperado.calles[0]!.seccion.puntos.every((p) => p.distanciaDeFabrica)).toBe(true)
})

it('cada campaña se convierte en una nivelación de una sola toma', () => {
  const recuperado = desempaquetarProyecto(empaquetarProyecto(proyectoAnteriorConDosCampanias()))

  expect(recuperado.calles[0]!.nivelaciones).toHaveLength(2)
  expect(recuperado.calles[0]!.nivelaciones[0]!.tomas).toHaveLength(1)
})

it('las lecturas sobreviven intactas a la migración', () => {
  const viejo = proyectoAnteriorConDosCampanias()
  const recuperado = desempaquetarProyecto(empaquetarProyecto(viejo))

  expect(recuperado.calles[0]!.nivelaciones[0]!.tomas[0]!.estaciones).toEqual(viejo.campanias[0]!.estaciones)
})

it('cada nivelación migrada recibe un color distinto', () => {
  const recuperado = desempaquetarProyecto(empaquetarProyecto(proyectoAnteriorConDosCampanias()))
  const colores = recuperado.calles[0]!.nivelaciones.map((n) => n.color)

  expect(new Set(colores).size).toBe(colores.length)
})

it('el catálogo viejo se convierte en palabras de los puntos, no se tira', () => {
  const viejo = proyectoAnteriorConCatalogoAprendido() // trae ZKJ → eje
  const recuperado = desempaquetarProyecto(empaquetarProyecto(viejo))
  const eje = recuperado.calles[0]!.seccion.puntos.find((p) => p.rol === 'eje')!

  expect(eje.palabras.map((p) => p.toLowerCase())).toContain('zkj')
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

Encadena `migrarASeccion` en `migrarProyecto`, junto a `migrarCapasSinOrden` y
`migrarCamposDe2B`. **Detecta por forma, no por número de versión**, como las dos
que ya hay: una calle sin `seccion` es una calle vieja.

Cada elemento de la plantilla da un `PuntoSeccion`: el rol sale de buscar su clave
entre las palabras de fábrica; si no aparece, `rol: 'otro'` **y se anota** en vez
de adivinar. La clave se guarda como su primera palabra. `distanciaDeFabrica`
queda en `false`: son medidas de Max.

Los códigos que el catálogo viejo hubiera aprendido se reparten como palabras del
punto de su concepto, traduciendo `bordeIzq` → el punto `bordeCalzada` de
distancia negativa, y así con los demás. **Un código aprendido que no encuentre
punto se anota**; no se pierde en silencio.

Las estaciones, lecturas, bancos de nivel, capas y rasantes **no se tocan**.

- [ ] **Paso 4: Ejecutar la batería y commit**

Run: `npm test` y `npm run typecheck --workspaces`

```bash
git add -A
git commit -m "Migra los proyectos guardados a la seccion declarada"
```

---

## Tarea D6: La pantalla de subir datos

**Necesita D3 y D4 terminadas.**

**Archivos:**
- Crear: `packages/app/src/vistas/VistaSubirDatos.tsx`, `packages/app/src/vistas/VistaSubirDatos.test.tsx`
- Modificar: `packages/app/src/estado/almacen.ts`, `packages/app/src/App.tsx`, `packages/app/src/componentes/BarraSuperior.tsx`

**Interfaces:**
- Consume: `leerXlsx`, `leerCsv`, `leerPegado` de C2; `interpretarHoja` de D3;
  `anadirPalabraAPunto` de D4.
- Produce: acción `importarHoja(calleId: Id, hoja: HojaInterpretada, fecha: string, capaId: Id): void`.

- [ ] **Paso 1: Escribir las pruebas que fallan**

```tsx
it('primero se elige la calle, y propone el nombre del archivo', async () => {
  render(<VistaSubirDatos />)
  await elegirArchivo(archivoDetrasDelColegio())

  expect(screen.getByLabelText(/a qué calle/i)).toHaveValue('detras-del-colegio')
})

it('enseña lo que ha entendido antes de aceptar nada', async () => {
  render(<VistaSubirDatos />)
  await elegirArchivo(archivoDetrasDelColegio())

  expect(screen.getByText(/7 progresivas/)).toBeInTheDocument()
  expect(screen.getByText(/vista atrás/i)).toBeInTheDocument()
  expect(screen.getByText(/1\.45/)).toBeInTheDocument()
})

it('enseña lo que NO importó, con su contenido', async () => {
  render(<VistaSubirDatos />)
  await elegirArchivo(archivoDetrasDelColegio())

  expect(screen.getByText(/no import/i)).toBeInTheDocument()
  expect(screen.getByText(/0\.125/)).toBeInTheDocument()
  expect(screen.getByText(/2\.11/)).toBeInTheDocument()
})

it('una columna sin asignar se coloca ahí mismo, y la palabra queda guardada', async () => {
  render(<VistaSubirDatos />)
  await elegirArchivo(archivoDetrasDelColegio())

  await userEvent.selectOptions(screen.getByLabelText(/dónde va la columna IZQ/i), 'p-borde-i')
  await userEvent.click(screen.getByRole('button', { name: /importar/i }))

  expect(puntoDe(calleImportada(), 'p-borde-i').palabras).toContain('IZQ')
})

it('no deja importar mientras quede una columna medida sin colocar', async () => {
  render(<VistaSubirDatos />)
  await elegirArchivo(archivoDetrasDelColegio())

  // Dejar fuera una columna medida es perder trabajo de campo en silencio.
  expect(screen.getByRole('button', { name: /importar/i })).toBeDisabled()
  expect(screen.getByText(/hay 2 columnas sin colocar/i)).toBeInTheDocument()
})

it('acepta datos pegados igual que un archivo', async () => {
  render(<VistaSubirDatos />)

  await pegarTexto('\tVEREDA\tEJE\n0\t1.10\t1.20\n')

  expect(screen.getByText(/1 progresiva/)).toBeInTheDocument()
})

it('nada entra en el proyecto hasta que se confirma', async () => {
  const antes = useAlmacen.getState().proyecto
  render(<VistaSubirDatos />)

  await elegirArchivo(archivoDetrasDelColegio())

  expect(useAlmacen.getState().proyecto).toBe(antes)
})

it('importar sobre una calle que ya existe añade una toma, no la pisa', async () => {
  conCalleYaImportada('Detrás del colegio')
  const antes = tomasDe('Detrás del colegio').length

  render(<VistaSubirDatos />)
  await importarLaMuestraEn('Detrás del colegio')

  expect(callesLlamadas('Detrás del colegio')).toHaveLength(1)
  expect(tomasDe('Detrás del colegio').length).toBe(antes + 1)
})

it('avisa de que la toma no cierra, con palabras de topógrafo', async () => {
  render(<VistaSubirDatos />)
  await importarLaMuestraEn('Detrás del colegio')

  expect(screen.getByText(/no cierra|sin comprobar/i)).toBeInTheDocument()
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

Dos entradas —un campo de archivo que acepta `.xlsx` y `.csv`, y un área donde
pegar— que **acaban en el mismo camino**: leer a celdas, elegir calle,
interpretar con la sección de esa calle, previsualizar.

La vista previa lleva, en este orden: la calle, el dibujo de la sección con las
columnas colocadas encima, las cuentas, las referencias, **lo no importado con su
contenido**, los conflictos, y las columnas sin asignar con un desplegable de los
puntos de la sección.

Asignar una columna llama a `anadirPalabraAPunto` y vuelve a interpretar: así lo
que se ve es siempre el resultado de verdad y no una promesa.

El botón de importar queda deshabilitado mientras quede una columna sin colocar,
**y se dice por qué**.

Añade la pestaña a la barra superior.

- [ ] **Paso 4: Ejecutar la batería y commit**

Run: `npm test` y `npm run typecheck --workspaces`

```bash
git add -A
git commit -m "Sube o pega la hoja de campo, con vista previa y columnas sin colocar"
```

---

## Tarea D7: Cierre

- [ ] **Paso 1: Batería completa**

```
npm test
npm run typecheck --workspaces
npm run build --workspace packages/app
npm audit --omit=dev
```

Todo sin avisos. Anota el tamaño del paquete y la cuenta de pruebas.

- [ ] **Paso 2: Verificación en navegador real**

`packages/app/verificacion/importar.mjs`, siguiendo el patrón de los seis que ya
existen: importar `packages/app/src/pruebas/muestras/detras-del-colegio.xlsx` de
verdad, colocar `IZQ` y `DER`, confirmar, y comprobar que después hay cotas,
perfil y modelo. **Y el camino del pegado**, que es el que más fácil se queda sin
probar.

**No lo ejecutes** (necesita servidor). Déjalo listo y dilo en el informe.

Los otros seis guiones navegan por pestañas que cambian: léelos y di qué ajustar.

- [ ] **Paso 3: Documentación**

`docs/uso.md`: cómo se empieza pasa a ser **declarar la sección e importar**, con
el archivo de Max como ejemplo trabajado. Quita lo de definir plantillas y calles
a mano y lo del catálogo de códigos.

README con la cuenta de pruebas. Y `docs/decisiones-seccion-declarada.md`, con el
formato de `docs/decisiones-entrega-2b.md`.

- [ ] **Paso 4: Decidir sobre `generarProgresivas`**

Quedó anotado en el plan anterior: está muerta —solo la llama su propio test— y
conserva 8 pruebas, mientras `progresivasMedidas` ya tiene la suya. Ahora que el
intérprete existe, **decídelo con el código delante** y escribe el porqué.

- [ ] **Paso 5: Commit**

```bash
git add -A
git commit -m "Cierre: verificacion en navegador, guia y decisiones"
```

---

## Lo que queda fuera

El **bloque B**, con su propio diseño: el panel de comparación con colores, las
diferencias entre nivelaciones, las pendientes entre progresivas y las vistas
afinadas.

Y los tres bloques del replanteamiento que siguen pendientes: movimiento de
tierras, material con esponjamiento, y el recomendador de pendientes.
