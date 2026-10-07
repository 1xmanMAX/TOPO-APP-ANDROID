import tailwind from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  // Rutas relativas: la misma compilación sirve en el navegador, dentro de la
  // app de Android (Capacitor) y dentro de la de Windows (Electron).
  base: './',
  plugins: [react(), tailwind()],
})
