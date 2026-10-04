# Informe consolidado y plan de funciones — TOPO APP

**Fecha:** 2026-10-04 · **Estado:** aprobado para desarrollo (v1.0)

Este informe resume los cuatro estudios de la carpeta y decide **qué se construye en la v1.0**:

| # | Estudio | Contenido |
|---|---|---|
| 01 | [Estudio de mercado](01-estudio-de-mercado.md) | Competidores, precios, mercado peruano, brechas y monetización |
| 02 | [Estudio funcional de campo](02-estudio-funcional-campo.md) | Tareas del topógrafo, fórmulas, tolerancias (IGN, FGCS, EG-2013) e informes |
| 03 | [Formatos de datos de equipos](03-formatos-de-datos-equipos.md) | Leica GSI, Trimble DiNi, Sokkia SDR, Topcon, NMEA, CSV, DXF, KML, LandXML |
| 04 | [Estudio UX/UI](04-estudio-ux-ui.md) | Principios de apps de campo, navegación, sistema de diseño, wireframes |

---

## 1. Conclusiones de los estudios

1. **Hay un nicho real que nadie atiende bien.** En obras peruanas la nivelación con nivel automático es la tarea más frecuente, y se sigue haciendo en papel y Excel. Las suites premium (Trimble Access, Leica Captivate, Topcon Magnet, Carlson SurvCE, FieldGenius) cuestan entre US$ 700 y 2 200, están atadas a GNSS o estación total y dejan el ajuste de la nivelación para el gabinete. Las apps de libreta que existen son amateur: no dan informes profesionales ni conocen la normativa.
2. **Tres diferenciadores que ningún competidor junta:**
   - control del cierre **en campo**, con semáforo frente a la tolerancia `e·√K`;
   - **PDF y Excel listos para la supervisión** (libreta, protocolo de capas, cuadro de BMs);
   - **control de capas de pavimento** contra la rasante, con tolerancias EG-2013.
3. **No competir en GNSS ni en estación total.** TOPO APP debe ser agnóstica al equipo: importar lo que exporta cualquier nivel digital o estación total (GSI, DiNi, SDR, CSV) y exportar limpio a AutoCAD/Civil 3D (DXF, LandXML), Google Earth (KML) y Excel.
4. **Requisitos no negociables de UX:**
   - 100 % offline;
   - en español, con terminología peruana;
   - uso con una mano y con guantes (táctiles ≥ 48 px, 56 px por defecto);
   - **modo sol** de alto contraste;
   - teclado numérico propio para las lecturas de mira;
   - autoguardado;
   - estados que muestran **icono + texto + color** juntos.
5. **Navegación:** cinco destinos fijos en la barra inferior (en tablet o PC pasa a un riel lateral):
   - **Inicio**
   - **Nivelación**
   - **Puntos**
   - **Cálculos**
   - **Informes**

   Las acciones principales van en un botón flotante contextual y las secundarias en hojas inferiores.

## 2. Problemas del estado anterior y cómo se resuelven

| Antes | Ahora (v1.0) |
|---|---|
| Solo un documento de diseño, sin código ejecutable | App funcional: Vite + React + TypeScript, empaquetable para Android con Capacitor |
| Alcance disperso (3D, CAD, nube…) sin un orden de prioridades | Alcance priorizado MUST → SHOULD; el 3D y la nube pasan a una fase posterior |
| Sin estructura de navegación | 5 pestañas fijas, pantallas apiladas, botón *atrás* nativo de Android |
| Sin motor de cálculo | Motor puro en `src/core` cubierto por tests (Vitest) |
| Sin estrategia de informes | Módulo `src/report`: PDF (jsPDF) y Excel (SheetJS) con membrete |

## 3. Funciones aprobadas para la v1.0

✅ = incluido en v1.0 · 🔜 = fase siguiente

### Nivelación (núcleo)
- ✅ Libreta digital con métodos **cota instrumental** y **ascensos/descensos**, puntos de cambio e intermedias, y cálculo en vivo
- ✅ **Captura de campo**: teclado numérico grande, botón "Siguiente", flujo VA → VI… → VAd, deshacer
- ✅ Hilos estadimétricos (superior, medio, inferior) con verificación del hilo medio y distancia `100·(hs − hi)`
- ✅ Comprobación aritmética `ΣVA − ΣVAd = ΣS − ΣB = Cf − Ci`
- ✅ Cierre frente a tolerancia `e·√K`, con perfiles de orden (1.º, 2.º, 3.º, ordinaria y personalizada) y un **semáforo** (cumple ≤ 0,8 T · al límite ≤ T · no cumple > T)
- ✅ Compensación proporcional a la distancia o al número de estaciones
- ✅ Balance de distancias atrás/adelante con alerta
- ✅ Cotas de proyecto en puntos intermedios, con **corte/relleno**
- ✅ Perfil gráfico de la nivelación
- ✅ Importación desde **niveles digitales**: Leica GSI (LS10/LS15/DNA03/Sprinter), Trimble DiNi (.dat), CSV
- 🔜 Conexión Bluetooth directa con el nivel

