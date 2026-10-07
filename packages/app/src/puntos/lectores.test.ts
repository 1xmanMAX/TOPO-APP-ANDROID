import { describe, expect, it } from 'vitest'
import { leerGsi, leerPuntos, leerTextoDePuntos, proponerSistema, type LecturaDePuntos } from './lectores'

// ─── Lectura de las muestras con Node, encerrada en la prueba ─────────────

interface ArchivosDeNode {
  existsSync(ruta: string): boolean
  readFileSync(ruta: string, codificacion: 'utf8'): string
}
declare const process: { cwd(): string; getBuiltinModule(nombre: string): unknown }

/** Igual que en muestras.ts: se busca desde el paquete o desde la raíz del repositorio. */
function leerMuestra(nombre: string): string {
  const fs = process.getBuiltinModule('node:fs') as ArchivosDeNode
  const relativa = `src/pruebas/muestras/${nombre}`
  const desdeElPaquete = `${process.cwd()}/${relativa}`
  const ruta = fs.existsSync(desdeElPaquete) ? desdeElPaquete : `${process.cwd()}/packages/app/${relativa}`
  return fs.readFileSync(ruta, 'utf8')
}

function punto(l: LecturaDePuntos, id: string) {
  const p = l.puntos.find((x) => x.id === id)
  if (!p) throw new Error(`no está el punto ${id}`)
  return p
}

function lineasConAviso(l: LecturaDePuntos): number[] {
  return [...new Set(l.avisos.map((a) => a.linea))].sort((a, b) => a - b)
}

// ─── Muestras ─────────────────────────────────────────────────────────────

describe('estacion-pnezd.csv: CSV con encabezado', () => {
  const l = leerPuntos(leerMuestra('estacion-pnezd.csv'))

  it('reconoce formato, separador, encabezado y orden', () => {
    expect(l.formato).toBe('texto')
    expect(l.separador).toBe('coma')
    expect(l.conEncabezado).toBe(true)
    expect(l.orden).toBe('PNEZD')
    expect(l.ordenSeguro).toBe(true)
  })

  it('lee norte y este en su sitio: x = este, y = norte', () => {
    expect(punto(l, '1')).toMatchObject({ x: 1004.118, y: 5003.215, z: 3249.872, codigo: 'BORDE', linea: 4 })
    expect(punto(l, 'E1')).toMatchObject({ x: 1000, y: 5000, z: 3250, codigo: 'ESTACION' })
  })

  it('una descripción entre comillas puede llevar coma', () => {
    expect(punto(l, '5').codigo).toBe('BZ, POSTE')
  })

  it('nunca descarta en silencio: cada línea rara tiene su aviso', () => {
    // 11: norte con una O en vez de cero; 12: sin cota; 13: punto repetido.
    expect(lineasConAviso(l)).toEqual([11, 12, 13])
    expect(l.puntos.some((p) => p.linea === 11)).toBe(false)
    expect(l.avisos.find((a) => a.linea === 11)!.contenido).toContain('5O20.653')
    expect(punto(l, '8').z).toBeNull()
    expect(l.avisos.find((a) => a.linea === 13)!.texto).toMatch(/repetido.*línea 6/)
  })

  it('el repetido se conserva: el usuario decide', () => {
    expect(l.puntos.filter((p) => p.id === '3')).toHaveLength(2)
    expect(l.puntos).toHaveLength(10)
  })

  it('coordenadas locales: propone sistema local', () => {
    expect(l.sistema.tipo).toBe('local')
  })
})

describe('estacion-penzd.txt: TXT con tabs, sin encabezado', () => {
  const l = leerPuntos(leerMuestra('estacion-penzd.txt'))

  it('el orden se deduce de las magnitudes UTM: este (6 cifras) antes que norte (7)', () => {
    expect(l.separador).toBe('tab')
    expect(l.conEncabezado).toBe(false)
    expect(l.orden).toBe('PENZD')
    expect(l.ordenSeguro).toBe(true)
    expect(punto(l, '1')).toMatchObject({ x: 476812.345, y: 8665432.101, z: 3254.218, codigo: 'BM' })
  })

  it('descripción con espacio, sin descripción y sin cota', () => {
    expect(punto(l, '2').codigo).toBe('BORDE IZQ')
    expect(punto(l, '6').codigo).toBeNull()
    expect(punto(l, '7').z).toBeNull()
    expect(lineasConAviso(l)).toEqual([7])
    expect(l.puntos).toHaveLength(7)
  })

  it('propone UTM, hemisferio sur probable, sin inventar la zona', () => {
    expect(l.sistema.tipo).toBe('utm')
    expect(l.sistema.hemisferioProbable).toBe('S')
    expect(l.sistema.motivo).toMatch(/zona/)
  })
})

