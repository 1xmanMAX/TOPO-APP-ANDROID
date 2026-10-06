import type { Id } from '@topo/core'
import { useEffect, useRef, useState } from 'react'
import { useAlmacen } from '../../estado/almacen'
import AjustesObra, { type ApartadoObra } from './AjustesObra'
import InicioObra from './InicioObra'
import PanelCalle, { type ApartadoCalle } from './PanelCalle'

function alternarEn<T>(conjunto: Set<T>, valor: T): Set<T> {
  const nuevo = new Set(conjunto)
  if (nuevo.has(valor)) nuevo.delete(valor)
  else nuevo.add(valor)
  return nuevo
}

/**
 * Obra › Calles.
 *
 * En el celular (pantalla 4 del lienzo) se ve primero el inicio: dónde lo
 * dejaste, subir hoja, nueva jornada, las calles con sus capas y los BMs.
 * Elegir una calle abre su panel en lugar de la lista, con «Volver a la obra».
 *
 * En la laptop (pantalla 10) van a la vez: el inicio a la izquierda y el panel
 * de la calle a la derecha; los bancos de nivel, las capas y el instrumento,
 * debajo del inicio, o en su propia columna si la pantalla es ancha.
 *
 * Mirar una calle aquí NO cambia la jornada activa: Max puede estar a media
 * jornada en una calle, entrar a Obra a ver otra, y «Seguir donde lo dejaste»
 * tiene que seguir diciendo dónde lo dejó. La calle se activa de verdad al
 * tocar «Abrir la calle», al abrir una jornada o al empezar una nueva.
 */
export default function EspacioObra() {
  const proyecto = useAlmacen((s) => s.proyecto)
  const calleActivaId = useAlmacen((s) => s.calleActivaId)

  // La calle que se está mirando. Sigue a la activa cuando esta cambia por
  // otro lado (una jornada nueva, abrir una jornada de otra calle).
  const [calleVistaId, setCalleVistaId] = useState<Id | null>(calleActivaId)
  useEffect(() => setCalleVistaId(calleActivaId), [calleActivaId])

  /** Solo cuenta en el celular: si el panel de la calle tapa la lista. */
  const [panelAbierto, setPanelAbierto] = useState(false)
  // Sección abierta como en el lienzo; Subir hoja también, porque es donde se
  // suelta el Excel y no tiene que esconderse detrás de un toque más.
  const [apartadosCalle, setApartadosCalle] = useState<Set<ApartadoCalle>>(() => new Set(['seccion', 'subir']))
  const [apartadosObra, setApartadosObra] = useState<Set<ApartadoObra>>(() => new Set())
  const panel = useRef<HTMLDivElement>(null)
  const inicio = useRef<HTMLDivElement>(null)
  const [llevarASubir, setLlevarASubir] = useState(false)
  /** Sube cada vez que Max elige otra calle: descarta la hoja a medio leer. */
  const [claveSubir, setClaveSubir] = useState(0)
  /**
   * A dónde mandar el foco después de abrir o cerrar el panel: en el celular,
   * la columna de donde venía el foco desaparece, y sin esto el lector de
   * pantalla se queda sin saber dónde está.
   */
  const [enfocar, setEnfocar] = useState<'panel' | 'lista' | null>(null)

  const calle =
    proyecto.calles.find((c) => c.id === calleVistaId) ??
    proyecto.calles.find((c) => c.id === calleActivaId) ??
    proyecto.calles[0] ??
    null

  useEffect(() => {
    if (!llevarASubir) return
    setLlevarASubir(false)
    const zona = panel.current?.querySelector<HTMLElement>('[data-testid="zona-subir-hoja"]')
    zona?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
  }, [llevarASubir])

  useEffect(() => {
    if (enfocar === null) return
    setEnfocar(null)
    if (enfocar === 'panel') {
      panel.current?.querySelector<HTMLElement>('h2')?.focus({ preventScroll: true })
    } else if (calle) {
      const botones = inicio.current?.querySelectorAll<HTMLElement>('[data-calle-id]') ?? []
      ;[...botones].find((b) => b.dataset.calleId === calle.id)?.focus()
    }
  }, [enfocar, calle])

  function elegirCalle(id: Id) {
    if (id !== calle?.id) setClaveSubir((n) => n + 1)
    setCalleVistaId(id)
    setPanelAbierto(true)
    setEnfocar('panel')
    // En el celular el panel reemplaza a la lista: se empieza a leer desde arriba,
    // no desde donde estaba la calle en la lista.
    requestAnimationFrame(() => panel.current?.scrollIntoView?.({ block: 'start' }))
  }

  function volver() {
    setPanelAbierto(false)
    setEnfocar('lista')
  }

  function subirHoja() {
    setApartadosCalle((antes) => new Set(antes).add('subir'))
    setPanelAbierto(true)
    setLlevarASubir(true)
    setEnfocar('panel')
  }

  return (
    <div className="mx-auto grid w-full max-w-[100rem] grid-cols-1 gap-4 p-4 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:items-start xl:grid-cols-[minmax(0,22rem)_minmax(0,1fr)_minmax(0,20rem)]">
      <div
        ref={inicio}
        className={`flex-col gap-6 lg:col-start-1 lg:row-start-1 lg:flex ${panelAbierto ? 'hidden' : 'flex'}`}
      >
        <InicioObra calleVistaId={calle?.id ?? null} alElegirCalle={elegirCalle} alSubirHoja={subirHoja} />
      </div>

      <div
        ref={panel}
        className={`min-w-0 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:block ${panelAbierto ? 'block' : 'hidden'}`}
      >
        {/* El panel reinicia lo de la calle al cambiar de calle: un borrado a
            medio confirmar no pasa de una a otra. La hoja a medio aceptar se
            descarta solo cuando Max elige otra calle (claveSubir): al aceptar
            una hoja, la calle que la recibe —o la primera, si la obra estaba
            vacía— pasa a ser la activa, y el «Hoja aceptada» tiene que seguir
            a la vista. Por eso el panel es el mismo con calle o sin ella. */}
        <PanelCalle
          claveSubir={claveSubir}
          calle={calle}
          abiertos={apartadosCalle}
          alAlternar={(a) => setApartadosCalle((antes) => alternarEn(antes, a))}
          alVolver={volver}
        />
      </div>

      <div
        className={`flex-col gap-2 lg:col-start-1 lg:row-start-2 lg:flex xl:col-start-3 xl:row-start-1 ${
          panelAbierto ? 'hidden' : 'flex'
        }`}
      >
        <AjustesObra abiertos={apartadosObra} alAlternar={(a) => setApartadosObra((antes) => alternarEn(antes, a))} />
      </div>
    </div>
  )
}
