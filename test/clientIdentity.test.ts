import { resolveClientFirstName, resolveClientName } from '../src/utils/clientIdentity';

describe('canonical authenticated client identity', () => {
  it('preserves and trims the canonical user name', () => {
    expect(resolveClientName('  Silky  ')).toBe('Silky');
    expect(resolveClientFirstName('  Silky QA Client  ')).toBe('Silky');
  });

  it.each([null, undefined, '', '   '])('uses the approved fallback only for a missing name: %p', (name) => {
    expect(resolveClientName(name)).toBe('Name unavailable');
    expect(resolveClientFirstName(name)).toBe('there');
  });

  it('does not leak identity between authenticated users', () => {
    expect(resolveClientName('Silky')).toBe('Silky');
    expect(resolveClientName('QA Client')).toBe('QA Client');
  });
});