describe('estacion-leica-gsi16.gsi: Leica GSI-16 en UTM', () => {
  const l = leerPuntos(leerMuestra('estacion-leica-gsi16.gsi'))

  it('formato y puntos con 81 este, 82 norte, 83 cota, 71 código', () => {
    expect(l.formato).toBe('gsi16')
    expect(l.orden).toBeNull()
    expect(punto(l, '1001')).toMatchObject({ x: 476812.345, y: 8665432.101, z: 3254.218, codigo: 'BM', linea: 2 })
    expect(punto(l, '1005').codigo).toBe('VEREDA')
  })

  it('la línea de estación (84/85/86) sale como punto marcado estación', () => {
    expect(punto(l, 'E1')).toMatchObject({ x: 476800, y: 8665420, z: 3253.5, estacion: true })
    expect(punto(l, '1001').estacion).toBe(false)
  })

  it('unidades en décimas de mm (unidad 6)', () => {
    expect(punto(l, '1009')).toMatchObject({ x: 476856.8123, y: 8665464.0045, z: 3253.6551 })
  })

  it('una medición sin coordenadas se avisa; un punto sin cota se conserva con aviso', () => {
    expect(lineasConAviso(l)).toEqual([8, 9])
    expect(l.avisos.find((a) => a.linea === 8)!.texto).toMatch(/ángulos/)
    expect(punto(l, '1008').z).toBeNull()
    expect(l.puntos).toHaveLength(9)
  })

  it('propone UTM', () => {
    expect(l.sistema.tipo).toBe('utm')
  })
})

describe('estacion-leica-gsi8.gsi: Leica GSI-8 en sistema local', () => {
  const l = leerPuntos(leerMuestra('estacion-leica-gsi8.gsi'))

  it('formato y puntos', () => {
    expect(l.formato).toBe('gsi8')
    expect(punto(l, '1')).toMatchObject({ x: 1004.118, y: 5003.215, z: 3249.872, codigo: 'BORDE' })
    expect(punto(l, 'E1')).toMatchObject({ x: 1000, y: 5000, z: 3250, estacion: true })
    expect(punto(l, '6')).toMatchObject({ x: 1025.2437, y: 5017.7468, z: 3250.0994 })
  })

  it('el dato dañado y el bloque de código se avisan por línea', () => {
    expect(lineasConAviso(l)).toEqual([8, 9])
    expect(l.avisos.find((a) => a.linea === 8)!.contenido).toContain('05O20653')
    expect(l.avisos.find((a) => a.linea === 9)!.texto).toMatch(/bloque de código/)
    expect(l.puntos).toHaveLength(7)
  })

  it('propone sistema local', () => {
    expect(l.sistema.tipo).toBe('local')
  })
})

describe('gnss-utm18s-huancayo.csv: GNSS en UTM 18S', () => {
  const l = leerPuntos(leerMuestra('gnss-utm18s-huancayo.csv'))

  it('el encabezado manda: Este antes que Norte', () => {
    expect(l.orden).toBe('PENZD')
    expect(punto(l, 'BM1')).toMatchObject({ x: 476805.412, y: 8665418.237, z: 3253.981, codigo: 'BM', solucion: 'FIJA' })
  })

  it('las columnas que no se usan se dicen', () => {
    expect(l.avisosGenerales.join(' ')).toMatch(/HRMS/)
    expect(l.avisosGenerales.join(' ')).toMatch(/VRMS/)
  })

  it('solución flotante: se conserva con aviso; norte N/A: se avisa y no entra', () => {
    expect(punto(l, 'G7').solucion).toBe('FLOTANTE')
    expect(l.avisos.find((a) => a.linea === 9)!.texto).toMatch(/FLOTANTE/)
    expect(l.puntos.some((p) => p.id === 'G8')).toBe(false)
    expect(lineasConAviso(l)).toEqual([9, 10])
    expect(l.puntos).toHaveLength(9)
  })

  it('propone UTM con hemisferio sur probable', () => {
    expect(l.sistema).toMatchObject({ tipo: 'utm', hemisferioProbable: 'S' })
  })
})

