import fs from 'fs';
import path from 'path';
import { typography } from '../src/design/tokens';

const sourceRoot = path.resolve(__dirname, '../src');

const runtimeSourceFiles = (directory: string): string[] => fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
  const target = path.join(directory, entry.name);
  if (entry.isDirectory()) return runtimeSourceFiles(target);
  return /\.(ts|tsx)$/.test(entry.name) ? [target] : [];
});

describe('Fiteatsy typography contract', () => {
  it('uses Exo for every explicit normal-text font family', () => {
    const violations = runtimeSourceFiles(sourceRoot).flatMap((file) => {
      const source = fs.readFileSync(file, 'utf8');
      return [...source.matchAll(/fontFamily:\s*['"]([^'"]+)['"]/g)]
        .filter((match) => !match[1].startsWith('Exo_'))
        .map((match) => `${path.relative(sourceRoot, file)}: ${match[1]}`);
    });
    expect(violations).toEqual([]);
  });

  it('defines the complete semantic Exo scale', () => {
    const roles = [
      'display', 'screenTitle', 'screenSubtitle', 'sectionTitle', 'cardTitle', 'body', 'bodyMedium',
      'bodySmall', 'subtext', 'label', 'caption', 'button', 'tab', 'badge', 'metric', 'metricSmall',
      'navigationLabel'
    ];
    roles.forEach((role) => {
      expect(typography[role]?.fontFamily).toMatch(/^Exo_/);
      expect(typography[role]?.fontSize).toBeGreaterThan(0);
      expect(typography[role]?.lineHeight).toBeGreaterThan(typography[role]?.fontSize as number);
    });
  });

  it('matches the Foundation V1 semantic type specification exactly', () => {
    expect(typography.screenTitle).toMatchObject({ fontFamily: 'Exo_600SemiBold', fontSize: 16, lineHeight: 22 });
    expect(typography.sectionTitle).toMatchObject({ fontFamily: 'Exo_600SemiBold', fontSize: 16, lineHeight: 22 });
    expect(typography.cardTitle).toMatchObject({ fontFamily: 'Exo_600SemiBold', fontSize: 14, lineHeight: 20 });
    expect(typography.body).toMatchObject({ fontFamily: 'Exo_400Regular', fontSize: 14, lineHeight: 20 });
    expect(typography.bodyMedium).toMatchObject({ fontFamily: 'Exo_500Medium', fontSize: 14, lineHeight: 20 });
    expect(typography.subtext).toMatchObject({ fontFamily: 'Exo_400Regular', fontSize: 12, lineHeight: 17 });
    expect(typography.label).toMatchObject({ fontFamily: 'Exo_500Medium', fontSize: 12, lineHeight: 17 });
    expect(typography.caption).toMatchObject({ fontFamily: 'Exo_400Regular', fontSize: 12, lineHeight: 17 });
    expect(typography.button).toMatchObject({ fontFamily: 'Exo_600SemiBold', fontSize: 16, lineHeight: 20 });
    expect(typography.tab).toMatchObject({ fontFamily: 'Exo_600SemiBold', fontSize: 14, lineHeight: 18 });
    expect(typography.badge).toMatchObject({ fontFamily: 'Exo_600SemiBold', fontSize: 11, lineHeight: 14 });
    expect(typography.metric).toMatchObject({ fontFamily: 'Exo_700Bold', fontSize: 24, lineHeight: 30 });
    expect(typography.metricSmall).toMatchObject({ fontFamily: 'Exo_600SemiBold', fontSize: 16, lineHeight: 22 });
    expect(typography.navigationLabel).toMatchObject({ fontFamily: 'Exo_500Medium', fontSize: 12, lineHeight: 15 });
  });
});
