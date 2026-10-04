import type { FeatureModule } from '@/app/feature';
import PointsRoot from './PointsRoot';
import PointEdit from './PointEdit';
import PhoneGps from './PhoneGps';
import Surface from './Surface';

const mod: FeatureModule = {
  Root: PointsRoot,
  screens: {
    'point-edit': PointEdit,
    'phone-gps': PhoneGps,
    surface: Surface,
  },
};
export default mod;
