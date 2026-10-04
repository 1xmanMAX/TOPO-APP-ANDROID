import { HelpCircle } from 'lucide-react';

const ROWS: Array<{ fmt: string; equip: string; ext: string; data: string }> = [
  { fmt: 'Leica GSI-8 / GSI-16', equip: 'Niveles LS10/LS15, DNA03/DNA10, Sprinter; estaciones TS/TPS', ext: '.gsi .raw .txt', data: 'Libretas y puntos' },
  { fmt: 'Trimble DiNi M5', equip: 'Trimble/Zeiss DiNi 03/12/22', ext: '.dat .m5', data: 'Libretas' },
  { fmt: 'Sokkia SDR33', equip: 'Estaciones Sokkia, colectoras SDR', ext: '.sdr', data: 'Puntos' },
  { fmt: 'Topcon GTS / South', equip: 'Topcon GTS/GPT, South NTS', ext: '.gt7 .dat .txt', data: 'Puntos' },
  { fmt: 'NMEA 0183', equip: 'Receptores GNSS / RTK', ext: '.nmea .log .txt', data: 'Puntos (GGA)' },
  { fmt: 'CSV / TXT', equip: 'Excel, Civil 3D, cualquier equipo', ext: '.csv .txt .xyz', data: 'Puntos (PENZD, PNEZD…) o libreta' },
  { fmt: 'Respaldo TOPO', equip: 'Esta app', ext: '.topo.json', data: 'Proyecto completo' },
];

/** Tarjeta plegable con los formatos soportados y cómo descargar el nivel. */
export function FormatsHelp() {
  return (
    <details className="card rp-help">
      <summary>
        <HelpCircle size={20} />
        <span className="grow">Formatos soportados y cómo descargar el nivel</span>
      </summary>
      <div className="stack">
        <div className="table-wrap">
          <table className="table rp-help-table">
            <thead>
              <tr>
                <th className="text left">Formato</th>
                <th className="text left">Equipos</th>
                <th className="text left">Extensión</th>
                <th className="text left">Trae</th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map((r) => (
                <tr key={r.fmt}>
                  <td className="text left">
                    <strong>{r.fmt}</strong>
                  </td>
                  <td className="text left">{r.equip}</td>
                  <td className="text left mono">{r.ext}</td>
                  <td className="text left">{r.data}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h4 className="rp-h4">Cómo descargar los datos del nivel</h4>
        <ol className="rp-steps">
          <li>
            <strong>Leica LS10/LS15 · DNA:</strong> Menú → Gestión de datos → Exportar → memoria USB. Elige formato{' '}
            <em>GSI-16</em> y unidades en metros.
          </li>
          <li>
            <strong>Leica Sprinter:</strong> conecta el cable USB a la PC (o OTG al celular) y copia el archivo{' '}
            <em>.gsi</em> de la libreta.
          </li>
          <li>
            <strong>Trimble DiNi:</strong> Menú → Datos → Exportar a USB → formato <em>M5</em> (archivo .dat).
          </li>
          <li>
            <strong>Estación total / GNSS:</strong> exporta puntos como <em>CSV PENZD</em> o GSI; en GNSS guarda el
            registro NMEA.
          </li>
          <li>
            Pasa el archivo al celular (USB-OTG, correo, Drive o WhatsApp como <em>documento</em>) y elígelo arriba.
          </li>
        </ol>
        <p className="faint xs">
          Los menús pueden variar según la versión de firmware. Si el formato no se reconoce, elígelo manualmente.
        </p>
      </div>
    </details>
  );
}
