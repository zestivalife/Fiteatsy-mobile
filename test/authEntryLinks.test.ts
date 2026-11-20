import fs from 'node:fs';
import path from 'node:path';

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), 'utf8');

describe('authentication entry links', () => {
  it('routes existing users from registration back to login', () => {
    const signup = read('src/screens/auth/SignUpScreen.tsx');
    expect(signup).toContain('Existing Member Login?');
    expect(signup).toContain('accessibilityLabel="Existing member login"');
    expect(signup).toContain("navigation.navigate('SignIn')");
    expect(signup).not.toContain('Use the same OTP flow');
  });

  it('routes users who need an account from login to registration', () => {
    const signIn = read('src/screens/auth/SignInScreen.tsx');
    expect(signIn).toContain('Register with Fiteatsy');
    expect(signIn).toContain("navigation.navigate('SignUp')");
    expect(signIn).not.toContain('Login with OTP');
  });
});
