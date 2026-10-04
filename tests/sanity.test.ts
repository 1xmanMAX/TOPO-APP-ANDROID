import { uid } from '@/core/id';

test('uid genera ids distintos', () => {
  expect(uid()).not.toBe(uid());
});
