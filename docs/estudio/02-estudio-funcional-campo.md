# 02 — Estudio funcional: el trabajo del topógrafo en campo y gabinete

> **Propósito.** Definir, desde la práctica real de un ingeniero topógrafo en obra (énfasis en Perú: carreteras, saneamiento, edificaciones, habilitaciones urbanas), qué cálculos, controles y entregables debe soportar una app Android de topografía. Cada fórmula está escrita de forma que pueda implementarse directamente y cada tolerancia indica su fuente.
>
> **Convenciones.** Distancias en metros salvo indicación; `K` = longitud del circuito o sección de nivelación en **kilómetros**; ángulos sexagesimales salvo indicación; azimut medido desde el Norte en sentido horario (0°–360°); `ΔN` = latitud (proyección Norte), `ΔE` = longitud/desplazamiento (proyección Este).

---

## Índice

1. [Tareas típicas de campo](#1-tareas-típicas-de-campo)
2. [Nivelación en detalle](#2-nivelación-en-detalle)
3. [Cálculos COGO](#3-cálculos-cogo)
4. [Informes que se entregan a supervisión/residencia (Perú)](#4-informes-que-se-entregan-a-supervisiónresidencia-perú)
5. [Lista priorizada de funciones (MUST/SHOULD/COULD)](#5-lista-priorizada-de-funciones-mustshouldcould)
6. [Tabla resumen de tolerancias](#6-tabla-resumen-de-tolerancias)
7. [Fuentes](#7-fuentes)

---

## 1. Tareas típicas de campo

### 1.0 Mapa de actividades (campo vs. gabinete)

| Etapa | Campo | Gabinete | Equipo típico |
|---|---|---|---|
| Control geodésico | Puntos GNSS estáticos, monumentación de hitos, BMs | Post-proceso, ajuste, cuadro de coordenadas | GNSS doble frecuencia |
| Control vertical | Nivelación geométrica de BMs (ida y vuelta) | Libreta, cierre, compensación, cuadro de BMs | Nivel automático/digital, mira |
| Poligonal de apoyo | Medición de ángulos y distancias | Cierre angular y lineal, compensación | Estación total |
| Levantamiento | Radiación de detalles, secciones | Coordenadas, MDT/TIN, curvas, perfiles | Estación total, GNSS RTK |
| Replanteo | Estacado de ejes, curvas, taludes, cotas | Planilla de replanteo, cálculo de cortes/rellenos | Estación total, nivel, GNSS RTK |
| Control de obra | Nivelación de capas, losas, tuberías | Protocolos, informes de control | Nivel, estación total |
| Metrados | Secciones antes/después | Áreas, volúmenes, cuadros de metrados | — |

### 1.1 Nivelación geométrica (diferencial)

Principio: con el instrumento horizontal, el desnivel entre A (atrás) y B (adelante) es

```
Δh_AB = L_atrás − L_adelante        (V.Atrás − V.Adelante)
Cota_B = Cota_A + Δh_AB
```

| Tipo | Descripción | Comprobación |
|---|---|---|
| **Simple** | Una sola puesta de instrumento; se leen atrás e intermedias. Válida si todos los puntos son visibles y a ≤ distancia máxima de visual. | Ninguna intrínseca (se recomienda doble altura de instrumento). |
| **Compuesta** | Sucesión de simples enlazadas por **puntos de cambio (PC/TP)**. | Σ VA − Σ VAd = Cota final − Cota inicial. |
| **Cerrada** | Parte y termina en el mismo BM (circuito) o en otro BM de cota conocida. | Error de cierre `e = Cota_calc − Cota_conocida` ≤ tolerancia. |
| **Ida y vuelta (doble)** | Se nivela A→B y luego B→A por puntos de cambio distintos. | `e = Δh_ida + Δh_vuelta` ≤ tolerancia; Δh adoptado = promedio de |Δh_ida| y |Δh_vuelta| con signo de ida. IGN la exige como "compuesta doble cerrada" para NAP y NP. |
| **Recíproca** | Cruce de obstáculos (ríos, quebradas) donde no se puede equilibrar distancias; se observa desde cerca de A y desde cerca de B. | Elimina colimación, curvatura y refracción (ver 2.8). |

### 1.2 Nivelación trigonométrica

Con estación total (ángulo vertical α de elevación, o cenital Z = 90° − α):

```
Δh_AB = D_i·sen(α) + hi − hm + (1 − k)·(D_i·cos α)² / (2R)          (forma IGN Perú)
Δh_AB = D_i·cos(Z) + hi − hm + (1 − k)·D_h² / (2R)                  (equivalente con cenital)
D_h   = D_i·sen(Z) = D_i·cos(α)
```

- `D_i` distancia inclinada; `hi` altura de instrumento; `hm` altura de prisma/jalón.
- `R` radio terrestre (IGN cita 6 378 137 m en el ecuador; 6 371 000 m como radio medio es práctica habitual).
- `k` coeficiente de refracción: **IGN Perú usa k = 0,16**; la literatura clásica usa k ≈ 0,13–0,14 (refracción ≈ 1/7 de la curvatura).
- La **nivelación trigonométrica por estaciones recíprocas** promedia ambos sentidos: `Δh_AB = (Δh_AB(directo) − Δh_BA(inverso)) / 2`, eliminando la corrección (1−k)D²/2R.
- Tolerancia IGN Perú para nivelación ordinaria trigonométrica (estaciones recíprocas compuesta): **T = 7,0 mm·√K**, distancias ≤ 1 000 m, distanciómetro 1 mm + 1,5 ppm.

### 1.3 Levantamiento por radiación (taquimetría con estación total)

Desde una estación E (N_E, E_E, Z_E) orientada a un punto de referencia (azimut conocido `Az_ref`):

```
Az_P   = Az_ref + (Hz_P − Hz_ref)        (normalizar a [0°, 360°))
D_h    = D_i · sen(Z)
ΔZ     = D_i · cos(Z) + hi − hm   (+ corrección c+r si D_h > ~300 m)
N_P    = N_E + D_h · cos(Az_P)
E_P    = E_E + D_h · sen(Az_P)
Cota_P = Z_E + ΔZ
```

Con taquímetro óptico (estadia), ver 2.4.

Datos de campo por punto: código/descripción (BZ, EJE, BORDE, PISTA, VEREDA, POSTE, BUZON, etc.), Hz, Z, D_i, hm, observación. La app debe soportar **códigos de campo con conexión de líneas** para dibujo automático.

### 1.4 Poligonales

**Tipos**: abierta (sin control → no recomendable), cerrada en sí misma (anillo), y encuadrada/enlazada (parte de dos puntos conocidos y llega a otros dos conocidos).

#### 1.4.1 Cierre angular

```
Poligonal cerrada, ángulos internos:   Σα_teórica = 180°·(n − 2)
Poligonal cerrada, ángulos externos:   Σα_teórica = 180°·(n + 2)
Poligonal enlazada (azimuts):          Az_final_calc = Az_inicial + Σα − m·180°  (m entero que normaliza)
e_α = Σα_medida − Σα_teórica
Tolerancia angular típica:             T_α = a·√n     (n = número de vértices/estaciones)
Corrección por vértice (iguales pesos): c_α = −e_α / n
```

Valores de `a` (precisión angular por estación):

| Norma / uso | T_α |
|---|---|
| FGCC 1984 – 3er orden clase I | 10″·√N |
| FGCC 1984 – 3er orden clase II | 12″·√N |
| Práctica de obra con estación total de 5″ | ≈ 5″·√n a 10″·√n |
| Práctica con teodolito de 20″/1′ (topografía general) | 20″·√n a 1′·√n |

#### 1.4.2 Proyecciones, cierre lineal y precisión relativa

```
ΔN_i = L_i · cos(Az_i)          ΔE_i = L_i · sen(Az_i)
e_N  = ΣΔN − (N_final − N_inicial)      (en poligonal cerrada: ΣΔN)
e_E  = ΣΔE − (E_final − E_inicial)
e_L  = √(e_N² + e_E²)                    (error de cierre lineal)
Az_error = atan2(e_E, e_N)
Precisión relativa = 1 / N,   N = P / e_L,   P = ΣL_i  (perímetro)
```

| Uso | Precisión relativa mínima | Fuente |
|---|---|---|
| Georreferenciación (carreteras) | 1:100 000 | MTC EG-2013, Tabla 102-01 |
| Puntos de control (carreteras) | 1:10 000 | MTC EG-2013, Tabla 102-01 |
| Puntos del eje (PC, PT, puntos en curva, referencias) | 1:5 000 | MTC EG-2013, Tabla 102-01 |
| FGCC 3er orden clase I / II | 1:10 000 / 1:5 000 | FGCC 1984 |
| Levantamientos catastrales/linderos (práctica común) | ≥ 1:5 000 | Práctica |

#### 1.4.3 Compensación

**Regla de la brújula (Bowditch)** — errores angulares y lineales de precisión comparable (caso típico con estación total):

```
C_N,i = −e_N · (L_i / P)
C_E,i = −e_E · (L_i / P)
```

**Regla del tránsito** — ángulos más precisos que distancias:

```
C_N,i = −e_N · |ΔN_i| / Σ|ΔN|
C_E,i = −e_E · |ΔE_i| / Σ|ΔE|
```

**Mínimos cuadrados** (COULD): ajuste riguroso con pesos `p = 1/σ²`, recomendado para redes con redundancia.

Coordenadas compensadas: `N_{i+1} = N_i + ΔN_i + C_N,i` ; `E_{i+1} = E_i + ΔE_i + C_E,i`.

**Ejemplo verificado** (cuadrilátero, perímetro P = 360,015 m):
ΣΔN = +0,0337 m, ΣΔE = −0,0069 m → e_L = 0,0344 m → **1 / 10 459** (cumple 1:10 000 de puntos de control EG-2013). Corrección Bowditch del lado de 100,010 m: C_N = −0,0094 m, C_E = +0,0019 m.

### 1.5 Replanteo

#### 1.5.1 Estacado de ejes
- Desde estación con coordenadas conocidas, para cada punto de diseño P: calcular **inverso** (Az, D_h) estación→P; ángulo a girar `Hz = Az_P − Az_ref + Hz_ref`.
- Densidad (MTC EG-2013, 102.03): puntos del eje **cada 20 m en tangente y cada 10 m en curva**, además de obras de arte; secciones transversales cada 20 m en tangente, 10 m en curva y adicionales cada 5 m en quiebres.
- Progresivas: formato `km+mmm.mm` (p.ej. `12+340.00`). Hito/tablilla de progresiva cada 500 m.
- Replanteo por **offset** (desplazamiento lateral `d` respecto al eje con azimut tangente `Az_t`):
  ```
  N_off = N_eje + d·cos(Az_t ± 90°)       (+90° derecha, −90° izquierda)
  E_off = E_eje + d·sen(Az_t ± 90°)
  ```
- Reporte "**stake-out**": diferencias medido − diseño en ΔN, ΔE, ΔZ y en coordenadas locales (avance/retroceso, izquierda/derecha, corte/relleno).

#### 1.5.2 Curvas horizontales circulares simples

Datos: PI (vértice), Δ (ángulo de deflexión), R (radio).

```
T  = R · tan(Δ/2)                    tangente (PC–PI = PI–PT)
Lc = π · R · Δ / 180                  longitud de curva (Δ en grados)
C  = 2R · sen(Δ/2)                    cuerda larga
E  = R · (sec(Δ/2) − 1)               externa
M  = R · (1 − cos(Δ/2))               ordenada media (flecha)
G  = 2 · asen(c / (2R))               grado de curva para cuerda c (p.ej. c = 10 m o 20 m)
Prog_PC = Prog_PI − T
Prog_PT = Prog_PC + Lc
```

Replanteo por **deflexiones** desde PC (cuerdas parciales):

```
δ_i = (l_i · 90) / (π · R)  [grados]    deflexión para arco l_i
δ_acum,i = Σ δ                           (al PT: δ_acum = Δ/2)
c_i = 2R · sen(δ_i)                      cuerda para el arco l_i
```

Primera cuerda: desde PC hasta la primera progresiva redonda (sub-cuerda); última: desde la última progresiva redonda al PT.

Replanteo por **coordenadas** (preferido con estación total):

```
Az_PC→PI = Az_t1
Centro O: N_O = N_PC + R·cos(Az_t1 ± 90°), E_O = E_PC + R·sen(Az_t1 ± 90°)   (+ curva a la derecha)
Punto a arco l: θ = l/R (rad); Az_O→P = Az_O→PC ∓ θ ... (signo según sentido)
```

Otros: curvas de transición (clotoide `A² = R·L`), curvas verticales parabólicas (`y = (g2 − g1)·x² / (2L)`, `PIV`, `PCV = PIV − L/2`), peralte y sobreancho (COULD/SHOULD; ver 5).

#### 1.5.3 Cotas de corte/relleno y estacas de talud

```
h = Cota_terreno − Cota_proyecto
h > 0  → CORTE  (C)        h < 0 → RELLENO (R)
```

En la estaca se escribe `C 1.25` / `R 0.80` y la progresiva/offset. Para estacas de talud (chaflán), por iteración en el terreno:

```
Distancia al eje del borde del talud:
  x = b/2 + s·|h_borde|        b = ancho de plataforma (incl. cuneta en corte), s = talud H:V (p.ej. 1:1, 1.5:1)
Iterar: medir terreno en x, recalcular h_borde, hasta |x_medido − x_calculado| < tolerancia (EG-2013: ±50 mm horizontal, ±100 mm vertical)
```

#### 1.5.4 Plantillas (secciones típicas)

La app debe permitir definir una **sección típica** parametrizada: ancho de calzada, bombeo (%), bermas, cunetas, taludes de corte y relleno por tipo de material, espesores de capas (subrasante, subbase, base, carpeta). A partir del eje (alineamiento horizontal + rasante) calcula la cota de diseño de cualquier punto (progresiva, offset) de cada capa:

```
Cota_capa(prog, off) = Rasante(prog) − e_acumulado(capa) − |off|·bombeo   (sección con bombeo a dos aguas)
Cota_capa(prog, off) = Rasante(prog) + off·peralte                         (en curva, con signo)
```

### 1.6 Control de obra

| Elemento | Qué se controla | Tolerancia de cota | Fuente |
|---|---|---|---|
| Subrasante (corte y terraplén) | Cota de cualquier punto | ±10 mm (1 cm) | EG-2013, 202 y 205 |
| Subbase granular | Cota de cualquier punto | ±10 mm | EG-2013, 402 |
| Base granular | Cota | ±10 mm | EG-2013, 403 |
| Base de concreto hidráulico (curada) | Cota | ±10 mm | EG-2013, 403.A/403.C |
| Carpeta asfáltica en caliente (base o rodadura) | Cota | ±5 mm | EG-2013, 423 |
| Pavimento de concreto hidráulico | Cota | ±5 mm | EG-2013, 438 |
| Placas y veredas (concreto estructural) | Cota superior | −10 mm a +10 mm | EG-2013, 503 |
| Estacas de subrasante / rasante | Vertical / horizontal | ±10 mm / ±50 mm | EG-2013, Tabla 102-01 |
| Alcantarillas, cunetas, estructuras menores | Vertical / horizontal | ±20 mm / ±50 mm | EG-2013, Tabla 102-01 |
| Muros de contención | Vertical / horizontal | ±10 mm / ±20 mm | EG-2013, Tabla 102-01 |

Procedimiento de **control de niveles por capa** (protocolo):
1. Nivelar desde BM de obra (cota conocida, comprobada).
2. Para cada progresiva (cada 10 o 20 m) leer eje, bordes izquierdo/derecho y puntos intermedios (p.ej. a ±1,80 m, ±3,60 m).
3. Calcular `Cota_campo = HI − lectura`; `Cota_diseño` desde plantilla/rasante; `Dif = Cota_campo − Cota_diseño`.
4. Marcar **CONFORME** si `|Dif| ≤ tolerancia de la capa`; si no, "NO CONFORME → perfilar/rellenar".
5. Espesor de capa: `e = Cota_capa_superior − Cota_capa_inferior` en el mismo punto (requiere guardar la nivelación de la capa anterior).

**Sardineles y veredas**: control de cota superior y alineamiento; pendiente transversal de vereda (típica 1–2 % hacia la pista); altura de sardinel respecto a la rasante de pista (`h_sard = Cota_sard − Cota_borde_pista`, usualmente 0,15–0,20 m por diseño).

**Alcantarillado (pendientes de tuberías)**:

```
S (m/m) = (Cota_fondo_inicial − Cota_fondo_final) / L_horizontal
S (‰)   = S·1000
Cota_fondo(x) = Cota_fondo_buzón_aguas_arriba − S·x
Profundidad de buzón = Cota_tapa − Cota_fondo
Lectura de mira esperada en la clave/fondo (láser o nivel): L_esp = HI − Cota_fondo(x)
```

- RNE **OS.070** (Perú): pendiente mínima por **tensión tractiva media ≥ 1,0 Pa** (n = 0,013): `S_0min = 0,0055 · Q_i^(−0,47)` (S en m/m, Q_i caudal inicial en L/s). La app debe alertar si la pendiente replanteada < S_0min de diseño o si la contrapendiente es negativa.
- Control: cota de fondo en cada buzón y a lo largo del tramo (cada 5–10 m), "cota de fondo de zanja = cota fondo tubería − cama de apoyo".

### 1.7 Áreas y volúmenes

**Área por coordenadas (Gauss / fórmula del lazo)**:

```
A = ½ · | Σ_{i=1..n} (E_i · N_{i+1} − E_{i+1} · N_i) |      (índices cíclicos: n+1 → 1)
```

Áreas de sección transversal: misma fórmula con (offset, cota) separando polígonos de corte (terreno sobre plantilla) y relleno (plantilla sobre terreno) mediante intersección de las dos polilíneas.

**Volúmenes entre secciones**:

```
Áreas medias (promedio de áreas extremas):  V = L · (A1 + A2) / 2
Prismoidal (Simpson):                       V = L · (A1 + 4·Am + A2) / 6     (Am = área de la sección media, no el promedio)
Corrección prismoidal (secciones de tres niveles): Cp = (L/12)·(c1 − c2)·(w1 − w2)     V_prism = V_áreas medias − Cp
Sección mixta (paso de corte a relleno) – pirámide: V = A·L/3
Simpson para N secciones equidistantes (N impar): V = (d/3)·[A1 + 4(A2 + A4 + …) + 2(A3 + A5 + …) + An]
```

**Volúmenes por superficies (TIN)**: superficie de terreno (TIN1) vs. superficie de diseño o de otra fecha (TIN2). Para cada prisma triangular de la superficie diferencia: `V = A_tri_plana · (h1 + h2 + h3)/3` (h = diferencia de cotas en cada vértice). Corte = Σ volúmenes con h > 0, relleno = Σ con h < 0 (los triángulos que cruzan la línea de paso se dividen).

**Volumen por cuadrícula (malla)**: `V = (A_celda/4)·(Σh1 + 2Σh2 + 3Σh3 + 4Σh4)` (h_k = alturas de vértices compartidos por k celdas).

Factores (metrados): esponjamiento `Fe = V_suelto / V_banco`; contracción `Fc = V_compactado / V_banco`. Volumen de transporte = V_banco·Fe.

### 1.8 Curvas de nivel

1. Triangulación de Delaunay sobre los puntos levantados (respetando **líneas de quiebre** — bordes de vía, cunetas, crestas de talud).
2. Interpolación lineal sobre cada arista: para una curva de cota `z_c` entre vértices P1(z1) y P2(z2) con `z1 < z_c < z2`:
   ```
   t = (z_c − z1)/(z2 − z1);   P = P1 + t·(P2 − P1)
   ```
3. Enlace de segmentos en polilíneas, suavizado opcional (sin alterar la posición en vértices), rotulado de curvas maestras.
4. Equidistancia típica: 0,25–0,5 m (urbano/obra), 1 m (1:1 000), 2–5 m (1:5 000). Curvas maestras cada 5 intermedias.

### 1.9 Perfiles longitudinales y secciones transversales

- **Perfil longitudinal**: cota de terreno a lo largo del eje por progresiva (intersección del eje con el TIN o nivelación directa del eje cada 20 m), rasante, cotas de corte/relleno, pendientes (%) de cada tramo y curvas verticales. Escala vertical exagerada típicamente 10× la horizontal (p.ej. H 1:1 000, V 1:100).
- **Sección transversal**: perpendicular al eje en cada progresiva; puntos (offset, cota) de terreno, plantilla de diseño superpuesta, áreas de corte y relleno, estacas de talud. Extensión suficiente para que entren los taludes (EG-2013 102.03 d).

---

## 2. Nivelación en detalle

### 2.1 Método de altura de instrumento (cota instrumental)

```
HI (altura/cota instrumental) = Cota_conocida + V.Atrás
Cota_punto = HI − V.Intermedia   (o − V.Adelante en un punto de cambio)
En cada punto de cambio: nuevo HI = Cota_PC + nueva V.Atrás
```

**Comprobación aritmética** (solo verifica los puntos de cambio, no las intermedias):

```
Σ V.Atrás − Σ V.Adelante = Cota_final − Cota_inicial
```

Comprobación completa opcional incluyendo intermedias: `Σ(HI_j · n_j) − Σ(V.Int + V.Ad) = Σ Cotas (excluida la primera)`, donde n_j = nº de puntos leídos desde la estación j.

### 2.2 Método de ascensos y descensos (rise & fall)

Para cada par de lecturas consecutivas dentro de una misma estación:

```
d = Lectura_anterior − Lectura_actual
d > 0 → ASCENSO (S) = d          d < 0 → DESCENSO (B) = |d|
Cota_actual = Cota_anterior + S − B
```

**Triple comprobación aritmética** (verifica también las intermedias):

```
Σ V.Atrás − Σ V.Adelante = Σ Ascensos − Σ Descensos = Cota_final − Cota_inicial
```

**Ejemplo verificado** (circuito cerrado sobre BM-1 = 100,000 m):

| Pto | V.Atrás | V.Int | V.Adel | HI | S | B | Cota |
|---|---|---|---|---|---|---|---|
| BM-1 | 1,525 | | | 101,525 | | | 100,000 |
| A | | 1,830 | | | | 0,305 | 99,695 |
| PC-1 | 2,104 | | 0,985 | 102,644 | 0,845 | | 100,540 |
| B | | 1,640 | | | 0,464 | | 101,004 |
| PC-2 | 0,875 | | 1,762 | 101,757 | | 0,122 | 100,882 |
| BM-1 | | | 1,760 | | | 0,885 | 99,997 |
| **Σ** | **4,504** | | **4,507** | | **1,309** | **1,312** | |

ΣVA − ΣVAd = −0,003 = ΣS − ΣB = −0,003 = 99,997 − 100,000 ✔. Error de cierre e = −3 mm. Si K = 0,36 km → tolerancia 3er orden FGCS = 12·√0,36 = 7,2 mm ✔.

### 2.3 Error de cierre, tolerancias y órdenes

```
e = Cota_llegada_calculada − Cota_llegada_conocida
(circuito: e = Σ VA − Σ VAd)
(ida y vuelta: e = Δh_ida + Δh_vuelta)
Tolerancia: T = m · √K   (mm, K en km)       Aceptar si |e| ≤ T; si no, repetir.
```

Cuando las distancias no se conocen (terreno muy quebrado, visuales cortas), se usa `T = m′·√n` con n = número de estaciones (práctica de obra; p.ej. m′ ≈ 2–3 mm por estación en nivelación de obra).

#### Tolerancias de cierre por norma

| Norma | Orden / clase | T (mm) | Notas |
|---|---|---|---|
| **IGN Perú** NTG Levantamientos Geodésicos Verticales V1.0 (2016) | Nivelación de Alta Precisión (NAP) | **1,5·√K** | Visuales ≤ 50 m; balance general ≤ 2 m; nivel digital 0,1 mm; mira invar; doble cerrada; ≥ 3 lecturas (método EFFE); visual ≥ 0,5 m sobre el terreno; jornadas ≤ 4 h continuas |
| IGN Perú | Nivelación de Precisión (NP) | **2,5·√K** | Visuales ≤ 100 m; balance general ≤ 3 m; doble cerrada; ≥ 3 lecturas (EF) |
| IGN Perú | Nivelación Ordinaria (NO) trigonométrica | **7,0·√K** | Estaciones recíprocas compuesta; distancias ≤ 1 000 m; k = 0,16 |
| **FGCS / FGCC (EE.UU.)** | 1er orden clase I | 4·√K | |
| FGCS | 1er orden clase II | 5·√K | |
| FGCS | 2do orden clase I | 6·√K | |
| FGCS | 2do orden clase II | 8·√K | |
| FGCS | 3er orden | 12·√K | Estándar de facto en obra civil para BMs de proyecto |
| WSDOT (manual de carreteras) | 2do orden / 3er orden | 8·√K / 12·√K | Desbalance por estación ≤ 5 m (2º) / 10 m (3º); acumulado ≤ 10 m; visuales ≤ 70 m (2º) / 90 m (3º) |
| MTC EG-2013 (control vertical de obra) | Georreferenciación y puntos de control | ±5 mm | Tabla 102-01 (tolerancia absoluta) |
| Práctica de obra / topografía general | Nivelación ordinaria | 20·√K a 24·√K | Muy usada en Perú para nivelación "topográfica" de obra; no normativa nacional — configurable |

> **Decisión para la app:** las tolerancias deben ser **perfiles configurables** (`m` y tipo `√K` o `√n`), precargados con: IGN-NAP 1,5; IGN-NP 2,5; IGN-NO 7,0; FGCS 4/5/6/8/12; EG-2013; "Obra ordinaria" 20. El perfil por defecto sugerido para BMs de obra: **12 mm·√K**.

### 2.4 Nivelación por tres hilos (taquimétrica/estadimétrica)

Lecturas: hilo superior `hs`, medio `hm`, inferior `hi`.

```
Comprobación hilo medio:  | hm − (hs + hi)/2 | ≤ 1 mm   (típico 1–2 mm; si falla, releer)
Intervalo estadimétrico:  s = hs − hi
Distancia horizontal (visual horizontal, nivel): D = K·s + C = 100·(hs − hi)     (K = 100, C = 0 en anteojos analácticos/modernos)
Con visual inclinada (taquímetro, α elevación): D_h = 100·s·cos²α ;  V = 50·s·sen(2α) = 100·s·senα·cosα
Con ángulo cenital Z:                           D_h = 100·s·sen²Z ;  V = 50·s·sen(2Z) = 100·s·senZ·cosZ
Cota_P = Cota_E + hi_instr + V − hm
```

Comprobación de intervalos (WSDOT, 3 hilos): diferencia entre intervalo superior (hs−hm) e inferior (hm−hi) ≤ 0,20 unidades de mira (2º orden) / 0,30 (3º orden).

Usos de la distancia: balanceo atrás/adelante y cálculo de K para la tolerancia y la compensación.

### 2.5 Balanceo de distancias atrás/adelante

Igualar `D_atrás ≈ D_adelante` en cada estación anula el error de colimación residual y la curvatura/refracción.

```
Desbalance por estación:       δ_j = D_atrás,j − D_adelante,j
Desbalance acumulado (sección): Δ = Σ δ_j
Error de colimación inducido:   ε_col = c · Δ        (c en mm/m o rad)
```

| Norma | Máx. visual | Desbalance por estación | Desbalance acumulado |
|---|---|---|---|
| IGN NAP | 50 m | — (iguales) | ≤ 2 m |
| IGN NP | 100 m | — (iguales) | ≤ 3 m |
| WSDOT 2º orden | 70 m | ≤ 5 m | ≤ 10 m |
| WSDOT 3º orden | 90 m | ≤ 10 m | ≤ 10 m |
| Recomendación práctica | ≤ 60 m | ≈ 2 m | — |

La app debe mostrar **en vivo** el desbalance acumulado y advertir al superar el umbral del perfil.

### 2.6 Prueba de colimación (dos estacas / peg test)

Procedimiento (método de estación central + estación externa):

1. Estacas A y B separadas `L` (p.ej. 50–60 m). Instrumento en el punto medio: leer `a1` (en A) y `b1` (en B). Desnivel verdadero: `Δh_v = a1 − b1` (la colimación se cancela).
2. Instrumento cerca de B (≈ 3–5 m) o fuera del tramo: leer `a2` y `b2`. `Δh_2 = a2 − b2`.
3. Error de colimación:
   ```
   e = Δh_2 − Δh_v = (a2 − b2) − (a1 − b1)          (mm, en la diferencia de distancias)
   c = e / (d_A2 − d_B2)                             (mm/m; d = distancias en la 2ª estación)
   c″ = c[mm/m] · 206,265                            (segundos de arco)
   Lectura correcta en A desde la 2ª estación:  a2_corr = b2 + Δh_v
   ```
4. Tolerancia:
   - **WSDOT**: reajustar si se supera **2 mm en 60 m** (0,007 ft en 200 ft) ≈ 0,033 mm/m ≈ **7″**; prueba **diaria** en 2º y 3º orden.
   - Práctica común (manuales de prácticas): ≤ **1 mm por cada 20 m** (0,05 mm/m ≈ 10″).
   - Niveles digitales (IGN NAP/NP): corrección de colimación automática; registrar el valor.

### 2.7 Compensación de la nivelación

Si `|e| ≤ T`, se reparte la corrección total `C = −e`:

```
Proporcional a la distancia acumulada:  c_i = −e · (D_acum,i / D_total)
Proporcional al número de estaciones:    c_i = −e · (n_i / N)          (n_i = estaciones hasta el punto i)
Cota_compensada_i = Cota_calculada_i + c_i
```

- Las intermedias reciben la corrección del punto de cambio/estación desde el que fueron leídas.
- **Ejemplo 2.2**: e = −3 mm, N = 3 estaciones → PC-1 +1 mm, PC-2 +2 mm, BM-1 +3 mm; A (estación 1) +1 mm, B (estación 2) +2 mm.
- Red de varios circuitos: ajuste por mínimos cuadrados con pesos `p_i = 1/K_i` (COULD).

### 2.8 Corrección por curvatura y refracción; nivelación recíproca

```
Curvatura:                 c_c = D² / (2R)              ≈ 0,0785·K² m   (R = 6 371 km, K en km)
Refracción:                c_r = k · D² / (2R)          ≈ (1/7)·c_c  (k ≈ 0,14)
Combinada:                 c   = (1 − k)·D² / (2R)      ≈ 0,0675·K² m  (k ≈ 0,14)
                                                           → 0,0659·K² m con k = 0,16 (IGN)
La corrección se suma a la lectura de mira calculada (la mira se lee "más alta"): Lectura_corr = Lectura − c
```

Magnitudes: a 100 m, c ≈ 0,7 mm; a 300 m, c ≈ 6 mm; a 1 km, c ≈ 67,5 mm. Con visuales balanceadas el efecto se cancela.

**Nivelación recíproca** (cruce de río): estación 1 cerca de A lee `a1` (A, corta) y `b1` (B, larga); estación 2 cerca de B lee `a2` (A, larga) y `b2` (B, corta).

```
Δh_AB = [(a1 − b1) + (a2 − b2)] / 2
Error combinado (colimación + c&r) en la visual larga: ε = [(a2 − b2) − (a1 − b1)] / 2
```

Las dos estaciones deben hacerse con poca diferencia de tiempo (refracción estable).

---

## 3. Cálculos COGO

### 3.1 Inverso (dos puntos → azimut, rumbo, distancia)

```
ΔN = N2 − N1 ;  ΔE = E2 − E1
D_h = √(ΔN² + ΔE²)
Az  = atan2(ΔE, ΔN)  → si Az < 0: Az += 360°
D_i = √(D_h² + ΔZ²);   pendiente % = 100·ΔZ / D_h
Rumbo (cuadrante):
  0°–90°   : N Az E
  90°–180° : S (180° − Az) E
  180°–270°: S (Az − 180°) W
  270°–360°: N (360° − Az) W
Contra-azimut: Az_inv = Az ± 180°
```

(Nota: `atan2(ΔE, ΔN)` — el orden de argumentos es Este, Norte, por usar azimut desde el Norte.)

### 3.2 Radiación (polar → rectangular) y su inverso

```
N_P = N_E + D_h·cos(Az) ;  E_P = E_E + D_h·sen(Az) ;  Z_P = Z_E + D_i·cos(Z) + hi − hm
Transporte de azimut en poligonal: Az_{i,i+1} = Az_{i−1,i} + α_i ± 180°  (α = ángulo horario medido atrás→adelante; normalizar)
```

### 3.3 Intersecciones

**Azimut–azimut** (desde A con Az_A y desde B con Az_B):

```
d_A = [ (E_B − E_A)·cos(Az_B) − (N_B − N_A)·sen(Az_B) ] / sen(Az_A − Az_B)
P = A + d_A·(sen Az_A, cos Az_A)        (E, N)
Sin solución si sen(Az_A − Az_B) ≈ 0 (rectas paralelas); si d_A < 0 la intersección está "detrás" de A
```

**Distancia–distancia** (círculos con centros A, B y radios r_A, r_B; d = |AB|):

```
a = (r_A² − r_B² + d²) / (2d) ;  h = √(r_A² − a²)   (sin solución si r_A² < a²)
P0 = A + a·(B − A)/d
P1,2 = P0 ± h·( −(N_B − N_A)/d , (E_B − E_A)/d )   (dos soluciones; elegir por lado)
```

**Azimut–distancia**: intersección recta–círculo (resolver la cuadrática; 0, 1 o 2 soluciones).

**Recta–recta por cuatro puntos** (intersección de alineamientos, p.ej. PI de dos tangentes): resolver sistema 2×2.

**Trisección/resección (estación libre)** (SHOULD): Pothenot con 3 puntos o mínimos cuadrados con ≥ 2 puntos con distancias.

**Punto–línea**: estación (progresiva) y desplazamiento (offset) de P respecto de la recta A→B:
```
u = ((P − A)·(B − A)) / |AB| ;   off = ((B − A) × (P − A)) / |AB|   (off > 0 a la izquierda en sentido A→B; definir convención)
```

### 3.4 Conversión de ángulos

```
1 vuelta = 360° = 400 g (gon) = 2π rad
grados  → gon:  g = ° · 10/9          gon → grados: ° = g · 0,9
grados  → rad:  rad = ° · π/180
DMS → decimal:  ° = G + M/60 + S/3600   (signo aplicado a todo el valor)
Decimal → DMS:  G = trunc(°); M = trunc((° − G)·60); S = ((° − G)·60 − M)·60   (redondear S y propagar 60″ → 1′)
1 rad = 206 264,806″ ;  1 mgon = 3,24″ ;  1″ ≈ 4,848 µrad (≈ 0,485 mm a 100 m)
```

### 3.5 UTM ↔ geográficas (WGS84; Perú zonas 17S, 18S, 19S)

Parámetros:

| Parámetro | Valor |
|---|---|
| Elipsoide WGS84 | a = 6 378 137 m ; f = 1/298,257223563 ; e² = f(2 − f) = 0,00669437999 |
| Factor de escala central | k₀ = 0,9996 |
| Falso Este | 500 000 m |
| Falso Norte (hemisferio sur) | 10 000 000 m |
| Meridiano central | λ₀ = −183° + 6°·zona → **17S: −81°**, **18S: −75°**, **19S: −69°** |
| Rango de zonas en Perú | 17S (λ < −78°), 18S (−78° ≤ λ < −72°), 19S (λ ≥ −72°) |
| EPSG | 32717, 32718, 32719 (WGS84/UTM sur) |

Nota: el sistema oficial en Perú es **SIRGAS/REGGEN** (elipsoide GRS80); para topografía la diferencia GRS80–WGS84 es sub-milimétrica en la forma del elipsoide y se trata como equivalente.

**Directa (φ, λ → E, N)** — series de Snyder (USGS PP 1395):

```
e'² = e²/(1 − e²)
N  = a / √(1 − e²·sen²φ)
T  = tan²φ ;  C = e'²·cos²φ ;  A = (λ − λ₀)·cosφ
M  = a·[ (1 − e²/4 − 3e⁴/64 − 5e⁶/256)·φ − (3e²/8 + 3e⁴/32 + 45e⁶/1024)·sen2φ
        + (15e⁴/256 + 45e⁶/1024)·sen4φ − (35e⁶/3072)·sen6φ ]
E = 500000 + k₀·N·[ A + (1 − T + C)·A³/6 + (5 − 18T + T² + 72C − 58e'²)·A⁵/120 ]
N_utm = k₀·{ M + N·tanφ·[ A²/2 + (5 − T + 9C + 4C²)·A⁴/24 + (61 − 58T + T² + 600C − 330e'²)·A⁶/720 ] }
si φ < 0: N_utm += 10 000 000
Factor de escala puntual:
k = k₀·[ 1 + (1 + C)·A²/2 + (5 − 4T + 42C + 13C² − 28e'²)·A⁴/24 + (61 − 148T + 16T²)·A⁶/720 ]
```

**Inversa (E, N → φ, λ)**:

```
x = E − 500000 ;  y = N − 10 000 000 (hemisferio sur)
M  = y / k₀ ;  μ = M / [a·(1 − e²/4 − 3e⁴/64 − 5e⁶/256)]
e₁ = (1 − √(1 − e²)) / (1 + √(1 − e²))
φ₁ = μ + (3e₁/2 − 27e₁³/32)·sen2μ + (21e₁²/16 − 55e₁⁴/32)·sen4μ + (151e₁³/96)·sen6μ + (1097e₁⁴/512)·sen8μ
C₁ = e'²cos²φ₁ ;  T₁ = tan²φ₁ ;  N₁ = a/√(1 − e²sen²φ₁) ;  R₁ = a(1 − e²)/(1 − e²sen²φ₁)^1.5 ;  D = x/(N₁k₀)
φ = φ₁ − (N₁tanφ₁/R₁)·[ D²/2 − (5 + 3T₁ + 10C₁ − 4C₁² − 9e'²)·D⁴/24 + (61 + 90T₁ + 298C₁ + 45T₁² − 252e'² − 3C₁²)·D⁶/720 ]
λ = λ₀ + [ D − (1 + 2T₁ + C₁)·D³/6 + (5 − 2C₁ + 28T₁ − 3C₁² + 8e'² + 24T₁²)·D⁵/120 ] / cosφ₁
```

Precisión de estas series: sub-milimétrica dentro de ±3° del meridiano central; para mayor rigor usar Karney (2011) (implementado en GeographicLib / PROJ).

**Vectores de prueba** (calculados con las fórmulas anteriores; usar como pruebas unitarias):

| Punto | φ, λ (°) | Zona | E (m) | N (m) | k |
|---|---|---|---|---|---|
| Lima (Plaza de Armas aprox.) | −12,046374, −77,042793 | 18S | 277 618,194 | 8 667 490,779 | 1,00021188 |
| Cusco (aprox.) | −13,531950, −71,967463 | 19S | 178 774,655 | 8 502 089,022 | 1,00087664 |
| Piura (aprox.) | −5,194490, −80,632820 | 17S | 540 691,534 | 9 425 825,205 | 0,99962049 |

### 3.6 Factor de escala y distancias (topográfica ↔ UTM)

```
Factor de elevación (reducción al elipsoide):  k_h = R / (R + h)       (h = altura elipsoidal media; R ≈ 6 371 000 m)
Factor combinado:                               FC = k_UTM · k_h
Distancia UTM (cuadrícula) = Distancia horizontal topográfica · FC
Distancia topográfica      = Distancia UTM / FC
Para una línea: k_UTM medio ≈ (k1 + 4·km + k2)/6  (o promedio de extremos en líneas cortas)
```

Ejemplo: en Cusco (k ≈ 1,000877, h ≈ 3 400 m → k_h ≈ 0,999467) → FC ≈ 1,000343 → **34 cm por km**. Por eso en obra se trabaja con **coordenadas topográficas locales** (UTM escaladas por 1/FC respecto de un punto origen) y la app debe ofrecer la conversión UTM ↔ topográfica local con FC por proyecto.

### 3.7 Áreas por coordenadas (Gauss)

```
2A = Σ_{i=1..n} E_i·(N_{i+1} − N_{i−1})        (equivalente a la fórmula del lazo)
Signo: positivo = sentido antihorario (en sistema E-N)
Perímetro = Σ distancias entre vértices consecutivos
Centroide: E_c = (1/6A)·Σ (E_i + E_{i+1})·(E_i·N_{i+1} − E_{i+1}·N_i), análogo para N_c
Unidades: m², ha (= m²/10 000)
```

### 3.8 Pendientes

| Expresión | Fórmula | Ejemplo (ΔZ = 1,5 m en 60 m) |
|---|---|---|
| Porcentaje | `p% = 100·ΔZ / D_h` | 2,50 % |
| Por mil | `p‰ = 1000·ΔZ / D_h` | 25,0 ‰ |
| Grados | `θ = atan(ΔZ / D_h)` | 1,4321° (1°25′56″) |
| Relación 1:n (V:H) | `n = D_h / ΔZ` | 1:40 |
| Talud H:V (z:1) | `z = D_h / ΔZ` | 40:1 |
| Conversión | `p% = 100·tanθ` ; `θ = atan(p%/100)` ; `n = 100/p%` | — |

Atención: en taludes de corte/relleno la convención peruana de planos es **H:V** (p.ej. "talud 1,5:1" = 1,5 horizontal por 1 vertical); en pendientes de tubería se usa **‰** o **m/m**; en vías **%**.

---

## 4. Informes que se entregan a supervisión/residencia (Perú)

Contexto normativo: MTC EG-2013 Sección 102 establece que "los formatos a utilizar serán previamente aprobados por el Supervisor", que "toda la información de campo, su procesamiento y documentos de soporte serán de propiedad de la entidad contratante" y que se organizará en medios electrónicos; los trabajos se inician "solo cuando se cuente con la aprobación escrita de la Supervisión" y todo trabajo fuera de tolerancia "será rechazado". Por eso la app debe **exportar en formatos editables (XLSX/CSV) y PDF firmable**, con encabezado configurable.

### 4.0 Encabezado común (todos los formatos)

| Campo | Ejemplo |
|---|---|
| Entidad / contratante | Municipalidad / Provías / Gobierno Regional |
| Obra (nombre completo), código SNIP/CUI | "Mejoramiento de la vía…" CUI 2xxxxxx |
| Contratista / Supervisión | Razón social |
| Ubicación (distrito, provincia, región) | |
| Tramo / frente / partida | p.ej. 04.02 Base granular e = 0,20 m |
| Fecha, hora, clima | |
| Equipo (marca, modelo, serie) y **certificado de calibración** (n.º, fecha, vigencia) | Nivel Topcon AT-B4 S/N…, cert. n.º… |
| Sistema de coordenadas, datum, zona, BMs de partida | WGS84 / UTM 18S / BM-03 |
| Responsables y firmas | Topógrafo, Ing. Residente (CIP), Ing. Supervisor (CIP) |

### 4.1 Libreta de nivelación

| Columna | Contenido |
|---|---|
| Punto / estación | BM-1, PC-1, Prog 0+020 Eje, etc. |
| Progresiva / descripción | |
| V. Atrás (+) | Lectura en m (3 decimales) |
| Altura instrumental (HI) | (método HI) |
| V. Intermedia | |
| V. Adelante (−) | |
| Ascenso / Descenso | (método rise & fall) |
| Distancia atrás / adelante | (de tres hilos o EDM) y desbalance acumulado |
| Cota calculada | |
| Corrección | por compensación |
| Cota compensada | |
| Observaciones | |
| **Pie**: ΣVA, ΣVAd, ΣS, ΣB, comprobación aritmética, error de cierre, K, tolerancia aplicada (fórmula y norma), CONFORME/NO CONFORME | |

### 4.2 Informe de control topográfico (mensual o por hito)

Estructura típica:
1. Generalidades (objetivo, ubicación, alcance, periodo).
2. Personal y equipos (con certificados de calibración en anexo).
3. Sistema de referencia y puntos de control (cuadro de BMs y puntos geodésicos; ficha de monumentación).
4. Metodología (poligonal, nivelación, replanteo, control por capas).
5. Resultados: cierres de poligonal (angular, lineal, 1/N) y de nivelación (e, T); compensaciones.
6. Control de obra por partida: resumen de protocolos (n.º puntos, % conformes, desviación máx./media).
7. Metrados topográficos del periodo (avance).
8. Conclusiones y recomendaciones.
9. Anexos: libretas, protocolos, planos (planta, perfiles, secciones), panel fotográfico, certificados.

### 4.3 Protocolo de nivelación por capa (control de cotas)

| Campo | Contenido |
|---|---|
| Capa / partida | Subrasante, subbase, base, carpeta, losa, vereda |
| Tramo | Prog. inicial – Prog. final, lado |
| BM utilizado y su cota | |
| Por cada progresiva y punto (Eje, LI, LD, offsets) | Lectura, cota de campo, cota de diseño, diferencia (mm), espesor (si aplica) |
| Tolerancia aplicada | p.ej. ±10 mm (EG-2013 402/403) o ±5 mm (423/438) |
| Resultado por punto | Conforme / No conforme |
| Estadísticos | n.º de puntos, máx., mín., media, desviación estándar, % conformes |
| Firmas | Topógrafo, Residente, Supervisor; fecha de liberación de capa |

### 4.4 Cuadro de BMs (y puntos de control)

| Campo | Contenido |
|---|---|
| Código | BM-01 |
| Descripción / ubicación | "Hito de concreto 0,30×0,30 m con placa de bronce, frente a…" |
| Progresiva y lado | 2+150, LD a 15 m |
| Norte, Este (UTM y/o topográficas) | |
| Cota (msnm) | Ortométrica; origen (BM IGN, GNSS + EGM08) |
| Método de obtención y precisión | Nivelación cerrada 3er orden, e = −3 mm, T = 7,2 mm |
| Fecha de monumentación / última verificación | |
| Croquis / foto | |

### 4.5 Planilla de replanteo

| Campo | Contenido |
|---|---|
| Estación (ocupada) y punto de orientación | E-01 → E-02, Az de referencia |
| Punto / progresiva / offset | 0+120 Eje, 0+120 LI 3,60 |
| Coordenadas de diseño N, E, Cota | |
| Ángulo horizontal y distancia a replantear | |
| Coordenadas medidas (verificación) | |
| ΔN, ΔE, ΔZ / Δ radial | |
| Corte/relleno a marcar en estaca | C 0,85 / R 0,40 |
| Tolerancia (EG-2013 102-01) y estado | |

Para curvas: cuadro de elementos (PI, Δ, R, T, Lc, C, E, M, Prog PC/PT) + tabla de deflexiones (progresiva, arco, cuerda, deflexión parcial y acumulada).

### 4.6 Cuadro de cortes y rellenos (por sección)

| Progresiva | Cota terreno eje | Cota rasante | Altura C/R eje | Área corte (m²) | Área relleno (m²) | Distancia | Vol. corte (m³) | Vol. relleno (m³) | Vol. acumulado corte | Vol. acumulado relleno | Ordenada de masas |
|---|---|---|---|---|---|---|---|---|---|---|---|

Ordenada del **diagrama de masas (curva de Brückner)**: `OM_i = OM_{i−1} + V_corte,i − V_relleno,i·(1/Fc)` (con factor de compensación).

### 4.7 Metrados de movimiento de tierras

| Partida (código de presupuesto) | Descripción | Und. | Método de cálculo | Tramo | Cantidad | Observaciones |
|---|---|---|---|---|---|---|
| 02.01 | Excavación masiva en material suelto | m³ | Áreas medias / TIN | 0+000–1+000 | | |
| 02.02 | Excavación en roca suelta / fija | m³ | Clasificación por % | | | |
| 02.03 | Relleno con material propio / de préstamo | m³ | | | | |
| 02.04 | Perfilado y compactado de subrasante | m² | Ancho × longitud | | | |
| 02.05 | Eliminación de material excedente | m³ | V_excav·Fe − V_reuso | | | |
| 02.06 | Excavación de zanjas (alcantarillado) | m³ | Ancho × profundidad media × L | | | |

Soporte: secciones transversales firmadas "antes" (terreno natural, topografía inicial aprobada) y "después" (as-built), base de las **valorizaciones** mensuales.

---

## 5. Lista priorizada de funciones (MUST/SHOULD/COULD)

### MUST (MVP: sin esto la app no sirve en obra)

| # | Función | Justificación |
|---|---|---|
| M1 | **Libreta de nivelación digital** (métodos HI y ascenso/descenso), PC, intermedias, cálculo en vivo de cotas | Es la tarea más frecuente del topógrafo de obra; elimina errores aritméticos de la libreta de papel. |
| M2 | **Comprobaciones aritméticas automáticas** (ΣVA−ΣVAd = ΣS−ΣB = Cf−Ci) | Requisito de toda libreta presentada a supervisión. |
| M3 | **Error de cierre vs tolerancia configurable** (perfiles IGN 1,5/2,5/7,0; FGCS 4–12; obra 20; `√K` o `√n`) y **compensación** (por distancia o por estaciones) | Decide si se repite el trabajo; la supervisión exige ver fórmula y norma. |
| M4 | **Nivelación por tres hilos**: comprobación de hilo medio, distancia = 100(hs−hi), desbalance atrás/adelante acumulado con alerta | Da K para la tolerancia y controla errores sistemáticos. |
| M5 | **Control de cotas por capa / protocolo**: cota de diseño (manual, por rasante+pendiente o importada) vs cota medida, diferencia y CONFORME/NO CONFORME con tolerancias EG-2013 precargadas (±10 / ±5 mm) | Actividad diaria en pavimentos, losas, veredas; principal entregable de control. |
| M6 | **Pendientes de tuberías y cotas de fondo** (S en ‰ y m/m, cota a distancia x, lectura esperada de mira, profundidad de buzón) | Control de alcantarillado y drenaje; errores aquí son costosos (contrapendientes). |
| M7 | **COGO básico**: inverso (Az, rumbo, distancia, pendiente), radiación polar→rectangular, conversión DMS/decimal/gon/rad | Núcleo de cualquier cálculo de replanteo y gabinete. |
| M8 | **Conversión UTM ↔ geográficas WGS84** zonas 17S/18S/19S con factor de escala | Todos los proyectos en Perú se entregan en UTM WGS84. |
| M9 | **Área por coordenadas (Gauss)** y perímetro | Lotes, habilitaciones, áreas de intervención. |
| M10 | **Conversor de pendientes** (%, ‰, grados, 1:n, H:V) | Uso constante en campo; fuente frecuente de confusión. |
| M11 | **Exportación** de libreta y protocolo a **PDF y XLSX/CSV** con encabezado de obra configurable | EG-2013: formatos aprobados por el Supervisor, información en medios electrónicos. |
| M12 | **Gestión de proyectos, BMs y puntos** (cuadro de BMs) almacenada **offline** | En obra no hay cobertura; los BMs se reutilizan en todos los cálculos. |

### SHOULD (segunda versión: diferencia competitiva fuerte)

| # | Función | Justificación |
|---|---|---|
| S1 | **Poligonal**: cierre angular (Σ = 180(n∓2), enlazada por azimuts), cierre lineal, 1/N, compensación Bowditch y tránsito | Apoyo de todo levantamiento; EG-2013 exige 1:10 000 en puntos de control. |
| S2 | **Curvas horizontales**: elementos (T, Lc, C, E, M), progresivas PC/PT, tabla de deflexiones y coordenadas de replanteo cada 10 m | Replanteo de ejes viales (EG-2013: cada 10 m en curva). |
| S3 | **Planilla de replanteo** desde estación conocida (Hz y distancia a cada punto, offsets izq./der.) | Prepara el trabajo de campo con estación total. |
| S4 | **Plantilla/sección típica + rasante** para calcular cota de diseño por (progresiva, offset, capa) | Automatiza M5 y estacas de talud; evita cálculos manuales por punto. |
| S5 | **Cortes y rellenos**: secciones transversales, áreas por Gauss, volumen por áreas medias y prismoidal, cuadro de C/R | Metrados para valorizaciones. |
| S6 | **Prueba de dos estacas (peg test)** con registro diario y alerta (2 mm/60 m o 1 mm/20 m) | WSDOT exige prueba diaria; evidencia de calidad ante supervisión. |
| S7 | **Nivelación trigonométrica** (con c&r, k configurable 0,13/0,16) y **recíproca** | Terrenos montañosos (sierra peruana) y cruces de ríos. |
| S8 | **Intersecciones** (Az–Az, Dist–Dist, Az–Dist, recta–recta) y punto–línea (progresiva/offset) | Cálculos de gabinete frecuentes (PI de tangentes, linderos). |
| S9 | **Coordenadas topográficas locales ↔ UTM** con factor combinado | Diferencias de hasta ~34 cm/km en la sierra. |
| S10 | **Informe de control topográfico** generado (resumen de cierres y protocolos del periodo) | Entregable mensual. |
| S11 | Importación de puntos/diseño desde **CSV/TXT** (P,N,E,Z,D) y **LandXML/DXF** básico | Interoperabilidad con Civil 3D y estaciones totales. |

### COULD (futuro / valor añadido)

| # | Función | Justificación |
|---|---|---|
| C1 | **TIN y curvas de nivel** con líneas de quiebre; volumen superficie-superficie | Potente pero exigente en cómputo/UI en móvil; Civil 3D lo cubre en gabinete. |
| C2 | **Perfil longitudinal** y curvas verticales parabólicas | Útil para verificar rasantes en campo. |
| C3 | **Diagrama de masas** (Brückner) con factores de esponjamiento/contracción | Planificación de movimiento de tierras. |
| C4 | Ajuste por **mínimos cuadrados** (redes de nivelación y poligonales) | Rigor para redes con redundancia; poco común en obra menor. |
| C5 | **Resección/estación libre** | Cuando la estación total no la trae o para verificar. |
| C6 | Conexión **Bluetooth** a niveles digitales/estaciones totales/GNSS (NMEA) | Elimina transcripción; depende de protocolos propietarios. |
| C7 | Curvas de **transición (clotoide)**, peralte y sobreancho | Proyectos viales de mayor categoría. |
| C8 | Captura con **fotos georreferenciadas** y firma digital en protocolos | Panel fotográfico y trazabilidad. |
| C9 | Conversión de alturas elipsoidales → ortométricas con **EGM2008** (H = h − N) | Nivelación GNSS (IGN NO satelital). |

---

## 6. Tabla resumen de tolerancias

| Concepto | Valor | Fuente |
|---|---|---|
| Nivelación IGN Alta Precisión (NAP) | T = 1,5 mm·√K; visual ≤ 50 m; balance ≤ 2 m | IGN NTG Lev. Verticales 2016, p. 54–55 |
| Nivelación IGN Precisión (NP) | T = 2,5 mm·√K; visual ≤ 100 m; balance ≤ 3 m | IGN 2016, p. 58–59 |
| Nivelación IGN Ordinaria trigonométrica | T = 7,0 mm·√K; D ≤ 1 000 m; k = 0,16 | IGN 2016, p. 49, 61–62 |
| FGCS 1er orden I / II | 4 / 5 mm·√K | FGCC 1984 |
| FGCS 2do orden I / II | 6 / 8 mm·√K | FGCC 1984 |
| FGCS 3er orden | 12 mm·√K | FGCC 1984 |
| Peg test | ≤ 2 mm en 60 m (WSDOT, diario); práctica ≤ 1 mm/20 m | WSDOT M22-97 cap. 10 |
| Hilo medio vs promedio | ≤ 1–2 mm (práctica) | Práctica |
| Desbalance atrás/adelante | ≤ 5 m/estación y 10 m acumulado (2º orden WSDOT) | WSDOT |
| Poligonal azimut 3er orden I / II | 10″·√N / 12″·√N | FGCC 1984 |
| Poligonal posición 3er orden I / II | 1:10 000 / 1:5 000 | FGCC 1984 |
| Georreferenciación (carreteras) | 1:100 000 H; ±5 mm V | EG-2013 Tabla 102-01 |
| Puntos de control | 1:10 000 H; ±5 mm V | EG-2013 Tabla 102-01 |
| Puntos de eje PC/PT/curva | 1:5 000 H; ±10 mm V | EG-2013 Tabla 102-01 |
| Otros puntos del eje; secciones y estacas de talud | ±50 mm H; ±100 mm V | EG-2013 Tabla 102-01 |
| Alcantarillas, cunetas, estructuras menores | ±50 mm H; ±20 mm V | EG-2013 Tabla 102-01 |
| Muros de contención | ±20 mm H; ±10 mm V | EG-2013 Tabla 102-01 |
| Estacas de subrasante y rasante | ±50 mm H; ±10 mm V | EG-2013 Tabla 102-01 |
| Límites de roce y limpieza | ±500 mm H | EG-2013 Tabla 102-01 |
| Cota subrasante, subbase, base granular | ±10 mm | EG-2013 secc. 202, 205, 402, 403 |
| Cota carpeta asfáltica / pavimento rígido | ±5 mm | EG-2013 secc. 423, 438 |
| Cota superior de placas y veredas | −10 a +10 mm | EG-2013 secc. 503 |
| Pendiente mínima alcantarillado | S₀min = 0,0055·Qi^(−0,47) (τ ≥ 1,0 Pa, n = 0,013) | RNE OS.070 |
| Curvatura + refracción | c = 0,0675·K² m (k ≈ 0,14) | Literatura clásica |
| Estadia | D = 100·(hs − hi); D_h = 100·s·cos²α; V = 50·s·sen2α | Literatura clásica |

---

## 7. Fuentes

- IGN Perú — *Norma Técnica Geodésica: Especificaciones Técnicas para Levantamientos Geodésicos Verticales*, V1.0, junio 2016 (consultada: tolerancias NAP/NP/NO, fórmula trigonométrica con k = 0,16): https://cdn.www.gob.pe/uploads/document/file/670932/ESPECIFICACIONES-TECNICAS-PARA-LEVANTAMIENTOS-VERTICALES.pdf — ficha: https://www.gob.pe/institucion/ign/informes-publicaciones/543965-norma-tecnica-especificaciones-tecnicas-para-levantamientos-geodesicos-verticales
- MTC Perú — *Manual de Carreteras: Especificaciones Técnicas Generales para Construcción EG-2013* (Sección 102 Topografía y georreferenciación, Tabla 102-01; secciones 202, 205, 402, 403, 423, 438, 503): https://cdn-web.construccion.org/normas/files/tecnicas/EG-2013.pdf — versión MTC: https://portal.mtc.gob.pe/transportes/caminos/normas_carreteras/documentos/manuales/MANUALES%20DE%20CARRETERAS%202019/MC-01-13%20Especificaciones%20Tecnicas%20Generales%20para%20Construcci%C3%B3n%20-%20EG-2013%20-%20(Versi%C3%B3n%20Revisada%20-%20JULIO%202013).pdf
- RNE Perú — Norma OS.070 Redes de Aguas Residuales: https://cdn.www.gob.pe/uploads/document/file/2366336/23%20OS.070%20REDES%20DE%20AGUA%20RESIDUALES%20DS%20N%C2%B0%20010-2009.pdf
- FGCC (1984) — *Standards and Specifications for Geodetic Control Networks*: https://www.ngs.noaa.gov/FGCS/tech_pub/1984-stds-specs-geodetic-control-networks.htm
- FGCS — *Specifications and Procedures to Incorporate Electronic Digital/Bar-Code Leveling Systems* v4.1: https://www.ngs.noaa.gov/FGCS/tech_pub/Fgcsvert.v41.specs.pdf
- NOAA — *Control Leveling* (Whalen, NOS 73 NGS 8): https://www.ngs.noaa.gov/PUBS_LIB/TRNOS73NGS8.pdf
- WSDOT — *Highway Surveying Manual* M22-97, Cap. 10 Differential Leveling (tablas de 2º y 3º orden, peg test 2 mm/60 m): https://wsdot.wa.gov/publications/manuals/fulltext/M22-97/Chapter10.pdf
- Snyder, J. P. (1987) — *Map Projections: A Working Manual*, USGS PP 1395 (Transverse Mercator/UTM): https://www.oc.nps.edu/oc2902w/maps/synder.pdf ; Karney (2011) TM de alta precisión: https://arxiv.org/pdf/1002.1417
- Curvatura y refracción (0,0675 K²): https://faculty.kfupm.edu.sa/CE/hawahab/WEBPAGE/CE260/NOTES/CH3.pdf ; https://civilnotess.com/curvature-and-refraction-correction-in-levelling/
- Ascensos y descensos / altura de instrumento (comprobaciones): https://civinnovate.com/2024/10/14/rise-and-fall-method/ ; https://civilnotess.com/booking-of-levels-height-of-instrument-and-rise-and-fall-methods/
- Prueba de dos estacas: https://scienceinsights.org/how-to-peg-a-level-using-the-two-peg-test/ ; https://usqdirect.usq.edu.au/usq/file/84ae721b-bdcf-4596-a8b2-c258b8f7957e/1/Project%20DKShowcase.zip/demos/Surveying/twopeg.html
- Nivelación recíproca y geométrica (UPM): https://moodle.upm.es/en-abierto/pluginfile.php/45077/mod_label/intro/Teoria_NG_Tema4.pdf
- Poligonales, Bowditch y tránsito: https://esenotes.com/traverse-survey-latitude-and-departure-closing-error-relative-precision-bowditchs-rule-transit-rule/ ; https://jerrymahun.com/index.php/home/open-access/17-trav-comps/41-travcomps-chap-b?start=1
- Curvas horizontales: https://mathalino.com/reviewer/surveying-and-transportation-engineering/simple-curves-or-circular-curves ; https://en.wikibooks.org/wiki/Fundamentals_of_Transportation/Horizontal_Curves
- Taquimetría/estadia: https://civilnotess.com/tacheometry-tacheometer-stadia-rod-theory-of-tacheometer-distance-and-elevation-through-tacheometer-etc/
- Volúmenes (áreas medias, prismoidal, corrección prismoidal): https://eng.libretexts.org/Bookshelves/Civil_Engineering/Fundamentals_of_Transportation/07:_Geometric_Design/7.03:_Earthwork ; https://www.dot.state.wy.us/files/live/sites/wydot/files/shared/Highway_Development/Surveys/Survey%20Manual/Appendix%20F%20-%20Volume.pdf

> **Notas de verificación.** Las tolerancias IGN (1,5 / 2,5 / 7,0 mm·√K) y EG-2013 (Tabla 102-01 y cotas por capa) se leyeron directamente de los PDF oficiales. Los valores FGCS se tomaron de las publicaciones NGS/FGCC citadas. Los vectores de prueba UTM se calcularon con las series de Snyder reproducidas en 3.5 y deben contrastarse con PROJ/GeographicLib en las pruebas unitarias. Las tolerancias de "práctica de obra" (20 mm·√K, hilo medio ≤ 1–2 mm, 1 mm/20 m) no son normativas nacionales: se exponen como valores por defecto **editables**.
