import EnConstruccion from '../../componentes/EnConstruccion'

/**
 * Obra › Plano: el plano de obra (DXF o PDF) con las pistas encima, sus
 * pendientes y sus controles, y el croquis de cada pista. ESQUELETO del
 * armazón: lo llena el agente de Plano con `agregarPlano`, `agregarPista`,
 * `crearCalleDesdePista`… del almacén y los lectores de `src/planos`.
 */
export default function EspacioPlano() {
  return (
    <EnConstruccion
      titulo="Plano de obra"
      descripcion="Abre el plano en DXF o PDF, dibuja las pistas y toca una para ir a sus cálculos."
    />
  )
}
