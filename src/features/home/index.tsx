import type { FeatureModule } from '@/app/feature';
import HomeRoot from './Home';
import Projects from './Projects';
import ProjectEdit from './ProjectEdit';
import Benchmarks from './Benchmarks';
import Settings from './Settings';
import Search from './Search';

const mod: FeatureModule = {
  Root: HomeRoot,
  screens: {
    projects: Projects,
    'project-edit': ProjectEdit,
    benchmarks: Benchmarks,
    settings: Settings,
    search: Search,
  },
};
export default mod;
