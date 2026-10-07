import { proyectarSobrePolilinea, type PlanoImportado, type Rasante, type TextoCota } from '@topo/core'
import { forwardRef, useId, useMemo, useState } from 'react'
import { useAlmacen } from '../../estado/almacen'
import type { EjeCandidato, TextoPlano } from '../../planos/dxf'
import { datosDePista, type DatosPista } from './datosPista'
import { BOTON_PRINCIPAL, BOTON_SECUNDARIO, CAJA, type AvisoPantalla } from './estilos'
import { ListaPendientes } from './FichaPista'
import { CampoTextoAlto } from './Paneles'
import TomarRasante from './TomarRasante'

/** Un rótulo que parece nombre de calle: palabras, no un número de lote ni una progresiva. */
const PARECE_NOMBRE = /[A-Za-zÁÉÍÓÚÑáéíóúñ]{3,}/
const PARECE_MANZANA = /^\s*(MZ|MZA|MANZANA|LOTE|LT)\b/i

/**
 * El nombre que el plano le pone a este eje: el rótulo de texto más cercano
 * al eje (a 15 m o menos), si parece un nombre. La proyección es la del motor.
 */
function nombreDelPlano(eje: EjeCandidato, textos: readonly TextoPlano[], plano: PlanoImportado): string | null {
  if (!plano.calibracion) return null
  let mejor: { texto: string; distancia: number } | null = null
  for (const t of textos) {
    if (t.valor !== null || !PARECE_NOMBRE.test(t.texto) || PARECE_MANZANA.test(t.texto)) continue
    try {
      const p = proyectarSobrePolilinea(eje.puntos, t, plano.calibracion)
      const distancia = Math.abs(p.desplazamiento)
      if (!p.fueraDeLaPista && distancia <= 15 && (!mejor || distancia < mejor.distancia)) mejor = { texto: t.texto, distancia }
    } catch {
      // Un texto sin posición no ayuda a nombrar: se salta.
    }
  }
  return mejor?.texto ?? null
}

type Medida = { datos: DatosPista } | { error: string } | null

interface Props {
  eje: EjeCandidato
  indice: number
  plano: PlanoImportado
  textos: readonly TextoPlano[]
  textosCota: readonly TextoCota[]
  /** La pista recién creada con este eje, para elegirla, y lo que se hizo, en palabras. */
  alUsar: (pistaId: string, aviso: AvisoPantalla) => void
}

/** Un eje del DXF que todavía no es pista: convertirlo en calle y, si el plano trae cotas, tomar su rasante. */
const FichaEje = forwardRef<HTMLHeadingElement, Props>(function FichaEje({ eje, indice, plano, textos, textosCota, alUsar }, refTitulo) {
  const idTitulo = useId()
  const agregarPista = useAlmacen((s) => s.agregarPista)
  const crearCalleDesdePista = useAlmacen((s) => s.crearCalleDesdePista)
  const fijarRasante = useAlmacen((s) => s.fijarRasante)
  const [nombre, setNombre] = useState(() => nombreDelPlano(eje, textos, plano) ?? `Eje ${indice + 1}`)
  const [tomandoRasante, setTomandoRasante] = useState(false)

  // Una escala errada (un DXF en milímetros que dice metros) hace que el
  // motor se niegue a sacar miles de estacas: se avisa, no tumba la pantalla.
  const medida = useMemo<Medida>(() => {
    if (!plano.calibracion) return null
    try {
      return {
        datos: datosDePista({ id: 'eje', nombre: 'eje', polilinea: eje.puntos, calibracion: plano.calibracion, progresivaInicio: 0 }, textosCota, undefined),
      }
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) }
    }
  }, [eje, plano.calibracion, textosCota])
  const datos = medida && 'datos' in medida ? medida.datos : null
  const kmSegunEscala = plano.calibracion ? (eje.largo * plano.calibracion.metrosPorUnidad) / 1000 : null

  function usar(rasante: Rasante | null, aviso: AvisoPantalla | null) {
    const nombreFinal = nombre.trim() || `Eje ${indice + 1}`
    const pistaId = agregarPista({ nombre: nombreFinal, planoId: plano.id, polilinea: eje.puntos, origen: 'dxf', progresivaInicio: 0 })
    const calleId = crearCalleDesdePista(pistaId)
    const creada = `Calle «${nombreFinal}» creada con el eje del plano.`
    if (rasante && calleId && aviso) {
      fijarRasante(calleId, rasante)
      alUsar(pistaId, { tipo: aviso.tipo, texto: aviso.tipo === 'ok' ? `✓ ${creada} ${aviso.texto.replace(/^✓ /, '')}` : `${creada} ${aviso.texto}` })
      return
    }
    alUsar(pistaId, { tipo: 'ok', texto: `✓ ${creada}` })
  }

  return (
    <section aria-labelledby={idTitulo} className={CAJA}>
      <h3 id={idTitulo} ref={refTitulo} tabIndex={-1} className="scroll-mt-28 text-2xl font-bold leading-tight outline-none">
        Eje del plano {indice + 1}
      </h3>
      <p className="numerico text-sm text-tenue">
        Capa {eje.capa}
        {datos ? ` · ${datos.largoM.toFixed(3)} m` : ''}
        {eje.piezas > 1 ? ` · armado de ${eje.piezas} piezas` : ''}
      </p>
      {datos ? (
        <>
          <p className="text-sm">
            {datos.cotasDelPlano.length === 0
              ? 'El plano no trae cotas junto a este eje.'
              : `${datos.cotasDelPlano.length} cotas del plano junto a este eje.`}
          </p>
          {datos.cotasDelPlano.length >= 2 && <ListaPendientes datos={datos} />}
        </>
      ) : medida && 'error' in medida ? (
        <p className="rounded-[10px] bg-aviso-suave px-3 py-2 text-sm text-aviso">
          <span aria-hidden="true">△ </span>
          La escala parece errada: con ella este eje mediría {kmSegunEscala?.toFixed(1)} km. Revísala en «Calibrar escala». ({medida.error})
        </p>
      ) : (
        <p className="text-sm">
          <span aria-hidden="true">△ </span>
          Calibra la escala para saber el largo y leer las cotas del plano.
        </p>
      )}
      <CampoTextoAlto etiqueta="Nombre de la calle" valor={nombre} alCambiar={setNombre} />
      {tomandoRasante && datos && (
        <TomarRasante
          cotas={datos.cotasDelPlano}
          actual={null}
          nivelacionesConTomas={0}
          alCancelar={() => setTomandoRasante(false)}
          alConfirmar={(rasante, texto, tipo) => usar(rasante, { tipo, texto })}
        />
      )}
      <div className="flex flex-col gap-2">
        <button type="button" className={BOTON_PRINCIPAL} onClick={() => usar(null, null)}>
          Usar como eje de una calle
        </button>
        {!tomandoRasante && (
          <button
            type="button"
            className={BOTON_SECUNDARIO}
            disabled={!datos || datos.cotasDelPlano.length < 2}
            onClick={() => setTomandoRasante(true)}
          >
            Tomar la rasante de las cotas del plano
          </button>
        )}
      </div>
    </section>
  )
})

export default FichaEje
