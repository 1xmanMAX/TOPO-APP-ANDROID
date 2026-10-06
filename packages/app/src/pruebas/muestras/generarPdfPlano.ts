import { jsPDF } from 'jspdf'

/**
 * Plano de expediente simulado, en PDF vectorial, para probar el lector de
 * planos sin depender de un plano real de un cliente.
 *
 * Se dibuja a escala 1:1000 en A4 apaisado: 1 mm de papel = 1 m de terreno.
 * Así cualquier distancia del plano se comprueba a mano sin calculadora.
 *
 * Disposición (milímetros de papel, origen arriba a la izquierda como en
 * jsPDF; el PDF guarda luego y hacia arriba, eso lo resuelve el lector):
 *
 * - Jr. Lima: eje horizontal en y = 110, de x = 40 a x = 240 (200 m), con
 *   bordes a ±5 mm (calzada de 10 m).
 * - Av. Sol: eje vertical en x = 140, de y = 40 a y = 160 (120 m), bordes a
 *   ±5 mm.
 * - Cuatro manzanas, una en cada cuadrante que dejan las dos calles.
 * - Barra de escala de 20 mm (20 m) con los textos «0» y «20 m».
 * - Cinco cotas en texto vectorial, junto a una crucecita en su punto.
 */

/** Medidas que las pruebas comprueban; se exportan para no repetirlas. */
export const PLANO_SIMULADO = {
  anchoPapelMm: 297,
  altoPapelMm: 210,
  escala: 1000,
  /** Desplazamiento del texto de cota respecto de su crucecita, en mm. */
  desfaseTextoMm: { x: 1.5, y: -1.5 },
  rotulos: [
    { texto: 'JR. LIMA', xMm: 60, yMm: 108, angulo: 0 },
    // Rotado como se rotula una calle vertical: se lee de abajo arriba.
    { texto: 'AV. SOL', xMm: 143, yMm: 70, angulo: 90 },
  ],
  cotas: [
    { texto: '3244.400', xMm: 40, yMm: 110 }, // inicio de Jr. Lima
    { texto: '3243.900', xMm: 140, yMm: 110 }, // cruce
    { texto: '3244.100', xMm: 240, yMm: 110 }, // fin de Jr. Lima
    // Una con prefijo, como se ve en los planos de expediente.
    { texto: 'NTN 3245.180', xMm: 140, yMm: 40 }, // inicio de Av. Sol
    { texto: '3243.680', xMm: 140, yMm: 160 }, // fin de Av. Sol
  ],
} as const

/**
 * Genera el PDF y devuelve sus bytes.
 *
 * Fecha de creación e identificador fijos: así dos generaciones dan el mismo
 * archivo y el que está guardado en el repositorio no cambia sin motivo.
 */
export function generarPdfPlano(): Uint8Array {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: false })
  doc.setCreationDate(new Date(Date.UTC(2026, 9, 5, 12, 0, 0)))
  doc.setFileId('00000000000000000000000000000001')
  doc.setDocumentProperties({ title: 'Plano de trazado - expediente simulado' })

  doc.setFont('helvetica', 'normal')
  doc.setLineWidth(0.25)

  // Calles: bordes de calzada, cortados en el cruce para que se lea como plano.
  const lima = { y: 110, x0: 40, x1: 240 }
  const sol = { x: 140, y0: 40, y1: 160 }
  const media = 5
  // Jr. Lima, a cada lado de la Av. Sol.
  for (const y of [lima.y - media, lima.y + media]) {
    doc.line(lima.x0, y, sol.x - media, y)
    doc.line(sol.x + media, y, lima.x1, y)
  }
  // Av. Sol, a cada lado del Jr. Lima.
  for (const x of [sol.x - media, sol.x + media]) {
    doc.line(x, sol.y0, x, lima.y - media)
    doc.line(x, lima.y + media, x, sol.y1)
  }
  // Ejes en trazo fino.
  doc.setLineWidth(0.1)
  doc.line(lima.x0, lima.y, lima.x1, lima.y)
  doc.line(sol.x, sol.y0, sol.x, sol.y1)

  // Manzanas: un rectángulo por cuadrante, retirado 3 mm de los bordes.
  doc.setLineWidth(0.35)
  const retiro = 3
  doc.rect(60, 45, sol.x - media - retiro - 60, lima.y - media - retiro - 45) // NO
  doc.rect(sol.x + media + retiro, 45, 220 - (sol.x + media + retiro), lima.y - media - retiro - 45) // NE
  doc.rect(60, lima.y + media + retiro, sol.x - media - retiro - 60, 155 - (lima.y + media + retiro)) // SO
  doc.rect(sol.x + media + retiro, lima.y + media + retiro, 220 - (sol.x + media + retiro), 155 - (lima.y + media + retiro)) // SE
  doc.setFontSize(9)
  doc.text('MZ. A', 95, 80)
  doc.text('MZ. B', 180, 80)
  doc.text('MZ. C', 95, 140)
  doc.text('MZ. D', 180, 140)

  // Rótulos de calle.
  doc.setFontSize(10)
  for (const r of PLANO_SIMULADO.rotulos) {
    doc.text(r.texto, r.xMm, r.yMm, { angle: r.angulo })
  }

  // Cotas: crucecita en el punto y el texto al lado.
  doc.setLineWidth(0.15)
  doc.setFontSize(7)
  const { x: dx, y: dy } = PLANO_SIMULADO.desfaseTextoMm
  for (const c of PLANO_SIMULADO.cotas) {
    doc.line(c.xMm - 1, c.yMm, c.xMm + 1, c.yMm)
    doc.line(c.xMm, c.yMm - 1, c.xMm, c.yMm + 1)
    doc.text(c.texto, c.xMm + dx, c.yMm + dy)
  }

  // Barra de escala: 20 mm = 20 m a 1:1000, en dos tramos alternados.
  doc.setLineWidth(0.3)
  doc.rect(40, 185, 10, 2, 'F')
  doc.rect(50, 185, 10, 2)
  doc.setFontSize(7)
  doc.text('0', 40, 183, { align: 'center' })
  doc.text('20 m', 60, 183, { align: 'center' })
  doc.text('ESCALA 1:1000', 70, 187)

  doc.setFontSize(11)
  doc.text('PLANO DE TRAZADO - EXPEDIENTE SIMULADO', 40, 25)

  return new Uint8Array(doc.output('arraybuffer'))
}
