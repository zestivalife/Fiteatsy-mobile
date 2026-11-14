import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(__dirname, '..');
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');

describe('client login PIN setup flow', () => {
  it('routes successful registration through the dedicated login PIN setup gate', () => {
    const signup = read('src/screens/auth/SignUpScreen.tsx');
    const splash = read('src/screens/auth/SplashScreen.tsx');
    expect(signup).toContain("name: 'ChangePin', params: { mode: 'setup', force: true }");
    expect(splash).toContain('authSession?.requiresPinSetup');
    expect(splash).toContain("navigation.replace('ChangePin', { mode: 'setup', force: true })");
  });

  it('creates a login PIN without requiring or reusing a consultant Connection PIN', () => {
    const auth = read('src/services/authService.ts');
    const screen = read('src/screens/auth/ChangePinScreen.tsx');
    const consultant = read('src/screens/consultants/ConnectConsultantScreen.tsx');
    const consultantService = read('src/services/externalConsultantService.ts');
    expect(auth).toContain("'/v1/auth/create-pin'");
    expect(screen).toContain('createLoginPin(authSession.sessionToken');
    expect(screen).toContain('separate from a consultant Connection PIN');
    expect(consultant).toContain('Enter your Connection PIN');
    expect(consultantService).toContain('/v1/external-consultants/preview');
  });
});
