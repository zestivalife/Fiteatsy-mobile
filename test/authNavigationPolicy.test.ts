import { resolvePostSignupDestination } from '../src/services/authNavigationPolicy';

describe('post-signup authentication navigation', () => {
  it('opens initial PIN setup only when the authenticated account needs one', () => {
    expect(resolvePostSignupDestination(true)).toEqual({
      name: 'ChangePin',
      params: { force: true, initialSetup: true },
    });
  });

  it('continues an existing account without trying to overwrite its PIN', () => {
    expect(resolvePostSignupDestination(false)).toEqual({ name: 'Splash' });
    expect(resolvePostSignupDestination(undefined)).toEqual({ name: 'Splash' });
  });

  it('forces replacement of an issued temporary Login PIN', () => {
    expect(resolvePostSignupDestination(false, true)).toEqual({
      name: 'ChangePin',
      params: { force: true },
    });
  });
});
