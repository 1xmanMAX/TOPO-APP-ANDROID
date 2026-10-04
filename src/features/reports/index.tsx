import type { FeatureModule } from '@/app/feature';
import { ReportsRoot } from './ReportsRoot';
import { ImportScreen } from './ImportScreen';
import { ExportScreen } from './ExportScreen';
import { ReportScreen } from './ReportScreen';

const mod: FeatureModule = {
  Root: ReportsRoot,
  screens: {
    import: ImportScreen,
    export: ExportScreen,
    report: ReportScreen,
  },
};
export default mod;