// ─── Reglas sueltas ───────────────────────────────────────────────────────

describe('leerTextoDePuntos: separadores y orden', () => {
  it('sin encabezado y coordenadas locales: supone PNEZD y lo dice', () => {
    const l = leerTextoDePuntos('1,5003.215,1004.118,3249.872,BORDE\n2,5006.120,1008.342,3249.915,EJE\n')
    expect(l.orden).toBe('PNEZD')
    expect(l.ordenSeguro).toBe(false)
    expect(l.avisosGenerales.join(' ')).toMatch(/PENZD/)
    expect(l.puntos[0]).toMatchObject({ x: 1004.118, y: 5003.215 })
  })

  it('el orden elegido por el usuario manda', () => {
    const l = leerTextoDePuntos('1,1004.118,5003.215,3249.872,BORDE\n', { orden: 'PENZD' })
    expect(l.ordenSeguro).toBe(true)
    expect(l.puntos[0]).toMatchObject({ x: 1004.118, y: 5003.215 })
  })

  it('punto y coma con coma decimal', () => {
    const l = leerTextoDePuntos('P;N;E;Z;D\nA;5003,215;1004,118;3249,872;BORDE\n')
    expect(l.separador).toBe('puntoYComa')
    expect(l.puntos[0]).toMatchObject({ id: 'A', x: 1004.118, y: 5003.215, z: 3249.872 })
  })

  it('separado por espacios: la descripción puede tener espacios', () => {
    const l = leerTextoDePuntos('10   5003.215  1004.118  3249.872  BORDE IZQ\n')
    expect(l.separador).toBe('espacios')
    expect(l.puntos[0]!.codigo).toBe('BORDE IZQ')
  })

  it('tres columnas: NEZ sin nombre, se numeran y se dice', () => {
    const l = leerTextoDePuntos('8665432.101 476812.345 3254.218\n8665437.554 476818.902 3254.102\n')
    expect(l.orden).toBe('NEZ')
    expect(l.puntos.map((p) => p.id)).toEqual(['1', '2'])
    expect(l.puntos[0]).toMatchObject({ x: 476812.345, y: 8665432.101 })
    expect(l.avisosGenerales.join(' ')).toMatch(/nombre/)
  })

  it('encabezado con X e Y: X es el este', () => {
    const l = leerTextoDePuntos('ID,X,Y,Z\nP1,1004.118,5003.215,3249.872\n')
    expect(l.orden).toBe('PENZ')
    expect(l.puntos[0]).toMatchObject({ x: 1004.118, y: 5003.215, codigo: null })
  })

  it('encabezado que contradice las magnitudes UTM: avisa que parecen cambiadas', () => {
    const l = leerTextoDePuntos('Punto,Norte,Este,Cota\n1,476812.345,8665432.101,3254.218\n')
    expect(l.avisosGenerales.join(' ')).toMatch(/cambiad/)
  })

  it('líneas de comentario: se saltan y se cuentan', () => {
    const l = leerTextoDePuntos('# exportado de la estación\n1,5003.215,1004.118,3249.872\n')
    expect(l.puntos).toHaveLength(1)
    expect(l.avisosGenerales.join(' ')).toMatch(/comentario/)
  })

  it('una línea con columnas de menos se avisa', () => {
    const l = leerTextoDePuntos('1,5003.215,1004.118,3249.872\n2,5006.120\n')
    expect(l.puntos).toHaveLength(1)
    expect(l.avisos[0]!.linea).toBe(2)
  })

  it('archivo vacío: sin puntos y con aviso', () => {
    const l = leerPuntos('  \n\n')
    expect(l.puntos).toEqual([])
    expect(l.avisosGenerales.length).toBeGreaterThan(0)
  })
})

