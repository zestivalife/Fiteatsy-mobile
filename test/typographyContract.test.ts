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
      'display', 'screenTitle', 'screenSubtitle', 'sectionTitle', 'cardTitle', 'body', 'bodySmall',
      'label', 'caption', 'button', 'tab', 'badge', 'metric', 'metricSmall', 'navigationLabel'
    ];
    roles.forEach((role) => {
      expect(typography[role]?.fontFamily).toMatch(/^Exo_/);
      expect(typography[role]?.fontSize).toBeGreaterThan(0);
      expect(typography[role]?.lineHeight).toBeGreaterThan(typography[role]?.fontSize as number);
    });
  });
});
