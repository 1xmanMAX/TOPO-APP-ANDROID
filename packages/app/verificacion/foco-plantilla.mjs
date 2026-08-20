import { chromium } from 'playwright'

const navegador = await chromium.launch()
const pagina = await navegador.newPage()
await pagina.goto('http://localhost:4173/', { waitUntil: 'networkidle' })
await pagina.getByRole('button', { name: 'Plantilla' }).click()

// Marca cada campo de distancia con la clave de su fila, para poder saber
// DESPUÉS de escribir si el campo enfocado sigue siendo el mismo elemento.
async function fotografiarFilas() {
  return pagina.evaluate(() => {
    const filas = [...document.querySelectorAll('div.grid')]
      .filter((f) => f.querySelector('input[aria-label="Clave"]'))
    return filas.map((fila) => ({
      clave: fila.querySelector('input[aria-label="Clave"]').value,
      distancia: fila.querySelector('input[inputmode="decimal"]').value,
    }))
  })
}

console.log('Orden inicial:', (await fotografiarFilas()).map((f) => `${f.clave}=${f.distancia}`).join(' '))

// Enfocar la distancia de la PRIMERA fila y anotar a qué elemento pertenece
const antes = await pagina.evaluate(() => {
  const fila = [...document.querySelectorAll('div.grid')]
    .filter((f) => f.querySelector('input[aria-label="Clave"]'))[0]
  const campo = fila.querySelector('input[inputmode="decimal"]')
  campo.focus()
  campo.dataset.marca = 'seguido'
  return fila.querySelector('input[aria-label="Clave"]').value
})
console.log('Se empieza a editar la distancia de:', antes)

// Escribir un valor que la manda al otro extremo
await pagina.keyboard.press('Control+a')
await pagina.keyboard.type('10', { delay: 60 })

const despues = await pagina.evaluate(() => {
  const activo = document.activeElement
  const marcado = document.querySelector('input[data-marca="seguido"]')
  const filaDelActivo = activo?.closest('div.grid')
  return {
    sigueSiendoElMismoNodo: activo === marcado,
    claveQueMuestraAhora: filaDelActivo?.querySelector('input[aria-label="Clave"]')?.value ?? null,
    valorQueMuestraAhora: activo?.value ?? null,
  }
})

console.log('Sigue enfocado el mismo campo del DOM:', despues.sigueSiendoElMismoNodo)
console.log('Ese campo ahora pertenece al elemento:', despues.claveQueMuestraAhora)
console.log('Y muestra el valor:', despues.valorQueMuestraAhora)
console.log('Orden final:', (await fotografiarFilas()).map((f) => `${f.clave}=${f.distancia}`).join(' '))

const correcto = despues.claveQueMuestraAhora === antes && despues.valorQueMuestraAhora === '10'
console.log(correcto
  ? '\nOK: se sigue editando el mismo elemento'
  : `\nFALLA: se empezó editando ${antes} y se acabó editando ${despues.claveQueMuestraAhora}`)

await navegador.close()
process.exit(correcto ? 0 : 1)
