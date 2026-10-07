import { formatearProgresiva, hayDistanciasDeFabrica, type Calle, type Rasante } from '@topo/core'
import { useMemo, useState } from 'react'
import CampoTexto from '../../componentes/CampoTexto'
import EditorRasante from '../../componentes/EditorRasante'
import { BOTON_PRINCIPAL, ENLACE_PELIGRO } from '../../componentes/ui'
import { useAlmacen } from '../../estado/almacen'
import { cuenta, formatearCota } from '../../formato'
import VistaSeccion from '../VistaSeccion'
import Apartado from './Apartado'
import { estadoDeCierre, fechaCorta, jornadasDeCalle, tramoDeTomas } from './estadoObra'
import JornadasCalle from './JornadasCalle'
import SubirHojaEmbebida from './SubirHojaEmbebida'

export type ApartadoCalle = 'seccion' | 'rasante' | 'anchos' | 'jornadas' | 'subir'

/**
 * La sección y la rasante son los editores de siempre, pensados para la
 * laptop: botones de 24 a 32 px y una «×» de 8 px para quitar una palabra.
 * Con guantes y al sol, esa «×» al lado de PROG o EJE se pulsa sin querer y
 * la próxima hoja se lee mal. Aquí, que también se usa en el celular, todo lo
 * que se toca se agranda a 44 px, sin tocar los editores: botones de alto y
 * de ancho, campos y selectores de alto, y la casilla por su etiqueta.
 */
const CONTROLES_DE_44 =
  '[&_button]:inline-flex [&_button]:min-h-11 [&_button]:min-w-11 [&_button]:items-center [&_button]:justify-center ' +
  '[&_input:not([type=checkbox]):not([type=radio])]:min-h-11 [&_select]:min-h-11 ' +
  '[&_label:has(input[type=checkbox])]:min-h-11 [&_input[type=checkbox]]:size-5'

/** Un número con su signo siempre escrito, con el menos tipográfico. */
function conSigno(valor: number, decimales: number): string {
  const texto = Math.abs(valor).toFixed(decimales)
  if (Number(texto) === 0) return texto
  return `${valor > 0 ? '+' : '−'}${texto}`
}

function resumenSeccion(calle: Calle): string {
  const distancias = calle.seccion.puntos.map((p) => p.distancia)
  if (distancias.length === 0) return 'Sin puntos todavía'
  const desde = Math.min(...distancias)
  const hasta = Math.max(...distancias)
  const fabrica = hayDistanciasDeFabrica(calle.seccion) ? ' · △ distancias de fábrica, sin medir' : ''
  return `${cuenta(distancias.length, 'punto', 'puntos')} · de ${conSigno(desde, 2)} a ${conSigno(hasta, 2)} m${fabrica}`
}

function resumenRasante(rasante: Rasante | null): string {
  if (!rasante) return 'Sin rasante: la calle se mide igual, pero sin cota de proyecto con qué comparar'
  const tramos = rasante.tramos.map((t) =>
    t.tipo === 'pendiente' ? `${t.nombre.toLowerCase()} ${conSigno(t.valor, 1)} %` : `${t.nombre.toLowerCase()} ${conSigno(t.valor, 2)} m`,
  )
  return [
    `${formatearCota(rasante.cotaArranque)} en ${formatearProgresiva(rasante.progresivaArranque)}`,
    `${conSigno(rasante.pendienteLongitudinal, 2)} %`,
    ...tramos,
  ].join(' · ')
}

interface Props {
  /** Null con la obra todavía sin calles: entonces el panel ofrece subir la primera hoja. */
  calle: Calle | null
  abiertos: Set<ApartadoCalle>
  alAlternar: (apartado: ApartadoCalle) => void
  /** Solo en el celular: vuelve a la lista de calles. */
  alVolver: () => void
  /**
   * Cambia cuando Max elige otra calle: entonces la hoja a medio leer se
   * descarta. No cambia cuando la calle cambia sola —al aceptar una hoja, la
   * calle que nace o recibe la hoja pasa a ser la activa—, para que el «Hoja
   * aceptada» siga a la vista en vez de desaparecer con el panel.
   */
  claveSubir?: number
}

