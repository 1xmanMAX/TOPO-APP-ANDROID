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
