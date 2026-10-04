# Estudio de mercado: software de topografía de campo

**Foco:** Perú y Latinoamérica, con referencia al mercado global
**Producto evaluado:** TOPO APP (Android, campo, nivelación y control de obra)
**Fecha de corte:** octubre 2026
**Método:** investigación documental en la web (fabricantes, distribuidores, Google Play, informes de mercado, fuentes oficiales peruanas). Los precios son de lista o de distribuidores públicos, en USD salvo que se indique otra moneda. Varían por país, distribuidor y paquete con equipo. Las cifras de tamaño de mercado vienen de consultoras privadas con metodologías distintas: deben leerse como **órdenes de magnitud**, no como valores exactos.

> **Leyenda de confianza**
> - **[V]**: dato verificado en la fuente citada.
> - **[E]**: estimación o juicio del analista a partir de fuentes indirectas o de la experiencia del sector. Conviene validarlo con entrevistas.

---

## Índice

1. [Resumen ejecutivo](#1-resumen-ejecutivo)
2. [Panorama competitivo](#2-panorama-competitivo)
3. [Tamaño de mercado y tendencias](#3-tamaño-de-mercado-y-tendencias)
4. [Perfil del usuario en Perú](#4-perfil-del-usuario-en-perú)
5. [Brechas y oportunidades](#5-brechas-y-oportunidades)
6. [Propuesta de valor, posicionamiento y monetización](#6-propuesta-de-valor-posicionamiento-y-monetización)
7. [Matriz comparativa](#7-matriz-comparativa)
8. [Riesgos](#8-riesgos)
9. [Conclusiones para TOPO APP](#9-conclusiones-para-topo-app)
10. [Fuentes](#10-fuentes)

---

## 1. Resumen ejecutivo

- El mercado de software de topografía está **polarizado**:
  - **En la gama alta** están las suites de los fabricantes (Trimble Access, Leica Captivate, Topcon/Magnet, Carlson, FieldGenius), que cuestan entre **US$ 700 y 2,200 por licencia o por año** y están pensadas para GNSS y estaciones totales.
  - **En la gama baja** hay apps gratuitas o casi gratuitas (Mobile Topographer, SW Maps, decenas de "libretas de nivelación" amateur) sin rigor normativo ni informes profesionales.
- **La nivelación geométrica (con nivel automático) es la actividad más frecuente en obra civil y la peor atendida por el software.** Las suites premium la tratan como función secundaria o la delegan al software de gabinete (Trimble Business Center, Leica Infinity). Las apps de libreta de nivel son proyectos pequeños, a menudo abandonados. Por ejemplo, Nivellus se discontinuó por "insufficient demand" en el mercado alemán. Ninguna emite un **informe PDF listo para la supervisión** con control de cierre según tolerancia, ni un control de capas de pavimento contra la rasante del proyecto.
- **El contexto peruano es favorable:**
  - La inversión pública fue récord en 2025 (**S/ 60,422 millones**), con fuerte peso de los gobiernos locales, que ejecutan obras de pavimentación y saneamiento.
  - El presupuesto de saneamiento fue de S/ 6,108 millones.
  - Android tiene alrededor del **82 %** de cuota móvil en Perú.
  - El Plan BIM se vuelve obligatorio por tipologías a partir de 2025–2026.
- **Oportunidad recomendada:** posicionar TOPO APP como **"la libreta de nivelación y control de obra del topógrafo peruano"**. Debe funcionar offline, en español y con normativa local (EG-2013, tolerancias de cierre), generar PDF y Excel con formato de protocolo y tener un precio accesible (freemium con plan Pro de alrededor de S/ 15–25 al mes o pago anual). No debe competir con las suites GNSS en su terreno.

---

## 2. Panorama competitivo

### 2.1 Segmentación del mercado

| Segmento | Ejemplos | Precio típico | Usuario |
|---|---|---|---|
| A. Suites de campo de fabricante (premium) | Trimble Access, Leica Captivate, Topcon Magnet Field / Topcon Field | US$ 800–1,600/año o perpetua > US$ 2,000 | Empresas grandes, minería, concesiones viales |
| B. Software de campo multimarca | Carlson SurvPC/SurvCE, MicroSurvey FieldGenius | US$ 845/año a US$ 2,200 perpetua | Consultoras medianas, EE. UU./Canadá |
| C. Software GNSS chino (incluido con el receptor) | South SurvStar/SurvX, CHC LandStar, Hi-Target Hi-Survey | Incluido o alrededor de € 495 | Contratistas medianos y pequeños en LatAm |
| D. Ecosistemas GNSS low-cost | Emlid Flow, SW Maps, Mobile Topographer | Gratis a US$ 240/año | Agrimensores independientes, catastro, GIS |
| E. Apps de libreta de nivelación | Level Book / Libreta de Nivel, Smart Level Book, Topografía-Nivelaciones, Nivellus, Geometri | Gratis a < US$ 10 | Topógrafos de obra, estudiantes |
| F. Gabinete / CAD | Civil 3D, CivilCAD, TopoCal, Trimble Business Center, Leica Infinity | Gratis a US$ 2,870/año | Oficina técnica, ingenieros de diseño |

### 2.2 Fichas de competidores

#### Trimble Access (Trimble)

- **Plataforma:** Windows y Android en controladoras Trimble (TSC5/TSC7, TDC600).
- **Licencia y precio [V]:**
  - Suscripción anual o perpetua ligada a la controladora.
  - General Survey: alrededor de **US$ 1,540–1,602/año**.
  - Solo GNSS: alrededor de US$ 1,025–1,066/año.
  - Módulo Roads: alrededor de US$ 615/año.
  - Fuentes: [CSDS](https://www.csdsinc.com/service-support/warranty-subscription-renewals/trimble-access-warranty-subscriptions), [NEI GPS](https://neigps.com/shop/trimble-access-general-survey-1-year-subscription/), [Trimble Help: licencias](https://help.fieldsystems.trimble.com/trimble-access/latest/en/software-licenses.htm).
- **Funciones:** GNSS RTK, estación total robótica, escáner, carreteras, túneles, minas, monitoreo, Trimble Connect.
- **Nivelación:** soporta archivos de nivel digital Trimble DiNi (.dat). El ajuste completo del itinerario se hace en Trimble Business Center (gabinete) ([Trimble TBC: DiNi](https://help.fieldsystems.trimble.com/tbc/4652.htm), [Frontier Precision](https://frontierprecision.com/news/trimble-dini-level-loop-adjustment-in-tbc/)).
- **Fortalezas:** el más completo, el estándar en grandes proyectos y con mucho soporte.
- **Debilidades:** caro, atado al hardware Trimble y poco útil para quien trabaja con nivel automático y libreta.

#### Leica Captivate y Leica Zeno (Leica Geosystems / Hexagon)

- **Plataforma:**
  - Captivate corre en estaciones totales y controladoras Leica (CS20, CS30).
  - Zeno Mobile corre en Android 5+.
- **Licencia y precio:**
  - Captivate se vende por cotización y suele ir incluido con el equipo [V].
  - Zeno Mobile Professional: referencia de alrededor de **US$ 1,680** [V] ([Transit & Level](https://www.transitandlevel.com/shop/871195-leica-zeno-mobile-professional-android-5148), [Leica Zeno Mobile](https://leica-geosystems.com/en-gb/products/gis-collectors/software/leica-zeno-mobile)).
- **Funciones:** levantamiento, replanteo, carreteras, visualización 3D y BIM. Zeno se orienta a GIS con antena GG04 (precisión de 1 cm).
- **Nivelación:** los niveles digitales LS10/LS15 tienen su propio software a bordo con guía de líneas de nivelación. El post-proceso se hace en **Leica Infinity** ([Leica LS15/LS10](https://leica-geosystems.com/en-us/products/levels/digital-levels/leica-ls15-and-ls10)). Un LS15 cuesta entre US$ 9,650 y 13,800 [V] ([VP-ESS](https://www.vp-ess.com/products/survey/levels/digital-levels/leica-ls15-digital-level/)), fuera del alcance del topógrafo promedio de obra en Perú.
- **Fortalezas:** calidad, marca e integración con BIM e Infinity.
- **Debilidades:** ecosistema cerrado y costo muy alto. Los usuarios de niveles automáticos (la mayoría) no lo usan.

#### Topcon Magnet Field / Topcon Field (Topcon, también Sokkia)

- **Plataforma:** Windows (Magnet Field) y **Android/iOS** (Topcon Field Mobile, en Google Play).
- **Precio [V]:** alrededor de **US$ 835/año**, en oferta US$ 710 ([Topcon Shop](https://shop.topconsolutions.com/products/topcon-field-for-android-ios-subscription), [AAI Survey](https://aaisurvey.com/products/topcon-field-mobile-software-android-and-ios-subscription)).
- **Funciones:** GNSS, estaciones Topcon y Sokkia (incluidas robóticas), replanteo, nube (MAGNET Enterprise) e informes de campo.
- **Nivelación:** los niveles digitales Sokkia/Topcon exportan en SDR33 [V] ([rpls.com](https://rpls.com/forums/software-cad-mapping/digital-levels-2/)). En la app móvil no hay un flujo de libreta de nivel automático [E].
- **Fortalezas:** es la única suite premium realmente móvil (en el teléfono) y tiene buena base instalada Sokkia y Topcon en Perú [E].
- **Debilidades:** suscripción en USD, interfaz en inglés u orientada a EE. UU. y foco en replanteo, no en libreta de nivelación.

#### Carlson SurvPC / SurvCE / Carlson Layout (Carlson Software)

- **Plataforma:** SurvPC en Windows. SurvCE en Windows Mobile (legado). **Carlson Layout para Android**.
- **Precio [V]:**
  - SurvPC 7: US$ 1,750 (estación total US$ 1,500, más GPS US$ 1,000, más robótica US$ 500).
  - Carlson Layout Android: US$ 1,000–1,250.
  - Fuente: [Lista de precios Carlson (Minnesota OSP)](https://osp.admin.mn.gov/sites/osp/files/2024-02/s-9345_171660_ppl_carlson_software_a7.pdf).
- **Funciones:** multimarca (cientos de equipos), COGO, carreteras, superficies y formatos RW5 y LandXML.
- **Fortalezas:** soporte de hardware muy amplio y mucha historia en EE. UU.
- **Debilidades:** caro, la experiencia en Android es limitada y tiene poca presencia comercial en Perú [E].

#### MicroSurvey FieldGenius (MicroSurvey / Hexagon)

- **Plataforma:** Windows 10/11 y **Android**.
- **Precio [V]:**
  - Perpetua: US$ 2,200.
  - Suscripción: US$ 845/año.
  - Versión Emlid: alrededor de US$ 1,183.
  - Fuente: [MicroSurvey Pricing](https://www.microsurvey.com/products/fieldgenius/pricing/).
- **Funciones:** COGO, poligonal, replanteo, DTM, LandXML, informes personalizables e interfaz basada en mapa.
- **Fortalezas:** neutral respecto a la marca y buena experiencia de uso gráfica.
- **Debilidades:** precio alto para LatAm y sin enfoque en nivelación de obra.

#### South SurvStar / SurvX (South) y CHC LandStar

- **Plataforma:** Android (5.1.1 o superior).
- **Precio:**
  - SurvStar: alrededor de **€ 495** [V] ([Global GPS Systems](https://globalgpssystems.com/survstar/)).
  - En la práctica suele venir **incluido con el receptor GNSS** chino [E].
  - SurvX se describe como "low-cost" ([Survey Solutions NZ](https://www.surveysolutions.co.nz/survey-controllers/south-survx-field-data-collection-android/)).
- **Funciones:**
  - RTK, estático, PPK, replanteo de puntos y líneas, carreteras y CAD (DXF/DWG).
  - Volúmenes, líneas eléctricas y base de datos de sistemas de coordenadas.
  - SurvX está en varios idiomas, incluido el español ([SourceForge SurvX](https://sourceforge.net/software/product/SurvX/)).
- **Fortalezas:** muy difundido en Perú y LatAm porque los receptores South, CHC, Hi-Target y Stonex dominan el segmento medio [E]. Precio bajo.
- **Debilidades:** muy centrado en GNSS, sin libreta de nivelación geométrica, traducciones irregulares e informes pobres para la supervisión [E].

#### Hi-Target Hi-Survey (Road)

- **Plataforma:** Android (controladoras Hi-Target y teléfonos de terceros).
- **Precio:** incluido con el equipo o por cotización ([Survey Mate](https://surveymate.net/product/software/land-survey-software/hi-survey-road-software/)).
- **Funciones:** carreteras (eje, perfil, secciones, cadenamientos), replanteo, DTM, CAD, modo offline con sincronización ([Hi-Target ES](http://es.hi-target.com.cn/hi-survey-road-software)).
- **Fortalezas:** buen módulo vial y Android.
- **Debilidades:** atado a GNSS y estación total. No cubre la nivelación geométrica ni el control de capas con nivel.

#### Mobile Topographer (Applicality)

- **Plataforma:** Android.
- **Precio [V]:** versión GIS gratuita. Pro alrededor de US$ 22 (pago único). Algunos usuarios reportan suscripción de alrededor de US$ 35/año ([Google Play](https://play.google.com/store/apps/details?id=com.applicality.mobiletopographergis&hl=en_US), [Applicality](http://applicality.com/projects/mobile-topographer-pro/)).
- **Funciones:** GNSS interno o externo (GPS, GLONASS, Galileo, BeiDou), estacionamiento, curvas de nivel, 3D y transformaciones.
- **Fortalezas:** precio y gran base de usuarios.
- **Debilidades:** precisión limitada sin un receptor externo y no es una herramienta de control de obra.

#### SW Maps (Softwel, Nepal)

- **Plataforma:** Android e iOS.
- **Precio [V]:** **gratis, sin anuncios** y con uso comercial permitido ([Google Play](https://play.google.com/store/apps/details?id=np.com.softwel.swmaps&hl=en_US)).
- **Funciones:** GIS, RTK externo por Bluetooth o BLE, NTRIP, replanteo de puntos y líneas, exportación a SHP, KMZ, GPKG, XLS y CSV, y mapas offline.
- **Fortalezas:** es el estándar de facto de los usuarios de GNSS low-cost (Emlid, ArduSimple).
- **Debilidades:** no hace topografía de obra (ni nivelación, ni COGO avanzado, ni informes).

#### Emlid Flow (Emlid)

- **Plataforma:** Android e iOS.
- **Precio [V]:**
  - Plan gratuito básico.
  - Plan Survey: **US$ 240/año** o US$ 25/mes.
  - Receptor RS3: US$ 2,999.
  - Fuente: [Emlid Store](https://store.emlid.com/products/reach-rs3-survey-kit), [Advexure](https://advexure.com/products/emlid-flow-survey-plan-1-year).
- **Funciones:** levantamiento, replanteo, codificación, líneas y replanteo sobre DTM ([American Surveyor](https://amerisurv.com/2024/09/20/the-emlid-flow-survey-app-now-supports-dtm-staking-and-other-pro-surveying-tools-on-android-ios/)).
- **Interés para TOPO APP:** es el **referente de modelo de negocio** (freemium móvil con buena experiencia de uso) en el segmento low-cost.

#### Apps de libreta de nivelación (competencia directa)

| App | Desarrollador | Plataforma y precio | Funciones | Limitaciones |
|---|---|---|---|---|
| **Level Book / Libreta de Nivel – Replanteos** | Adrian Pérez Cruz | Android, gratis o freemium | Altura de instrumento (HI) y cotas automáticas, modo replanteo ([Google Play](https://play.google.com/store/apps/details?id=com.perez.adrian.nivelesandroid&hl=en_US)) | Sin control normativo de cierre ni PDF de protocolo [E] |
| **Smart Level Book** | SONIS (Corea) | Android | Cota en tiempo real con BS/FS, exportación a Excel, replanteo, áreas y volúmenes ([Google Play](https://play.google.com/store/apps/details?id=com.smartlevelbook.smartlevelbook&hl=en_IN)) | Interfaz poco localizada y sin tolerancias locales [E] |
| **Topografía – Nivelaciones** | GeoSoftware (V. Palma Carrasco) | Android, en español | Nivelación simple y de precisión con 3 hilos, cierre de nivelación ([Google Play](https://play.google.com/store/apps/details?hl=es_419&id=com.topografia.nivelaciones)) | Informe y gestión de proyectos básicos [E] |
| **Libreta Topográfica – Nivelación Geométrica / Topography Book Pro** | AppsYona / ingtecyobi (App Inventor) | Android, gratis o bajo costo | Nivelación simple y compuesta, CSV ([APKCombo](https://apkcombo.com/topographic-notepad-geometri/com.appsyona.nivelaciontopogratis/)) | Hecha con App Inventor y de calidad amateur [E] |
| **Nivel topográfico** | PeopleDev | Android | Registro, cotas, corte y relleno, pendientes, CSV ([Google Play](https://play.google.com/store/apps/details?id=com.byPeopleDev.NivelDigital&hl=en_US)) | Sin informe profesional [E] |
| **Nivellus** | level-online.net (Alemania) | Android, demo y versión completa | Rise/fall, compensación, cierre admisible, PDF y TXT ([level-online](https://www.level-online.net/nivellus/index.php?lang=en)) | **Discontinuada por "insufficient demand"**. Solo en alemán e inglés |

**Lectura:** existe demanda (hay muchas apps y descargas), pero **la oferta está fragmentada y es amateur**. Nadie ha construido una libreta de nivelación de calidad profesional con salida para la supervisión. El fracaso de Nivellus advierte que **una libreta sola es un producto pequeño**: hay que unirla al flujo de control de obra (capas, rasantes, protocolos) y al mercado hispano, donde la nivelación con nivel automático sigue siendo masiva.

#### Gabinete: TopoCal, CivilCAD, Civil 3D

- **TopoCal (España):**
  - Lite gratuita (300 puntos). Pro con pago único de alrededor de € 229.
  - Anuncia que es "100 % gratuito durante todo 2026" [V] ([topocal.com](https://www.topocal.com/)).
  - Muy usado en Perú para curvas de nivel, perfiles y secciones [E].
- **CivilCAD (ArqCOM, México):**
  - Módulo sobre AutoCAD. Suscripción de MXN 7,195–14,695/año. Perpetua de MXN 14,800–44,805 [V] ([civilcad.com.mx](https://civilcad.com.mx/comprar/)).
  - Se observan **activaciones no oficiales a alrededor de MXN 200** en sitios de terceros ([ejemplo](https://sistemascontables.info/construccion/101-civilcad-2026-arqcom.html)). Es un indicador de **alta piratería y baja disposición a pagar licencias caras** en la región.
- **Autodesk Civil 3D:** alrededor de **US$ 2,870/año** [V] ([TrustRadius](https://www.trustradius.com/products/autodesk-civil-3d/pricing)). Es el estándar de diseño vial y de saneamiento y será central con el Plan BIM.
- **Implicación:** TOPO APP **no debe** competir con el gabinete. Debe **exportar limpio** hacia estas herramientas (CSV/TXT PENZD, DXF, LandXML y Excel).

### 2.3 Formatos de datos relevantes

| Formato | Origen | Uso |
|---|---|---|
| **GSI-8/16** | Leica (TPS, DNA03, LS10/LS15) | Texto ASCII con códigos WI. Especificación pública ([GSI Online Leica](https://www.usatfne.org/officials/electronic/manuals/leica/leica-dna-tps-online-guide.pdf)) |
| **DAT (M5)** | Trimble DiNi | Importación en TBC ([Trimble](https://help.fieldsystems.trimble.com/tbc/4652.htm)) |
| **SDR33** | Sokkia y Topcon (SDL1X, DL) | El SDL1X tiene RS-232C, USB y Bluetooth opcional ([Sokkia](https://eu.sokkia.com/products/levels/digital-levels/sdl1x-digital-level)) |
| CSV / TXT (PENZD, PNEZD) | Universal | Intercambio con TopoCal, Civil 3D, CivilCAD |
| DXF / DWG, LandXML | CAD / diseño | Rasantes, ejes y superficies del proyecto |
| RW5, JobXML | Carlson, Trimble | Libretas de estación total |

---

## 3. Tamaño de mercado y tendencias

### 3.1 Cifras globales

| Segmento | Tamaño 2025 | Proyección | CAGR | Fuente |
|---|---|---|---|---|
| Software de topografía (land survey software) | US$ 1.9–2.5 mil millones | US$ 4.2 mil millones (2034) | 8–9.2 % | [Dataintelo](https://dataintelo.com/report/land-survey-software-market), [Archive Market Research](https://www.archivemarketresearch.com/reports/land-survey-software-564612), [Verified Market Reports](https://www.verifiedmarketreports.com/product/land-survey-software-market/) |
| Receptores GNSS | US$ 2.3–3.0 mil millones | US$ 4.5–4.8 mil millones (2034–35) | 6.8–8.8 % | [Intel Market Research](https://www.intelmarketresearch.com/global-gnss-receivers-forecast-market-26327), [Prophecy](https://www.prophecymarketinsights.com/market_insight/Global-GPS-and-GNSS-Receiver-1062) |
| Receptores GNSS RTK | alrededor de US$ 2.0–2.3 mil millones | US$ 3.4–5.5 mil millones | 8.1–9.2 % | [360iResearch](https://www.360iresearch.com/library/intelligence/rtk-gnss-receiver), [Verified Market Reports](https://www.verifiedmarketreports.com/product/gnss-rtk-receiver-market/) |
| Topografía con drones (servicios / land survey) | US$ 1.2–5.7 mil millones según definición | — | 12–18 % | [Research and Markets](https://www.researchandmarkets.com/reports/6188950/mapping-and-survey-drone-cameras-market-global), [Dataintelo](https://dataintelo.com/report/drone-based-land-survey-market) |

> Para LatAm y Perú no hay cifras públicas confiables de software topográfico. **Estimación de orden de magnitud [E]:** si LatAm representa entre el 5 y el 7 % del gasto global, el mercado regional sería de unos **US$ 100–170 millones al año**, dominado por el hardware con software incluido. El nicho de apps móviles de libreta y control de obra en Perú es **muy pequeño en ingresos** (unos pocos millones de USD como máximo), pero **grande en número de usuarios**.

### 3.2 Tendencias clave

1. **Android en campo.**
   - Los fabricantes migran de Windows Mobile y CE a Android (SurvStar, SurvX, Hi-Survey, Topcon Field, Carlson Layout, FieldGenius Android, Zeno Mobile).
   - En Perú **Android tiene alrededor del 82 % de los móviles** y iOS alrededor del 18 % ([StatCounter Perú](https://gs.statcounter.com/os-market-share/mobile/peru)).
   - El topógrafo ya usa su propio teléfono en obra. Una app nativa Android es el canal natural.
2. **GNSS low-cost.**
   - Emlid, ArduSimple y los receptores chinos con IMU han bajado el RTK a US$ 1,000–3,000 por receptor.
   - El software pasa a ser freemium o por suscripción (Emlid Flow US$ 240/año) o va incluido.
   - Esto presiona a la baja los precios de las suites premium.
3. **Drones y fotogrametría.**
   - Es el segmento que más crece (CAGR de 12–18 %).
   - Desplaza el levantamiento topográfico masivo, pero **no reemplaza la nivelación de precisión ni el control de cotas de capas** (de ± 10–20 mm), que siguen haciéndose con nivel o estación total.
4. **BIM.**
   - El **Plan BIM Perú** (MEF) hace obligatorio el BIM en tipologías críticas desde 2025 (RD N° 0007-2025-EF) y en los tres niveles de gobierno para proyectos complejos desde agosto de 2026, con meta de 100 % en 2030 ([MEF Plan BIM](https://www.mef.gob.pe/planbimperu/planbim.html), [AECOtech](https://aecotech.com/plan-bim-peru-licitaciones/)).
   - **Consecuencia:** crecerá la exigencia de **trazabilidad digital** de los datos de campo (protocolos, as-built). Es una oportunidad para una app que genere registros estructurados y exportables.
5. **Nube y suscripción.** La industria migra a SaaS (Trimble, Topcon, Emlid, Autodesk). En LatAm se mantiene la **preferencia por el pago único** y una alta tolerancia a la piratería en escritorio.
6. **Persistencia de la nivelación geométrica.**
   - Los niveles automáticos (de US$ 200–800) siguen siendo el instrumento más vendido en obra.
   - Los niveles digitales (LS15 de US$ 9,650–13,800) son minoritarios en Perú [E].
   - El "software" del 90 % de las nivelaciones de obra sigue siendo **papel y Excel** [E].

### 3.3 Contexto Perú

- **Inversión pública récord en 2025:** S/ 60,422 millones (+5.6 %).
  - Gobierno nacional: S/ 23,466 millones.
  - Municipios: S/ 22,565 millones.
  - Gobiernos regionales: S/ 14,391 millones.
  - Fuente: [El Peruano / MEF](https://www.elperuano.pe/noticia/286305-mef-inversion-publica-anoto-record-en-el-2025).
- **Saneamiento:** presupuesto 2025 de S/ 6,108 millones, el 61.7 % en manos de gobiernos locales ([ComexPerú](https://www.comexperu.org.pe/articulo/ejecucion-de-la-inversion-publica-en-saneamiento-por-parte-de-los-gobiernos-locales-apenas-supera-el-47-al-cierre-del-tercer-trimestre)).
- **Cartera de infraestructura 2025–2026:** más de US$ 15,800 millones en APP y Proyectos en Activos, de los cuales más de US$ 2,400 millones son de saneamiento ([Constructivo](https://constructivo.com/noticia/cartera-de-proyectos-de-infraestructura-en-peru-2025-2026-inversion-sectores-y-cronogramas-clave-1772055259)).
- **Implicación:** miles de obras municipales de **pistas y veredas, saneamiento y edificaciones**. Cada una requiere un topógrafo de obra y **protocolos de nivelación** para la supervisión o inspección.

---

## 4. Perfil del usuario en Perú

### 4.1 Arquetipos

| Arquetipo | Descripción | Necesidad principal | Disposición a pagar |
|---|---|---|---|
| **Topógrafo de obra (núcleo)** | Técnico topógrafo (instituto) o bachiller, de 22 a 45 años. Trabaja para el contratista en pavimentación, saneamiento o edificaciones | Libreta de nivelación rápida, cálculo de cotas y cortes y rellenos, entregar protocolos a la supervisión | Baja o media: S/ 10–30 al mes si le ahorra horas [E] |
| **Ingeniero residente / asistente** | Ingeniero civil a cargo de la obra | Ver avance, validar cotas y adjuntar protocolos a valorizaciones | Media (paga la empresa) |
| **Supervisor / inspector** | Ingeniero de la supervisión o la entidad | Recibir protocolos legibles, firmados y trazables | No paga, pero **influye en la adopción** |
| **Topógrafo independiente / consultor** | Levantamientos, lotizaciones, expedientes | GNSS, estación total, gabinete | Ya usa SurvStar, TopoCal o Civil 3D |
| **Estudiante / egresado** | Institutos (SENATI, tecnológicos) y universidades | Aprender y practicar con libreta | Muy baja, pero es un canal viral |

### 4.2 Ingresos de referencia

- Topógrafo en Perú: **alrededor de S/ 2,700–3,000 al mes** en promedio (de S/ 2,600 al iniciar a más de S/ 4,200 con experiencia) ([Indeed Perú](https://pe.indeed.com/career/topografo/salaries), [Computrabajo](https://pe.computrabajo.com/salarios/topografoa)).
- Ingeniero topógrafo: S/ 3,500–6,000 ([InfoSueldo](https://www.infosueldo.com/cuanto-gana-un-ingeniero-topografo-en-el-peru/)).
- Costo hora-hombre del topógrafo en construcción civil: alrededor de S/ 29.6 con leyes sociales ([Scribd, CAPECO 2024–2025](https://www.scribd.com/document/763399954/Costo-Hora-Hombre-Pliego-2024-2025)).
- **Implicación de precio:** una suscripción de S/ 20 al mes es menos del 1 % del sueldo. Ahorrar **1 hora al mes** de pasar la libreta a Excel ya cubre el costo para la empresa.

### 4.3 Equipos típicos en obra peruana [E, a validar en entrevistas]

| Tipo | Marcas y modelos frecuentes | Comentario |
|---|---|---|
| Nivel automático | **Sokkia B40/B30**, **Topcon AT-B4/AT-B2**, **Leica NA720/NA730**, South, Pentax AP | El instrumento más común. **Sin salida de datos**: la lectura se anota a mano |
| Nivel digital | Leica **LS15/LS10**, **DNA03**; **Trimble DiNi**; **Sokkia SDL1X/SDL30**; Topcon DL | Minoritario (por costo). Exporta GSI, DAT o SDR33 |
| Estación total | Leica TS/FlexLine, **Topcon ES/GM**, **Sokkia CX/iM**, **South NTS** | Libreta interna. Se descarga a TopoCal o Civil 3D |
| GNSS | **South, CHC, Hi-Target, Stonex**, Emlid; Trimble y Leica en grandes empresas | Software Android incluido (SurvStar, LandStar, Hi-Survey) |
| Gabinete | **Excel**, TopoCal, **Civil 3D**, AutoCAD, CivilCAD | Uso frecuente de licencias no oficiales [E] |

### 4.4 Cómo se lleva hoy la libreta de nivelación

1. **En campo:** libreta de papel (cuaderno de nivelación). Columnas: Punto, V(+) o vista atrás, Altura instrumental, V(−) o vista adelante, V. intermedia, Cota y Observaciones.
2. **En la noche o en gabinete:** se transcribe a **Excel** con plantillas propias o heredadas (fórmulas de AI = cota + V atrás; cota = AI − V adelante).
3. **Control de cierre:** cuando se hace, se calcula en Excel con criterios de tolerancia muy variables (± 12 mm·√K, ± 20 mm·√K, etc.) y muchas veces **no se documenta**.
4. **Protocolo para la supervisión:** formato Word o Excel de la empresa, impreso, firmado y escaneado, que se adjunta a la valorización o al dossier de calidad.
5. **Control de capas** (subrasante, subbase, base, carpeta): se nivela en una grilla por progresiva (eje, bordes y a cada X m) y se compara a mano contra la rasante del expediente técnico.
   - En subrasante, la EG-2013 admite una variación de **± 20 mm** de la cota proyectada (10 mm en subrasante terminada) ([EG-2013 MTC](https://portal.mtc.gob.pe/transportes/caminos/normas_carreteras/documentos/manuales/MANUALES%20DE%20CARRETERAS%202019/MC-01-13%20Especificaciones%20Tecnicas%20Generales%20para%20Construcci%C3%B3n%20-%20EG-2013%20-%20(Versi%C3%B3n%20Revisada%20-%20JULIO%202013).pdf)).
   - Para base y subbase se usan tolerancias del orden de 0 / −20 mm y lisura de 15–20 mm con regla de 3 m. Verificar en el capítulo 400 de la EG-2013 y en las especificaciones del expediente.

### 4.5 Dolores (pain points)

| # | Dolor | Severidad | Evidencia |
|---|---|---|---|
| 1 | **Doble digitación** de papel a Excel: pérdida de 1–2 h al día y errores de transcripción | Alta | Flujo típico [E]. Lo que prometen todas las apps de libreta ([Level Book](https://play.google.com/store/apps/details?id=com.perez.adrian.nivelesandroid&hl=en_US)) |
| 2 | **Error de cierre descubierto tarde** (en gabinete): hay que volver a campo | Alta | Nivellus y Topografía-Nivelaciones lo atacan con controles de plausibilidad y cierre |
| 3 | **Protocolos** para la supervisión hechos a mano, con formatos distintos y sin trazabilidad | Alta | Exigencia contractual y Plan BIM [E] |
| 4 | **Control de capas**: comparar cientos de cotas contra la rasante por progresiva | Media-alta | Tolerancias EG-2013 |
| 5 | Software profesional **caro, en inglés y atado al hardware** | Media | Precios de US$ 700–2,200 |
| 6 | **Sin señal** en zonas rurales y obras de saneamiento en zanja | Media | Requiere modo offline completo |
| 7 | Papel mojado o perdido y libreta sin respaldo | Media | [E] |
| 8 | No hay forma práctica de **importar el nivel digital** (GSI/DAT/SDR) al teléfono | Baja (nicho) | Formatos en la sección 2.3 |

---

## 5. Brechas y oportunidades

### 5.1 Lo que nadie hace bien

| Brecha | Suites premium | GNSS chinos | Apps de libreta | Oportunidad para TOPO APP |
|---|---|---|---|---|
| Libreta de **nivel automático** con cálculo en vivo (AI / altura de instrumento, cota, corte y relleno) | ✗ (no es su foco) | ✗ | ✓ básico | **✓✓ con UX de campo de primer nivel** |
| **Control de cierre en campo** con tolerancia configurable (mm·√K) y alerta antes de irse | Parcial (en gabinete) | ✗ | Parcial | **✓✓ diferenciador** |
| **Compensación** del itinerario (proporcional a distancia o número de estaciones) | En gabinete (TBC, Infinity) | ✗ | Raro (Nivellus, discontinuada) | ✓ |
| **Control de capas de pavimento** (rasante de proyecto por progresiva vs. cota medida, ✓/✗ por tolerancia EG-2013) | Parcial (módulos Roads con GNSS o estación total) | Parcial (Roads) | ✗ | **✓✓ diferenciador fuerte** |
| **Informe PDF tipo protocolo** listo para la supervisión (logo, obra, firma, cuadro de cierre, gráfico) | Informes genéricos en inglés | Pobres | ✗ o solo CSV | **✓✓ diferenciador fuerte** |
| Exportación a **Excel** con formato de la libreta peruana | ✗ | ✗ | CSV plano | ✓ |
| **100 % offline** | ✓ | ✓ | ✓ | ✓ (requisito) |
| **Español nativo** y terminología local (V. atrás, V. adelante, BM, progresiva) | Traducción parcial | Traducción irregular | Algunas | ✓✓ |
| **Precio** < US$ 10 al mes | ✗ | Incluido con hardware | ✓ | ✓ |
| Importar **nivel digital** (GSI, DAT, SDR33) | Solo de su marca | ✗ | ✗ | ✓ (fase 2, nicho de valor) |
| **Trazabilidad**: fecha, GPS del teléfono, fotos y estado "no editado" | Parcial | ✗ | ✗ | ✓ (útil para auditoría y BIM) |

### 5.2 Oportunidades priorizadas

1. **Núcleo, que se gana en la primera semana de uso.** Libreta de nivelación geométrica (simple y compuesta, con vistas intermedias y 3 hilos opcional), cálculo en vivo, **control de cierre con semáforo** y **PDF de protocolo**.
2. **Diferenciador vertical.** Módulo de **control de capas o rasante**:
   - Importar la rasante del proyecto (CSV por progresiva, o LandXML/DXF en una fase posterior).
   - Nivelar por grilla (eje e izquierda/derecha).
   - Obtener el diferencial contra el proyecto y el cumplimiento según la tolerancia de la capa (plantillas EG-2013 configurables).
   - Generar un informe por tramo.
3. **Saneamiento.** Pendientes de buzón a buzón, cotas de fondo de zanja y verificación de pendiente mínima.
4. **Exportación al gabinete.** CSV/TXT para TopoCal, Civil 3D y CivilCAD, y Excel con plantilla.
5. **Fase 2.** Importar niveles digitales (GSI de Leica, DAT de DiNi, SDR33 de Sokkia), compartir protocolos en la nube con la supervisión y firma digital.

---

## 6. Propuesta de valor, posicionamiento y monetización

### 6.1 Propuesta de valor

> **"TOPO APP: tu libreta de nivelación que cierra en campo y entrega el protocolo listo para la supervisión. Sin papel, sin Excel, sin señal."**

Para **topógrafos de obra civil en Perú y LatAm** que nivelan con nivel automático y pierden horas pasando la libreta a Excel, **TOPO APP** es una app Android offline que **calcula las cotas en vivo, avisa si el cierre está fuera de tolerancia antes de dejar el campo y genera el PDF y el Excel del protocolo** con el formato que pide la supervisión. A diferencia de Trimble, Leica o SurvStar, **no requiere comprar hardware ni licencias de US$ 1,000**. A diferencia de las apps de libreta gratuitas, entrega **informes profesionales y control normativo (EG-2013)**.

### 6.2 Posicionamiento

```
                 Precio alto
                     │
   Trimble Access ●  │  ● Leica Captivate
   FieldGenius ●     │  ● Carlson
   Topcon Field ●    │
 ────────────────────┼──────────────────── Foco en nivelación
 Foco GNSS / ET      │                     y control de obra
   SurvStar/SurvX ●  │
   Emlid Flow ●      │      ★ TOPO APP (objetivo)
   SW Maps ●         │   ● Apps de libreta amateur
   Mobile Topo ●     │
                 Precio bajo
```

- **Categoría:** "software de control topográfico de obra" (no "colectora GNSS").
- **Complemento, no sustituto.** TOPO APP convive con SurvStar o Civil 3D y les envía datos limpios.
- **Mensajes clave:** ahorra 1–2 h al día, no regresas a campo por un error de cierre, la supervisión aprueba tu protocolo y funciona sin señal.

### 6.3 Modelo de monetización recomendado

| Plan | Precio sugerido | Incluye |
|---|---|---|
| **Gratis** | S/ 0 | Libreta ilimitada, cálculo en vivo, control de cierre, exportación a CSV. PDF con marca de agua y límite de 1 proyecto activo |
| **Pro (individual)** | **S/ 19.90 al mes** o **S/ 149 al año** (alrededor de US$ 5–40) | Proyectos ilimitados, **PDF de protocolo sin marca de agua con logo propio**, Excel con plantilla, control de capas y rasante, compensación, respaldo |
| **Pro de por vida (opcional, por campaña)** | S/ 299–399, pago único | Para el segmento que rechaza suscripciones (cultura de pago único en LatAm) |
| **Empresa / obra** | S/ 49–99 al mes por obra o paquetes de 5 licencias | Plantillas corporativas, panel para el residente, protocolos compartidos con la supervisión y soporte |

**Justificación:**

- **Freemium:** las apps de libreta gratuitas fijan el ancla de precio en cero. Hay que ganar adopción viral (estudiantes, institutos, grupos de WhatsApp y Facebook de topógrafos) y cobrar por **lo que se entrega a terceros (el PDF y el protocolo)**, que es donde está el valor percibido.
- **Precio local en soles** con Google Play Billing y precios regionales. Considerar **Yape/Plin** mediante códigos de activación para quien no tiene tarjeta [E].
- **Plan anual con descuento fuerte:** las obras duran entre 3 y 12 meses. El plan anual reduce la cancelación.
- Evitar depender de publicidad: perjudica la imagen profesional y genera poco ingreso en el nicho.
- **Referentes:**
  - Emlid Flow: US$ 240/año, freemium.
  - Mobile Topographer Pro: alrededor de US$ 22 en pago único.
  - TopoCal: freemium de escritorio con Lite gratis.
  - TOPO APP debe quedar **entre los dos**: más caro que una app amateur y 10 a 50 veces más barato que una suite premium.

### 6.4 Canales de adquisición [E]

- Grupos de Facebook y WhatsApp de topografía en Perú, y TikTok/YouTube con tutoriales cortos ("cierra tu nivelación en 2 minutos").
- Institutos (SENATI, institutos tecnológicos) y universidades: licencias educativas gratuitas.
- Distribuidores de equipos (venta de niveles Sokkia, Topcon y South): la app como valor agregado.
- Capítulos de Ingeniería Civil del CIP y CAPECO: webinars.
- Expansión: Bolivia, Ecuador, Colombia, Chile y México, adaptando las plantillas normativas (INVIAS, MOP, SCT).

---

## 7. Matriz comparativa

Leyenda: ✓✓ fuerte · ✓ sí · ~ parcial o básico · ✗ no · ? sin dato público

| Criterio | Trimble Access | Leica Captivate / Zeno | Topcon Field | Carlson SurvPC / Layout | FieldGenius | SurvStar / SurvX | Hi-Survey | Mobile Topographer | SW Maps | Emlid Flow | Apps de libreta (Level Book, Smart LB, Nivelaciones) | TopoCal | Civil 3D | **TOPO APP (objetivo)** |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Plataforma | Win / Android (controladora) | Equipo Leica / Android (Zeno) | Android, iOS, Win | Win / Android (Layout) | Win / Android | Android | Android | Android | Android, iOS | Android, iOS | Android | Windows | Windows | **Android** |
| Precio (aprox.) | US$ 1,025–1,600/año | Cotización; Zeno alrededor de US$ 1,680 | US$ 835/año | US$ 1,000–1,750 | US$ 845/año o 2,200 | alrededor de € 495 o incluido | Incluido | Gratis / US$ 22 | Gratis | Gratis / US$ 240/año | Gratis / < US$ 10 | Lite gratis / € 229 (gratis en 2026) | US$ 2,870/año | **Freemium, Pro alrededor de US$ 5/mes** |
| Funciona sin equipo propietario | ✗ | ✗ | ~ | ✓ | ✓ | ~ | ~ | ✓ | ✓ | ~ | ✓ | ✓ | ✓ | **✓** |
| GNSS RTK | ✓✓ | ✓✓ | ✓✓ | ✓✓ | ✓✓ | ✓✓ | ✓✓ | ~ | ✓ | ✓✓ | ✗ | ✗ | ✗ | ✗ (fuera de alcance) |
| Estación total | ✓✓ | ✓✓ | ✓✓ | ✓✓ | ✓✓ | ~ | ~ | ✗ | ✗ | ✗ | ✗ | Importa | Importa | ✗ / importa (fase 3) |
| Libreta de nivel automático | ~ | ~ | ✗ | ~ | ~ | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ | ✗ | ✗ | **✓✓** |
| Control de cierre en campo | ~ | ~ (en el nivel LS) | ✗ | ? | ? | ✗ | ✗ | ✗ | ✗ | ✗ | ~ | ✗ | ✗ | **✓✓** |
| Compensación del itinerario | En gabinete (TBC) | En gabinete (Infinity) | ✗ | ~ | ~ | ✗ | ✗ | ✗ | ✗ | ✗ | ~ (Nivellus) | ~ | ~ | **✓** |
| Niveles digitales (GSI / DAT / SDR) | DAT (DiNi) | GSI (Leica) | SDR (Sokkia/Topcon) | ~ | ? | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ~ | ~ | ✓ (fase 2) |
| Control de capas / rasante | ✓ (Roads, GNSS o estación total) | ✓ | ✓ | ✓ | ✓ | ~ | ✓ (Road) | ✗ | ✗ | ~ (DTM) | ✗ | Gabinete | Gabinete | **✓✓ con nivel** |
| Normativa peruana (EG-2013) | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **✓✓** |
| PDF tipo protocolo para supervisión | ~ (genérico) | ~ | ~ | ~ | ✓ (configurable) | ~ | ~ | ✗ | ✗ | ~ | ✗ | ~ | ✓ (planos) | **✓✓** |
| Exportación Excel / CSV | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ (CSV) | ✓ | ✓ | ✓ |
| DXF / LandXML | ✓✓ | ✓✓ | ✓ | ✓✓ | ✓✓ | ✓ | ✓ | ~ | ~ | ✓ | ✗ | ✓ | ✓✓ | ~ (fase 2) |
| Offline | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | **✓** |
| Español | ✓ | ✓ | ~ | ~ | ~ | ✓ (variable) | ~ | ~ | ~ | ~ | ✓ / ~ | ✓✓ | ✓ | **✓✓ (nativo)** |
| Curva de aprendizaje | Alta | Alta | Media | Alta | Media | Media | Media | Baja | Baja | Baja | Baja | Media | Muy alta | **Baja** |

---

## 8. Riesgos

| Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|
| **Nicho pequeño en ingresos** (precedente de Nivellus, discontinuada por baja demanda) | Media | Alto | Ir más allá de la libreta: control de capas, protocolos y plan empresa. Expandir a LatAm hispana |
| Baja disposición a pagar y piratería | Alta | Medio | El valor se cobra en el PDF y en las funciones de colaboración, que son difíciles de piratear. Precio muy bajo y pago local |
| Las apps gratuitas copian funciones | Media | Medio | Calidad de UX, normativa local, comunidad y velocidad de iteración |
| Los fabricantes chinos agregan libreta de nivel a SurvStar o LandStar | Baja-media | Medio | Ellos se enfocan en GNSS. TOPO APP es agnóstico al equipo y está especializado |
| Errores de cálculo que dañen la reputación | Baja | Muy alto | Pruebas unitarias exhaustivas, casos de referencia con cierres conocidos y auditoría del cálculo en el PDF |
| Variedad de formatos de protocolo por entidad o supervisión | Alta | Bajo-medio | Plantillas configurables (logo, campos y firmas) |

---

## 9. Conclusiones para TOPO APP

1. **Nicho desatendido y claro.** La nivelación geométrica con nivel automático es la tarea topográfica más frecuente en obra civil peruana y sigue en **papel más Excel**. Las suites premium (US$ 700–2,200) no la atienden en campo y las apps de libreta existentes son amateur, sin informes ni normativa.
2. **No competir con GNSS ni con estación total.** SurvStar, LandStar, Hi-Survey, Emlid Flow y Trimble dominan ese terreno, a menudo incluidos con el hardware. TOPO APP debe ser **agnóstica al equipo** y complementaria.
3. **Tres diferenciadores que ningún competidor combina:**
   - **(a)** Control de cierre en campo con tolerancia configurable y semáforo.
   - **(b)** **PDF y Excel de protocolo** listos para la supervisión, con logo, datos de obra y firmas.
   - **(c)** **Control de capas o rasante** con tolerancias EG-2013 por tipo de capa.
4. **Requisitos no negociables:** Android nativo (82 % del mercado móvil peruano), **100 % offline**, español nativo con terminología peruana (V. atrás, V. adelante, BM, progresiva, cota de rasante), interfaz para usar con una mano y bajo el sol, y respaldo y exportación sin fricción.
5. **Hay demanda real.** Inversión pública récord (S/ 60.4 mil millones en 2025), miles de obras municipales de pistas, veredas y saneamiento, y un Plan BIM que empuja la trazabilidad digital de los datos de campo.
6. **Monetización:** freemium (libreta y cierre gratis, PDF con marca de agua) con **Pro en soles (alrededor de S/ 19.90 al mes o S/ 149 al año)**, opción de pago único en campañas y un **plan empresa o por obra**. Se cobra por lo que se entrega a terceros.
7. **Hoja de ruta sugerida:**
   - **MVP:** libreta, cierre, compensación y PDF/Excel.
   - **v1.1:** control de capas y rasante, y plantillas EG-2013.
   - **v1.2:** saneamiento (pendientes entre buzones).
   - **v2:** importar GSI, DAT y SDR33, compartir con la supervisión en la nube y licencias de empresa.
   - **v3:** expansión regional con plantillas normativas por país.
8. **Validación pendiente.** Antes de construir la v1.1, hacer **10–15 entrevistas** con topógrafos de obra en Perú (pavimentación y saneamiento) y **3–5 con supervisores**. El objetivo es confirmar los formatos de protocolo, las tolerancias usadas en la práctica, los equipos reales y la disposición a pagar. Recoger también 5–10 protocolos reales como referencia de diseño del PDF.

---

## 10. Fuentes

**Competidores**
- Trimble Access, licencias: https://help.fieldsystems.trimble.com/trimble-access/latest/en/software-licenses.htm
- Precios de Trimble Access: https://www.csdsinc.com/service-support/warranty-subscription-renewals/trimble-access-warranty-subscriptions · https://neigps.com/shop/trimble-access-general-survey-1-year-subscription/ · https://neigps.com/shop/trimble-access-roads-1-year-subscription/
- Trimble DiNi en TBC: https://help.fieldsystems.trimble.com/tbc/4652.htm · https://frontierprecision.com/news/trimble-dini-level-loop-adjustment-in-tbc/
- Leica LS15/LS10: https://leica-geosystems.com/en-us/products/levels/digital-levels/leica-ls15-and-ls10 · precio: https://www.vp-ess.com/products/survey/levels/digital-levels/leica-ls15-digital-level/
- Leica Zeno Mobile: https://leica-geosystems.com/en-gb/products/gis-collectors/software/leica-zeno-mobile · https://www.transitandlevel.com/shop/871195-leica-zeno-mobile-professional-android-5148
- Topcon Field: https://shop.topconsolutions.com/products/topcon-field-for-android-ios-subscription · https://aaisurvey.com/products/topcon-field-mobile-software-android-and-ios-subscription
- Lista de precios Carlson: https://osp.admin.mn.gov/sites/osp/files/2024-02/s-9345_171660_ppl_carlson_software_a7.pdf
- FieldGenius: https://www.microsurvey.com/products/fieldgenius/pricing/
- South SurvStar: https://globalgpssystems.com/survstar/ · SurvX: https://www.surveysolutions.co.nz/survey-controllers/south-survx-field-data-collection-android/ · https://sourceforge.net/software/product/SurvX/
- Hi-Survey Road: http://es.hi-target.com.cn/hi-survey-road-software · https://surveymate.net/product/software/land-survey-software/hi-survey-road-software/
- Mobile Topographer: https://play.google.com/store/apps/details?id=com.applicality.mobiletopographergis&hl=en_US · http://applicality.com/projects/mobile-topographer-pro/
- SW Maps: https://play.google.com/store/apps/details?id=np.com.softwel.swmaps&hl=en_US
- Emlid: https://store.emlid.com/products/reach-rs3-survey-kit · https://advexure.com/products/emlid-flow-survey-plan-1-year · https://amerisurv.com/2024/09/20/the-emlid-flow-survey-app-now-supports-dtm-staking-and-other-pro-surveying-tools-on-android-ios/
- Apps de libreta: https://play.google.com/store/apps/details?id=com.perez.adrian.nivelesandroid&hl=en_US · https://play.google.com/store/apps/details?id=com.smartlevelbook.smartlevelbook&hl=en_IN · https://play.google.com/store/apps/details?hl=es_419&id=com.topografia.nivelaciones · https://play.google.com/store/apps/details?id=com.byPeopleDev.NivelDigital&hl=en_US · https://apkcombo.com/topographic-notepad-geometri/com.appsyona.nivelaciontopogratis/ · https://www.level-online.net/nivellus/index.php?lang=en · https://landsurveyorsunited.com/forum/topics/level-book-android-application
- TopoCal: https://www.topocal.com/
- CivilCAD: https://civilcad.com.mx/comprar/
- Civil 3D: https://www.trustradius.com/products/autodesk-civil-3d/pricing
- Formatos de niveles digitales: https://rpls.com/forums/software-cad-mapping/digital-levels-2/ · https://eu.sokkia.com/products/levels/digital-levels/sdl1x-digital-level · https://www.usatfne.org/officials/electronic/manuals/leica/leica-dna-tps-online-guide.pdf

**Mercado**
- Software topográfico: https://dataintelo.com/report/land-survey-software-market · https://www.archivemarketresearch.com/reports/land-survey-software-564612 · https://www.verifiedmarketreports.com/product/land-survey-software-market/
- GNSS: https://www.intelmarketresearch.com/global-gnss-receivers-forecast-market-26327 · https://www.prophecymarketinsights.com/market_insight/Global-GPS-and-GNSS-Receiver-1062 · https://www.360iresearch.com/library/intelligence/rtk-gnss-receiver · https://www.verifiedmarketreports.com/product/gnss-rtk-receiver-market/
- Drones: https://www.researchandmarkets.com/reports/6188950/mapping-and-survey-drone-cameras-market-global · https://dataintelo.com/report/drone-based-land-survey-market
- Android en Perú: https://gs.statcounter.com/os-market-share/mobile/peru

**Perú**
- Inversión pública 2025: https://www.elperuano.pe/noticia/286305-mef-inversion-publica-anoto-record-en-el-2025
- Saneamiento: https://www.comexperu.org.pe/articulo/ejecucion-de-la-inversion-publica-en-saneamiento-por-parte-de-los-gobiernos-locales-apenas-supera-el-47-al-cierre-del-tercer-trimestre
- Cartera de infraestructura: https://constructivo.com/noticia/cartera-de-proyectos-de-infraestructura-en-peru-2025-2026-inversion-sectores-y-cronogramas-clave-1772055259
- Plan BIM Perú: https://www.mef.gob.pe/planbimperu/planbim.html · https://aecotech.com/plan-bim-peru-licitaciones/
- EG-2013 (MTC): https://portal.mtc.gob.pe/transportes/caminos/normas_carreteras/documentos/manuales/MANUALES%20DE%20CARRETERAS%202019/MC-01-13%20Especificaciones%20Tecnicas%20Generales%20para%20Construcci%C3%B3n%20-%20EG-2013%20-%20(Versi%C3%B3n%20Revisada%20-%20JULIO%202013).pdf
- Sueldos: https://pe.indeed.com/career/topografo/salaries · https://pe.computrabajo.com/salarios/topografoa · https://www.infosueldo.com/cuanto-gana-un-ingeniero-topografo-en-el-peru/ · https://www.scribd.com/document/763399954/Costo-Hora-Hombre-Pliego-2024-2025
