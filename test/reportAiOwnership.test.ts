import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('Report AI helper ownership', () => {
  const backendRoute = readFileSync(join(process.cwd(), 'backend/src/modules/intelligence/intelligence.routes.ts'), 'utf8');
  const mobileService = readFileSync(join(process.cwd(), 'src/services/nuetraService.ts'), 'utf8');

  it('loads report parameters server-side from an authenticated owned report', () => {
    expect(backendRoute).toContain('const loadOwnedReportParameters');
    expect(backendRoute).toContain('report.userId !== owner.accountId || report.clientId !== owner.clientId');
    expect(backendRoute).toContain('loadOwnedReportParameters(parsed.data.reportId, owner)');
  });

  it('does not send caller-supplied report parameters to report AI helper endpoints', () => {
    expect(mobileService).toContain("'/v1/intelligence/reports/summary'");
    expect(mobileService).toContain("'/v1/intelligence/reports/parameter-insight'");
    expect(mobileService).toContain("'/v1/intelligence/reports/action-plan'");
    expect(mobileService).toContain("'/v1/intelligence/reports/cross-insights'");
    expect(mobileService).toContain("'/v1/intelligence/reports/chat'");
    expect(mobileService).not.toContain('parameters,');
    expect(mobileService).not.toContain('abnormalParameters');
    expect(mobileService).not.toContain('abnormalParams');
    expect(mobileService).not.toContain('reportParameters');
  });
});
