import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFile as execFileCallback } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { test } from 'node:test';

const execFile = promisify(execFileCallback);
const backendRoot = fileURLToPath(new URL('../../backend/', import.meta.url));
const packagedPolicyUrl = new URL(
  '../../backend/dist/catalogue-import/src/modules/nutrition/catalogue/catalogue.import-policy.js',
  import.meta.url,
);

test('production-style build packages the allowlisted v1.1 catalogue for the compiled importer', async () => {
  await execFile('npm', ['run', 'build'], { cwd: backendRoot });

  const policy = await import(`${packagedPolicyUrl.href}?production-package-test=${Date.now()}`);
  const packagedPath = policy.APPROVED_NUTRITION_CATALOGUE_PATH as string;
  const expectedSuffix = '/dist/catalogue-import/src/modules/nutrition/catalogue/data/fiteatsy-nutrition-catalogue-v1.1.json';

  assert.ok(packagedPath.endsWith(expectedSuffix), `expected compiled catalogue path, received ${packagedPath}`);
  const raw = await readFile(packagedPath, 'utf8');
  assert.equal(createHash('sha256').update(raw).digest('hex'), policy.APPROVED_NUTRITION_CATALOGUE_SHA256);

  const { manifest, sha256 } = await policy.loadApprovedNutritionCatalogue();
  assert.equal(sha256, policy.APPROVED_NUTRITION_CATALOGUE_SHA256);
  assert.deepEqual([manifest.foods.length, manifest.recipes.length, manifest.mealVariants.length], [58, 64, 376]);
});
