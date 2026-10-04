export function Spinner({ size = 18 }: { size?: number }) {
  return <span className="rp-spin" style={{ width: size, height: size }} role="status" aria-label="Generando" />;
}
