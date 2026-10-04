import type { ComponentProps } from 'react';
import { Screen } from '@/ui/kit';

/** Screen con espaciado vertical uniforme entre bloques. */
export function Page({ children, ...rest }: ComponentProps<typeof Screen>) {
  return (
    <Screen {...rest}>
      <div className="rp-page">{children}</div>
    </Screen>
  );
}