describe('leerGsi: reglas', () => {
  it('pies (unidad 1) se pasan a metros y se dice', () => {
    const l = leerGsi('110001+00000001 81..01+00010000 82..01+00020000 83..01+00001000 \n')
    expect(l.puntos[0]!.x).toBeCloseTo(3.048, 6)
    expect(l.puntos[0]!.y).toBeCloseTo(6.096, 6)
    expect(l.avisosGenerales.join(' ')).toMatch(/pies/)
  })

  it('signo negativo', () => {
    const l = leerGsi('110001+00000001 81..00-00001500 82..00+00002000 83..00-00000250 \n')
    expect(l.puntos[0]).toMatchObject({ x: -1.5, y: 2, z: -0.25 })
  })

  it('una palabra que no es GSI se avisa', () => {
    const l = leerGsi('110001+00000001 81..00+00001500 82..00+00002000 basura\n')
    expect(l.puntos).toHaveLength(1)
    expect(l.avisos[0]!.texto).toMatch(/basura/)
  })

  it('falta el norte: no hay punto, hay aviso', () => {
    const l = leerGsi('110001+00000001 81..00+00001500 83..00+00002000\n')
    expect(l.puntos).toHaveLength(0)
    expect(l.avisos[0]!.texto).toMatch(/norte/)
  })
})

describe('proponerSistema', () => {
  it('mezcla de UTM y local: local, con aviso', () => {
    const s = proponerSistema([
      { x: 476812.345, y: 8665432.101 },
      { x: 1000, y: 5000 },
    ])
    expect(s.tipo).toBe('local')
    expect(s.motivo).toMatch(/1 de 2/)
  })
  it('sin puntos: local', () => {
    expect(proponerSistema([]).tipo).toBe('local')
  })
})

// ─── Lo que hallaron los revisores ────────────────────────────────────────

describe('sin encabezado: nombre o coordenada en la primera columna', () => {
  it('PNE de 3 columnas en UTM: el número de punto no se toma por norte', () => {
    const l = leerTextoDePuntos('1,8665432.100,476543.200\n2,8665440.000,476550.000\n')
    expect(l.orden).toBe('PNE')
    expect(l.ordenSeguro).toBe(true)
    expect(l.puntos[0]).toMatchObject({ id: '1', x: 476543.2, y: 8665432.1, z: null })
    expect(l.sistema.tipo).toBe('utm')
  })

  it('PNE de 3 columnas en local: supone nombre (entero corto delante de decimales) y lo dice', () => {
    const l = leerTextoDePuntos('1,100.5,200.5\n2,110.5,210.5\n3,120.5,220.5\n')
    expect(l.orden).toBe('PNE')
    expect(l.ordenSeguro).toBe(false)
    expect(l.puntos[0]).toMatchObject({ id: '1', x: 200.5, y: 100.5, z: null })
    expect(l.avisosGenerales.join(' ')).toMatch(/primera columna sea el nombre.*NEZD/)
  })

  it('NEZD con descripción, separado por espacios: la cota no se toma por este', () => {
    const l = leerTextoDePuntos('8665432.100 476543.200 3250.10 BM\n8665440.000 476550.000 3250.20 TN\n')
    expect(l.orden).toBe('NEZD')
    expect(l.ordenSeguro).toBe(true)
    expect(l.puntos[0]).toMatchObject({ id: '1', x: 476543.2, y: 8665432.1, z: 3250.1, codigo: 'BM' })
    expect(l.avisos).toEqual([])
  })

  it('el orden elegido por el usuario con 3 columnas se respeta tal cual (P,N,E)', () => {
    const l = leerTextoDePuntos('1,100.5,200.5\n', { orden: 'PNEZD' })
    expect(l.orden).toBe('PNE')
    expect(l.ordenSeguro).toBe(true)
    expect(l.puntos[0]).toMatchObject({ id: '1', x: 200.5, y: 100.5 })
  })

  it('el orden elegido sin P: la primera columna es el norte', () => {
    const l = leerTextoDePuntos('5003.215,1004.118,3249.872\n', { orden: 'NEZD' })
    expect(l.puntos[0]).toMatchObject({ id: '1', x: 1004.118, y: 5003.215, z: 3249.872 })
  })

  it('un orden que deja una coordenada UTM junto a una chica: se avisa y deja de ser seguro', () => {
    const l = leerTextoDePuntos('1,8665432.100,476543.200\n', { orden: 'NEZD' })
    expect(l.ordenSeguro).toBe(false)
    expect(l.avisosGenerales.join(' ')).toMatch(/tamaño de UTM.*elija el orden/)
  })

  it('NEZ local sin decimales en la primera: no hay nombre', () => {
    const l = leerTextoDePuntos('5003.215 1004.118 3249.872\n5006.120 1008.342 3249.915\n')
    expect(l.orden).toBe('NEZ')
    expect(l.puntos[0]).toMatchObject({ id: '1', y: 5003.215 })
  })
})

