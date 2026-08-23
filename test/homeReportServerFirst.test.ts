import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('My Health report data source', () => {
  const homeSource = readFileSync(join(process.cwd(), 'src/screens/home/HomeScreen.tsx'), 'utf8');
  const reportsSource = readFileSync(join(process.cwd(), 'src/screens/home/ReportsScreen.tsx'), 'utf8');

  it('loads report summaries from the authenticated server API before rendering report-derived state', () => {
    expect(reportsSource).toContain('listAnalyzedReports()');
    expect(reportsSource).toContain('clearReportDerivedState();');
    expect(homeSource).not.toContain('AsyncStorage.getItem(reportHistoryStorageKey)');
  });

  it('maps fresh server data in the Reports surface without reintroducing a Home-local report cache', () => {
    expect(reportsSource).toContain('reportDtos.reduce<ReportItem[]>');
    expect(reportsSource).toContain('setReports(hydratedReports)');
    expect(homeSource).not.toContain('reportHistoryStorageKey');
  });
});
