# TOPO APP — Aplicación de Topografía

Aplicación de topografía para **campo y gabinete**, con núcleo en el **control de niveles por capas** en pavimentación urbana y veredas.

**Estado:** diseño de la primera herramienta terminado. Empieza la implementación.

## Documentación

- [Diseño general de la app (2026-08-08)](docs/superpowers/specs/2026-08-08-app-topografica-design.md)
- [Herramienta 1 — Nivelación por progresivas y capas (2026-08-19)](docs/superpowers/specs/2026-08-19-nivelacion-por-progresivas-design.md)

## Herramienta en construcción

**Nivelación por progresivas y capas.** Ingresas las lecturas de mira crudas; la app calcula cotas, verifica el cierre del circuito contra la tolerancia `e·√K`, compensa el error y te deja recorrer la calle en cortes transversales interactivos.

## Stack

- Núcleo de cálculo en **TypeScript puro** (sin dependencias de UI/IO)
- **React + Vite** para la interfaz, **Vitest** para las pruebas
- **Capacitor** para Android (campo, Bluetooth Clásico SPP) — más adelante
- **Three.js** para el visualizador 3D — más adelante

## Normativa de referencia (Perú)

RNE CE.010 · RNE CE.040 · MTC EG-2013
