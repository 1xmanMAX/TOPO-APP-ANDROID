import type { BaseInforme } from './tipos'

/** Encabezado de obra común a las pruebas: con tildes y eñes a propósito. */
export const baseDePrueba = (comprobado: boolean): BaseInforme => ({
  encabezado: {
    obra: 'Pavimentación de la Av. Ñaña',
    calle: 'Jr. Peñaloza',
    capa: 'Subrasante',
    fecha: '05/10/2026',
    tramo: '0+000 a 0+120',
    bm: { nombre: 'BM-1', cota: 3244.6275 },
    toleranciaMm: 10,
    topografo: 'Max Mamani',
    supervisor: 'Ing. Pérez',
  },
  comprobado,
})
