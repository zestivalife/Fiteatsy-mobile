import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { closePool, getPool } from '../src/db/pool.js';
import { migrateDatabase } from '../src/db/migrator.js';

type TerminalState = 'ACTIVATED_GOVERNED' | 'ALIAS_GOVERNED' | 'SOURCE_IDENTITY_LINKED' | 'BLOCKED_EVIDENCE';
type ClosureRecord = {
  closureId: string;
  referenceItemId: string;
  terminalState: TerminalState;
  terminalReason: string;
  governedFoodId: string | null;
  sourceMappingId: string | null;
  effectiveProcessorVersion: string;
  processorVersion: 'FOOD_CATALOGUE_CLOSURE_V17_34';
};
type ClosureArtifact = {
  schemaVersion: string;
  artifactSha256: string;
  referenceIdentityCount: number;
  terminalStateCounts: Record<TerminalState, number>;
  records: ClosureRecord[];
};

const artifactUrl = new URL('../src/modules/nutrition/food-curation/data/food_catalogue_closure_v17_34.json', import.meta.url);
const artifactBytes = readFileSync(artifactUrl);
const artifact = JSON.parse(artifactBytes.toString('utf8')) as ClosureArtifact;
const artifactFileSha256 = createHash('sha256').update(artifactBytes).digest('hex');

const validate = () => {
  if (artifact.schemaVersion !== 'FITEATSY_FOOD_CATALOGUE_CLOSURE_V17_34') throw new Error('V17_34_SCHEMA_VERSION_MISMATCH');
  if (artifact.referenceIdentityCount !== 207 || artifact.records.length !== 207) throw new Error('V17_34_RECORD_COUNT_MISMATCH');
  if (new Set(artifact.records.map((item) => item.referenceItemId)).size !== 207) throw new Error('V17_34_REFERENCE_DUPLICATE');
  const expected = { ACTIVATED_GOVERNED: 74, ALIAS_GOVERNED: 7, BLOCKED_EVIDENCE: 123, SOURCE_IDENTITY_LINKED: 3 };
  if (JSON.stringify(artifact.terminalStateCounts) !== JSON.stringify(expected)) throw new Error('V17_34_TERMINAL_COUNTS_MISMATCH');
  if (!/^[a-f0-9]{64}$/.test(artifact.artifactSha256) || !/^[a-f0-9]{64}$/.test(artifactFileSha256)) throw new Error('V17_34_ARTIFACT_HASH_INVALID');
};

const main = async () => {
  validate();
  await migrateDatabase();
  const client = await getPool().connect();
  let persisted = 0;
  let unchanged = 0;
  try {
    await client.query('begin');
    await client.query('select pg_advisory_xact_lock($1,$2)', [20260907, 34]);
    for (const record of artifact.records) {
      const result = await client.query(
        `insert into food_catalogue_closure_v17_34 (
          closure_id, reference_item_id, terminal_state, terminal_reason, governed_food_id,
          source_mapping_id, effective_processor_version, artifact_sha256, processor_version, closure_payload
        ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)
        on conflict(reference_item_id) do update set
          closure_id=excluded.closure_id,
          terminal_state=excluded.terminal_state,
          terminal_reason=excluded.terminal_reason,
          governed_food_id=excluded.governed_food_id,
          source_mapping_id=excluded.source_mapping_id,
          effective_processor_version=excluded.effective_processor_version,
          artifact_sha256=excluded.artifact_sha256,
          processor_version=excluded.processor_version,
          closure_payload=excluded.closure_payload,
          updated_at=now()
        where food_catalogue_closure_v17_34.closure_payload <> excluded.closure_payload
           or food_catalogue_closure_v17_34.artifact_sha256 <> excluded.artifact_sha256`,
        [record.closureId, record.referenceItemId, record.terminalState, record.terminalReason, record.governedFoodId, record.sourceMappingId, record.effectiveProcessorVersion, artifact.artifactSha256, record.processorVersion, JSON.stringify(record)],
      );
      if (result.rowCount) persisted += 1;
      else unchanged += 1;
    }
    const count = await client.query<{ count: string }>('select count(*)::text as count from food_catalogue_closure_v17_34 where artifact_sha256=$1', [artifact.artifactSha256]);
    if (Number(count.rows[0]?.count) !== 207) throw new Error('V17_34_PERSISTED_CLOSURE_COUNT_MISMATCH');
    await client.query('commit');
    process.stdout.write(`${JSON.stringify({ referenceIdentityCount: 207, persisted, unchanged, terminalStateCounts: artifact.terminalStateCounts, artifactSha256: artifact.artifactSha256, artifactFileSha256 })}\n`);
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
    await closePool();
  }
};

void main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : error);
  await closePool();
  process.exitCode = 1;
});
