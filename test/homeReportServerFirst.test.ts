import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('Home My Health report data source', () => {
  const source = readFileSync(join(process.cwd(), 'src/screens/home/HomeScreen.tsx'), 'utf8');

  it('loads report summaries from the authenticated server API before rendering report-derived state', () => {
    expect(source).toContain('listAnalyzedReports()');
    expect(source).not.toContain('AsyncStorage.getItem(reportHistoryStorageKey)');
  });

  it('only persists report history after fresh server data is mapped for the active scoped key', () => {
    expect(source).toContain('reportDtos.map(toHealthProfileReportSummary)');
    expect(source).toContain('AsyncStorage.setItem(reportHistoryStorageKey, JSON.stringify(reports))');
  });
});
