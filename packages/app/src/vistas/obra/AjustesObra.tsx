import {
  capaEnUso,
  INSTRUMENTO_DE_FABRICA,
  instrumentoCompleto,
  ordenarCapas,
  type Id,
  type Instrumento,
  type Proyecto,
} from '@topo/core'
import { useState } from 'react'
import CampoNumero from '../../componentes/CampoNumero'
import CampoTexto from '../../componentes/CampoTexto'
import { useAlmacen } from '../../estado/almacen'
import { todasLasTomas } from '../../estado/proyectoTomas'
import { cuenta, formatearCota } from '../../formato'
import Apartado from './Apartado'

export type ApartadoObra = 'obra' | 'bms' | 'capas' | 'instrumento'

/**
 * Los campos de texto y número compartidos miden 34 px; en campo hacen falta
 * 44. Se agrandan desde aquí, sin tocar el componente que usan otras pantallas.
 */
const CAMPOS_GRANDES = '[&_input]:min-h-11 [&_input]:text-base [&_select]:min-h-11 [&_select]:text-base'

function DatosDeObra() {
  const meta = useAlmacen((s) => s.proyecto.meta)
  const actualizarMeta = useAlmacen((s) => s.actualizarMeta)
  return (
    <div className={`grid grid-cols-1 gap-3 p-3 sm:grid-cols-2 lg:grid-cols-1 ${CAMPOS_GRANDES}`}>
      <CampoTexto etiqueta="Nombre del proyecto" valor={meta.nombre} alCambiar={(v) => actualizarMeta({ nombre: v })} />
      <CampoTexto etiqueta="Obra" valor={meta.obra} alCambiar={(v) => actualizarMeta({ obra: v })} />
      <CampoTexto etiqueta="Cliente" valor={meta.cliente} alCambiar={(v) => actualizarMeta({ cliente: v })} />
      <CampoTexto etiqueta="Ubicación" valor={meta.ubicacion} alCambiar={(v) => actualizarMeta({ ubicacion: v })} />
      <CampoTexto etiqueta="Responsable" valor={meta.responsable} alCambiar={(v) => actualizarMeta({ responsable: v })} />
    </div>
  )
}

/**
 * Las jornadas que usan un BM, dichas como se reconocen («2026-08-19 · Av. Sol»):
 * de arranque, de cierre o en alguna vista a BM del recorrido.
 */
function jornadasQueUsanBM(proyecto: Proyecto, bmId: Id): string[] {
  const usan: string[] = []
  for (const calle of proyecto.calles) {
    for (const toma of calle.nivelaciones.flatMap((n) => n.tomas)) {
      const enRecorrido = toma.estaciones.some((e) =>
        [e.vistaAtras, ...e.intermedias, ...(e.vistaAdelante ? [e.vistaAdelante] : [])].some(
          (l) => l.destino.tipo === 'bm' && l.destino.bmId === bmId,
        ),
      )
      if (toma.bmInicialId === bmId || toma.cierre.bmFinalId === bmId || enRecorrido) {
        usan.push(`${toma.fecha} · ${calle.nombre}`)
      }
    }
  }
  return usan
}

