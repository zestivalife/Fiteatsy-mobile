import { hydrationProgress, remainingHydration } from '../src/utils/hydration';

describe('hydration utils', () => {
  it('calculates bounded hydration progress', () => {
    expect(hydrationProgress(2.4, 4)).toBe(0.6);
    expect(hydrationProgress(6, 4)).toBe(1);
    expect(hydrationProgress(1, 0)).toBe(0);
  });

  it('calculates remaining hydration liters', () => {
    expect(remainingHydration(2.4, 4)).toBe(1.6);
    expect(remainingHydration(4.2, 4)).toBe(0);
  });
});
