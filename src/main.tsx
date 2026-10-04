import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter';
import '@fontsource-variable/jetbrains-mono';
import './styles/tokens.css';
import './styles/app.css';
import App from './App';
import { installBackHandler, useNav, go } from './app/nav';
import { useStore } from './app/store';

installBackHandler();

// Acceso para automatización (capturas del README y pruebas E2E).
(window as unknown as { __topo: unknown }).__topo = { go, useNav, useStore };

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