function BancosDeNivel() {
  const proyecto = useAlmacen((s) => s.proyecto)
  const agregarBM = useAlmacen((s) => s.agregarBM)
  const actualizarBM = useAlmacen((s) => s.actualizarBM)
  const eliminarBM = useAlmacen((s) => s.eliminarBM)
  const [porEliminar, setPorEliminar] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  return (
    <div className={`flex flex-col gap-3 p-3 ${CAMPOS_GRANDES}`}>
      {proyecto.bms.length === 0 && (
        <p className="text-sm text-aviso">
          <span aria-hidden="true">△ </span>
          Todavía no hay bancos de nivel. Agrega al menos uno para poder nivelar.
        </p>
      )}
      <ul className="flex flex-col gap-3">
        {proyecto.bms.map((bm) => {
          const queLoUsan = jornadasQueUsanBM(proyecto, bm.id)
          return (
            <li key={bm.id} className="grid grid-cols-2 gap-2 rounded-lg border border-slate-200 p-2 dark:border-slate-800">
              <CampoTexto etiqueta="Nombre" valor={bm.nombre} alCambiar={(v) => actualizarBM(bm.id, { nombre: v })} />
              <CampoNumero
                etiqueta="Cota"
                ariaLabel={`Cota de ${bm.nombre}`}
                valor={bm.cota}
                alCambiar={(v) => actualizarBM(bm.id, { cota: v })}
                sufijo="m"
              />
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Tipo</span>
                <select
                  aria-label={`Tipo de ${bm.nombre}`}
                  value={bm.tipo}
                  onChange={(e) => actualizarBM(bm.id, { tipo: e.target.value as 'oficial' | 'auxiliar' })}
                  className="rounded border border-slate-300 bg-white px-2 dark:border-slate-700 dark:bg-slate-900"
                >
                  <option value="oficial">Oficial</option>
                  <option value="auxiliar">Auxiliar</option>
                </select>
              </label>
              <CampoTexto
                etiqueta="Dónde está"
                valor={bm.descripcion}
                alCambiar={(v) => actualizarBM(bm.id, { descripcion: v })}
                marcador="dónde está el clavo"
              />
              <button
                type="button"
                aria-label={porEliminar === bm.id ? `Confirmar eliminación de ${bm.nombre}` : `Eliminar ${bm.nombre}`}
                onClick={() => {
                  // Igual que con las capas: un BM en uso no se borra. Las jornadas
                  // que lo usan se quedarían sin cota de arranque o de cierre, y
                  // desde aquí no hay cómo devolvérsela.
                  if (queLoUsan.length > 0) {
                    setPorEliminar(null)
                    setAviso(
                      `No se puede borrar ${bm.nombre}: lo usan ${cuenta(queLoUsan.length, 'jornada', 'jornadas')} ` +
                        `(${queLoUsan.join('; ')}). Cámbiales el banco de nivel en la libreta primero.`,
                    )
                    return
                  }
                  setAviso(null)
                  if (porEliminar === bm.id) {
                    eliminarBM(bm.id)
                    setPorEliminar(null)
                  } else {
                    setPorEliminar(bm.id)
                  }
                }}
                onBlur={() => setPorEliminar((actual) => (actual === bm.id ? null : actual))}
                className="col-span-2 min-h-11 rounded text-sm text-falla"
              >
                {porEliminar === bm.id ? '¿Seguro?' : 'Eliminar'}
              </button>
            </li>
          )
        })}
      </ul>
      {aviso && (
        <p role="alert" className="text-sm text-falla">
          <span aria-hidden="true">✗ </span>
          {aviso}
        </p>
      )}
      <button
        type="button"
        onClick={() =>
          agregarBM({ nombre: `BM-${proyecto.bms.length + 1}`, cota: 0, tipo: 'auxiliar', descripcion: '' })
        }
        className="min-h-11 rounded-lg bg-marca px-3 text-base font-medium text-white"
      >
        Agregar banco de nivel
      </button>
    </div>
  )
}

