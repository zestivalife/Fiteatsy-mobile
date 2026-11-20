import fs from 'node:fs';
import path from 'node:path';

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), 'utf8');

describe('signup validation feedback', () => {
  it('shows actionable field errors and keeps invalid submission available for feedback', () => {
    const signup = read('src/screens/auth/SignUpScreen.tsx');

    expect(signup).toContain('Enter a valid email address, for example name@example.com.');
    expect(signup).toContain('Enter a valid 10-digit Indian mobile number.');
    expect(signup).toContain('disabled={loading || requestCooldownRemainingSec > 0}');
    expect(signup).toContain('accessibilityRole="alert"');
  });

  it('renders reusable accessible inline errors on text fields', () => {
    const textField = read('src/components/TextField.tsx');

    expect(textField).toContain('error?: string | null');
    expect(textField).toContain('accessibilityHint={error ?? accessibilityHint}');
    expect(textField).toContain('accessibilityLiveRegion="polite"');
    expect(textField).toContain('accessibilityRole="alert"');
  });
});
