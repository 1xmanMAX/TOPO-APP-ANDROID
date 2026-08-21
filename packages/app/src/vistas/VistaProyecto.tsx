import { capaEnUso, ordenarCapas } from '@topo/core'
import { useState } from 'react'
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
  const actualizarCapa = useAlmacen((s) => s.actualizarCapa)
  const eliminarCapa = useAlmacen((s) => s.eliminarCapa)
  const moverCapa = useAlmacen((s) => s.moverCapa)
  const campanias = useAlmacen((s) => s.proyecto.campanias)
  const [porEliminar, setPorEliminar] = useState<string | null>(null)
  const [avisoCapa, setAvisoCapa] = useState<string | null>(null)
  const capasOrdenadas = ordenarCapas(capas)
  // El terreno (orden 0) no aporta material: su espesor cero es el punto de
  // partida, no un dato que falte. Solo las capas que sí deberían traer
  // espesor propio cuentan para el aviso.
  const capasSinEspesor = capasOrdenadas.filter((capa) => capa.orden > 0 && capa.espesor === 0)

  function bmEnUso(id: string): boolean {
    return campanias.some((c) => c.bmInicialId === id || c.cierre.bmFinalId === id)
  }

  function textoDeBorrado(id: string, enUso: boolean): string {
    if (porEliminar !== id) return 'Eliminar'
    return enUso ? '¿Seguro? Hay campañas que lo usan' : '¿Seguro?'
  }

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
                onClick={() => {
                  if (porEliminar === bm.id) {
                    eliminarBM(bm.id)
                    setPorEliminar(null)
                  } else {
                    setPorEliminar(bm.id)
                  }
                }}
                onBlur={() => setPorEliminar((actual) => (actual === bm.id ? null : actual))}
                aria-label={
                  porEliminar === bm.id
                    ? `Confirmar eliminación de ${bm.nombre}`
                    : `Eliminar ${bm.nombre}`
                }
                className="rounded px-2 py-1.5 text-xs text-falla hover:bg-red-50 dark:hover:bg-red-950"
              >
                {textoDeBorrado(bm.id, bmEnUso(bm.id))}
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
        <p className="text-xs text-slate-500">
          El orden va de abajo hacia arriba del paquete: primero el terreno, al final la capa de
          rodadura. De ese orden depende el cálculo del espesor colocado.
        </p>
        <p className="text-xs text-slate-500">
          Valores de referencia para la tolerancia: base granular ±10 mm (MTC EG-2013), carpeta de
          rodadura 5 mm (RNE CE.010). Ajusta cada capa según el material que lleve.
        </p>
        <ul className="flex flex-col gap-2">
          {capasOrdenadas.map((capa, indice) => (
            <li
              key={capa.id}
              className="flex flex-wrap items-end gap-3 rounded border border-slate-300 px-3 py-2 text-sm dark:border-slate-700"
            >
              <CampoTexto
                etiqueta="Nombre"
                valor={capa.nombre}
                alCambiar={(v) => actualizarCapa(capa.id, { nombre: v })}
                ancho="w-40"
              />
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  aria-label={`Subir la capa ${capa.nombre}`}
                  onClick={() => moverCapa(capa.id, -1)}
                  disabled={indice === 0}
                  className="px-1 text-slate-400 hover:text-marca disabled:opacity-30"
                >
                  ↑
                </button>
                <button
                  type="button"
                  aria-label={`Bajar la capa ${capa.nombre}`}
                  onClick={() => moverCapa(capa.id, 1)}
                  disabled={indice === capasOrdenadas.length - 1}
                  className="px-1 text-slate-400 hover:text-marca disabled:opacity-30"
                >
                  ↓
                </button>
              </div>
              <CampoNumero
                etiqueta="Espesor"
                ariaLabel={`Espesor de ${capa.nombre}`}
                valor={capa.espesor}
                alCambiar={(v) => actualizarCapa(capa.id, { espesor: v })}
                decimales={3}
                sufijo="m"
                ancho="w-28"
              />
              <CampoNumero
                etiqueta="Tolerancia"
                ariaLabel={`Tolerancia de ${capa.nombre}`}
                valor={capa.toleranciaMm}
                alCambiar={(v) => actualizarCapa(capa.id, { toleranciaMm: v })}
                decimales={0}
                sufijo="mm"
                ancho="w-24"
              />
              <button
                type="button"
                onClick={() => {
                  if (capaEnUso(campanias, capa.id)) {
                    setAvisoCapa(
                      `No se puede borrar ${capa.nombre}: la usa una campaña. Cámbiala de capa primero.`,
                    )
                    return
                  }
                  setAvisoCapa(null)
                  if (porEliminar === capa.id) {
                    eliminarCapa(capa.id)
                    setPorEliminar(null)
                  } else {
                    setPorEliminar(capa.id)
                  }
                }}
                onBlur={() => setPorEliminar((actual) => (actual === capa.id ? null : actual))}
                aria-label={
                  porEliminar === capa.id
                    ? `Confirmar eliminación de la capa ${capa.nombre}`
                    : `Eliminar capa ${capa.nombre}`
                }
                className="text-slate-400 hover:text-falla"
              >
                {porEliminar === capa.id ? '¿Seguro?' : '×'}
              </button>
            </li>
          ))}
        </ul>
        {avisoCapa && <p className="text-sm text-falla">{avisoCapa}</p>}
        {capasSinEspesor.length > 0 && (
          <p className="rounded border border-aviso bg-aviso/10 p-2 text-sm text-aviso">
            Hay capas sin espesor definido: {capasSinEspesor.map((c) => c.nombre).join(', ')}. Sin su
            espesor, la cota que el proyecto pide para las capas de debajo sale movida.
          </p>
        )}
      </section>
    </div>
  )
}
