import fs from 'fs';
import path from 'path';

const read = (relativePath: string) => fs.readFileSync(path.resolve(__dirname, '..', relativePath), 'utf8');

describe('Foundation V1 interaction contracts', () => {
  it('keeps manual chevron-back controls out of production screens', () => {
    const screenRoot = path.resolve(__dirname, '../src/screens');
    const walk = (directory: string): string[] => fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const target = path.join(directory, entry.name);
      return entry.isDirectory() ? walk(target) : entry.name.endsWith('.tsx') ? [target] : [];
    });
    const violations = walk(screenRoot).filter((file) => read(path.relative(path.resolve(__dirname, '..'), file)).includes('name="chevron-back"'));
    expect(violations).toEqual([]);
  });

  it('defines accessible shared CTA, tab, header, and back primitives', () => {
    const button = read('src/components/PrimaryButton.tsx');
    const back = read('src/components/AppBackButton.tsx');
    const tabs = read('src/components/SegmentedTabs.tsx');
    const header = read('src/components/PageHeader.tsx');
    expect(button).toContain("minHeight: 44");
    expect(button).toContain('busy: loading');
    expect(back).toContain('navigation.canGoBack()');
    expect(back).toContain('fallbackRoute');
    expect(back).toContain('minHeight: 44');
    expect(tabs).toContain("minHeight: 40");
    expect(tabs).toContain('accessibilityState={{ selected: active }}');
    expect(header).toContain('typography.screenTitle');
  });
});
