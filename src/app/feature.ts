import type { ComponentType } from 'react';

/** Props que recibe toda pantalla apilada. */
export interface ScreenProps {
  params: Record<string, any>;
}

/**
 * Cada pestaña es un módulo con su pantalla raíz y sus pantallas apiladas.
 * Los nombres de pantalla son GLOBALES: cualquier pestaña puede apilar
 * cualquier pantalla con `go(nombre, params)`.
 */
export interface FeatureModule {
  Root: ComponentType;
  screens: Record<string, ComponentType<ScreenProps>>;
}
