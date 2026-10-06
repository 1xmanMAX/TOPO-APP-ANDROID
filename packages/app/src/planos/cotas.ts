/**
 * Cuándo un texto de un plano es una cota. Una sola regla para los dos
 * lectores (DXF y PDF): el mismo plano exportado a uno u otro formato tiene
 * que dar las mismas cotas. Ante la duda, null: una cota mal leída es peor
 * que ninguna, porque falsea pendientes sin que nadie lo note; el texto
 * sigue listado para que Max lo vea.
 *
 * Decisiones (escritas solo aquí):
 * - Punto o coma decimal: «3244.40» y «3244,40».
 * - Sin prefijo, hacen falta decimales: «12» o «5» sueltos son lotes o manzanas.
 * - Con un prefijo de cota (lista cerrada PREFIJOS_COTA) basta un entero:
 *   «NPT 3250». Cualquier otro prefijo da null: «L=20.00» (largo), «R=15.00»
 *   (radio), «A=250.35» (área), «Km 0.120» (progresiva), «H=1.20», «E=1.50»…
 * - Rótulo de BM o de punto de control delante: «BM-1 3244.400»,
 *   «BM1: 3244.40», «PC-3=3243.680». Aquí los decimales son obligatorios:
 *   «BM 12» es el nombre del BM, no su cota. Entre el rótulo con número y la
 *   cota tiene que haber espacio, «:» o «=»: «BM-123244.40» no se puede partir.
 * - Unidad «m» al final se acepta («3244.40 m»), como ya lo hacía el DXF.
 * - Separador de miles: «3,244.40» se rechaza. Y una coma seguida de
 *   exactamente 3 cifras tras 1 a 3 cifras que no son 0 («3,244», «1,500»)
 *   también: puede ser 3244 escrito con coma de miles. «0,150» y «3244,400»
 *   no tienen esa duda y valen.
 */

/**
 * Prefijos con que se rotulan las cotas en los planos peruanos (sin puntos):
 * nivel de terreno natural, de piso terminado, de fondo, etc.
 */
const PREFIJOS_COTA = new Set(['NTN', 'NPT', 'NTT', 'NFP', 'NFC', 'NR', 'NV', 'NIV', 'CT', 'CF', 'COTA', 'ELEV', 'Z'])

/**
 * rotulo: BM o PC con su número opcional; exige separador para no comerse
 *   cifras de la cota. Va primero para que «BM 3244.40» no lo tome prefijo.
 * prefijo: letras y puntos, pegado al número o separado por espacio, «=» o «:».
 */
const PATRON =
  /^\s*(?:(?<rotulo>(?:BM|PC)(?:[-.\s]?\d+[A-Za-z]?)?)(?:\s*[=:]\s*|\s+)|(?<prefijo>[A-Za-z.]+)(?:\s*[=:]\s*|\s+|(?=[+\-\d])))?(?<entero>[+-]?\d+)(?:(?<separador>[.,])(?<decimales>\d+))?\s*(?:m)?\s*$/i

/** Si el texto es una cota, su valor; si no, null. Ver las decisiones arriba. */
export function valorDeCota(texto: string): number | null {
  const m = PATRON.exec(texto)
  if (!m?.groups) return null
  const { prefijo, rotulo, entero, separador, decimales } = m.groups
  if (rotulo !== undefined) {
    if (decimales === undefined) return null
  } else if (prefijo !== undefined) {
    if (!PREFIJOS_COTA.has(prefijo.replace(/\./g, '').toUpperCase())) return null
  } else if (decimales === undefined) {
    return null
  }
  if (separador === ',' && decimales?.length === 3 && /^[+-]?[1-9]\d{0,2}$/.test(entero!)) return null
  const valor = Number(decimales === undefined ? entero : `${entero}.${decimales}`)
  return Number.isFinite(valor) ? valor : null
}
