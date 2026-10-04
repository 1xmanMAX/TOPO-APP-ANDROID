import { useId } from 'react';

/**
 * Logotipo con id de degradado único por instancia. (El `Logo` compartido usa
 * un id fijo; si la primera copia está oculta — p. ej. en la barra lateral —
 * el degradado deja de pintarse en las demás.)
 */
export function BrandMark({ size = 34 }: { size?: number }) {
  const gid = `hm-lg-${useId().replace(/:/g, '')}`;
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