function CapasDeObra() {
  const proyecto = useAlmacen((s) => s.proyecto)
  const agregarCapa = useAlmacen((s) => s.agregarCapa)
  const actualizarCapa = useAlmacen((s) => s.actualizarCapa)
  const eliminarCapa = useAlmacen((s) => s.eliminarCapa)
  const moverCapa = useAlmacen((s) => s.moverCapa)
  const [porEliminar, setPorEliminar] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const capas = ordenarCapas(proyecto.capas)
  const tomas = todasLasTomas(proyecto)
  // El terreno (orden 0) no aporta material: su espesor cero es el punto de partida.
  const sinEspesor = capas.filter((c) => c.orden > 0 && c.espesor === 0)

  return (
    <div className={`flex flex-col gap-3 p-3 ${CAMPOS_GRANDES}`}>
      <p className="text-sm text-slate-600 dark:text-slate-300">
        De abajo arriba: primero el terreno, al final la rodadura. De este orden sale el espesor
        colocado. Referencia: base granular ±10 mm (MTC EG-2013), carpeta 5 mm (RNE CE.010).
      </p>
      <ol className="flex flex-col gap-2">
        {capas.map((capa, indice) => (
          <li key={capa.id} className="flex flex-col gap-2 rounded-lg border border-slate-200 p-2 dark:border-slate-800">
            <div className="flex items-end gap-1">
              <div className="min-w-0 flex-1">
                <CampoTexto etiqueta="Nombre" valor={capa.nombre} alCambiar={(v) => actualizarCapa(capa.id, { nombre: v })} />
              </div>
              <button
                type="button"
                aria-label={`Subir la capa ${capa.nombre}`}
                onClick={() => moverCapa(capa.id, -1)}
                disabled={indice === 0}
                className="size-11 rounded border border-slate-300 disabled:opacity-30 dark:border-slate-700"
              >
                ↑
              </button>
              <button
                type="button"
                aria-label={`Bajar la capa ${capa.nombre}`}
                onClick={() => moverCapa(capa.id, 1)}
                disabled={indice === capas.length - 1}
                className="size-11 rounded border border-slate-300 disabled:opacity-30 dark:border-slate-700"
              >
                ↓
              </button>
            </div>
            <div className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
              <CampoNumero
                etiqueta="Espesor"
                ariaLabel={`Espesor de ${capa.nombre}`}
                valor={capa.espesor}
                alCambiar={(v) => actualizarCapa(capa.id, { espesor: v })}
                decimales={3}
                sufijo="m"
              />
              <CampoNumero
                etiqueta="Tolerancia"
                ariaLabel={`Tolerancia de ${capa.nombre}`}
                valor={capa.toleranciaMm}
                alCambiar={(v) => actualizarCapa(capa.id, { toleranciaMm: v })}
                decimales={0}
                sufijo="mm"
              />
              <button
                type="button"
                aria-label={
                  porEliminar === capa.id ? `Confirmar eliminación de la capa ${capa.nombre}` : `Eliminar capa ${capa.nombre}`
                }
                onClick={() => {
                  if (capaEnUso(tomas, capa.id)) {
                    setAviso(`No se puede borrar ${capa.nombre}: la usa una jornada. Cámbiala de capa primero.`)
                    return
                  }
                  setAviso(null)
                  if (porEliminar === capa.id) {
                    eliminarCapa(capa.id)
                    setPorEliminar(null)
                  } else {
                    setPorEliminar(capa.id)
                  }
                }}
                onBlur={() => setPorEliminar((actual) => (actual === capa.id ? null : actual))}
                className="min-h-11 min-w-11 rounded px-2 text-falla"
              >
                {porEliminar === capa.id ? '¿Seguro?' : '×'}
              </button>
            </div>
          </li>
        ))}
      </ol>
      {aviso && (
        <p role="alert" className="text-sm text-falla">
          <span aria-hidden="true">✗ </span>
          {aviso}
        </p>
      )}
      {sinEspesor.length > 0 && (
        <p className="rounded border border-aviso bg-aviso/10 p-2 text-sm">
          <span aria-hidden="true">△ </span>
          Capas sin espesor: {sinEspesor.map((c) => c.nombre).join(', ')}. Sin su espesor, la cota que el
          proyecto pide para las capas de debajo sale movida.
        </p>
      )}
      <button
        type="button"
        onClick={() => agregarCapa('CAPA NUEVA')}
        className="min-h-11 rounded-lg bg-marca px-3 text-base font-medium text-white"
      >
        Agregar capa
      </button>
    </div>
  )
}

interface CampoInstrumento {
  clave: keyof Instrumento
  etiqueta: string
  sufijo: string
  decimales: number
  ayuda: string
}

