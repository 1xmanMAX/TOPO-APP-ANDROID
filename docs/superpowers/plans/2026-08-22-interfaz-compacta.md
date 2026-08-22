# Interfaz compacta: plan de implementación

> **Para trabajadores agénticos:** SUB-SKILL REQUERIDA: usa
> superpowers:subagent-driven-development para implementar este plan tarea por
> tarea. Los pasos usan casillas (`- [ ]`) para el seguimiento.

**Objetivo:** pasar de seis pestañas a tres y aprovechar el ancho de la pantalla,
sin que ninguna función se quede sin sitio.

**Arquitectura:** las vistas actuales no se reescriben: se **recolocan**.
`VistaProyecto`, `VistaPlantilla` y `VistaCalle` pasan a ser secciones de una
`VistaObra`; la lista de campañas baja a una barra dentro de la libreta; y en
Resultados las cinco vistas del control contra el proyecto dejan de apilarse y se
turnan en un grupo de pestañas. El motor no se toca.

**Stack:** TypeScript, React 19, Vite 7, Tailwind v4, Vitest + jsdom + Testing
Library, Zustand. **Sin dependencias nuevas.**

**Spec:** `docs/superpowers/specs/2026-08-22-interfaz-compacta-design.md`

## Cuándo se ejecuta este plan

**Después de cerrar la Entrega 3 (visor 3D) e integrarla.** Las dos tocan
`VistaResultados`, y el grupo de vistas que se turnan incluye el visor 3D como
quinta pestaña. Ejecutar los dos a la vez sería pelearse por el mismo archivo.

## Restricciones globales

- Español en identificadores, textos, comentarios y mensajes de commit. **Sin `ñ`
  en identificadores** (`Campania`, no `Campaña`); en textos visibles sí va la ñ.
- **`packages/core` no se toca en este trabajo.** Si una tarea parece necesitarlo,
  para y dilo.
- **Sin dependencias nuevas.**
- Ninguna función se añade ni se quita; ningún dato cambia de forma; el archivo
  `.topo` queda idéntico.
- Los datos crudos no se sobrescriben jamás; todo se deriva.
- Nada de jerga de programador en textos visibles.
- El color nunca es el único portador de significado.
- Un dato calculado sobre una nivelación que no cerró se marca como **no
  comprobado**, y **las cinco vistas quedan bajo un solo aviso**. Esa regla costó
  tres apariciones del mismo defecto: una sola sección, un solo aviso.
- **La campaña de referencia se recibe por parámetro**, nunca leyendo el estado
  global desde el componente de vista.
- El contenido ancho hace scroll dentro de su caja; **la página nunca se desborda
  en horizontal**.
- La salida de las pruebas queda **sin avisos**.

## Estado de partida

`packages/app/src/estado/almacen.ts` define hoy:

```ts
export type Vista = 'proyecto' | 'plantilla' | 'calle' | 'campanias' | 'libreta' | 'resultados'
```

Y `App.tsx` renderiza una vista por cada valor. `BarraSuperior.tsx` tiene la lista
`PESTANAS` con los seis textos.

## Estructura de archivos

| Archivo | Qué le pasa |
|---|---|
| `estado/almacen.ts` | `Vista` pasa a tres valores; entra `vistaControl` |
| `componentes/BarraSuperior.tsx` | Tres pestañas en vez de seis |
| `componentes/Plegable.tsx` (crear) | Bloque que se abre y cierra, con resumen visible cerrado |
| `vistas/VistaObra.tsx` (crear) | Reúne proyecto, capas, calle, plantilla y rasante |
| `componentes/BarraCampania.tsx` (crear) | La jornada activa y sus acciones, dentro de la libreta |
| `componentes/GrupoControl.tsx` (crear) | Las cinco vistas turnándose |
| `vistas/VistaProyecto.tsx` | Deja de ser vista; su contenido se parte en dos secciones |
| `vistas/VistaPlantilla.tsx` | Deja de ser vista; pasa a sección plegable |
| `vistas/VistaCalle.tsx` | Deja de ser vista; pasa a sección |
| `vistas/VistaCampanias.tsx` | Deja de ser vista; su lista pasa al desplegable de la barra |
| `vistas/VistaLibreta.tsx` | Gana la barra de campaña arriba |
| `vistas/VistaResultados.tsx` | Dos columnas arriba; el control pasa a `GrupoControl` |
| `App.tsx` | Tres vistas en vez de seis |
| `verificacion/*.mjs` | Navegación ajustada a las tres pestañas |

