import type { ComponentType } from 'react';
import type { TabId } from './nav';
import type { ScreenProps } from './feature';
import home from '@/features/home';
import leveling from '@/features/leveling';
import points from '@/features/points';
import tools from '@/features/tools';
import reports from '@/features/reports';

export const ROOTS: Record<TabId, ComponentType> = {
  home: home.Root,
  leveling: leveling.Root,
  points: points.Root,
  tools: tools.Root,
  reports: reports.Root,
};

export const SCREENS: Record<string, ComponentType<ScreenProps>> = {
  ...home.screens,
  ...leveling.screens,
  ...points.screens,
  ...tools.screens,
  ...reports.screens,
};
