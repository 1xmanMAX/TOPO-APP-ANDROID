# TOPO APP — Aplicación de Topografía

Aplicación de topografía para **campo y gabinete**, con núcleo en el **control de niveles por capas** en pavimentación urbana y veredas.

**Estado:** Entregas 1 y 2A funcionando — nivelación de una calle por progresivas con verificación de cierre, y comparación de capas con el espesor realmente colocado.

## Cómo usarla

```
npm install     # la primera vez
npm run dev     # abre en http://localhost:5173
```

Funciona **sin internet**. Guía completa: [docs/uso.md](docs/uso.md).

## Qué hace hoy

- **Libreta de nivelación** con las lecturas de mira tal como se anotan en campo: vista atrás, intermedias, punto de cambio, vista adelante.
- **Cotas calculadas** por el método de cota instrumento, encadenando estaciones.
- **Verificación de cierre** contra la tolerancia `T = e·√K`, con los tres casos reales: cerrado, enlace a otro banco de nivel, y abierto sin verificación.
- **Compensación** proporcional del error, conservando siempre la cota cruda al lado de la compensada.
- **Avisos** de lectura que se aparta de sus vecinas, celda medida dos veces, punto de cambio repetido y cierre fuera de tolerancia.
- **Plantilla transversal configurable** por calle: con vereda o sin ella, con pelo de agua, con los puntos existentes de amarre que hagan falta.
- **Campañas apiladas** por fecha, calle y capa. Nunca se pisan entre sí.
- **Corte transversal con deslizador** y perfil longitudinal, ligados a la tabla: eliges una celda y el corte salta a esa progresiva.
- **Archivo `.topo` portable** y autoguardado con recuperación.
- **Comparación de dos capas** con el espesor colocado celda por celda, su mínimo, medio y máximo, y cuántas celdas son comparables. Una celda sin pareja sale vacía, nunca cero.
- **Corte con las capas superpuestas** y el área sombreada solo donde las dos tienen medida.
- **Exportación** a Excel, CSV y portapapeles — de cotas o de espesores, y siempre con el estado de verificación en la cabecera.
- Modo claro, oscuro y automático.

## Verificación

```
npm test                                   # 301 pruebas: 102 del motor + 199 de la interfaz
npm run typecheck --workspaces             # tipos
npm run build --workspace packages/app     # 289 kB, 90 kB comprimido
npm audit --omit=dev                       # sin vulnerabilidades
```

Y la verificación en un navegador real, que comprueba lo que un entorno simulado no puede:

```
npm run build --workspace packages/app
npx vite preview --port 4173                 # desde packages/app, en otra ventana
node packages/app/verificacion/recorrido.mjs <carpeta-de-salida>   # 14 comprobaciones
node packages/app/verificacion/capas.mjs <carpeta-de-salida>       # 13 comprobaciones
```

El de capas descarga el Excel de espesores de verdad, lo descomprime y comprueba lo que solo se ve dentro del archivo.

## Estructura

```
packages/
  core/   motor de cálculo — TypeScript puro, sin pantalla ni archivos
  app/    interfaz — React + Vite + Tailwind
```

El motor no sabe que existe una pantalla: recibe números y devuelve números. La interfaz lo consume; nunca al revés.

## Documentación

- [Diseño general de la app](docs/superpowers/specs/2026-08-08-app-topografica-design.md)
- [Diseño de la herramienta 1](docs/superpowers/specs/2026-08-19-nivelacion-por-progresivas-design.md)
- [Plan de implementación de la Entrega 1](docs/superpowers/plans/2026-08-19-entrega-1-nivelacion-por-progresivas.md)
- [Plan de implementación de la Entrega 2A](docs/superpowers/plans/2026-08-20-entrega-2a-capas-y-espesores.md)
- [Guía de uso](docs/uso.md)
- [Decisiones tomadas durante la Entrega 1](docs/decisiones-entrega-1.md)
- [Decisiones tomadas durante la Entrega 2A](docs/decisiones-entrega-2a.md)

## Lo que viene

| | |
|---|---|
| **Entrega 2B** | Rasante de proyecto: cota teórica contra real, corte y relleno, semáforo de tolerancia |
| **Entrega 3** | Visor 3D con las capas apiladas y el plano de corte ligado al mismo deslizador |
| **Entrega 4** | Planos de fondo con marcadores anclados, para ubicar y encadenar calles |

## Stack

TypeScript · React 19 · Vite 7 · Tailwind v4 · Vitest · fflate · idb-keyval · Zustand

Sin servidor, sin base de datos, sin cuentas. Los datos viven en tu archivo `.topo`.

## Normativa de referencia (Perú)

RNE CE.010 · RNE CE.040 · MTC EG-2013