const CAMPOS_INSTRUMENTO: CampoInstrumento[] = [
  { clave: 'largoMira', etiqueta: 'Largo de la mira', sufijo: 'm', decimales: 2, ayuda: 'La telescópica común es de 5 m.' },
  { clave: 'alturaInstrumento', etiqueta: 'Altura del instrumento', sufijo: 'm', decimales: 2, ayuda: 'Del suelo al anteojo.' },
  { clave: 'lecturaMin', etiqueta: 'Lectura mínima', sufijo: 'm', decimales: 2, ayuda: 'Más abajo, la refracción cerca del suelo engaña.' },
  { clave: 'margenSuperior', etiqueta: 'Margen en la punta', sufijo: 'm', decimales: 2, ayuda: 'La punta de la mira oscila.' },
  { clave: 'visualMax', etiqueta: 'Visual máxima', sufijo: 'm', decimales: 0, ayuda: 'Por precisión, aunque el equipo alcance más.' },
  { clave: 'desequilibrioMax', etiqueta: 'Desequilibrio atrás − adelante', sufijo: 'm', decimales: 1, ayuda: 'Visuales parejas cancelan la colimación.' },
  { clave: 'coeficienteK', etiqueta: 'k de la tolerancia k·√K', sufijo: 'mm', decimales: 0, ayuda: 'Tercer orden: 12 mm.' },
  { clave: 'sigmaPorEstacionMm', etiqueta: 'Error por estación (σ)', sufijo: 'mm', decimales: 1, ayuda: 'Para estimar el error de cada tramo.' },
  { clave: 'maxCambiosPorTramo', etiqueta: 'Cambios entre dos controles', sufijo: '', decimales: 0, ayuda: 'Cada tramo cierra por su cuenta.' },
]

/** Los que en cero dejan la app sin sentido: mira 0 = ninguna lectura vale; k 0 = ningún circuito cierra. */
const DEBEN_SER_POSITIVOS: ReadonlySet<keyof Instrumento> = new Set([
  'largoMira',
  'alturaInstrumento',
  'visualMax',
  'coeficienteK',
  'maxCambiosPorTramo',
])

/**
 * Por qué no se acepta este valor del instrumento, o null si vale. Lo que no
 * se acepta no se guarda: se queda el valor de antes y se dice por qué.
 */
export function problemaDelInstrumento(
  instrumento: Instrumento,
  clave: keyof Instrumento,
  valor: number,
): string | null {
  if (!Number.isFinite(valor) || valor < 0) return 'No puede ser negativo.'
  if (DEBEN_SER_POSITIVOS.has(clave) && valor <= 0) return 'Tiene que ser mayor que cero.'
  const prueba = { ...instrumento, [clave]: valor }
  if (
    (clave === 'largoMira' || clave === 'lecturaMin' || clave === 'margenSuperior') &&
    prueba.lecturaMin + prueba.margenSuperior >= prueba.largoMira
  ) {
    return 'La lectura mínima más el margen en la punta no dejan mira útil: tienen que sumar menos que el largo de la mira.'
  }
  return null
}

