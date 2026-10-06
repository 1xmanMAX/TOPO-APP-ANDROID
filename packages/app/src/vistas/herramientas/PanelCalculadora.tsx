import EnConstruccion from '../../componentes/EnConstruccion'

/**
 * La calculadora de campo, que se abre encima de cualquier pantalla con el
 * botón Calcular. El marco (el diálogo y su botón de cerrar) lo pone App;
 * esto es solo su contenido. ESQUELETO del armazón: lo llena el agente de
 * Herramientas sobre `campo/calculadora` del motor.
 */
export default function PanelCalculadora() {
  return (
    <EnConstruccion
      titulo="Calculadora de campo"
      descripcion="Altura instrumental, cota, lectura objetivo y cortar o rellenar, a un toque desde cualquier pantalla."
    />
  )
}
