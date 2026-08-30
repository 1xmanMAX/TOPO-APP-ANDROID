/**
 * Lo que un punto de la sección es, sin el lado: el lado sale del signo de
 * la distancia, no del rol. Así una misma palabra —«vereda»— sirve para los
 * dos lados de la calle.
 */
export type Rol = 'eje' | 'bordeCalzada' | 'sardinel' | 'vereda' | 'cuneta' | 'peloAgua' | 'otro'

export const ROLES: readonly Rol[] = ['eje', 'bordeCalzada', 'sardinel', 'vereda', 'cuneta', 'peloAgua', 'otro']

export const ETIQUETA_ROL: Record<Rol, string> = {
  eje: 'Eje',
  bordeCalzada: 'Borde de calzada',
  sardinel: 'Sardinel',
  vereda: 'Vereda',
  cuneta: 'Cuneta',
  peloAgua: 'Pelo de agua',
  otro: 'Otro',
}