function InstrumentoDeObra() {
  const parcial = useAlmacen((s) => s.proyecto.instrumento)
  const fijarInstrumento = useAlmacen((s) => s.fijarInstrumento)
  const instrumento = instrumentoCompleto(parcial)
  const [rechazos, setRechazos] = useState<Partial<Record<keyof Instrumento, string>>>({})

  function cambiar(clave: keyof Instrumento, valor: number) {
    const problema = problemaDelInstrumento(instrumento, clave, valor)
    setRechazos((antes) => {
      const despues = { ...antes }
      if (problema) despues[clave] = problema
      else delete despues[clave]
      return despues
    })
    if (!problema) fijarInstrumento({ [clave]: valor })
  }

  return (
    <div className={`flex flex-col gap-3 p-3 ${CAMPOS_GRANDES}`}>
      <p className="text-sm text-slate-600 dark:text-slate-300">
        Una sola fuente para la libreta, el aviso al anotar, el replanteo, la calculadora y el planificador.
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-1">
        {CAMPOS_INSTRUMENTO.map((campo) => {
          const deFabrica = instrumento[campo.clave] === INSTRUMENTO_DE_FABRICA[campo.clave]
          return (
            <div key={campo.clave} className="flex flex-col gap-0.5">
              <CampoNumero
                etiqueta={campo.etiqueta}
                valor={instrumento[campo.clave]}
                alCambiar={(v) => cambiar(campo.clave, v)}
                decimales={campo.decimales}
                sufijo={campo.sufijo}
              />
              {rechazos[campo.clave] && (
                <span role="alert" className="text-sm text-aviso">
                  <span aria-hidden="true">△ </span>
                  {rechazos[campo.clave]} Se queda en {instrumento[campo.clave]}.
                </span>
              )}
              <span className="text-sm text-slate-500 dark:text-slate-400">
                {campo.ayuda}
                {deFabrica ? ' · de fábrica' : ` · de fábrica: ${INSTRUMENTO_DE_FABRICA[campo.clave]}`}
              </span>
            </div>
          )
        })}
      </div>
      <button
        type="button"
        onClick={() => {
          setRechazos({})
          fijarInstrumento({ ...INSTRUMENTO_DE_FABRICA })
        }}
        className="min-h-11 rounded-lg border border-slate-300 px-3 text-base dark:border-slate-700"
      >
        Volver a los valores de fábrica
      </button>
    </div>
  )
}

interface Props {
  abiertos: Set<ApartadoObra>
  alAlternar: (apartado: ApartadoObra) => void
}

/** Lo que es de toda la obra: sus datos, los bancos de nivel, las capas y el instrumento. */
export default function AjustesObra({ abiertos, alAlternar }: Props) {
  const proyecto = useAlmacen((s) => s.proyecto)
  const instrumento = instrumentoCompleto(proyecto.instrumento)
  const capas = ordenarCapas(proyecto.capas)

  const resumenBms =
    proyecto.bms.length === 0
      ? '△ Ninguno todavía'
      : proyecto.bms.map((bm) => `${bm.nombre} ${formatearCota(bm.cota)}`).join(' · ')
  const resumenCapas =
    capas.length === 0
      ? '△ Ninguna todavía'
      : `${cuenta(capas.length, 'capa', 'capas')}: ${capas.map((c) => c.nombre.toLowerCase()).join(', ')}`
  const resumenInstrumento =
    `mira ${instrumento.largoMira} m · visual ≤ ${instrumento.visualMax} m · ` +
    `k ${instrumento.coeficienteK} mm · ≤ ${instrumento.maxCambiosPorTramo} cambios por tramo`

  return (
    <section aria-labelledby="titulo-ajustes-obra" className="flex flex-col gap-2">
      <h2 id="titulo-ajustes-obra" className="text-xs font-semibold uppercase tracking-widest text-slate-600 dark:text-slate-400">
        De toda la obra
      </h2>
      <Apartado
        titulo="Bancos de nivel"
        resumen={<span className="numerico">{resumenBms}</span>}
        abierto={abiertos.has('bms')}
        alAlternar={() => alAlternar('bms')}
      >
        <BancosDeNivel />
      </Apartado>
      <Apartado
        titulo="Capas"
        resumen={resumenCapas}
        abierto={abiertos.has('capas')}
        alAlternar={() => alAlternar('capas')}
      >
        <CapasDeObra />
      </Apartado>
      <Apartado
        titulo="Instrumento"
        resumen={resumenInstrumento}
        abierto={abiertos.has('instrumento')}
        alAlternar={() => alAlternar('instrumento')}
      >
        <InstrumentoDeObra />
      </Apartado>
      <Apartado
        titulo="Datos de la obra"
        resumen={[proyecto.meta.obra, proyecto.meta.cliente, proyecto.meta.ubicacion].filter(Boolean).join(' · ') || 'Sin datos todavía'}
        abierto={abiertos.has('obra')}
        alAlternar={() => alAlternar('obra')}
      >
        <DatosDeObra />
      </Apartado>
    </section>
  )
}
