import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import RedDeSeguridad from './componentes/RedDeSeguridad'
import './estilos.css'

createRoot(document.getElementById('raiz')!).render(
  <StrictMode>
    <RedDeSeguridad>
      <App />
    </RedDeSeguridad>
  </StrictMode>,
)
