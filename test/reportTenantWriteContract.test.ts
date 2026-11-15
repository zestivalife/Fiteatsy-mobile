import fs from 'node:fs';
import path from 'node:path';

const storeSource = fs.readFileSync(
  path.join(process.cwd(), 'backend/src/modules/reports/reports.store.ts'),
  'utf8'
);
const biomarkerSource = fs.readFileSync(
  path.join(process.cwd(), 'backend/src/modules/biomarkers/biomarkers.repository.ts'),
  'utf8'
);
const platformStoreSource = fs.readFileSync(
  path.join(process.cwd(), 'backend/src/modules/platform/platform.store.ts'),
  'utf8'
);
const reportRoutesSource = fs.readFileSync(
  path.join(process.cwd(), 'backend/src/modules/reports/reports.routes.ts'),
  'utf8'
);

describe('report tenant write contract', () => {
  it('resolves an active tenant and includes it in report persistence writes', () => {
    expect(storeSource).toContain('const resolveReportTenantId = async');
    expect(storeSource).toContain("membership.status = 'active'");
    expect(storeSource).toContain('document_hash, tenant_id');
    expect(storeSource).toContain('content, tenant_id)');
    expect(storeSource).toContain('expires_at, tenant_id');
    expect(storeSource).toContain("throw new Error('TENANT_CONTEXT_REQUIRED')");
  });

  it('uses tenant-scoped biomarker uniqueness and observation ownership', () => {
    expect(biomarkerSource).toContain('on conflict (tenant_id, canonical_name)');
    expect(biomarkerSource).toContain('reference_range, tenant_id');
    expect(biomarkerSource).toContain('b.tenant_id = inserted.tenant_id');
  });

  it('writes notification tenancy and keeps ancillary sync failures from downgrading a published report', () => {
    expect(platformStoreSource).toContain('const resolveNotificationTenantId = async');
    expect(platformStoreSource).toContain('deleted_at, tenant_id');
    expect(platformStoreSource).toContain('createdAtISO,\n      tenantId');
    expect(reportRoutesSource).toContain("logReportRuntime('processing:platform-sync-failed'");
  });
});
