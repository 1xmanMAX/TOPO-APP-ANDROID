/** Identificador corto, único en la práctica para datos locales. */
export function uid(prefix = ''): string {
  const rnd = Math.random().toString(36).slice(2, 8);
  const t = Date.now().toString(36).slice(-5);
  return `${prefix}${t}${rnd}`;
}
