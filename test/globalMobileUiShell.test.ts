import fs from 'fs';
import path from 'path';

const root = path.resolve(__dirname, '..');
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), 'utf8');

describe('Global mobile UI shell', () => {
  it('keeps one background authority shared by Home, generic screens, and forms', () => {
    const background = read('src/components/AppBackground.tsx');
    expect(background).toContain('getThemeGradients(themeMode).appBackground');
    expect(background).toContain("themeMode === 'light' ? 'dark' : 'light'");
    expect(read('src/components/Screen.tsx')).toContain('<AppBackground>');
    expect(read('src/components/KeyboardAwareFormScreen.tsx')).toContain('<AppBackground>');
    expect(read('src/screens/home/HomeScreen.tsx')).toContain('<AppBackground>');
    expect(read('src/screens/home/HomeScreen.tsx')).not.toContain("colors={['#262B2F', '#16191D']}");
  });

  it('uses one accessible icon-only back primitive with a governed fallback', () => {
    const back = read('src/components/AppBackButton.tsx');
    expect(back).toContain('accessibilityLabel="Go back"');
    expect(back).toContain('navigation.canGoBack()');
    expect(back).toContain('fallbackRoute');
    expect(back).toContain('width: 44');
    expect(back).toContain('height: 44');
    expect(back).not.toContain('<Text');
  });

  it('uses the canonical header for profile and diagnostics surfaces', () => {
    expect(read('src/components/ProfileUi.tsx')).toContain('<ScreenHeader');
    const diagnostics = read('src/screens/sync/CanonicalHealthSyncDebugScreen.tsx');
    expect(diagnostics).toContain('<ScreenHeader title="Health Sync Diagnostics"');
    expect(diagnostics).toContain('statusColor');
    expect(diagnostics).toContain('colors.textPrimary');
  });

  it('does not render a visible textual back control', () => {
    const screenRoot = path.join(root, 'src');
    const walk = (directory: string): string[] => fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const target = path.join(directory, entry.name);
      return entry.isDirectory() ? walk(target) : entry.name.endsWith('.tsx') ? [target] : [];
    });
    const visibleBack = /<Text[^>]*>\s*(?:Back|Go Back|&lt; Back)\s*<\/Text>/;
    expect(walk(screenRoot).filter((file) => visibleBack.test(fs.readFileSync(file, 'utf8')))).toEqual([]);
  });
});
