import '@testing-library/jest-dom/vitest'

// jsdom no tiene <canvas>: getContext da null igual, pero sin llenar la
// salida de «Not implemented». Quien pinta en canvas ya contempla el null.
if (typeof HTMLCanvasElement !== 'undefined') HTMLCanvasElement.prototype.getContext = (() => null) as unknown as typeof HTMLCanvasElement.prototype.getContext
