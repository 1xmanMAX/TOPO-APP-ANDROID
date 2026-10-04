import type { FeatureModule } from '@/app/feature';
import { Screen } from '@/ui/kit';

function Root() {
  return (
    <Screen title="Home">
      <p className="muted">En construcción.</p>
    </Screen>
  );
}

const mod: FeatureModule = { Root, screens: {} };
export default mod;