/**
 * La calle en un solo panel (pantalla 10 del lienzo): sección, rasante,
 * anchos, jornadas y subir hoja, cada uno plegable y diciendo qué tiene sin
 * abrirlo. Sin calles, el mismo panel ofrece subir la primera hoja.
 *
 * Todo lo de la calle se reinicia al cambiar de calle (un borrado a medio
 * confirmar no pasa de una a otra); la subida de datos, solo con `claveSubir`.
 * Para eso la subida va siempre en el mismo sitio del árbol, haya calle o no:
 * el resultado de la importación vive en ella, y si se desmontara al nacer la
 * primera calle, al borrar la calle que se miraba o al pasar el panel a la
 * calle que recibe la hoja, el «Hoja aceptada» se perdería.
 */
export default function PanelCalle({ calle, abiertos, alAlternar, alVolver, claveSubir = 0 }: Props) {
  return (
    <section aria-label={calle ? `Panel de ${calle.nombre}` : 'Subir la primera hoja'} className="flex min-w-0 flex-col gap-3">
      {calle ? (
        <CuerpoCalle key={calle.id} calle={calle} abiertos={abiertos} alAlternar={alAlternar} alVolver={alVolver} />
      ) : (
        <CabeceraSinCalles alVolver={alVolver} />
      )}

      {/* La subida de datos todavía no sabe de qué calle es este panel: toma el
          nombre del archivo. Por eso el apartado no promete «a esta calle». */}
      <Apartado
        titulo="Subir una hoja de campo"
        resumen="Suelta aquí tu Excel o pega las celdas: se suma a la calle sin pisar nada"
        abierto={abiertos.has('subir')}
        alAlternar={() => alAlternar('subir')}
        conservarMontado
      >
        <SubirHojaEmbebida key={claveSubir} calleDelPanel={calle?.nombre} />
      </Apartado>

      {/* Lo que no tiene vuelta va al final, lejos de lo que se toca a diario. */}
      {calle && <BorrarCalle key={`borrar-${calle.id}`} calle={calle} />}
    </section>
  )
}

/**
 * «Borrar esta calle y sus 2 jornadas», en rojo y sin caja, al pie del panel.
 * Pide un segundo toque que dice cuántas jornadas se van; se desarma al salir
 * del botón y al cambiar de calle.
 */
function BorrarCalle({ calle }: { calle: Calle }) {
  const eliminarCalle = useAlmacen((s) => s.eliminarCalle)
  const [confirmar, setConfirmar] = useState(false)
  const jornadas = calle.nivelaciones.reduce((suma, n) => suma + n.tomas.length, 0)
  const texto =
    jornadas === 0
      ? 'Borrar esta calle'
      : jornadas === 1
        ? 'Borrar esta calle y su jornada'
        : `Borrar esta calle y sus ${jornadas} jornadas`

  return (
    <div className="border-t border-borde pt-3">
      <button
        type="button"
        onClick={() => {
          if (confirmar) {
            eliminarCalle(calle.id)
            setConfirmar(false)
          } else {
            setConfirmar(true)
          }
        }}
        onBlur={() => setConfirmar(false)}
        className={`${ENLACE_PELIGRO} ${confirmar ? 'font-semibold underline' : ''}`}
      >
        {confirmar ? `¿Seguro? Se borran ${cuenta(jornadas, 'jornada', 'jornadas')}` : texto}
      </button>
    </div>
  )
}

function CabeceraSinCalles({ alVolver }: { alVolver: () => void }) {
  return (
    <>
      <BotonVolver alVolver={alVolver} />
      <h2 tabIndex={-1} className="text-[26px] leading-tight font-bold">
        Subir hoja
      </h2>
      <p className="text-base text-tenue">
        Todavía no hay ninguna calle. Sube una hoja de campo y la calle nace con ella, o créala en la lista.
      </p>
    </>
  )
}

/** Solo en el celular, donde el panel tapa la lista. */
function BotonVolver({ alVolver }: { alVolver: () => void }) {
  return (
    <button
      type="button"
      onClick={alVolver}
      className="-ml-1 flex min-h-11 items-center gap-1 self-start px-1 text-base font-medium text-marca lg:hidden"
    >
      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2.2}>
        <path d="M15 6l-6 6 6 6" />
      </svg>
      Volver a la obra
    </button>
  )
}

