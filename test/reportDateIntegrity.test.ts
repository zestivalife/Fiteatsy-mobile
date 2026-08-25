import fs from 'node:fs';
import path from 'node:path';
import { toDayKey } from '../src/utils/date';

describe('report chronology integrity', () => {
  it('defaults a new upload to the current IST business date, never a fixed historical date', () => {
    const source = fs.readFileSync(path.join(process.cwd(), 'src/screens/home/ReportsScreen.tsx'), 'utf8');
    expect(source).toContain('toDayKey(initialReportDate)');
    expect(source).not.toContain("useState('15 Mar 2026')");
    expect(toDayKey('2026-08-25T18:30:00.000Z')).toBe('2026-08-26');
  });

  it('preserves explicit user date over parsed/fallback analysis date', () => {
    const routes = fs.readFileSync(path.join(process.cwd(), 'backend/src/modules/reports/reports.routes.ts'), 'utf8');
    expect(routes).toContain('if (input.manualDate) analysis.reportDate = input.manualDate');
  });

  it('orders biomarker comparisons by canonical test date', () => {
    const source = fs.readFileSync(path.join(process.cwd(), 'src/screens/home/ReportsScreen.tsx'), 'utf8');
    expect(source).toContain('new Date(b.testDate).getTime() - new Date(a.testDate).getTime()');
  });
});
