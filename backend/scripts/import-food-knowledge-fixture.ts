import { closePool, getPool } from '../src/db/pool.js';
import { FOOD_KNOWLEDGE_FIXTURE_MANIFEST } from '../src/modules/nutrition/food-knowledge/food-knowledge.fixture.js';
import { dryRunFoodKnowledgeRelease, importFoodKnowledgeRelease } from '../src/modules/nutrition/food-knowledge/food-knowledge.importer.js';
import { assertDestructiveTestResetAllowed } from '../src/test-support/destructive-reset-guard.js';

const main = async () => {
  assertDestructiveTestResetAllowed();
  const dryRun = process.argv.includes('--dry-run');
  const result = dryRun
    ? await dryRunFoodKnowledgeRelease(FOOD_KNOWLEDGE_FIXTURE_MANIFEST, getPool())
    : await importFoodKnowledgeRelease(FOOD_KNOWLEDGE_FIXTURE_MANIFEST, getPool());
  console.log(JSON.stringify(result, null, 2));
  if (result.conflicts.length || result.invalidRecords.length) process.exitCode = 1;
};

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Food Knowledge fixture import failed.');
  process.exitCode = 1;
}).finally(closePool);