function CuerpoCalle({ calle, abiertos, alAlternar, alVolver }: Omit<Props, 'claveSubir' | 'calle'> & { calle: Calle }) {
  const proyecto = useAlmacen((s) => s.proyecto)
  const actualizarCalle = useAlmacen((s) => s.actualizarCalle)
  const irAEspacio = useAlmacen((s) => s.irAEspacio)
  const calleActivaId = useAlmacen((s) => s.calleActivaId)
  const activarCalle = useAlmacen((s) => s.activarCalle)

  const jornadas = useMemo(() => jornadasDeCalle(proyecto, calle), [proyecto, calle])
  const tramo = tramoDeTomas(jornadas.map((j) => j.toma))
  const ultima = jornadas[0]
  const resumenJornadas = ultima
    ? `${cuenta(jornadas.length, 'jornada', 'jornadas')} · última ${fechaCorta(ultima.toma.fecha)}, ${ultima.capa?.nombre ?? 'sin capa'}: ${(() => {
        const c = estadoDeCierre(ultima.toma, ultima.resultado)
        return `${c.simbolo} ${c.corto}`
      })()}`
    : 'Ninguna jornada todavía'
  const puntosOrdenados = [...calle.seccion.puntos].sort((a, b) => a.distancia - b.distancia)

  return (
    <>
      <BotonVolver alVolver={alVolver} />

      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
        {/* Recibe el foco al abrir el panel en el celular, donde la lista desaparece. */}
        <h2 tabIndex={-1} className="text-[26px] leading-tight font-bold">
          {calle.nombre}
        </h2>
        <span className="numerico text-sm text-tenue">{tramo ?? 'sin medir'}</span>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[12rem] flex-1 [&_input]:min-h-12 [&_input]:text-base">
          <CampoTexto
            etiqueta="Nombre de la calle"
            valor={calle.nombre}
            alCambiar={(v) => actualizarCalle(calle.id, { nombre: v })}
          />
        </div>
        <button
          type="button"
          onClick={() => {
            // Mirar la calle no la activó; abrirla sí. Si ya era la activa, se
            // queda la jornada en que se estaba, no la última de la calle.
            if (calleActivaId !== calle.id) activarCalle(calle.id)
            irAEspacio('calle')
          }}
          className={`${BOTON_PRINCIPAL} grow sm:grow-0`}
        >
          Abrir la calle ›
        </button>
      </div>

      <Apartado
        titulo="Sección"
        resumen={resumenSeccion(calle)}
        abierto={abiertos.has('seccion')}
        alAlternar={() => alAlternar('seccion')}
      >
        <div className={CONTROLES_DE_44}>
          <VistaSeccion calleId={calle.id} />
        </div>
      </Apartado>

      <Apartado
        titulo="Rasante"
        resumen={<span className="numerico">{resumenRasante(calle.rasante)}</span>}
        abierto={abiertos.has('rasante')}
        alAlternar={() => alAlternar('rasante')}
      >
        <div className={`p-3 sm:p-4 ${CONTROLES_DE_44}`}>
          <EditorRasante calleId={calle.id} puntos={calle.seccion.puntos} />
        </div>
      </Apartado>

      <Apartado
        titulo="Anchos"
        resumen="Un solo ancho para toda la calle, el mismo en cada progresiva"
        abierto={abiertos.has('anchos')}
        alAlternar={() => alAlternar('anchos')}
      >
        <div className="flex flex-col gap-2 p-3 sm:p-4">
          <p className="text-sm text-tenue">
            <span aria-hidden="true">△ </span>
            Esta versión todavía no guarda anchos medidos en cada progresiva: la sección vale igual de
            punta a punta. Estas son sus distancias al eje; se cambian en «Sección».
          </p>
          <table className="w-full max-w-md text-sm">
            <caption className="sr-only">Distancias al eje de la sección</caption>
            <thead>
              <tr className="text-left text-tenue">
                <th className="py-1 font-medium">Punto</th>
                <th className="py-1 text-right font-medium">m al eje</th>
              </tr>
            </thead>
            <tbody>
              {puntosOrdenados.map((p) => (
                <tr key={p.id} className="border-t border-borde">
                  <td className="py-1.5">{p.nombre}</td>
                  <td className="numerico py-1.5 text-right">
                    {conSigno(p.distancia, 2)}
                    {p.distanciaDeFabrica ? <span className="text-aviso"> △ de fábrica</span> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Apartado>

      <Apartado
        titulo="Jornadas y hojas"
        resumen={resumenJornadas}
        abierto={abiertos.has('jornadas')}
        alAlternar={() => alAlternar('jornadas')}
      >
        <JornadasCalle calle={calle} />
      </Apartado>
    </>
  )
}