---

## Tarea C1: El bloque plegable

Se hace primero porque las tareas siguientes lo usan.

**Archivos:**
- Crear: `packages/app/src/componentes/Plegable.tsx`
- Test: `packages/app/src/componentes/Plegable.test.tsx`

**Interfaces:**
- Produce: `<Plegable titulo={string} resumen={string} abiertoPorDefecto={boolean}>{children}</Plegable>`

- [ ] **Paso 1: Escribir las pruebas que fallan**

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import Plegable from './Plegable'

describe('Plegable', () => {
  it('cerrado, dice qué contiene sin que haya que abrirlo', () => {
    render(
      <Plegable titulo="Plantilla" resumen="7 puntos, de −5.60 a +5.60 m">
        <p>contenido</p>
      </Plegable>,
    )

    expect(screen.getByText('7 puntos, de −5.60 a +5.60 m')).toBeInTheDocument()
    expect(screen.queryByText('contenido')).toBeNull()
  })

  it('al abrirlo aparece el contenido', async () => {
    render(
      <Plegable titulo="Plantilla" resumen="7 puntos">
        <p>contenido</p>
      </Plegable>,
    )

    await userEvent.click(screen.getByRole('button', { name: /Plantilla/ }))

    expect(screen.getByText('contenido')).toBeInTheDocument()
  })

  it('dice si está abierto o cerrado, para quien no lo ve', async () => {
    render(
      <Plegable titulo="Rasante" resumen="sin definir">
        <p>contenido</p>
      </Plegable>,
    )

    const boton = screen.getByRole('button', { name: /Rasante/ })
    expect(boton).toHaveAttribute('aria-expanded', 'false')

    await userEvent.click(boton)
    expect(boton).toHaveAttribute('aria-expanded', 'true')
  })

  it('puede nacer abierto cuando lo que contiene se consulta a menudo', () => {
    render(
      <Plegable titulo="Capas" resumen="4 capas" abiertoPorDefecto>
        <p>contenido</p>
      </Plegable>,
    )

    expect(screen.getByText('contenido')).toBeInTheDocument()
  })
})
```

- [ ] **Paso 2: Ejecutar y ver que falla**

Run: `npm test --workspace packages/app -- Plegable`
Esperado: FALLA, no existe el componente.

- [ ] **Paso 3: Implementar**

Un `<button>` con `aria-expanded` y `aria-controls`, y el contenido en un
contenedor con el `id` correspondiente. El título y el resumen van **los dos
dentro del botón**, para que el resumen se lea aunque esté cerrado y forme parte
del nombre accesible.

Sigue la paleta y los espaciados que ya usan las secciones de `VistaResultados`;
no inventes estilos nuevos.

- [ ] **Paso 4: Ejecutar y ver que pasa**

Run: `npm test --workspace packages/app -- Plegable`
Esperado: PASA.

- [ ] **Paso 5: Commit**

```bash
git add -A
git commit -m "Añade el bloque plegable que dice qué contiene sin abrirlo"
```

---

## Tarea C2: Las tres pestañas

**Archivos:**
- Modificar: `packages/app/src/estado/almacen.ts`
- Modificar: `packages/app/src/componentes/BarraSuperior.tsx`
- Modificar: `packages/app/src/App.tsx`
- Crear: `packages/app/src/vistas/VistaObra.tsx`
- Test: `packages/app/src/componentes/BarraSuperior.test.tsx`
- Test: `packages/app/src/vistas/VistaObra.test.tsx`

**Interfaces:**
- Consume: `<Plegable>` de C1.
- Produce: `export type Vista = 'obra' | 'libreta' | 'resultados'`; `<VistaObra />`.

- [ ] **Paso 1: Escribir las pruebas que fallan**

```tsx
// BarraSuperior.test.tsx
it('tiene tres pestañas, no seis', () => {
  render(<BarraSuperior />)

  expect(screen.getByRole('button', { name: 'Obra' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Libreta' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Resultados' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Plantilla' })).toBeNull()
  expect(screen.queryByRole('button', { name: 'Campañas' })).toBeNull()
})
```

```tsx
// VistaObra.test.tsx
it('reúne los datos de la obra, los bancos de nivel y las capas', () => {
  render(<VistaObra />)

  expect(screen.getByLabelText(/Nombre del proyecto/i)).toBeInTheDocument()
  expect(screen.getByText(/Bancos de nivel/i)).toBeInTheDocument()
  expect(screen.getByText(/Capas/i)).toBeInTheDocument()
})

it('la plantilla ya no es una pantalla: vive dentro de la calle, plegada', () => {
  render(<VistaObra />)

  const plantilla = screen.getByRole('button', { name: /Plantilla/ })
  expect(plantilla).toHaveAttribute('aria-expanded', 'false')
})

it('la plantilla plegada dice cuántos puntos tiene y hasta dónde llega', () => {
  render(<VistaObra />)

  // La plantilla del ejemplo va de −5.60 a +5.60 con 7 elementos.
  expect(screen.getByText(/7 puntos/)).toBeInTheDocument()
  expect(screen.getByText(/5\.60/)).toBeInTheDocument()
})

it('la rasante plegada dice si está definida', () => {
  render(<VistaObra />)

  // El proyecto de ejemplo nace sin rasante.
  expect(screen.getByText(/sin definir/i)).toBeInTheDocument()
})

it('se puede editar la plantilla desde su nuevo sitio', async () => {
  render(<VistaObra />)
  await userEvent.click(screen.getByRole('button', { name: /Plantilla/ }))

  expect(screen.getAllByLabelText(/Distancia al eje/i).length).toBeGreaterThan(0)
})

it('se puede definir la rasante desde su nuevo sitio', async () => {
  render(<VistaObra />)
  await userEvent.click(screen.getByRole('button', { name: /Rasante/ }))

  expect(screen.getByRole('button', { name: /definir la rasante/i })).toBeInTheDocument()
})
```

**Las tres últimas pruebas son las que importan.** El riesgo de este trabajo no es
que quede feo: es que **algo deje de ser alcanzable**. Cada cosa que se mueve
necesita una prueba que la haga desde su sitio nuevo.

- [ ] **Paso 2: Ejecutar y ver que falla**

Run: `npm test --workspace packages/app -- BarraSuperior VistaObra`
Esperado: FALLA.

- [ ] **Paso 3: Cambiar el tipo y la barra**

En `almacen.ts`:

```ts
export type Vista = 'obra' | 'libreta' | 'resultados'
```

El typecheck fallará en todos los sitios que usan los valores viejos. **Esa lista
es el inventario de lo que hay que recolocar.** El valor inicial del estado pasa a
`'obra'`.

En `BarraSuperior.tsx`, la lista `PESTANAS` pasa a tres entradas.

- [ ] **Paso 4: Crear VistaObra**

Reúne, en este orden:

1. **Dos columnas** en pantalla ancha (`md:grid-cols-2`), que se apilan en
   estrecha: a la izquierda los datos del proyecto y los bancos de nivel, a la
   derecha las capas. Las dos **abiertas**, porque se consultan a menudo.
2. **La calle** debajo, a todo lo ancho, con la plantilla y la rasante en sendos
   `<Plegable>` **cerrados**.

**No reescribas el contenido.** Saca los bloques tal cual de `VistaProyecto.tsx`,
`VistaPlantilla.tsx` y `VistaCalle.tsx`. Si un bloque es grande, extráelo a su
propio componente en `componentes/` y úsalo desde aquí — pero su JSX interno no
cambia.

Los resúmenes de los plegables:

- Plantilla: `${n} puntos, de ${min} a ${max} m` con los offsets reales.
- Rasante: `${cota} en ${progresiva}, ${pendiente} %` si está definida;
  `sin definir` si no.

- [ ] **Paso 5: Ajustar App.tsx**

Tres vistas. `VistaProyecto`, `VistaPlantilla` y `VistaCalle` dejan de
importarse ahí.

- [ ] **Paso 6: Ejecutar la batería**

Run: `npm test` y `npm run typecheck --workspaces`

Van a fallar las pruebas de las vistas que dejaron de existir como pantalla.
**Reubícalas, no las borres**: cada una comprueba algo que sigue siendo
alcanzable, solo que desde otro sitio. Si alguna comprueba algo que de verdad ya
no existe, **para y dilo**: significaría que se perdió una función.

- [ ] **Paso 7: Commit**

```bash
git add -A
git commit -m "Reúne proyecto, plantilla y calle en una sola pantalla"
```

---

## Tarea C3: La jornada, dentro de la libreta

**Archivos:**
- Crear: `packages/app/src/componentes/BarraCampania.tsx`
- Modificar: `packages/app/src/vistas/VistaLibreta.tsx`
- Test: `packages/app/src/componentes/BarraCampania.test.tsx`

- [ ] **Paso 1: Escribir las pruebas que fallan**

```tsx
it('enseña la jornada activa con su calle, su capa y su fecha', () => {
  render(<BarraCampania />)

  expect(screen.getByText(/Av\. Sol/)).toBeInTheDocument()
  expect(screen.getByText(/SUBRASANTE/)).toBeInTheDocument()
})

it('deja cambiar de jornada sin salir de la libreta', async () => {
  conDosCampanias()
  render(<BarraCampania />)

  await userEvent.click(screen.getByRole('button', { name: /cambiar/i }))
  await userEvent.click(screen.getByRole('button', { name: /Abrir campaña del/ }))

  expect(useAlmacen.getState().campaniaActivaId).not.toBe('camp-1')
})

it('deja crear una jornada nueva sin salir de la libreta', async () => {
  render(<BarraCampania />)
  const antes = useAlmacen.getState().proyecto.campanias.length

  await userEvent.click(screen.getByRole('button', { name: /nueva/i }))

  expect(useAlmacen.getState().proyecto.campanias.length).toBe(antes + 1)
})

it('con la lista desplegada se pueden cambiar calle, capa y banco de nivel', async () => {
  render(<BarraCampania />)
  await userEvent.click(screen.getByRole('button', { name: /cambiar/i }))

  expect(screen.getAllByLabelText(/Calle de la campaña/).length).toBeGreaterThan(0)
  expect(screen.getAllByLabelText(/Capa de la campaña/).length).toBeGreaterThan(0)
  expect(screen.getAllByLabelText(/BM de la campaña/).length).toBeGreaterThan(0)
})
```

**La última prueba es la red de seguridad de esta tarea:** la pantalla de campañas
tenía cuatro selectores por campaña, y los cuatro tienen que seguir existiendo.

- [ ] **Paso 2: Ejecutar y ver que falla**

Run: `npm test --workspace packages/app -- BarraCampania`
Esperado: FALLA.

- [ ] **Paso 3: Implementar**

Una barra compacta: `Av. Sol · SUBRASANTE · 2026-08-19` y dos botones,
`Cambiar` y `Nueva jornada`.

`Cambiar` despliega **la lista que hoy está en `VistaCampanias`**, entera y sin
recortar. Sácala tal cual; no la reescribas.

Ponla arriba del todo en `VistaLibreta`, antes del panel de estación.

- [ ] **Paso 4: Ejecutar la batería**

Run: `npm test` y `npm run typecheck --workspaces`
Esperado: en verde. Reubica las pruebas de `VistaCampanias` que sigan valiendo.

- [ ] **Paso 5: Commit**

```bash
git add -A
git commit -m "Baja la jornada a una barra dentro de la libreta"
```

---

## Tarea C4: Las cinco vistas se turnan

**Archivos:**
- Crear: `packages/app/src/componentes/GrupoControl.tsx`
- Modificar: `packages/app/src/vistas/VistaResultados.tsx`
- Modificar: `packages/app/src/estado/almacen.ts`
- Test: `packages/app/src/componentes/GrupoControl.test.tsx`

**Interfaces:**
- Produce: en el estado, `vistaControl: VistaControl` con
  `type VistaControl = 'tabla' | 'mapa' | 'corte' | 'perfil' | 'modelo'`, y la
  acción `fijarVistaControl(v: VistaControl): void`.

- [ ] **Paso 1: Escribir las pruebas que fallan**

```tsx
it('las cinco vistas son pestañas de verdad, no botones sueltos', () => {
  render(<GrupoControl idCampaniaReferencia="camp-1" />)

  const grupo = screen.getByRole('tablist')
  expect(within(grupo).getAllByRole('tab')).toHaveLength(5)
})

it('al entrar se ve la tabla, que es la que da los números exactos', () => {
  render(<GrupoControl idCampaniaReferencia="camp-1" />)

  expect(screen.getByRole('tab', { name: /Tabla/ })).toHaveAttribute('aria-selected', 'true')
})

it('solo se dibuja la vista elegida, no las cinco', async () => {
  render(<GrupoControl idCampaniaReferencia="camp-1" />)
  await userEvent.click(screen.getByRole('tab', { name: /Mapa/ }))

  expect(screen.getByRole('tab', { name: /Mapa/ })).toHaveAttribute('aria-selected', 'true')
  expect(screen.getByRole('tab', { name: /Tabla/ })).toHaveAttribute('aria-selected', 'false')
})

it('la vista elegida se recuerda al ir y volver', async () => {
  const { unmount } = render(<GrupoControl idCampaniaReferencia="camp-1" />)
  await userEvent.click(screen.getByRole('tab', { name: /Perfil/ }))
  unmount()

  render(<GrupoControl idCampaniaReferencia="camp-1" />)
  expect(screen.getByRole('tab', { name: /Perfil/ })).toHaveAttribute('aria-selected', 'true')
})

it('el aviso de nivelación cubre las cinco, no solo la que se ve', async () => {
  conCircuitoSinCerrar()
  render(<GrupoControl idCampaniaReferencia="camp-1" />)

  expect(screen.getByText(/NO COMPROBAD/i)).toBeInTheDocument()

  await userEvent.click(screen.getByRole('tab', { name: /Mapa/ }))
  expect(screen.getByText(/NO COMPROBAD/i)).toBeInTheDocument()
})

it('se recorren con las flechas del teclado', async () => {
  render(<GrupoControl idCampaniaReferencia="camp-1" />)
  screen.getByRole('tab', { name: /Tabla/ }).focus()

  await userEvent.keyboard('{ArrowRight}')

  expect(screen.getByRole('tab', { name: /Mapa/ })).toHaveFocus()
})
```

**La quinta prueba es la que no se puede perder.** El aviso de que la nivelación
no está comprobada tiene que seguir cubriendo las cinco vistas. Ese defecto
apareció **tres veces** en este proyecto: una sola sección, un solo aviso.

- [ ] **Paso 2: Ejecutar y ver que falla**

Run: `npm test --workspace packages/app -- GrupoControl`
Esperado: FALLA.

- [ ] **Paso 3: Añadir el estado**

En `almacen.ts`, junto a la cámara del visor, porque es de la misma familia —
estado de sesión que describe lo que se está mirando, no el trabajo:

```ts
export type VistaControl = 'tabla' | 'mapa' | 'corte' | 'perfil' | 'modelo'
```

Valor inicial `'tabla'`. **Fuera del objeto `proyecto`**, como `seleccion` y
`camara`.

- [ ] **Paso 4: Implementar el grupo**

Semántica de pestañas de verdad: un contenedor con `role="tablist"`, cada botón
con `role="tab"`, `aria-selected` y `aria-controls`, y el contenido con
`role="tabpanel"`.

Las flechas izquierda y derecha mueven el foco entre pestañas. **Solo la pestaña
activa entra en el orden de tabulación** (`tabIndex` 0 en la activa, −1 en las
demás): así se sale del grupo con una sola pulsación de tabulador en vez de cinco.

El aviso de nivelación va **arriba del grupo**, fuera del panel, para que se vea
con cualquier pestaña.

**No toques los cinco componentes de vista.** Reciben lo mismo que hoy, incluida
`idCampaniaReferencia` por parámetro.

- [ ] **Paso 5: Reorganizar VistaResultados**

Las dos tablas de arriba —cotas y espesor entre capas— en dos columnas
(`md:grid-cols-2`), apilándose en pantalla estrecha. Debajo, `<GrupoControl>`.

- [ ] **Paso 6: Ejecutar la batería**

Run: `npm test` y `npm run typecheck --workspaces`

Varias pruebas de `VistaResultados` esperan ver las cinco vistas a la vez.
**Ajústalas para que primero elijan la pestaña**, sin cambiar lo que afirman. Si
alguna afirma algo que ya no es alcanzable, para y dilo.

- [ ] **Paso 7: Commit**

```bash
git add -A
git commit -m "Las cinco vistas del control se turnan en vez de apilarse"
```

---

## Tarea C5: Cierre

- [ ] **Paso 1: Batería completa**

```
npm test
npm run typecheck --workspaces
npm run build --workspace packages/app
npm audit --omit=dev
```

Anota el tamaño del paquete. Todo sin avisos.

- [ ] **Paso 2: Ajustar los guiones de navegador**

Los tres guiones de `packages/app/verificacion/` navegan por nombre de pestaña:
hacen clic en `Proyecto`, `Plantilla`, `Calle` o `Campañas`, que ya no existen.
Ajústalos a la navegación nueva:

- Lo que iba a `Proyecto`, `Plantilla` o `Calle` ahora va a **Obra**, y si el
  bloque está plegado hay que abrirlo primero.
- Lo que iba a `Campañas` ahora va a **Libreta** y despliega la barra de jornada.
- En Resultados, antes de comprobar una vista hay que **elegir su pestaña**.

Son 48 comprobaciones que protegen las tres entregas anteriores: **ninguna se
borra**. Si alguna deja de tener sentido, para y dilo.

**No los ejecutes** (necesitan servidor levantado). Déjalos listos y dilo en el
informe; los ejecuto yo.

- [ ] **Paso 3: Documentación**

En `docs/uso.md`, el orden de trabajo pasa de seis pasos a tres. Reescribe esa
sección y las referencias a pestañas que ya no existen. **Repasa el documento
entero**: cualquier frase que diga «ve a la pestaña X» tiene que apuntar al sitio
nuevo.

Actualiza el README con la cuenta de pruebas.

Escribe `docs/decisiones-interfaz-compacta.md` con las decisiones tomadas durante
la ejecución, siguiendo el formato de `docs/decisiones-entrega-2b.md`: qué se
decidió, por qué, y qué costaría si resulta equivocado.

- [ ] **Paso 4: Commit**

```bash
git add -A
git commit -m "Cierre de la interfaz compacta: verificación y guía"
```

---

## Lo que queda fuera

| Fuera | Por qué |
|---|---|
| Rediseño visual (colores, tipografía, iconos) | Max pidió reorganizar, no repintar |
| Atajos de teclado nuevos | Cabe después, cuando la estructura esté asentada |
| Guardar la disposición en el `.topo` | Es estado de sesión, como la cámara |
| Vista de móvil específica | Las dos columnas ya se apilan en estrecho; una vista propia es otro trabajo |
