/*
 * El logo de la empresa para el encabezado de los PDF. Suele ser una foto
 * del celular de varios MB: pegada tal cual, el PDF pesa demasiado para
 * mandarlo por WhatsApp y la vista previa se vuelve lenta. Se reduce a lo
 * que hace falta para 30 mm de papel.
 */

/** Lado mayor, en píxeles: de sobra para un logo de unos 30 mm impreso. */
export const LADO_MAXIMO_LOGO = 600

export const TIPOS_LOGO = /^image\/(png|jpeg)$/

function leerComoDataUrl(archivo: Blob): Promise<string> {
  return new Promise((resolver, rechazar) => {
    const lector = new FileReader()
    lector.onload = () =>
      typeof lector.result === 'string' ? resolver(lector.result) : rechazar(new Error('No se pudo leer la imagen.'))
    lector.onerror = () => rechazar(lector.error ?? new Error('No se pudo leer la imagen.'))
    lector.readAsDataURL(archivo)
  })
}

/**
 * Lee el logo y, si es más grande que `ladoMaximo`, lo redibuja más chico.
 * Un PNG sigue en PNG (puede tener fondo transparente); un JPG, en JPG. Si
 * el navegador no sabe redibujar (o falla), se usa el original: mejor un
 * PDF pesado que no tener logo.
 */
export async function reducirLogo(archivo: Blob, ladoMaximo = LADO_MAXIMO_LOGO): Promise<string> {
  const original = await leerComoDataUrl(archivo)
  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return original
  try {
    const imagen = await createImageBitmap(archivo)
    const escala = Math.min(1, ladoMaximo / Math.max(imagen.width, imagen.height))
    if (escala >= 1) {
      imagen.close()
      return original
    }
    const lienzo = document.createElement('canvas')
    lienzo.width = Math.max(1, Math.round(imagen.width * escala))
    lienzo.height = Math.max(1, Math.round(imagen.height * escala))
    const contexto = lienzo.getContext('2d')
    if (!contexto) {
      imagen.close()
      return original
    }
    contexto.drawImage(imagen, 0, 0, lienzo.width, lienzo.height)
    imagen.close()
    const tipo = archivo.type === 'image/png' ? 'image/png' : 'image/jpeg'
    const reducido = lienzo.toDataURL(tipo, 0.85)
    return reducido.startsWith(`data:${tipo}`) ? reducido : original
  } catch {
    return original
  }
}