describe('encabezados: Nº, h y H, altura', () => {
  it('«Nº» es el número de punto, no el norte', () => {
    const l = leerTextoDePuntos('Nº,Este,Norte,Cota\n1,1004.118,5003.215,3249.872\n2,1008.342,5006.120,3249.915\n')
    expect(l.orden).toBe('PENZ')
    expect(l.puntos[0]).toMatchObject({ id: '1', x: 1004.118, y: 5003.215, z: 3249.872 })
    expect(l.avisosGenerales.join(' ')).not.toMatch(/no se usan/)
  })

  it('«N°» (grado) y «Nro.» también', () => {
    for (const nombre of ['N°', 'Nro.']) {
      const l = leerTextoDePuntos(`${nombre},Norte,Este\n7,5003.215,1004.118\n`)
      expect(l.puntos[0]).toMatchObject({ id: '7', y: 5003.215 })
    }
  })

  it('una «N» suelta junto a una columna Norte es el número de punto', () => {
    const l = leerTextoDePuntos('N,Norte,Este,Cota\n1,5003.215,1004.118,3249.872\n')
    expect(l.puntos[0]).toMatchObject({ id: '1', y: 5003.215, x: 1004.118 })
    expect(l.avisosGenerales.join(' ')).toMatch(/número de punto/)
  })

  it('GNSS con h y H: la cota es H (ortométrica) y se avisa que hay dos', () => {
    const l = leerTextoDePuntos('Punto,Norte,Este,h,H\nG1,8665425.102,476809.733,3278.400,3250.100\n')
    expect(l.puntos[0]!.z).toBe(3250.1)
    expect(l.columnasDeCota).toEqual(['H', 'h'])
    expect(l.avisosGenerales.join(' ')).toMatch(/2 columnas que pueden ser la cota/)
  })

  it('solo h: se usa, pero se avisa que es elipsoidal', () => {
    const l = leerTextoDePuntos('Punto,Norte,Este,h\nG1,8665425.102,476809.733,3278.400\n')
    expect(l.puntos[0]!.z).toBe(3278.4)
    expect(l.avisosGenerales.join(' ')).toMatch(/elipsoidal/)
  })

  it('Altura y Cota: la cota es Cota, no la altura de la antena', () => {
    const l = leerTextoDePuntos('Punto,Norte,Este,Altura,Cota\nG1,8665425.102,476809.733,1.800,3250.100\n')
    expect(l.puntos[0]!.z).toBe(3250.1)
    expect(l.columnasDeCota).toEqual(['Cota', 'Altura'])
  })

  it('solo Altura: se usa como cota, con aviso de que puede ser la antena', () => {
    const l = leerTextoDePuntos('Punto,Norte,Este,Altura\nG1,8665425.102,476809.733,3250.100\n')
    expect(l.puntos[0]!.z).toBe(3250.1)
    expect(l.avisosGenerales.join(' ')).toMatch(/antena/)
  })

  it('el usuario elige la columna de la cota', () => {
    const l = leerTextoDePuntos('Punto,Norte,Este,h,H\nG1,8665425.102,476809.733,3278.400,3250.100\n', { columnaCota: 'h' })
    expect(l.puntos[0]!.z).toBe(3278.4)
    expect(l.columnasDeCota[0]).toBe('h')
  })
})

describe('GSI-8 y UTM', () => {
  it('GSI-8 con coordenadas: avisa que no admite UTM completas', () => {
    const l = leerGsi('110001+00000001 81..00+76543200 82..00+65432100 83..00+03250000 \n')
    expect(l.puntos[0]).toMatchObject({ x: 76543.2, y: 65432.1 })
    expect(l.avisosGenerales.join(' ')).toMatch(/GSI-8.*GSI-16/)
  })

  it('GSI-16 no lleva ese aviso', () => {
    const l = leerGsi('*110001+0000000000000001 81..00+0000000476543200 82..00+0000008665432100 \n')
    expect(l.formato).toBe('gsi16')
    expect(l.avisosGenerales.join(' ')).not.toMatch(/GSI-8/)
  })
})
