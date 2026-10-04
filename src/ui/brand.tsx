/** Identidad visual: logotipo y fondo de curvas de nivel. */
import { useId } from 'react';

export function Logo({ size = 34 }: { size?: number }) {
  // id único: varios logos en la página no deben compartir el gradiente
  const gid = `lg-topo-${useId().replace(/:/g, '')}`;
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#e8590c" />
          <stop offset="1" stopColor="#ff9f4a" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill={`url(#${gid})`} />
      <path d="M10 44c8-10 14-14 22-14s14 4 22 14" fill="none" stroke="#fff" strokeOpacity=".45" strokeWidth="3" strokeLinecap="round" />
      <path d="M14 36c6-8 11-11 18-11s12 3 18 11" fill="none" stroke="#fff" strokeOpacity=".7" strokeWidth="3" strokeLinecap="round" />
      <path d="M32 12l9 14H23z" fill="#fff" />
      <path d="M32 26v24" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" />
      <path d="M26 50h12" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" />
    </svg>
  );
}

/** Curvas de nivel decorativas para cabeceras. */
export function TopoLines() {
  const lines = Array.from({ length: 9 }, (_, i) => {
    const r = 40 + i * 34;
    return (
      <ellipse
        key={i}
        cx={380 - i * 6}
        cy={-20 + i * 4}
        rx={r * 1.35}
        ry={r}
        fill="none"
        stroke="#fff"
        strokeWidth={i % 4 === 0 ? 1.6 : 0.8}
        transform={`rotate(${-12 + i * 2} 380 0)`}
      />
    );
  });
  return (
    <svg className="topo-lines" viewBox="0 0 420 220" preserveAspectRatio="xMaxYMin slice" aria-hidden="true">
      {lines}
    </svg>
  );
}
