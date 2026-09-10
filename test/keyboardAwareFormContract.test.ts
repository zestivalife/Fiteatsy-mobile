import fs from 'node:fs';
import path from 'node:path';

const read = (file: string) => fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8');

describe('global keyboard-safe form contract', () => {
  it('provides one safe-area, keyboard-avoiding, scrollable form shell', () => {
    const shell = read('src/components/KeyboardAwareFormScreen.tsx');
    expect(shell).toContain('SafeAreaView');
    expect(shell).toContain('KeyboardAvoidingView');
    expect(shell).toContain('automaticallyAdjustKeyboardInsets={Platform.OS');
    expect(shell).toContain('keyboardShouldPersistTaps="handled"');
    expect(shell).toContain("Platform.OS === 'ios' ? 'interactive' : 'on-drag'");
    expect(shell).toContain('flexGrow: 1');
    expect(shell).not.toMatch(/height:\s*\d+/);
  });

  it('makes the shared scrolling Screen keyboard-safe for existing long forms', () => {
    const screen = read('src/components/Screen.tsx');
    expect(screen).toContain('automaticallyAdjustKeyboardInsets={Platform.OS');
    expect(screen).toContain('keyboardShouldPersistTaps="handled"');
    expect(screen).toContain('nestedScrollEnabled');
  });

  it('uses the canonical shell for phone, OTP, and PIN forms', () => {
    for (const file of ['src/screens/auth/SignInScreen.tsx', 'src/screens/auth/SignUpScreen.tsx', 'src/screens/auth/ChangePinScreen.tsx']) {
      expect(read(file)).toContain('<KeyboardAwareFormScreen');
    }
    const login = read('src/screens/auth/SignInScreen.tsx');
    expect(login).toContain('returnKeyType="next"');
    expect(login).toContain('pinRef.current?.focus()');
    expect(login).toContain('returnKeyType="done"');
  });

  it('keeps onboarding, long medication, search, and sheet forms scroll-aware', () => {
    expect(read('src/components/onboarding/OnboardingShell.tsx')).toContain('automaticallyAdjustKeyboardInsets');
    expect(read('src/screens/medication/MedicationFormScreen.tsx')).toContain('<KeyboardAwareFormScreen');
    expect(read('src/screens/home/SearchScreen.tsx')).toContain('keyboardShouldPersistTaps="handled"');
    expect(read('src/components/HealthProfileSheet.tsx')).toContain('automaticallyAdjustKeyboardInsets');
    expect(read('src/screens/cycle/CycleScreen.tsx')).toContain('automaticallyAdjustKeyboardInsets');
    expect(read('src/screens/home/ReportsScreen.tsx')).toContain('automaticallyAdjustKeyboardInsets');
    expect(read('src/screens/family/FamilyDashboardScreen.tsx')).toContain('KeyboardAvoidingView');
  });
});
