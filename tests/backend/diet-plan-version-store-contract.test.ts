import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const storeSource = fs.readFileSync(
  new URL('../../backend/src/modules/nutrition/nutrition.store.ts', import.meta.url),
  'utf8',
);

test('diet-plan version writes never increment a nonexistent version column', () => {
  const versionUpdates = storeSource.match(
    /update diet_plan_versions[\s\S]*?returning \*/g,
  ) ?? [];

  assert.ok(versionUpdates.length >= 4, 'expected the canonical diet-plan version write paths');
  for (const statement of versionUpdates) {
    assert.doesNotMatch(statement, /\bversion\s*=\s*version\s*\+\s*1\b/i);
  }
});
