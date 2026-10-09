import tailwind from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { defineConfig } from 'vite'

// El paquete de LibreDWG no deja importar su .wasm por su nombre («exports»
// lo cierra): se llega a su carpeta por la ruta real y se pide como URL.
const raizLibreDwg = dirname(createRequire(import.meta.url).resolve('@mlightcad/libredwg-web'))

export default defineConfig({
  // Rutas relativas: la misma compilación sirve en el navegador, dentro de la
  // app de Android (Capacitor) y dentro de la de Windows (Electron).
  base: './',
  plugins: [react(), tailwind()],
  resolve: {
    alias: { 'libredwg-wasm': join(raizLibreDwg, '..', 'wasm') },
  },
  // El módulo trae su propio cargador de WebAssembly: no se preempaqueta.
  optimizeDeps: { exclude: ['@mlightcad/libredwg-web'] },
})
