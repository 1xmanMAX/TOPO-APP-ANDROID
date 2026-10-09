import { Capacitor } from '@capacitor/core'

/**
 * El `accept` de un <input type="file">, o nada en Android. Android traduce
 * cada extensión a un tipo de archivo, y las que no conoce (.dwg, .topo)
 * quedan en gris en el selector: no se pueden elegir. Allí se deja elegir
 * cualquier archivo; igual se revisa lo que es al leerlo (la firma del DWG,
 * del PDF, del zip del .topo) y se avisa si no sirve.
 */
export function aceptarArchivos(lista: string): string | undefined {
  const android = Capacitor.isNativePlatform() || (typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent))
  return android ? undefined : lista
}
