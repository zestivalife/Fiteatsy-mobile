import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (path: string) => readFileSync(join(process.cwd(), '..', path), 'utf8');

test('Consultant biomarker projection retains exact facts, full history, and structured source provenance', () => {
  const repository = read('backend/src/modules/consultants/consultants.repository.ts');

  assert.match(repository, /partition by bo\.biomarker_id/);
  assert.match(repository, /order by bo\.test_date desc, bo\.created_at desc/);
  assert.match(repository, /where bo\.client_id = \$1\s+and bo\.user_id = \$2/);
  assert.match(repository, /'value', history\.value/);
  assert.match(repository, /'unit', history\.unit/);
  assert.match(repository, /'referenceRange', history\.reference_range/);
  assert.match(repository, /'testDate', history\.test_date/);
  assert.match(repository, /'sourceReportId', history\.source_report_id/);
  assert.match(repository, /history: ConsultantBiomarkerHistoryItem\[\]/);
  assert.match(repository, /label: 'Lab Report' \| 'Manual Entry'/);
});

test('report fallback remains factual and contains no generic improvement or treatment advice', () => {
  const reportsScreen = read('src/screens/home/ReportsScreen.tsx');

  assert.doesNotMatch(reportsScreen, /this can improve with consistent routine this week/i);
  assert.doesNotMatch(reportsScreen, /Start one corrective habit this week/i);
  assert.match(reportsScreen, /Reference range: \$\{parameter\.referenceRange \|\| 'Unavailable'\}/);
});