### Control de capas (pavimentos y veredas)
- ✅ Paquete de capas con plantillas: flexible urbano, rígido, vereda y afirmado
- ✅ Rasante por pendientes (cota inicial, pendiente longitudinal, bombeo a dos aguas o a una)
- ✅ Malla de control automática (progresivas × desplazamientos)
- ✅ Cota de diseño por capa, cota medida, desviación, semáforo y estadísticas
- ✅ Protocolo de nivelación por capa en PDF y Excel

### Puntos y levantamiento
- ✅ Lista de puntos con búsqueda y filtro por código; alta y edición
- ✅ **Vista en planta** interactiva: zoom, desplazamiento, códigos y colores por cota
- ✅ Captura con el GPS del teléfono, convertida a UTM (para croquis)
- ✅ Bancos de nivel (cuadro de BMs)
- ✅ Importación CSV/TXT (PNEZD, PENZD…), Leica GSI, Sokkia SDR33, Topcon y NMEA
- ✅ Superficie TIN, curvas de nivel y volumen respecto de una cota

### Cálculos (herramientas)
- ✅ Inverso (azimut, rumbo, distancia, pendiente) y radiación (polar → rectangular)
- ✅ UTM ↔ geográficas WGS84 (17S/18S/19S) con factor de escala
- ✅ Área y perímetro (Gauss)
- ✅ Conversor de pendientes (%, ‰, °, 1:n) y conversor de ángulos (DMS, decimal, gon)
- ✅ Prueba de dos estacas (colimación)
- ✅ Taquimetría (tres hilos), curvatura y refracción, nivelación recíproca
- ✅ Lectura de mira objetivo para replanteo (cota de proyecto → lectura)
- ✅ Pendiente de tuberías: cota de fondo a una distancia, ‰, profundidad de buzón
- ✅ Poligonal con compensación Bowditch y tránsito
- ✅ Curva horizontal: elementos y tabla de replanteo
- ✅ Intersecciones (azimut–azimut y distancia–distancia)
- ✅ Volumen por áreas medias y prismoidal

### Informes y datos
- ✅ PDF de la **libreta de nivelación** (encabezado de obra, tabla, cierre, perfil, firmas)
- ✅ PDF del **protocolo de control de capas**
- ✅ PDF del **cuadro de puntos y BMs**
- ✅ Excel (.xlsx) del proyecto completo y de cada informe
- ✅ Exportación a CSV, **DXF** (AutoCAD), **KML** (Google Earth) y **LandXML**
- ✅ Respaldo y restauración del proyecto completo (`.topo.json`)
- ✅ Membrete configurable: empresa, ingeniero y CIP

### Sistema
- ✅ Temas claro, oscuro y **sol**; funciona sin internet; autoguardado local
- ✅ Proyecto de ejemplo para probar la app en segundos
- ✅ Diseño adaptable: celular (barra inferior) y PC o tablet (riel lateral)
- 🔜 Bluetooth SPP (estación total, GNSS), visor 3D, sincronización en la nube y licencias

## 4. Flujos de pocos toques (objetivo de UX)

| Flujo | Toques |
|---|---|
| Nueva nivelación desde Inicio | 3 (Nivelación rápida → BM → Empezar) |
| Registrar una lectura | número + "Siguiente" |
| Importar archivo del nivel digital → PDF | 3 (Importar → archivo → Informe PDF) |
| Calcular cota de un punto | 2 (Cálculos → Lectura/Cota) |
| Exportar el proyecto a Excel | 2 (Informes → Excel) |

## 5. Arquitectura

```
src/
├── core/        motor puro (sin DOM) — leveling, cogo, geo, surface, pavement, units
├── io/          importadores y exportadores (GSI, DiNi, SDR, Topcon, NMEA, CSV, DXF, KML, LandXML)
├── report/      generadores de PDF y Excel
├── ui/          kit de componentes, gráficos (perfil, planta), formato
├── app/         estado (zustand + autoguardado), navegación, plataforma (archivos, GPS)
└── features/    pantallas por pestaña: home, leveling, points, tools, reports
```

Regla: `core` no importa nada de los demás; `io` y `report` dependen solo de `core`; las pantallas juntan todo.
