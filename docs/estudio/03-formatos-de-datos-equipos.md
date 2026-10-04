# 03 — Formatos de datos de equipos topográficos (importación / exportación)

> Estudio técnico para implementar importadores y exportadores en la app TypeScript (Capacitor/Android).
> Fecha: 2026-10-04. Idioma: español. Cada sección indica las fuentes consultadas (URL) y marca con
> **[VERIFICAR]** lo que no pudo confirmarse con documentación primaria y debe validarse con un archivo real
> del equipo antes de darlo por cerrado.
>
> Los fixtures de este documento (bloques marcados `fixture: <nombre>`) son **coherentes numéricamente**
> (coordenadas recalculadas desde las observaciones, cotas = cota anterior + atrás − adelante, checksums NMEA
> correctos), por lo que pueden copiarse tal cual a `tests/fixtures/` y usarse como "golden files".

---

## Índice

0. [Resumen ejecutivo y matriz de formatos](#0-resumen-ejecutivo-y-matriz-de-formatos)
1. [Leica GSI-8 / GSI-16 (estaciones totales)](#1-leica-gsi-8--gsi-16-estaciones-totales)
2. [Leica GSI de nivelación (DNA03/DNA10, LS10/LS15, Sprinter, NA)](#2-leica-gsi-de-nivelación-dna03dna10-ls10ls15-sprinter-na)
3. [Trimble/Zeiss DiNi: M5 y REC 500](#3-trimblezeiss-dini-m5-y-rec-500)
4. [Topcon, Sokkia, Nikon, South, Trimble JobXML](#4-topcon-sokkia-nikon-south-trimble-jobxml)
5. [CSV/TXT genéricos (PNEZD, PENZD, Civil 3D)](#5-csvtxt-genéricos-pnezd-penzd-civil-3d)
6. [GNSS: NMEA 0183 (GGA, RMC, GST, GSA)](#6-gnss-nmea-0183-gga-rmc-gst-gsa)
7. [Exportación: DXF R12, KML, LandXML 1.2, Excel](#7-exportación-dxf-r12-kml-landxml-12-excel)
8. [Ingreso manual: libreta de nivel automático](#8-ingreso-manual-libreta-de-nivel-automático)
9. [Arquitectura del parser tolerante con autodetección](#9-arquitectura-del-parser-tolerante-con-autodetección)
10. [Fuentes](#10-fuentes)

---

## 0. Resumen ejecutivo y matriz de formatos

| Formato | Equipos | Ext. típica | Tipo | Firma para autodetección | Prioridad |
|---|---|---|---|---|---|
| Leica GSI-8 | TPS 300/400/700/800, TS02/06/09 (FlexLine), NA, DNA, LS, Sprinter | `.gsi`, `.raw`, `.txt` | Texto, palabras de ancho fijo 16 car. | `^\d{6}[+-]` y palabras separadas cada 16 | **Alta** |
| Leica GSI-16 | Igual que arriba | `.gsi` | Texto, bloque inicia con `*`, palabras de 24 car. | `^\*\d{6}[+-]` | **Alta** |
| DiNi M5 | Trimble/Zeiss DiNi 03/12/22 | `.dat`, `.m5`, `.raw` | Texto, campos separados por `\|`, 121 car./línea | `^For M5\|Adr` | **Alta** |
| DiNi REC 500 | DiNi antiguos / Elta | `.dat`, `.rec` | Texto columnas fijas, 80 car. | `\b(Rb\|Rf\|Rz)\s+[\d.]+\s+HD\b` | Media |
| Zeiss R4/R5 | Elta R55, Trimble 3300/3600 | `.r5`, `.dat` | Igual que M5 (`For R5\|`) | `^For R[45]\|` | Baja |
| Sokkia SDR33 | SET (antiguas), SDR33, SDL30 (export), Topcon nuevos | `.sdr` | Texto, registros `NNcc` de ancho fijo | `^00NM` en la 1.ª línea | Media |
| Topcon GTS-7 / South NTS | Topcon GTS/GPT, South NTS-350/360/362 | `.gt7`, `.dat`, `.txt` | Texto `CLAVE␣␣␣valores,` | `^(JOB\|STN\|BS\|SS\|SD)\s{2,}` | Media |
| Nikon RAW v2.00 | Nikon NPL/DTM/Nivo, Spectra Focus | `.raw` | CSV con prefijo de registro | `^CO,Nikon RAW` o `^(CO\|ST\|SS\|F1\|MP),` | Media |
| Trimble JobXML | Trimble Access, Survey Controller | `.jxl` | XML | `<JOBFile` | Baja (resumen) |
| CSV/TXT PNEZD, PENZD, etc. | Todos (exportación de coordenadas) | `.csv`, `.txt`, `.xyz` | Delimitado | Inferencia de columnas | **Alta** |
| NMEA 0183 | Receptores GNSS (RTK), móviles | `.nmea`, `.txt`, `.log` | Texto `$..*CS` | `^\$G[PNLAB]...,` | **Alta** |

Salida: DXF R12 (AC1009), KML 2.2, LandXML 1.2, XLSX/CSV.

---

## 1. Leica GSI-8 / GSI-16 (estaciones totales)

Fuente primaria: *GSI Online for Leica TPS and DNA* (Leica Geosystems, ed. 2002 y 2008),
<http://uksurveyingequipment.com/pdf/leica-flexline-gsi-manual.pdf> (secciones 2.1, 2.2, 3.1–3.7) y
<https://www.usatfne.org/officials/electronic/manuals/leica/leica-dna-tps-online-guide.pdf>;
implementación de referencia: Total Open Station (`leica_gsi.py`),
<https://totalopenstation.readthedocs.io/en/stable/input_formats/if_leica_gsi.html>.

### 1.1 Estructura general

- Extensiones: `.gsi` (más común), `.raw`, `.txt`, `.frt`/`.gsi` según software (LGO/Infinity, Leica Survey Office, FlexOffice).
- El archivo es una secuencia de **bloques** (= líneas), cada uno terminado en `CR` o `CR/LF`.
- Cada bloque contiene N **palabras** (*words*). La primera palabra del bloque es normalmente `11` (punto) para
  bloques de medición, o `41` (código) para bloques de código.
- **GSI-8**: cada palabra mide **16 caracteres** = 7 de información + 8 de datos + 1 espacio.
- **GSI-16**: el bloque **empieza con `*`**; cada palabra mide **24 caracteres** = 7 de información + 16 de datos + 1 espacio.
- Un mismo archivo puede mezclar bloques GSI-8 y GSI-16 (en la práctica raro, pero el parser debe decidir por bloque según el `*`).

### 1.2 Especificación exacta de la palabra (word) GSI

```
GSI-8  (16 caracteres)                      GSI-16 (24 caracteres; el bloque lleva '*' delante)
pos: 1234567890123456                       pos: 123456789012345678901234
     WWIIIIS########_                            WWIIIIS################_
     │ │   │└ datos (8)                          │ │   │└ datos (16)
     │ │   └ signo + / -                         │ │   └ signo
     │ └ pos 3-6 información                     │ └ pos 3-6 información
     └ pos 1-2 Word Index (WI)                   └ pos 1-2 WI
```

| Posición | Contenido | Valores |
|---|---|---|
| 1–2 (o 1–3) | **Word Index (WI)**. En TPS es de 2 dígitos; en niveles DNA/LS existen WI de 3 dígitos (`330`, `331`, `571`…), que ocupan la pos. 3. | ver tablas |
| 3 | Sin significado en TPS (suele ser `.`); 3.er dígito del WI en niveles. En el WI `11`/`41`, pos. 3–6 = **número de bloque** (p. ej. `0001`). | `.` / dígito |
| 4 | **Índice automático** (TPS, sólo palabras de ángulo): `0` OFF, `1`/`3` operando. En DNA: vacío `.`. En NA3003: flag del compensador `1`. | `.`, `0`, `1`, `3` |
| 5 | **Modo de entrada** (TPS): `0` medido original, `1` ingresado manualmente, `2` medido con corrección Hz ON, `3` medido con corrección Hz OFF, `4` resultado de función especial. En DNA: `0` medido sin corrección de curvatura, `1` manual sin corrección, `2` medido con corrección de curvatura terrestre, `5` manual con corrección. | `.`, `0`–`5` |
| 6 | **Unidades y decimales** (ver tabla 1.3) | `0`–`8` (`9` = pulgadas en NA antiguos) |
| 7 | **Signo** | `+` / `-` |
| 8–15 (GSI-8) / 8–23 (GSI-16) | **Datos**: dígitos rellenados con ceros a la izquierda, sin punto decimal (la escala la da la pos. 6). En WI de texto (11, 41, 42–49, 71–79) son caracteres alfanuméricos, rellenados con `0` a la izquierda. | |
| 16 / 24 | Separador: **espacio (ASCII 32)** | ` ` |

Notas de implementación:
- Algunas palabras llevan más de un valor (p. ej. `51` ppm/mm: `51..1.+0000+000`); cada sub-valor lleva su propio signo.
- Pos. 3–6 puede contener `.` como relleno; nunca asumir dígitos.
- La última palabra de una línea a veces NO tiene el espacio final (archivos editados a mano): tolerarlo.

### 1.3 Código de unidades (posición 6)

| Código | Unidad | Último dígito | Decimales (divisor) |
|---|---|---|---|
| `0` | metro | 1 mm | 3 (÷1 000) |
| `1` | pie (ft) | 1/1000 ft | 3 (÷1 000) |
| `2` | gon (400 g) | 0,00001 gon | 5 (÷100 000) |
| `3` | grados decimales (360°) | 0,00001° | 5 (÷100 000) |
| `4` | grados sexagesimales (360°) | 0,1″ | formato `DDDMMSSs` |
| `5` | mil (6400) | 0,0001 mil | 4 (÷10 000) |
| `6` | metro | 0,1 mm | 4 (÷10 000) |
| `7` | pie | 1/10 000 ft | 4 (÷10 000) |
| `8` | metro | 0,01 mm | 5 (÷100 000) |
| `9` | pulgada (sólo NA2002/NA3003, histórico) | — | **[VERIFICAR]** |

Sexagesimal (`4`): el entero `n` se descompone `décimas = n % 10`, `ss = ⌊n/10⌋ % 100`, `mm = ⌊n/1000⌋ % 100`,
`ddd = ⌊n/100000⌋`. Ej.: `21.024+0000000003545100` → 35°45′10,0″.

Pie: el estándar Leica usa pie internacional (0,3048 m); permitir configurar pie topográfico EE. UU. (1200/3937 m).

### 1.4 Word Index (WI) para estaciones totales (TPS)

| WI | Significado | Tipo/unidad típica |
|---|---|---|
| `11` | Número de punto (PtID); pos. 3–6 = nº de bloque | texto |
| `12` | Número de serie del instrumento | texto |
| `13` | Tipo de instrumento | texto |
| `17`/`18`/`19` | Fecha / año / día-hora | texto |
| `21` | **Ángulo horizontal (Hz)** (lectura de círculo; acimut si la estación está orientada) | ángulo |
| `22` | **Ángulo vertical (V)** — por defecto **cenital** | ángulo |
| `25` | Diferencia Hz (ángulo de giro) | ángulo |
| `31` | **Distancia inclinada** | longitud |
| `32` | **Distancia horizontal** | longitud |
| `33` | **Desnivel** (entre eje del instrumento y prisma: `SD·cos V`) | longitud |
| `41` | Código / ID de bloque de código | texto |
| `42`–`49` | Info 1–8 del código | texto |
| `51` | ppm / constante de prisma (mm) — valores múltiples | mixto |
| `58` | Constante de prisma | mm |
| `71`–`79` | Observaciones / atributos (REM) | texto |
| `81` | **Este** del punto visado | longitud |
| `82` | **Norte** del punto visado | longitud |
| `83` | **Cota** del punto visado | longitud |
| `84` | Este de la estación | longitud |
| `85` | Norte de la estación | longitud |
| `86` | Cota de la estación | longitud |
| `87` | **Altura de prisma (reflector)** | longitud |
| `88` | **Altura de instrumento** | longitud |

Cálculo de coordenadas desde polares (si el archivo sólo trae 21/22/31): con V cenital,
`HD = SD·sin V`, `ΔH = SD·cos V`, `E = E₀ + HD·sin Az`, `N = N₀ + HD·cos Az`, `Z = Z₀ + hi + ΔH − hr`.

### 1.5 Ejemplos reales de la documentación Leica

GSI-8 (manual Leica, ej. 1):
```
110001+0000A110 81..00+00005387 82..00-00000992
110002+0000A111 81..00+00007586 82..00-00003031
110003+0000A112 81..00+00007536 82..00-00003080
110004+0000A113 81..00+00003839 82..00-00003080
110005+0000A114 81..00+00001241 82..00-00001344
```
GSI-16 (manual Leica, ej. 2):
```
*110001+000000000PNC0055 21.002+0000000013384650 22.002+0000000005371500
*110002+000000000PNC0056 21.002+0000000012802530 22.002+0000000005255000
*110003+000000000PNC0057 21.002+0000000011222360 22.002+0000000005433800
*110004+000000000PNC0058 21.002+0000000010573550 22.002+0000000005817600
*110005+000000000PNC0059 21.002+0000000009983610 22.002+0000000005171400
```
Muestra real de campo (Total Open Station, `sample_data/leica_gsi/leica_gsi8_ertola.gsi`, TPS en gon):
```
110001+00000001 21.322+03496940 22.322+09364360 31..00+00030485 51..1.+0000+000 87..10+00001500 81..00+00515836 82..00+00525871 83..00+00003079 71....+00000001 32..10+00030333 
110002+00000002 21.322+02179330 22.322+09442590 31..00+00030596 51..1.+0000+000 87..10+00001500 81..00+00510231 82..00+00528710 83..00+00002716 71....+00000001 32..10+00030479 
110003+00000003 21.322+01386450 22.322+09390160 31..00+00032850 51..1.+0000+000 87..10+00001500 81..00+00507065 82..00+00531927 83..00+00003182 71....+00000001 32..10+00032700 
```
Muestra GSI-16 real (sexagesimal, `leica_gsi16_gurob.gsi`):
```
*110002+00000000GDEM5415 21.024+0000000003545100 22.024+0000000009117510 31...0+0000000000013825 51....+000000000017+000 87...0+0000000000001300 88...0+0000000000001324 
*110003+00000000GDEM5416 21.024+0000000003411240 22.024+0000000009248200 31...0+0000000000020527 51....+000000000017+000 87...0+0000000000001300 88...0+0000000000001324 
```

### 1.6 Fixtures TPS (generados, coherentes)

Estación `EST1` (E=1000,000; N=5000,000; Z=100,000; hi=1,550), ángulos en gon (`.322` = índice auto 3, Hz-corr 2, unidad gon),
distancias en mm (`..00`), alturas `..10` (manual, mm). Las coordenadas 81/82/83 fueron calculadas con las fórmulas de 1.4.

`fixture: tps_gsi8.gsi`
```
110001+0000EST1 84..10+01000000 85..10+05000000 86..10+00100000 88..10+00001550 
110002+0000P101 21.322+04512340 22.322+09845670 31..00+00035214 87..10+00001800 81..00+01022915 82..00+05026725 83..00+00100604 
110003+0000P102 21.322+12345670 22.322+10123450 31..00+00052807 87..10+00001800 81..00+01049254 82..00+04980984 83..00+00098726 
110004+0000P103 21.322+21000000 22.322+09987650 31..00+00018552 87..10+00001500 81..00+00997098 82..00+04981676 83..00+00100086 
110005+0000P104 21.322+30055550 22.322+09711110 31..00+00064103 87..10+00002000 81..00+00935965 82..00+05000559 83..00+00102458 
110006+0000P105 21.322+38999990 22.322+10050000 31..00+00041776 87..10+00001800 81..00+00993465 82..00+05041260 83..00+00099422 
```

`fixture: tps_gsi16.gsi` (mismas observaciones + 32 distancia horizontal y 33 desnivel)
```
*110001+000000000000EST1 84..10+0000000001000000 85..10+0000000005000000 86..10+0000000000100000 88..10+0000000000001550 
*110002+000000000000P101 21.322+0000000004512340 22.322+0000000009845670 31..00+0000000000035214 87..10+0000000000001800 81..00+0000000001022915 82..00+0000000005026725 83..00+0000000000100604 32..00+0000000000035204 33..00+0000000000000854 
*110003+000000000000P102 21.322+0000000012345670 22.322+0000000010123450 31..00+0000000000052807 87..10+0000000000001800 81..00+0000000001049254 82..00+0000000004980984 83..00+0000000000098726 32..00+0000000000052797 33..00-0000000000001024 
*110004+000000000000P103 21.322+0000000021000000 22.322+0000000009987650 31..00+0000000000018552 87..10+0000000000001500 81..00+0000000000997098 82..00+0000000004981676 83..00+0000000000100086 32..00+0000000000018552 33..00+0000000000000036 
*110005+000000000000P104 21.322+0000000030055550 22.322+0000000009711110 31..00+0000000000064103 87..10+0000000000002000 81..00+0000000000935965 82..00+0000000005000559 83..00+0000000000102458 32..00+0000000000064037 33..00+0000000000002908 
*110006+000000000000P105 21.322+0000000038999990 22.322+0000000010050000 31..00+0000000000041776 87..10+0000000000001800 81..00+0000000000993465 82..00+0000000005041260 83..00+0000000000099422 32..00+0000000000041775 33..00-0000000000000328 
```

Resultados esperados (para asserts):

| Punto | E | N | Z | HD | ΔH (33) |
|---|---|---|---|---|---|
| P101 | 1022.915 | 5026.725 | 100.604 | 35.204 | 0.854 |
| P102 | 1049.254 | 4980.984 | 98.726 | 52.797 | −1.024 |
| P103 | 997.098 | 4981.676 | 100.086 | 18.552 | 0.036 |
| P104 | 935.965 | 5000.559 | 102.458 | 64.037 | 2.908 |
| P105 | 993.465 | 5041.260 | 99.422 | 41.775 | −0.328 |

### 1.7 Cómo parsear GSI (pseudocódigo TypeScript)

```ts
type GsiWord = { wi: string; info: string; autoIdx: string; inputMode: string; unit: string;
                 sign: 1 | -1; raw: string; value: number | string };

const TWO_DIGIT_BLOCK_WI = new Set(['11', '41']);           // pos 3-6 = número de bloque
const TEXT_WI = new Set(['11','12','13','41','42','43','44','45','46','47','48','49',
                         '71','72','73','74','75','76','77','78','79']);
const DIVISOR: Record<string, number> = { '0':1e3,'1':1e3,'2':1e5,'3':1e5,'5':1e4,'6':1e4,'7':1e4,'8':1e5 };

function parseGsiLine(line: string): GsiWord[] {
  let s = line.replace(/\r?\n$/, '');
  const is16 = s.startsWith('*');
  if (is16) s = s.slice(1);
  const dataLen = is16 ? 16 : 8;
  const wordLen = 7 + dataLen + 1;
  const words: GsiWord[] = [];
  // 1) intento posicional (ancho fijo)
  for (let i = 0; i + 7 + dataLen <= s.length; i += wordLen) {
    words.push(parseWord(s.substr(i, 7 + dataLen), dataLen));
  }
  // 2) fallback: separar por espacios si el posicional produjo signos inválidos
  if (words.some(w => w === null)) {
    return s.trim().split(/\s+/).map(tok => parseWord(tok, tok.length - 7));
  }
  return words;
}

function parseWord(w: string, dataLen: number): GsiWord {
  const wi2 = w.slice(0, 2);
  const wi = TWO_DIGIT_BLOCK_WI.has(wi2) || w[2] === '.' || !/\d/.test(w[2]) ? wi2 : w.slice(0, 3);
  const info = w.slice(2, 6);                // pos 3-6
  const signCh = w[6];                       // pos 7
  if (signCh !== '+' && signCh !== '-') throw new GsiError('signo inválido', w);
  const data = w.slice(7, 7 + dataLen);
  const unit = w[5];
  let value: number | string;
  if (TEXT_WI.has(wi)) value = data.replace(/^0+(?=.)/, '');            // PtID: quitar ceros a la izq.
  else if (wi === '51') value = w.slice(6);                               // multivalor: "+0000+000"
  else if (unit === '4') value = dmsToDeg(parseInt(data, 10));          // DDDMMSSs
  else value = (signCh === '-' ? -1 : 1) * parseInt(data, 10) / (DIVISOR[unit] ?? 1e3);
  return { wi, info, autoIdx: w[3], inputMode: w[4], unit, sign: signCh === '-' ? -1 : 1, raw: w, value };
}
const dmsToDeg = (n: number) => { const t = n % 10, ss = Math.floor(n/10)%100, mm = Math.floor(n/1000)%100,
  dd = Math.floor(n/100000); return dd + mm/60 + (ss + t/10)/3600; };
```

Regex de una palabra (útil para detección y fallback):
```
GSI-8 :  /^(\d{2,3})([0-9.]{1,4})([+-])([0-9A-Za-z?.\-_]{8})$/       (largo total 15 sin espacio)
GSI-16:  /^(\d{2,3})([0-9.]{1,4})([+-])([0-9A-Za-z?.\-_]{16})$/      (largo total 23)
Línea :  /^\*?\d{2}[0-9.]{4}[+-]\S+( \d{2,3}[0-9.]{1,4}[+-]\S+)*\s*$/
```
Nota: el WI `11` en un bloque de nivelación tiene la forma `110001` (WI + nº bloque) — la regex de 2–3 dígitos +
4 caracteres de info debe probarse con `wi=11` primero para no confundir `110` con un WI de 3 dígitos.

---

## 2. Leica GSI de nivelación (DNA03/DNA10, LS10/LS15, Sprinter, NA)

Fuentes: *GSI Online for Leica TPS and DNA*, sección 3 "DNA Section" (pp. 50–60)
<http://uksurveyingequipment.com/pdf/leica-flexline-gsi-manual.pdf>; manual LS10/LS15 (exportación GSI-8/GSI-16, ASCII, XML)
<https://www.manualslib.com/manual/1363644/Leica-Ls10.html?page=79>, <https://manualzz.com/doc/30348897/leica-ls10-ls15>.

### 2.1 Particularidades frente al GSI de TPS

- WI de **2 o 3 dígitos** (pos. 1–2/3). Pos. 4 vacía (`.`) en DNA; pos. 5 = flag de medición/curvatura; pos. 6 = unidad.
- Unidades usadas en niveles: `0` (m, 1 mm), `1` (ft, 0,001), `6` (m, 0,1 mm), `7` (ft, 0,0001 — sólo DNA03),
  `8` (m, 0,01 mm — sólo DNA03 y LS15). Los datos se guardan "en la unidad y resolución configuradas al exportar".
- Pos. 5: `0` medido sin corrección de curvatura; `1` manual sin corrección; `2` medido con corrección; `5` manual con corrección.
- Bloque de medición = empieza con `11`; bloque de código = empieza con `41` (9 palabras: 41 + Info1..Info8).
- **Bloque especial de método de nivelación** (WI 41 con `?` en la pos. 8):

| Método | Palabra (GSI-8) |
|---|---|
| Línea BF (atrás–adelante) | `410000+?......1` |
| Línea BFFB (atrás–adelante–adelante–atrás) | `410000+?......2` |
| Línea aBF (alternada BF/FB) | `410000+?......3` |
| Línea aBFFB (alternada BFFB/FBBF) | `410000+?......4` |
| Check & Adjust (control de colimación) | `410000+?.....10` |

- DNA/LS soportan GSI-16 (`*`), NA2002/3003 sólo GSI-8 (formato "viejo", con flags distintos en pos. 4–5).
- Sprinter 150M/250M: exporta GSI-8/16 con el mismo diccionario (330 medición simple, 331/332 atrás/adelante, 333
  intermedia, 83 cota, 32 distancia). **[VERIFICAR]** con archivo real: la Sprinter no genera bloques 571/572 (no hace BFFB).

### 2.2 Word Index de nivelación

| WI | Significado |
|---|---|
| `11` | ID de punto (pos. 3–6 = nº de bloque) |
| `32` | **Distancia horizontal a la mira** |
| `330` | Lectura de mira en "Sólo medir" (Meas Only) |
| `331` | **Lectura atrás** (Backsight) o B1 |
| `332` | **Lectura adelante** (Foresight) o F1 |
| `333` | **Lectura intermedia** (vista intermedia / radiación) |
| `334` | Lectura de replanteo |
| `335` | Lectura atrás B2 (2.ª lectura atrás en BFFB) |
| `336` | Lectura adelante F2 (2.ª lectura adelante en BFFB) |
| `35` | Diferencia de replanteo de distancia |
| `374` | Diferencia de replanteo de altura |
| `390` | Nº de mediciones repetidas |
| `391` | Desv. estándar de la medición individual (modo media) |
| `392` | Dispersión (modo mediana) |
| `41` | Código / bloque especial |
| `42`–`49` | Info1–Info8 |
| `571` | **Diferencia de estación** (en BFFB: (B1−F1) − (B2−F2)) |
| `572` | **Diferencia de estación acumulada** |
| `573` | **Balance de distancias** (Σatrás − Σadelante, acumulado) |
| `574` | **Distancia total** (longitud de la línea) |
| `71` | Observación (remark) |
| `83` | **Cota** (de partida o calculada) |
| `95` | Temperatura del instrumento (°C) |
| `12`, `13`, `17`, `19`, `560`–`562`, `599` | Nº serie, tipo, fecha/hora, versión (sólo por comando online) |

Comparativa DNA vs NA (mismo valor 32,12 m): DNA03 `32...8+03212345`, NA3003 `32..00+00032120`.
Media con n=4 y s=1,2 mm: DNA `390...+00000004 391.06+00000012`; NA `52..06+0004+012`.

### 2.3 Secuencia de bloques por método

| Método | Secuencia |
|---|---|
| BF | `41`(método) → `11,83` (cota inicial) → [`11,32,331` → `11,32,332` → `11,573,574,83`]* |
| aBF | igual que BF, alternando BF en estaciones pares y FB en impares |
| BFFB | `41` → `11,83` → [`11,32,331` (B1) → `11,32,332` (F1) → `11,32,336` (F2) → `11,32,335` (B2) → `11,571,572,573,574,83`]* |
| aBFFB | BFFB en estaciones pares, FBBF en impares |
| Intermedia | `11,32,333` → `11,83` |
| Replanteo altura | `11,32,334` → `11,374,83` |
| Sólo medir | `11,32,330` repetido |
| Modo media/mediana | se añaden `390,391` o `390,392` al bloque de lectura |

Algoritmo de reconstrucción: mantener `estado = {cotaActual, ultimaAtras}`; ante `331`/`335` guardar lectura atrás; ante
`332`/`336` calcular `Δh = atrás − adelante`; cuando llega el bloque de resultado (`83`) **preferir la cota del instrumento**
y comparar contra la calculada (warning si difiere > 0,1 mm por redondeo). En BFFB `Δh = ((B1−F1)+(B2−F2))/2`.

### 2.4 Ejemplo real (manual Leica, GSI-8 "Sample GSI-8 data")

```
110014+00000124 32...6+00241234 330.06+00010509
410015+?......1
110016+0000P135 83...6+04026500
110017+00000035 32...6+00241234 331.06+00012554
110018+00000036 32...6+00241234 332.06+00010473
110019+00000036 573..6-00056105 574..6+01513910 83..06+04029024
110020+00000101 32...6+00241234 333.06+00013286
110021+00000101 83..06+04020337
110022+00005501 32...6+00241234 334.06+00012054
110023+00005501 374.06-00000012 83..06+04027030
110024+00000016 32...6+00241234 330.06+00012054 390...+00000005 391.06+00000012 71....+0SURFACE
410025+00000099 42....+00020692 43....+00001122 44....+00000015 45....+00000788
```
Lectura: `32...6+00241234` = 24,1234 m; `331.06+00012554` = 1,2554 m; `83...6+04026500` = 402,6500 m.

### 2.5 Fixtures de nivelación (generados, coherentes)

`fixture: nivel_bf_gsi8.gsi` — línea BF BM01 (100,0000) → TP1 → TP2 → BM02, más una vista intermedia. Unidad `6` (0,1 mm).
```
410001+?......1 
110002+0000BM01 83...6+01000000 
110003+0000BM01 32...6+00253400 331.06+00015230 
110004+00000TP1 32...6+00248700 332.06+00012110 
110005+00000TP1 573..6+00004700 574..6+00502100 83..06+01003120 
110006+00000TP1 32...6+00301200 331.06+00009875 
110007+00000TP2 32...6+00296500 332.06+00018842 
110008+00000TP2 573..6+00009400 574..6+01099800 83..06+00994153 
110009+00000TP2 32...6+00184000 331.06+00014021 
110010+0000BM02 32...6+00189500 332.06+00007765 
110011+0000BM02 573..6+00003900 574..6+01473300 83..06+01000409 
110012+0000IS01 32...6+00123000 333.06+00021050 
```
Esperado: Δh = +0,3120, −0,8967, +0,6256 → cotas 100,3120 / 99,4153 / 100,0409; balance final 0,39 m; longitud 147,33 m.
(La intermedia IS01 sin bloque de resultado: el parser debe calcular `Z = 100,0409 + 0,7765 − 2,1050 = 98,7124` y avisar que falta el `83`.)

`fixture: nivel_bffb_gsi16.gsi` — BFFB con unidad `8` (0,01 mm), BM10 = 250,00000.
```
*410001+?..............2 
*110002+000000000000BM10 83...8+0000000025000000 
*110003+000000000000BM10 32...8+0000000002250000 331.08+0000000000162345 
*110004+00000000000000A1 32...8+0000000002280000 332.08+0000000000110220 
*110005+00000000000000A1 32...8+0000000002280000 336.08+0000000000110232 
*110006+000000000000BM10 32...8+0000000002250000 335.08+0000000000162351 
*110007+00000000000000A1 571..8+0000000000000006 572..8+0000000000000006 573..8-0000000000030000 574..8+0000000004530000 83..08+0000000025052122 
*110008+00000000000000A1 32...8+0000000002710000 331.08+0000000000131010 
*110009+000000000000BM11 32...8+0000000002670000 332.08+0000000000195544 
*110010+000000000000BM11 32...8+0000000002670000 336.08+0000000000195540 
*110011+00000000000000A1 32...8+0000000002710000 335.08+0000000000131018 
*110012+000000000000BM11 571..8-0000000000000012 572..8-0000000000000006 573..8+0000000000010000 574..8+0000000009910000 83..08+0000000024987594 
```
Esperado: A1 = 250,52122; BM11 = 249,87594; 571 = +0,00006 / −0,00012 m; 572 final −0,00006 m.

> **[VERIFICAR]** El relleno del bloque especial en GSI-16 (`?..............2`) se dedujo del GSI-8; confirmar con un
> export real de LS15/DNA03 en GSI-16. El parser debe reconocer el método con la regex `/^\*?41\d{4}\+\?\.*(\d{1,2})\s*$/`.

---

## 3. Trimble/Zeiss DiNi: M5 y REC 500

Fuentes: Trimble DiNi 12/12T/22 User Guide (cap. "The M5 Data Record Format", "Definition of the Type Identifiers"),
<https://studylib.es/doc/8962709/trimble-dini-12-12t-22-user-guide-571703071-ver0400-eng> (copia del PDF
<https://produkter.geoteam.dk/Manualer/Trimble%20DiNi/Trimble%20DiNi%2012%2012T%2022%20User%20Guide%20571703071%20ver0400%20ENG.pdf>);
STAR*DINI (MicroSurvey/Starplus), <https://www.mdt.mt.gov/other/webdata/external/ESDC/library/stardini.pdf>;
foro JAG3D (archivo M5 en alemán), <https://software.applied-geodesy.org/forum/?id=13775&mode=thread>;
Total Open Station (Zeiss R5/REC 500 son la misma familia), `sample_data/zeiss_elta_r55/`.

### 3.1 Formato M5 — especificación de columnas

Línea de **121 caracteres** (118 visibles + código de error/CR/LF). Separador de campos `|`.

```
col: 1      7 8       16 17 18 20 21 22                       48 49 50       72 73       95 96      118 119-121
     For M5 | Adr nnnnn |  TTT    <bloque información 27 car.> |  <valor 1>   |  <valor 2>  |  <valor 3>  | err CR LF
```

| Columnas | Contenido |
|---|---|
| 1–6 | Identificador de formato: `For M5` (en Zeiss Elta: `For R5`, `For R4`) |
| 7 | `\|` |
| 8–16 | `Adr` + espacio + **dirección** de memoria (5 dígitos, 1–99999, alineado a la derecha) |
| 17 | `\|` |
| 18–20 | **Identificador del bloque de información**: `KD1`, `KD2` (identificación de punto), `TO` (texto/mensaje: Start-Line, End-Line…) |
| 21 | espacio |
| 22–48 | **Información (27 car.)**: para `KD1`: ID de punto (8, a la derecha) + código (5) + hora `HH:MM:SS`+dígito + nº de línea; para `TO`: texto libre |
| 49 | `\|` |
| 50–72, 73–95, 96–118 | **3 bloques de valor**, 23 car. c/u: `TT` (identificador de tipo, 2 car.) + espacio + valor (14 car., alineado a la derecha, con punto decimal) + espacio + **unidad** (4 car.: `m   `, `ft  `, `in  `, `mm  `, `gon `, `deg `…) + `\|` |
| 119–121 | Código de error (opcional) + CR LF |

Cada valor de M5 lleva **su propia unidad** (el REC 500 no).

### 3.2 Identificadores de tipo (type identifiers)

| ID (inglés) | ID (alemán) | Significado |
|---|---|---|
| `R` | `L` | Lectura de mira simple |
| `Rb` | `Lr` | **Lectura atrás** (*Rückblick*) |
| `Rf` | `Lv` | **Lectura adelante** (*Vorblick*) |
| `Rz` | `Lz` | **Lectura intermedia** (*Zwischenblick*) |
| `sR` | `sL` | Desviación estándar de las lecturas |
| `HD` | `E` | **Distancia horizontal** (*Entfernung*) |
| `Z` | `Z` | **Cota del punto** medido |
| `Z0` | — | Cota del punto atrás |
| `Hz` | — | Dirección horizontal (DiNi 12T) |
| `Sh` | — | **Suma de desniveles** de la línea (fin de línea) |
| `dz` | — | **Error de cierre** (diferencia contra cota conocida) |
| `Db` | — | **Suma de distancias atrás** |
| `Df` | — | **Suma de distancias adelante** |
| `KD` | — | Código de punto |
| `TO` | — | Información de texto |
| `Sr`, `Sv` | — | (vistos en REC 500 de fin de línea) **[VERIFICAR]** probablemente sumas de distancias atrás/adelante en formato antiguo |

Mensajes `TO` relevantes: `Start-Line <método> <nº>` (método `BF`, `BFFB`, `BFBF`, `aBF`…), `Cont-Line`, `End-Line`,
`Intermediate sight.`, `End of interm. sight.`, `Measurement repeated`, `Station repeated`, `Curva ON/Refract ON`,
`Measurement units m`. Los mensajes dependen del idioma configurado en el equipo (el parser debe aceptar alias en alemán
como `Linienanfang`/`Linienende` **[VERIFICAR]**).

### 3.3 Ejemplos reales

M5 en pies (STAR*DINI):
```
For M5|Adr   1|TO Start-Line            BF       10|                        |                       |                |
For M5|Adr   2|KD1   BM757      1                10|                        |                       |Z   850.47 ft   |
For M5|Adr   3|KD1   BM757      1            2   10|Rb        0.50 ft       |HD         234.42 ft   |                |
For M5|Adr   4|KD1       1      0            2   10|Rf       12.10 ft       |HD         239.40 ft   |                |
For M5|Adr   5|KD1       1      0                10|                        |                       |Z   838.87 ft   |
For M5|Adr   6|KD1       1      0            2   10|Rb       2.11 ft        |HD         143.77 ft   |                |
For M5|Adr   7|KD1   AT360      1            2   10|Rf       7.51 ft        |HD         128.48 ft   |                |
```
(nótese que este ejemplo publicado NO respeta los anchos exactos: **parsear por `|` y por tokens, no por columna**.)

M5 en alemán (foro JAG3D):
```
For M5|Adr    12|KD1   122012                  3|                      |                      |Z         0.00000 m   |
For M5|Adr    13|KD1   122012      07:47:275   3|Lr        1.57951 m   |E          28.510 m   |                      |
For M5|Adr    14|KD1       31      07:47:515   3|Lv        1.48116 m   |E          29.107 m   |                      |
```

### 3.4 Formato REC 500

Líneas de ~80 caracteres: dirección (4–6), ID de punto (hasta 27 car. de información), hora, nº de línea y hasta 3 bloques
`TT valor` **sin unidad** (la unidad se toma de la línea `Measurement units ...` o de una preferencia del usuario).

Ejemplo real (STAR*DINI, `TestDINI.raw`, extracto):
```
     64 Curva ON/Refract ON
     65 Start-Line       BFFB    101
     66     5090    0            101                                   Z   2174.002
     67     5090    0            101 Rb        2.384 HD        23.21
     68        1    0            101 Rf        1.126 HD        28.01
     69        1    0            101 Rf        1.127 HD        28.00
     70     5090    0            101 Rb        2.385 HD        23.27
     71        1    0            101                                   Z   2175.260
    113 Intermediate sight.      101
    114     4960    0            101 Rz        2.642 HD        22.80 Z     2165.547
    116 End of interm. sight.    101
    128     5080    0 26         101 Sr     1138.71 Sv       1148.46 Z     2166.269
    129 End-Line                 101
```
Columnas: dirección, ID de punto, código, (hora), nº de línea, luego pares `tipo valor`.

### 3.5 Fixture DiNi M5 (generado, columnas exactas)

`fixture: dini_bf_m5.dat` (CRLF; mismas lecturas que el fixture GSI BF → mismos resultados)
```
For M5|Adr     1|TO  NIVEL01.DAT                |                      |                      |                      |
For M5|Adr     2|TO  Start-Line         BF     1|                      |                      |                      |
For M5|Adr     3|KD1     BM01                  1|                      |                      |Z       100.00000 m   |
For M5|Adr     4|KD1     BM01       08:01:121  1|Rb        1.52300 m   |HD         25.340 m   |                      |
For M5|Adr     5|KD1      TP1       08:02:051  1|Rf        1.21100 m   |HD         24.870 m   |                      |
For M5|Adr     6|KD1      TP1                  1|                      |                      |Z       100.31200 m   |
For M5|Adr     7|KD1      TP1       08:05:330  1|Rb        0.98750 m   |HD         30.120 m   |                      |
For M5|Adr     8|KD1      TP2       08:06:112  1|Rf        1.88420 m   |HD         29.650 m   |                      |
For M5|Adr     9|KD1      TP2                  1|                      |                      |Z        99.41530 m   |
For M5|Adr    10|KD1      TP2       08:09:401  1|Rb        1.40210 m   |HD         18.400 m   |                      |
For M5|Adr    11|KD1     BM02       08:10:254  1|Rf        0.77650 m   |HD         18.950 m   |                      |
For M5|Adr    12|KD1     BM02                  1|                      |                      |Z       100.04090 m   |
For M5|Adr    13|TO  Intermediate sight.       1|                      |                      |                      |
For M5|Adr    14|KD1     IS01       08:11:020  1|Rz        2.10500 m   |HD         12.300 m   |Z        98.71240 m   |
For M5|Adr    15|TO  End of interm. sight.     1|                      |                      |                      |
For M5|Adr    16|TO  End-Line                  1|                      |                      |                      |
For M5|Adr    17|KD1     BM02                  1|Sh        0.04090 m   |dz        0.00000 m   |Z       100.04090 m   |
For M5|Adr    18|KD1     BM02                  1|Db         73.860 m   |Df         73.470 m   |Z       100.04090 m   |
```
Posiciones de `|` verificadas: 7, 17, 49, 72, 95, 118.

### 3.6 Cómo parsear DiNi

```ts
const M5_LINE = /^For\s+(M5|R5|R4)\|Adr\s*(\d+)\|(.{3})\s?(.*?)\|(.*)$/;
const VALUE_BLOCK = /^\s*([A-Za-z][A-Za-z0-9]?)\s+(-?\d+(?:\.\d+)?)\s*([A-Za-z]*)\s*$/;

function parseM5(line: string) {
  const m = M5_LINE.exec(line.replace(/\r$/, ''));
  if (!m) return null;
  const [, fmt, adr, blockType, info, rest] = m;
  const values = rest.split('|').map(b => VALUE_BLOCK.exec(b)).filter(Boolean)
     .map(v => ({ type: normalizeType(v![1]), value: +v![2], unit: v![3] || null }));
  const type = blockType.trim();                 // 'KD1' | 'KD2' | 'TO'
  if (type === 'TO') return { kind: 'text', adr: +adr, text: info.trim() };   // Start-Line, End-Line…
  const tokens = info.trim().split(/\s+/);
  const pointId = tokens[0];
  const time = tokens.find(t => /^\d{2}:\d{2}:\d{2,3}$/.test(t)) ?? null;
  const lineNo = tokens.length > 1 ? tokens[tokens.length - 1] : null;
  return { kind: 'obs', adr: +adr, pointId, time, lineNo, values };
}
const normalizeType = (t: string) => ({ Lr:'Rb', Lv:'Rf', Lz:'Rz', E:'HD', L:'R', sL:'sR' } as any)[t] ?? t;

// REC 500
const REC500_OBS = /^\s*(\d+)\s+(\S+)\s+.*?\b(R[bfz]?|L[rvz]?)\s+(-?\d+\.\d+)\s+(HD|E)\s+(-?\d+\.\d+)(?:\s+Z\s+(-?\d+\.\d+))?/;
const REC500_Z   = /^\s*(\d+)\s+(\S+)\s+.*\bZ\s+(-?\d+\.\d+)\s*$/;
const REC500_TXT = /^\s*(\d+)\s+(Start-Line|End-Line|Cont-Line|Intermediate sight\.|End of interm\. sight\.|Measurement repeated|Station repeated|Curva.*|Measurement units.*)/;
```
Reglas: (1) procesar por "líneas de nivelación" entre `Start-Line` y `End-Line`; (2) `Measurement repeated`/`Station repeated`
invalidan la(s) lectura(s) anterior(es): conservar sólo la última; (3) en BFFB promediar los dos desniveles;
(4) la cota `Z` del instrumento es la referencia; recalcular y advertir si difiere; (5) unidad: la del bloque M5, o la de
`Measurement units`, o la preferencia del usuario (REC 500).

---

## 4. Topcon, Sokkia, Nikon, South, Trimble JobXML

### 4.1 Sokkia SDR33 (`.sdr`)

Fuentes: Total Open Station, <https://totalopenstation.readthedocs.io/en/latest/input_formats/if_sokkia_sdr33.html>,
<https://tops.iosa.it/2014/03/08/sdr33-format.html>; MicroSurvey/Mimaka "TDS/SDR Field Data",
<https://www.mimaka.com/help/gs/html/008_SDR33%20Field%20Data.htm>; manual SDL30/SDL50
<https://eu.sokkia.com/sites/default/files/sc_files/downloads/sdl30-50_operators_manual_-_13th_ed.pdf>;
SDR Level 5 Reference <https://eu.sokkia.com/sites/default/files/sc_files/downloads/750-1-0073_rev_1_sdr_level_5_ref.pdf>.

Formato de **campos de ancho fijo, un registro por línea**. Cada registro empieza con **2 dígitos de tipo** + **2 letras de
código de derivación** (cómo se obtuvo el dato): `NM` no medido/sólo nota, `KI` ingresado por teclado (*keyed in*),
`TP` calculado por topografía/poligonal, `F1`/`F2` observación cara 1/2, `MC` medido y calculado, `PC`… **[VERIFICAR]** lista completa.

| Registro | Contenido |
|---|---|
| `00` | Cabecera: versión (`SDR33 V04-04.02`), fecha/hora, **6 dígitos de unidades** (ángulo, distancia, presión, temperatura, orden de coordenadas, tipo de ángulo vertical) |
| `01` | Instrumento: modelo, nº de serie, constante de prisma… |
| `02` | **Estación**: ID, Norte, Este, Cota, altura de instrumento, descripción |
| `03` | **Altura de prisma** |
| `04` | Colimación |
| `05` | Atmósfera (presión, temperatura) |
| `06` | Factor de escala |
| `07` | **Acimut de referencia** (punto atrás, acimut, ángulo horizontal) |
| `08` | **Coordenadas de punto**: ID, Norte, Este, Cota, descripción (`08KI` ingresado, `08TP` calculado) |
| `09` | **Observación**: estación, visado, distancia inclinada, ángulo vertical, ángulo horizontal, descripción (`09F1`, `09F2`) |
| `10` | Trabajo (job): nombre y opciones |
| `11` | Observación reducida (acimut, dist. horizontal, desnivel) |
| `13` | Nota/observaciones |

Longitud de campos: con IDs de 4 caracteres (SDR20) o **16 caracteres** (SDR33 con IDs alfanuméricos largos); valores numéricos
en campos de 16 (o 10/12) caracteres, **alineados a la izquierda, rellenos con espacios**. TOPS lee `08TP` así:
`id = línea[12:20]`, `N = línea[20:32]`, `E = línea[32:48]`, `Z = línea[48:63]`, `desc = línea[63:70]` — compatible con
campos de 16: ID 4–19, N 20–35, E 36–51, Z 52–67 (índices base 0), con los números desbordando a la izquierda.
**Recomendación**: parsear por posición con fallback a `split(/\s+/)` cuando los números se tocan.

Ejemplo real (TOPS):
```
00NMSDR33 V04-04.02     00-000-00 00:00 211111
10NMJOB3            121111
06NM1.00000000      
01NM:SET5F V01-00    020078                      31                                0.00000000      
13PCP.C. mm Applied:-30.000                                     
02TP        00000031509.97000000    937.27400000    20.05300000     1.50500000      11              
03NM1.60000000      
08TP        00000009510.50400000    908.83800000    19.69900000     11              
08TP        00000010510.40000000    907.75700000    19.48700000     11              
08TP        00000011510.37900000    906.92000000    19.26200000     11              
```
Registro `09F1` (orden de campos): `09F1` + estación(16) + punto(16) + distancia inclinada(16) + ángulo vertical(16) + ángulo horizontal(16) + descripción.
**[VERIFICAR]** con archivo real: los anchos varían por versión (V03 vs V04) y por configuración "ID 4/16 caracteres".

Niveles Sokkia SDL30/SDL50 y Topcon DL-500 recientes exportan "SDR33" (registros de nivelación del SDR Level) o CSV;
se recomienda **pedir a usuarios un archivo real** y empezar soportando el CSV de esos niveles.

### 4.2 Topcon DL-500 / DL-101C / DL-102C

- DL-502/503: salida a PC en **CSV** o **SDR2X** (manual DL-502, cap. "Data Output", <https://www.manualslib.com/manual/996602/Topcon-Dl-502.html?page=55>).
- DL-101C/102C: RS-232C y tarjeta PCMCIA; formato propio del equipo
  (<https://www.ngs.noaa.gov/pub/corbin/Training/Leveling/precise-leveling-workshop/Equipment/Topcon/Topcon%20DL-101_102%20Brochure.pdf>,
  <https://manualzz.com/doc/o/90mop/topcon-dl-101c--dl-102c-electronic-digital-level-instruct...-end-of-line-leveling--end-of-benchmark---end-mode->).
- **Estrategia**: aceptar el CSV de DL-50x mediante el importador CSV genérico con *perfil de columnas* de nivelación
  (`Punto, Tipo(BS/FS/IS), Lectura, Distancia, Cota`) y documentar el SDR2X/DL-101 como **[VERIFICAR] — requiere archivo real**.

### 4.3 Topcon GTS-7 y South NTS (`.gt7`, `.dat`)

South NTS-350/360/362 y Topcon GTS (formato "GTS-7") usan el mismo estilo **clave + valores separados por coma**:
la clave ocupa las columnas 1–8 y los valores empiezan en la columna 9.
Fuente: <https://github.com/thanosa/south-total-station-data-converter> (`doc/specifications.md`, `input/sample.dat`).

| Clave | Valores | Significado |
|---|---|---|
| `JOB` | nombre | Trabajo |
| `INST` | modelo, versión | Instrumento |
| `UNITS` | `M,G` / `M,D` / `F,D` | Distancia (M/F), ángulo (G gon / D grados) |
| `STN` | punto, alt. instrumento, código | Estación |
| `XYZ` | X, Y, Z (en South: E/N o N/E según config. **[VERIFICAR]**) | Coordenadas de estación |
| `BKB` | punto atrás, acimut, ángulo Hz | Orientación (backbearing) |
| `BS` | punto, alt. prisma, código | Visual atrás |
| `FS` / `SS` | punto, alt. prisma, código | Visual adelante / radiación (side shot) |
| `SD` | Hz, V, distancia inclinada | Observación (ángulos en la unidad de `UNITS`) |
| `HD` | Hz, dist. horizontal, desnivel | Observación reducida |
| `HV` | Hz, V | Sólo ángulos |
| `PT` / `NEZ` | punto, N, E, Z, código | Coordenada **[VERIFICAR]** |

Ejemplo real (South NTS-350):
```
JOB     SAMPLE
INST    NTS-350 Ver. 2008.07.08
UNITS   M,G
STN     S2,1.636, 
XYZ     212704.739,815754.136,556.168
BS      S1,1.800, 
SD      0.0000,96.9854,58.876
SS      1,0.000,2P
SD      389.4092,96.6598,43.175
SS      2,0.000,2P
SD      385.1540,96.6601,31.506
SS      S3,1.800, 
HV      166.3753,114.1796
```
Parseo: `const m = /^(\w+)\s+(.*)$/.exec(line)`; `key = m[1]`, `vals = m[2].split(',').map(s => s.trim())`.
La observación (`SD`/`HD`/`HV`) **siempre sigue** a la línea `BS`/`FS`/`SS` que la identifica → máquina de estados de 2 líneas.

Además, las South exportan coordenadas en "CASS" `.dat`: `Pt,Código,E,N,Z` (P,E,N,Z,D) — cubrir con el importador CSV.

### 4.4 Nikon RAW v2.00 (`.raw`)

Fuente: <https://totalopenstation.readthedocs.io/en/stable/input_formats/if_nikon_raw_v200.html>, muestras TOPS.

CSV, primer campo = tipo de registro. Las líneas `CO` traen la **configuración** (unidades, orden de coordenadas, cero de V).

| Registro | Campos |
|---|---|
| `CO` | comentario / configuración (`Dist Units: Metres`, `Angle Units: Gons`, `Coord Order: NEZ`, `Zero VA: Zenith`) |
| `ST` | estación, (id), punto atrás, (id), alt. instrumento, acimut atrás, ángulo Hz atrás |
| `F1` / `F2` | punto, alt. prisma, dist. inclinada, Hz, V, hora |
| `SS` | punto, alt. prisma, dist. inclinada, Hz, V, hora, código |
| `SO` | replanteo |
| `UP`, `MP`, `CC`, `RE`, `MC` | coordenadas: punto, código?, c1, c2, c3 (en el orden `Coord Order`), descripción |

Ejemplo real (TOPS):
```
CO,Nikon RAW data format V2.00
CO,Instrument: Nikon NPL-352
CO,Dist Units: Metres
CO,Angle Units: Gons
CO,Zero azimuth: North
CO,Zero VA: Zenith
CO,Coord Order: NEZ
MP,1,,0.000,0.000,0.000,ST
ST,1,,,,1.430,0.0000,0.0000
F1,,1.500,,0.0000,110.5344,13:47:08
SS,2,1.500,8.986,107.9916,102.3376,14:00:04,P
SS,3,1.500,7.706,110.4894,103.4372,14:00:51,P
SS,4,1.500,7.620,105.5898,104.3960,14:01:30,P
```
Nikon también exporta **DES** (descriptivo/coordenadas) y "Nikon coordinate" CSV — cubrir con el importador CSV.

### 4.5 Trimble JobXML (`.jxl`) — resumen

Fuentes: esquema <https://ww2.trimble.com/schema/JobXML/5_6/JobXMLSchema-5.61.xsd>; FME JobXML reader
<https://docs.safe.com/fme/2017.0/html/FME_Desktop_Documentation/FME_ReadersWriters/jobxml/jobxml.htm>;
Trimble Access custom export <https://help.fieldsystems.trimble.com/trimble-access/latest/en/job-custom-export.htm>.

- Raíz `<JOBFile jobName=… version=…>` con `<Environment>` (unidades, sistema de coordenadas) y `<FieldBook>` (registros en orden cronológico).
- Registros clave: `<StationRecord>` (estación, altura instrumento, modo: Station Setup / Plus / Resection),
  `<BackBearingRecord>`, `<TargetRecord>` (altura de prisma, constante), `<PointRecord>` con `<Name>`, `<Code>`,
  `<Method>`, y uno de: `<Circle>` (`HorizontalCircle`, `VerticalCircle`, `EDMDistance`, `Face`, desviaciones),
  `<Grid>` (`North`, `East`, `Elevation`), `<WGS84>` (`Latitude`, `Longitude`, `Height`) o `<ECEFDeltas>` (GNSS).
- Ángulos en grados decimales y distancias en metros **internamente** (las unidades de presentación están en `<Environment>`).
- Registros pueden ser **borrados lógicamente** (`<Deleted>true</Deleted>`): filtrarlos.
- Parseo: `DOMParser` (navegador/Capacitor) → recorrer `FieldBook/*`; mantener mapa `TargetID → altura` y `StationID → estación`.

---

## 5. CSV/TXT genéricos (PNEZD, PENZD, Civil 3D)

Fuentes: foros Autodesk Civil 3D
<https://forums.autodesk.com/t5/civil-3d-forum/pnezd-file-import-issue/td-p/3423663>,
<https://forums.autodesk.com/t5/civil-3d-forum/cant-import-penzd-points-from-a-csv-file/td-p/9552834>;
NRCS "Using point styles" <https://www.nrcs.usda.gov/sites/default/files/2023-03/300_Points.pdf>.

### 5.1 Variantes de orden de columnas (nomenclatura Civil 3D)

| Código | Columnas | Comentario |
|---|---|---|
| `PNEZD` | Punto, Norte, Este, Cota, Descripción | **Formato por defecto de Civil 3D** y el más usado en América |
| `PENZD` | Punto, Este, Norte, Cota, Descripción | Común en equipos chinos (South, Hi-Target) y Europa |
| `PNEZ`, `PENZ` | sin descripción | |
| `ENZ`, `NEZ`, `XYZ` | sin punto | nubes de puntos |
| `PNE`, `PEN` | sin cota | |
| `PNEZD + atributos` | columnas extra | |

Civil 3D define para cada variante "(comma delimited)" y "(space delimited)"; su importador **no tolera encabezado**
(la 1.ª línea debe ser dato) y en algunos formatos exige nº de punto numérico.

### 5.2 Separadores y particularidades regionales

- Separadores: `,` `;` `\t` ` ` (uno o varios espacios). En configuraciones regionales en español Excel exporta CSV con
  **`;` y coma decimal** (`1022,915`) → si el separador es `;` aceptar `,` como decimal.
- Codificación: UTF-8 (con o sin BOM), Windows-1252/Latin-1 (acentos en descripciones). Detectar BOM y probar
  `TextDecoder('utf-8', {fatal:true})` → si falla, `windows-1252`.
- Fin de línea: CRLF, LF o CR.
- Encabezados frecuentes (normalizar sin tildes y en minúsculas): `p, pt, punto, point, id, nombre, name, num` /
  `n, norte, north, northing, y, x(!)` / `e, este, east, easting, x, y(!)` / `z, h, cota, elev, elevation, altura` /
  `d, desc, descripcion, description, code, codigo`.
- ¡Ojo con `X/Y`! En topografía latinoamericana/europea a menudo `X=Este, Y=Norte`, pero en convenciones geodésicas
  alemanas/rusas `X=Norte`. No asumir: usar la heurística de 5.3 y pedir confirmación.

### 5.3 Heurística de detección de columnas

1. Detectar separador: contar ocurrencias por línea de `[',',';','\t','|',' +']` en las primeras 50 líneas → el de menor varianza y conteo ≥ 2.
2. Si la 1.ª fila tiene ≥ 50 % de celdas no numéricas → encabezado; mapear con diccionario de sinónimos.
3. Sin encabezado: clasificar columnas por tipo (numérica entera, decimal, texto). Primera columna texto/entera única → `P`.
   Última columna texto → `D`.
4. Distinguir N/E (UTM): `E ∈ [100 000, 900 000]`, `N ∈ [0, 10 000 000]` (hemisferio sur típico `N > 7 000 000`).
   Si ambas columnas caen en el rango de E, mirar varianza/orden y **pedir confirmación**. Para coordenadas locales
   (p. ej. 1000/5000) no hay heurística fiable → preguntar al usuario mostrando vista previa con el punto dibujado.
5. Z: columna decimal con rango pequeño (< 9 000) y varianza menor que N/E.
6. Detectar lat/long: valores en [-90, 90] y [-180, 180] con ≥ 6 decimales → ofrecer convertir a UTM.

### 5.4 Fixtures CSV

`fixture: puntos_pnezd.csv` (Civil 3D, sin encabezado)
```
1,5000.000,1000.000,100.000,EST1
101,5026.725,1022.915,100.604,BORDE
102,4980.984,1049.254,98.726,BORDE
103,4981.676,997.098,100.086,POSTE
104,5000.559,935.965,102.458,ARBOL
105,5041.260,993.465,99.422,BM
```
`fixture: puntos_penzd_header_es.csv` (Excel regional español: `;` y coma decimal, con encabezado)
```
Punto;Este;Norte;Cota;Descripción
1;1000,000;5000,000;100,000;EST1
101;1022,915;5026,725;100,604;BORDE
102;1049,254;4980,984;98,726;BORDE
103;997,098;4981,676;100,086;POSTE
104;935,965;5000,559;102,458;ÁRBOL
105;993,465;5041,260;99,422;BM
```
`fixture: puntos_utm_espacios.txt` (PENZD separado por espacios, UTM 18S)
```
1  285431.112  8625104.556  152.384  BM-1
2  285456.903  8625131.020  152.910  PI
3  285470.250  8625098.774  151.877  PI
4  285449.018  8625071.305  151.402  BORDE
5  285421.660  8625085.991  151.995  BORDE
```

---

## 6. GNSS: NMEA 0183 (GGA, RMC, GST, GSA)

Fuentes: gpsd "NMEA 0183 – Revealed", <https://gpsd.gitlab.io/gpsd/NMEA.html>;
NovAtel OEM7 logs GPGGA/GPGST, <https://docs.novatel.com/OEM7/Content/Logs/GPGGA.htm>, <https://docs.novatel.com/OEM7/Content/Logs/GPGST.htm>.

### 6.1 Estructura común

`$` + talker (2) + tipo (3) + `,` campos `,`… + `*` + checksum (2 hex) + CRLF. Máx. 82 caracteres.
Talker: `GP` GPS, `GL` GLONASS, `GA` Galileo, `GB`/`BD` BeiDou, `GQ` QZSS, `GN` combinado (multi-GNSS).
**Checksum** = XOR de 8 bits de todos los caracteres entre `$` y `*` (excluidos), en 2 hex mayúsculas.
Latitud `ddmm.mmmmm`, longitud `dddmm.mmmmm` → `grados = dd + mm/60`, signo por `S`/`W`.

### 6.2 GGA — datos de la posición

`$xxGGA,hhmmss.ss,lat,N/S,lon,E/W,Q,nSat,HDOP,altMSL,M,N_geoide,M,edadDGPS,idEstación*CS`

| Campo | Contenido |
|---|---|
| 1 | Hora UTC |
| 2–3 | Latitud, N/S |
| 4–5 | Longitud, E/W |
| 6 | **Indicador de calidad**: `0` sin fix, `1` GPS autónomo, `2` DGPS/SBAS, `3` PPS, **`4` RTK fijo (fix)**, **`5` RTK flotante (float)**, `6` estimado (dead reckoning), `7` manual, `8` simulación |
| 7 | Satélites en uso |
| 8 | HDOP |
| 9–10 | Altitud sobre el nivel medio del mar (geoide), `M` |
| 11–12 | Ondulación del geoide N (separación geoide–elipsoide), `M` → **h elipsoidal = altitud + N** |
| 13 | Edad de las correcciones diferenciales (s) |
| 14 | ID de la estación base |

### 6.3 RMC — mínimo recomendado

`$xxRMC,hhmmss.ss,A/V,lat,N/S,lon,E/W,velNudos,rumbo,ddmmaa,varMag,E/W,modo[,navStatus]*CS`
Modo (NMEA ≥ 2.3): `A` autónomo, `D` diferencial, `E` estimado, `F` RTK float, `R` RTK fijo, `N` no válido.
**RMC aporta la fecha** (GGA sólo tiene hora): combinar por hora UTC.

### 6.4 GST — estadística de error (precisión)

`$xxGST,hhmmss.ss,rms,σmayor,σmenor,orient,σlat,σlon,σalt*CS`
σlat/σlon/σalt en metros (1σ). Precisión horizontal recomendada `σH = sqrt(σlat² + σlon²)`; vertical `σV = σalt`.
Es lo que se debe usar para **aceptar/rechazar un punto RTK** (p. ej. σH ≤ 0,02 m y Q=4).

### 6.5 GSA — DOP y satélites activos

`$xxGSA,M/A,modo(1 sin fix,2 2D,3 3D),sat1..sat12,PDOP,HDOP,VDOP[,systemId]*CS`
En multi-GNSS se emite un GSA por constelación (NMEA 4.10 añade `systemId`).

### 6.6 Fixture NMEA (checksums calculados)

`fixture: rtk_lima.nmea`
```
$GNGGA,153012.00,1226.12345,S,07655.54321,W,4,18,0.62,152.384,M,24.105,M,1.0,0001*62
$GNRMC,153012.00,A,1226.12345,S,07655.54321,W,0.012,,041026,,,R,V*08
$GNGST,153012.00,0.85,0.012,0.008,35.2,0.010,0.009,0.018*4E
$GNGSA,A,3,02,05,12,15,18,24,25,29,,,,,1.15,0.62,0.97,1*0D
$GNGGA,153013.00,1226.12346,S,07655.54322,W,5,17,0.70,152.401,M,24.105,M,1.0,0001*64
$GNGGA,153014.00,1226.12346,S,07655.54321,W,4,18,0.62,152.386,M,24.105,M,1.0,0001*65
$GPGGA,153015.00,,,,,0,00,99.99,,,,,,*65
```
Esperado: 1.ª GGA → lat −12,43539083°, lon −76,92572017°, Q=4 (RTK fix), alt 152,384, h elip. 176,489; 2.ª Q=5 (float, rechazar si se exige fix);
última sin fix (ignorar). Línea con checksum erróneo → descartar con warning.

```ts
const NMEA = /^\$([A-Z]{2})([A-Z]{3}),(.*)\*([0-9A-F]{2})\s*$/;
function nmeaChecksumOk(line: string) {
  const body = line.slice(1, line.indexOf('*'));
  let cs = 0; for (const ch of body) cs ^= ch.charCodeAt(0);
  return cs.toString(16).toUpperCase().padStart(2, '0') === line.slice(line.indexOf('*') + 1, line.indexOf('*') + 3);
}
const dm2deg = (v: string, hemi: string) => { if (!v) return NaN;
  const dot = v.indexOf('.'); const deg = +v.slice(0, dot - 2), min = +v.slice(dot - 2);
  return (deg + min / 60) * (hemi === 'S' || hemi === 'W' ? -1 : 1); };
```
Para registrar un punto GNSS: promediar N épocas con Q=4, y guardar `σH`, `σV` (GST), `PDOP` (GSA), nSat, edad de corrección.

---

## 7. Exportación: DXF R12, KML, LandXML 1.2, Excel

### 7.1 DXF R12 (AC1009) mínimo

Fuentes: Autodesk DXF Reference <https://help.autodesk.com/view/OARX/2024/ENU/?guid=GUID-235B22E0-A567-4CF6-92D3-38A2306D73F3>;
ezdxf "DXF R12" internals <https://ezdxf.readthedocs.io/en/stable/dxfinternals/filestructure.html>.

- Texto ASCII, pares **código de grupo / valor**, uno por línea. Secciones `HEADER`, `TABLES`, `ENTITIES`, fin `EOF`.
- **R12 no tiene `LWPOLYLINE`** (aparece en R14/AC1014). Para R12 usar `POLYLINE` + `VERTEX` + `SEQEND`;
  flag `70=8` → polilínea 3D; `VERTEX 70=32` → vértice de polilínea 3D; `70=1` cerrada.
  Si se exporta R2000+ (AC1015) se puede usar `LWPOLYLINE` (2D con elevación constante, código 38) — pero entonces hay que
  escribir handles, CLASSES, OBJECTS… → **mantener R12** por compatibilidad universal (AutoCAD, Civil 3D, QGIS, BricsCAD, LibreCAD).
- Capas: tabla `LAYER` (código 2 nombre, 62 color ACI, 6 tipo de línea, 70 flags). Si se referencia `CONTINUOUS`, declarar `LTYPE`.
- Puntos: `POINT` (10/20/30). Etiqueta: `TEXT` (10/20/30 inserción, 40 altura, 1 texto, 50 rotación).
- Separador decimal siempre `.`; codificación ANSI (cp1252) — evitar caracteres fuera de cp1252 en textos o usar `\U+XXXX`.

`fixture: export_min_r12.dxf`
```
0
SECTION
2
HEADER
9
$ACADVER
1
AC1009
9
$INSUNITS
70
6
0
ENDSEC
0
SECTION
2
TABLES
0
TABLE
2
LTYPE
70
1
0
LTYPE
2
CONTINUOUS
70
0
3
Solid line
72
65
73
0
40
0.0
0
ENDTAB
0
TABLE
2
LAYER
70
3
0
LAYER
2
PUNTOS
70
0
62
1
6
CONTINUOUS
0
LAYER
2
TEXTO
70
0
62
7
6
CONTINUOUS
0
LAYER
2
POLIGONAL
70
0
62
3
6
CONTINUOUS
0
ENDTAB
0
ENDSEC
0
SECTION
2
ENTITIES
0
POINT
8
PUNTOS
10
1022.915
20
5026.725
30
100.604
0
TEXT
8
TEXTO
10
1023.115
20
5026.925
30
100.604
40
0.25
1
P101
0
POLYLINE
8
POLIGONAL
66
1
10
0.0
20
0.0
30
0.0
70
8
0
VERTEX
8
POLIGONAL
10
1000.000
20
5000.000
30
100.000
70
32
0
VERTEX
8
POLIGONAL
10
1022.915
20
5026.725
30
100.604
70
32
0
VERTEX
8
POLIGONAL
10
1049.254
20
4980.984
30
98.726
70
32
0
SEQEND
8
POLIGONAL
0
ENDSEC
0
EOF
```
Recomendación: capas por código de punto (`PTS_<código>`, `TXT_NUM`, `TXT_COTA`, `TXT_DESC`), 3 TEXT por punto (número,
cota, descripción) desplazados, y opcionalmente `INSERT` de un bloque de símbolo (requiere sección `BLOCKS`).
`$INSUNITS` no existe en R12 estricto (se ignora sin error en lectores modernos; omitir si se quiere 100 % R12).

### 7.2 KML 2.2

Fuente: <https://developers.google.com/kml/documentation/kmlreference>.
- Coordenadas **WGS84 `lon,lat[,alt]`** (¡longitud primero!) → hay que transformar UTM/local → WGS84 (proj4js con EPSG del proyecto).
- `altitudeMode`: `clampToGround` (por defecto), `relativeToGround`, `absolute` (alt = elipsoidal/ortométrica según visor; usar `clampToGround` salvo que se pida).
- Puntos → `Placemark/Point`; poligonal → `Placemark/LineString`; parcela → `Polygon/outerBoundaryIs/LinearRing` (cerrar el anillo).
- `ExtendedData/Data` para cota, código, σ.

`fixture: export_min.kml`
```xml
<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>Levantamiento</name>
    <Style id="pt"><IconStyle><scale>0.8</scale></IconStyle></Style>
    <Folder><name>Puntos</name>
      <Placemark><name>1</name><description>BM-1</description><styleUrl>#pt</styleUrl>
        <ExtendedData><Data name="cota"><value>152.384</value></Data></ExtendedData>
        <Point><coordinates>-76.92572017,-12.43539083,152.384</coordinates></Point>
      </Placemark>
    </Folder>
    <Placemark><name>Poligonal</name>
      <LineString><tessellate>1</tessellate>
        <coordinates>-76.92572017,-12.43539083,0 -76.92550000,-12.43515000,0 -76.92530000,-12.43545000,0</coordinates>
      </LineString>
    </Placemark>
  </Document>
</kml>
```

### 7.3 LandXML 1.2

Fuentes: esquema <http://www.landxml.org/schema/LandXML-1.2/LandXML-1.2.xsd>, documentación <http://www.landxml.org/schema/LandXML-1.2/documentation/LandXML-1.2Doc.html>;
ejemplo de lectura en TOPS (`sample_data/landxml.xml`).

- **Orden de coordenadas: `Norte Este Cota`** (¡N primero!) separados por espacio, en `CgPoint` y en `Pnts/P`.
- `<Units>` obligatorio en la práctica: `<Metric linearUnit="meter" areaUnit="squareMeter" volumeUnit="cubicMeter" angularUnit="decimal degrees" directionUnit="decimal degrees"/>`.
- `<CoordinateSystem epsgCode="32718"/>` opcional pero muy recomendable.
- `CgPoint@name` debe ser único; `@code`, `@desc`, `@pntSurv` (`control`, `sideshot`…).
- Superficie TIN: `Surface/Definition@surfType="TIN"` con `Pnts/P@id` y `Faces/F` (tres ids, orientación antihoraria recomendada).
- Civil 3D importa CgPoints como Puntos COGO y Surfaces como superficies TIN.

`fixture: export_min_landxml12.xml`
```xml
<?xml version="1.0" encoding="UTF-8"?>
<LandXML xmlns="http://www.landxml.org/schema/LandXML-1.2"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://www.landxml.org/schema/LandXML-1.2 http://www.landxml.org/schema/LandXML-1.2/LandXML-1.2.xsd"
         version="1.2" date="2026-10-04" time="10:00:00" language="Spanish" readOnly="false">
  <Units>
    <Metric linearUnit="meter" areaUnit="squareMeter" volumeUnit="cubicMeter"
            angularUnit="decimal degrees" directionUnit="decimal degrees"/>
  </Units>
  <CoordinateSystem name="WGS 84 / UTM zone 18S" epsgCode="32718"/>
  <Project name="Levantamiento"/>
  <Application name="TOPO-APP" manufacturer="TOPO-APP" version="0.1"/>
  <CgPoints name="Puntos">
    <CgPoint name="1" code="BM" pntSurv="control">8625104.556 285431.112 152.384</CgPoint>
    <CgPoint name="2" code="PI">8625131.020 285456.903 152.910</CgPoint>
    <CgPoint name="3" code="PI">8625098.774 285470.250 151.877</CgPoint>
    <CgPoint name="4" code="BORDE">8625071.305 285449.018 151.402</CgPoint>
    <CgPoint name="5" code="BORDE">8625085.991 285421.660 151.995</CgPoint>
  </CgPoints>
  <Surfaces>
    <Surface name="TN">
      <Definition surfType="TIN">
        <Pnts>
          <P id="1">8625104.556 285431.112 152.384</P>
          <P id="2">8625131.020 285456.903 152.910</P>
          <P id="3">8625098.774 285470.250 151.877</P>
          <P id="4">8625071.305 285449.018 151.402</P>
          <P id="5">8625085.991 285421.660 151.995</P>
        </Pnts>
        <Faces>
          <F>1 3 2</F>
          <F>1 4 3</F>
          <F>1 5 4</F>
        </Faces>
      </Definition>
    </Surface>
  </Surfaces>
</LandXML>
```

### 7.4 Excel (XLSX)

- Librería: **SheetJS** (`xlsx`, instalar desde <https://cdn.sheetjs.com/> porque el paquete npm público quedó desactualizado; docs <https://docs.sheetjs.com>)
  o **ExcelJS** (<https://github.com/exceljs/exceljs>, mejor para estilos/formatos numéricos).
- Hojas recomendadas: `Puntos` (P, N, E, Z, D, método, σH, σV, fecha), `Observaciones` (estación, punto, Hz, V, DI, hi, hr),
  `Nivelación` (libreta: punto, atrás, intermedia, adelante, altura instrumental, cota, distancia, corrección, cota compensada),
  `Resumen` (cierre, tolerancia, error, metadata del equipo).
- Escribir números **como número** (no texto), con formato de celda `0.000` (o `0.0000` para lecturas de mira); nunca texto con coma.
- Fechas como fecha Excel; encabezados en negrita; congelar fila 1; ancho de columnas.
- En Android/Capacitor: generar `ArrayBuffer` → `Filesystem.writeFile` (base64) → `Share`.

---

## 8. Ingreso manual: libreta de nivel automático

Para niveles automáticos (ópticos) no hay archivo: la app debe ofrecer una **libreta electrónica** equivalente a la de campo.

### 8.1 Columnas de la libreta tradicional

| Columna | Abreviatura | Descripción |
|---|---|---|
| Punto / Estación | PV / Est. | Identificador (BM, PC/TP, punto de relleno) |
| Vista atrás | **VA** (V+, BS, L. atrás) | Lectura sobre punto de cota conocida |
| Vista intermedia | **VI** (BS radiación, IS) | Lectura a puntos de relleno (no cambian estación) |
| Vista adelante | **VAd** (V−, FS) | Lectura al punto de cambio o final |
| Altura instrumental | **AI** (HI) | `AI = Cota + VA` |
| Cota | Z | `Cota = AI − VI` o `AI − VAd` |
| Distancia | D | Estadimétrica (opcional) |
| Hilos | **HS / HM / HI** | Hilo superior, medio, inferior (si se registran) |
| Observaciones | | |

Método alternativo "ascenso/descenso" (*rise and fall*): `Δ = lectura anterior − lectura actual` (+ ascenso, − descenso).

### 8.2 Reglas de cálculo y control

- **Altura instrumental**: `AI = Z(punto atrás) + VA`; `Z(i) = AI − VI(i)`; `Z(cambio) = AI − VAd`; nueva estación: `AI' = Z(cambio) + VA'`.
- **Comprobación aritmética**: `ΣVA − ΣVAd = Z_final − Z_inicial` (las VI no entran).
- **Estadimetría con 3 hilos**: `D = K·(HS − HI) + C` con `K = 100`, `C = 0` en niveles modernos (anallácticos).
  Control: `|HM − (HS + HI)/2| ≤ 1–2 mm` (si no, alertar lectura errónea).
  Con 3 hilos, usar `HM` como lectura (o el promedio de los 3 hilos en nivelación precisa).
- **Error de cierre**: `e = Z_calculada_final − Z_conocida` (o `ΣΔ` en circuito cerrado = 0).
- **Tolerancia** típica: `T = k·√K` (K en km). Ejemplos frecuentes: ordinaria `12 mm·√K`; precisa `±4 a ±8 mm·√K`;
  topografía de obra `±10 mm·√n` (n = nº de estaciones). Hacerla **configurable** por proyecto.
- **Compensación** proporcional a la distancia acumulada (o al nº de estaciones): `c_i = −e · (D_i / D_total)`.
- **Balance de distancias** por estación (|ΣDatrás − ΣDadelante|) — advertir si excede un umbral (p. ej. 5 m) por errores de colimación.

### 8.3 Modelo de datos sugerido (compartido con los importadores de niveles digitales)

```ts
type LevelReadingKind = 'BS' | 'IS' | 'FS';       // VA, VI, VAd
interface LevelReading {
  station: number;                // nº de puesta de instrumento
  pointId: string;
  kind: LevelReadingKind;
  reading: number;                // m (HM o lectura digital)
  upper?: number; lower?: number; // HS, HI (hilos)
  distance?: number;              // m (digital o estadimétrica)
  readings2?: { reading: number; distance?: number };  // BFFB (B2/F2)
  source: 'manual' | 'gsi' | 'dini' | 'csv';
  raw?: string;                   // línea original (trazabilidad)
}
interface LevelRun { method: 'BF'|'BFFB'|'aBF'|'aBFFB'|'manual'; startPoint: string; startZ: number;
                     endKnownZ?: number; readings: LevelReading[]; }
```
Todos los importadores de nivelación (GSI, DiNi, CSV, manual) producen `LevelRun` → un único motor de cálculo/compensación.

### 8.4 Fixture de libreta manual (CSV de ingreso / exportación)

`fixture: libreta_manual.csv` — mismas lecturas que los fixtures GSI/DiNi BF (con hilos estadimétricos).
```
punto,va,vi,vad,hs,hm,hi,observacion
BM01,1.523,,,1.650,1.523,1.396,BM cota 100.000
TP1,0.988,,1.211,,,,cambio
TP2,1.402,,1.884,,,,cambio
IS01,,2.105,,2.167,2.105,2.044,relleno
BM02,,,0.777,0.872,0.777,0.682,BM cierre
```
Esperado (redondeo a mm): AI1 = 101,523 → TP1 = 100,312; AI2 = 101,300 → TP2 = 99,416; AI3 = 100,818 → IS01 = 98,713;
BM02 = 100,041. ΣVA − ΣVAd = 3,913 − 3,872 = 0,041 ✔. Distancias estadimétricas: BM01 25,4 m, IS01 12,3 m, BM02 19,0 m.
Control hilos BM01: (1,650+1,396)/2 = 1,523 ✔.

Nota sobre la fila: en la notación de libreta, la VAd y la VA de un punto de cambio van **en la misma fila** (TP1: VAd 1,211 cierra
la estación 1; VA 0,988 abre la estación 2). La VI se coloca en la estación activa (la 3.ª en el ejemplo).

---

## 9. Arquitectura del parser tolerante con autodetección

### 9.1 Principios

1. **Nunca lanzar excepción por una línea mala**: cada importador devuelve `{ data, warnings[], errors[] }` con número de línea y texto original.
2. **Autodetección por contenido**, no por extensión (`.dat`, `.txt`, `.raw` son ambiguos: DiNi, South, Topcon, CSV…). La extensión sólo suma puntaje.
3. **Normalización de entrada** antes de detectar: decodificar bytes (BOM UTF-8/UTF-16, fallback windows-1252), unificar fin de línea, quitar caracteres de control salvo TAB, quitar líneas vacías finales, recortar `\x1A` (EOF de DOS, frecuente en descargas por RS-232).
4. **Modelo canónico único** (independiente del formato): `Point`, `Station`, `Observation` (polar), `LevelRun`, `GnssEpoch`, más `meta` (instrumento, unidades, fecha).
5. **Unidades siempre a SI internamente** (m, radianes o gon como decisión única del dominio); conservar unidad original en `meta`.
6. **Trazabilidad**: cada entidad conserva `{ file, line, raw }` para mostrar en la UI de revisión.
7. **Vista previa + confirmación** cuando la confianza de detección < umbral o hay ambigüedad (N/E, unidades del REC 500, pies).

### 9.2 Interfaz de los detectores/parsers

```ts
export interface ImportContext { fileName?: string; userUnits?: { length: 'm'|'ft'|'usft'; angle: 'gon'|'deg' };
                                 csvProfile?: CsvProfile; }
export interface Diagnostic { line: number; severity: 'info'|'warning'|'error'; code: string; message: string; raw?: string; }
export interface ImportResult {
  format: FormatId; confidence: number;
  points: Point[]; stations: Station[]; observations: Observation[];
  levelRuns: LevelRun[]; gnss: GnssEpoch[];
  meta: Record<string, unknown>; diagnostics: Diagnostic[];
}
export interface FormatPlugin {
  id: FormatId;                                  // 'leica-gsi' | 'dini-m5' | 'dini-rec500' | 'sdr33' | 'gts7' | 'nikon-raw' | 'jobxml' | 'landxml' | 'nmea' | 'csv'
  extensions: string[];
  sniff(sample: string[], ctx: ImportContext): number;   // 0..1, usando las primeras ~200 líneas
  parse(lines: string[], ctx: ImportContext): ImportResult;
}
```

### 9.3 Reglas de *sniffing* (puntaje 0..1)

```ts
const sniffers: Record<FormatId, (ls: string[]) => number> = {
  'leica-gsi':  ls => ratio(ls, l => /^\*?\d{2}[0-9.]{4}[+-][0-9A-Za-z?.]{8,16}(\s|$)/.test(l)),
  'dini-m5':    ls => ratio(ls, l => /^For (M5|R5|R4)\|Adr/.test(l)),
  'dini-rec500':ls => ratio(ls, l => /\b(R[bfz]|L[rvz])\s+-?\d+\.\d+\s+(HD|E)\s+\d/.test(l) || /\bZ\s+-?\d+\.\d+\s*$/.test(l) || /Start-Line|End-Line/.test(l)),
  'sdr33':      ls => (/^00NM/.test(ls[0]) ? 0.6 : 0) + 0.4 * ratio(ls, l => /^\d{2}[A-Z0-9]{2}/.test(l)),
  'gts7':       ls => ratio(ls, l => /^(JOB|INST|UNITS|STN|XYZ|BKB|BS|FS|SS|SD|HD|HV|PT|NEZ)\s{2,}\S/.test(l)),
  'nikon-raw':  ls => (/^CO,Nikon RAW/i.test(ls[0]) ? 1 : ratio(ls, l => /^(CO|ST|SS|F1|F2|BS|SO|MP|UP|CC|RE|MC),/.test(l))),
  'nmea':       ls => ratio(ls, l => /^\$[A-Z]{2}[A-Z]{3},.*\*[0-9A-F]{2}$/.test(l)),
  'jobxml':     ls => (ls.slice(0, 5).join('').includes('<JOBFile') ? 1 : 0),
  'landxml':    ls => (ls.slice(0, 10).join('').includes('<LandXML') ? 1 : 0),
  'csv':        ls => csvScore(ls),          // consistencia de nº de columnas + % numérico
};
// ratio = fracción de líneas no vacías que cumplen; elegir el máximo; si max < 0.6 o (1.º − 2.º) < 0.15 → preguntar.
```
Orden de desempate: XML (firma exacta) > M5 > GSI > NMEA > SDR33 > Nikon > GTS-7 > REC 500 > CSV.

### 9.4 Flujo

```
bytes ──decode──▶ texto ──normalize──▶ líneas
   └─▶ sniff(todos) ──▶ ranking ──▶ [confianza alta] parse ──▶ ImportResult
                                 └─▶ [ambigua] UI: vista previa + elegir formato/perfil CSV/unidades
ImportResult ──validar (dominio)──▶ diagnósticos (cierres, duplicados, saltos de dirección M5, checksum NMEA)
            ──▶ mapear a proyecto (puntos, estaciones, nivelaciones) ──▶ UI de revisión con líneas originales
```

### 9.5 Validaciones de dominio recomendadas

- Puntos duplicados con coordenadas distintas (> tolerancia) → warning, no sobrescribir sin confirmación.
- GSI: palabras con signo inválido, longitud ≠ 16/24, WI desconocido (guardar en `meta.unknownWords`), saltos de nº de bloque.
- Niveles: cota calculada vs. cota del equipo (> 0,1 mm), lecturas fuera de 0–5 m (miras de 3/4/5 m), distancias > 100 m,
  bloques `Measurement repeated`, líneas sin `End-Line`.
- NMEA: checksum, Q < 4 en levantamientos RTK, saltos de tiempo, σH (GST) fuera de tolerancia.
- CSV: filas con nº de columnas distinto (reportar), números con coma decimal, campos vacíos.

### 9.6 Estructura de carpetas sugerida

```
src/io/import/
  index.ts            // registry + detect() + importFile()
  decode.ts           // BOM, cp1252, normalización
  formats/leica-gsi.ts, dini.ts, sdr33.ts, gts7.ts, nikon-raw.ts, jobxml.ts, landxml.ts, nmea.ts, csv.ts
  model.ts            // Point, Station, Observation, LevelRun, GnssEpoch
src/io/export/  dxf-r12.ts, kml.ts, landxml.ts, xlsx.ts, csv.ts
tests/fixtures/       // los bloques "fixture:" de este documento
tests/io/*.test.ts    // golden tests: parse(fixture) → snapshot + asserts de la tabla de esperados
```
Tests de propiedad: `export → import` (round-trip) para CSV, LandXML y DXF debe reproducir puntos con error < 0,0005 m.

---

## 10. Fuentes

- Leica Geosystems, *GSI ONLINE for Leica TPS and DNA* (2008): <http://uksurveyingequipment.com/pdf/leica-flexline-gsi-manual.pdf>
- Leica Geosystems, *GSI ONLINE for Leica TPS and DNA* (2002): <https://www.usatfne.org/officials/electronic/manuals/leica/leica-dna-tps-online-guide.pdf>
- Total Open Station – Leica GSI: <https://totalopenstation.readthedocs.io/en/stable/input_formats/if_leica_gsi.html> y repo con muestras <https://github.com/totalopenstation/totalopenstation> (`sample_data/`)
- Leica LS10/LS15 User Manual (exportación GSI): <https://www.manualslib.com/manual/1363644/Leica-Ls10.html?page=79>, <https://manualzz.com/doc/30348897/leica-ls10-ls15>
- Leica Format Manager (FlexLine): <http://geotop.com.pe/descargas/estacion_total/estacion_total_windows/flexline/manual_Format_manager_leica_geotop.pdf>
- Trimble DiNi 12/12T/22 User Guide: <https://produkter.geoteam.dk/Manualer/Trimble%20DiNi/Trimble%20DiNi%2012%2012T%2022%20User%20Guide%20571703071%20ver0400%20ENG.pdf>, copia <https://studylib.es/doc/8962709/trimble-dini-12-12t-22-user-guide-571703071-ver0400-eng>
- STAR*DINI Conversion Utility (ejemplos M5 y REC 500): <https://www.mdt.mt.gov/other/webdata/external/ESDC/library/stardini.pdf>
- Foro JAG3D – nivelación con Trimble DiNi (M5 en alemán): <https://software.applied-geodesy.org/forum/?id=13775&mode=thread>
- Sokkia SDR33 – Total Open Station: <https://totalopenstation.readthedocs.io/en/latest/input_formats/if_sokkia_sdr33.html>, <https://tops.iosa.it/2014/03/08/sdr33-format.html>
- MicroSurvey/Mimaka – SDR33 Field Data: <https://www.mimaka.com/help/gs/html/008_SDR33%20Field%20Data.htm>
- Sokkia SDL30/SDL50 Operator's Manual: <https://eu.sokkia.com/sites/default/files/sc_files/downloads/sdl30-50_operators_manual_-_13th_ed.pdf>; SDR Level 5 Reference: <https://eu.sokkia.com/sites/default/files/sc_files/downloads/750-1-0073_rev_1_sdr_level_5_ref.pdf>
- Topcon DL-502 Instruction Manual (Data Output): <https://www.manualslib.com/manual/996602/Topcon-Dl-502.html?page=55>
- Topcon DL-101C/102C: <https://www.ngs.noaa.gov/pub/corbin/Training/Leveling/precise-leveling-workshop/Equipment/Topcon/Topcon%20DL-101_102%20Brochure.pdf>
- South NTS-350 data converter (formato `.dat`): <https://github.com/thanosa/south-total-station-data-converter>
- Nikon RAW v2.00 – Total Open Station: <https://totalopenstation.readthedocs.io/en/stable/input_formats/if_nikon_raw_v200.html>
- Trimble JobXML schema 5.61: <https://ww2.trimble.com/schema/JobXML/5_6/JobXMLSchema-5.61.xsd>; FME JobXML reader: <https://docs.safe.com/fme/2017.0/html/FME_Desktop_Documentation/FME_ReadersWriters/jobxml/jobxml.htm>; Trimble Access custom export: <https://help.fieldsystems.trimble.com/trimble-access/latest/en/job-custom-export.htm>
- Civil 3D PNEZD (foros Autodesk): <https://forums.autodesk.com/t5/civil-3d-forum/pnezd-file-import-issue/td-p/3423663>, <https://forums.autodesk.com/t5/civil-3d-forum/cant-import-penzd-points-from-a-csv-file/td-p/9552834>; NRCS: <https://www.nrcs.usda.gov/sites/default/files/2023-03/300_Points.pdf>
- NMEA 0183 (gpsd): <https://gpsd.gitlab.io/gpsd/NMEA.html>; NovAtel GPGGA/GPGST: <https://docs.novatel.com/OEM7/Content/Logs/GPGGA.htm>, <https://docs.novatel.com/OEM7/Content/Logs/GPGST.htm>
- Autodesk DXF Reference: <https://help.autodesk.com/view/OARX/2024/ENU/?guid=GUID-235B22E0-A567-4CF6-92D3-38A2306D73F3>; ezdxf: <https://ezdxf.readthedocs.io/en/stable/dxfinternals/filestructure.html>
- KML Reference (Google): <https://developers.google.com/kml/documentation/kmlreference>
- LandXML 1.2: <http://www.landxml.org/schema/LandXML-1.2/LandXML-1.2.xsd>
- SheetJS: <https://docs.sheetjs.com>; ExcelJS: <https://github.com/exceljs/exceljs>
