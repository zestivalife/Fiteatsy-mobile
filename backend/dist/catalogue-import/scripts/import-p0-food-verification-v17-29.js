import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { closePool, getPool } from '../src/db/pool.js';
import { migrateDatabase } from '../src/db/migrator.js';
const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const artifactPath = path.join(backendRoot, 'src/modules/nutrition/food-curation/data/p0_food_verification_v17_29.json');
const artifactBytes = fs.readFileSync(artifactPath);
const artifact = JSON.parse(artifactBytes.toString('utf8'));
const artifactSha256 = crypto.createHash('sha256').update(artifactBytes).digest('hex');
const validate = () => {
    if (artifact.schemaVersion !== 'FITEATSY_P0_FOOD_VERIFICATION_V17_30A' || artifact.decisionCount !== 207 || artifact.decisions.length !== 207)
        throw new Error('P0_VERIFICATION_ARTIFACT_INVALID');
    if (new Set(artifact.decisions.map((decision) => decision.referenceItemId)).size !== 207)
        throw new Error('P0_VERIFICATION_DUPLICATE_REFERENCE_ITEM');
    if (artifact.decisions.some((decision) => (decision.generatorEligible && decision.outcome !== 'ACTIVATED_GENERATOR') || (decision.componentEligible && !['ACTIVATED_GENERATOR', 'ACTIVATED_COMPONENT_ONLY'].includes(decision.outcome)) || ((decision.generatorEligible || decision.componentEligible) && decision.sourceMapping == null)))
        throw new Error('P0_VERIFICATION_ACTIVATION_BOUNDARY_VIOLATION');
};
const main = async () => {
    validate();
    await migrateDatabase();
    const client = await getPool().connect();
    let inserted = 0;
    let unchanged = 0;
    try {
        await client.query('begin');
        await client.query('select pg_advisory_xact_lock($1,$2)', [20260905, 29]);
        for (const decision of artifact.decisions) {
            const result = await client.query(`insert into food_catalogue_p0_verification_decisions (decision_id,reference_item_id,artifact_sha256,outcome,operational_use_state,target_roles,generator_eligible,component_eligible,evidence_status,decision_payload) values($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10::jsonb) on conflict(reference_item_id) do nothing`, [decision.decisionId, decision.referenceItemId, artifactSha256, decision.outcome, decision.operationalUse, JSON.stringify(decision.targetRoles), decision.generatorEligible, decision.componentEligible, decision.evidenceStatus, JSON.stringify(decision)]);
            if (result.rowCount)
                inserted++;
            else
                unchanged++;
        }
        if (inserted + unchanged !== 207)
            throw new Error('P0_VERIFICATION_PERSISTENCE_COUNT_MISMATCH');
        await client.query(`update food_catalogue_reference_items reference set processing_status='VERIFIED',processing_version='P0_VERIFICATION_V17_30A',evidence_status=decision.evidence_status,operational_use_state=decision.operational_use_state,target_roles=decision.target_roles from food_catalogue_p0_verification_decisions decision where reference.id=decision.reference_item_id and reference.batch_id=$1 and decision.artifact_sha256=$2`, [artifact.sourceBatchId, artifactSha256]);
        await client.query('commit');
        process.stdout.write(`${JSON.stringify({ decisionCount: artifact.decisions.length, inserted, unchanged, activations: artifact.decisions.filter((decision) => decision.generatorEligible || decision.componentEligible).length, sourceMappings: artifact.decisions.filter((decision) => decision.sourceMapping != null).length, artifactSha256 })}\n`);
    }
    catch (error) {
        await client.query('rollback');
        throw error;
    }
    finally {
        client.release();
        await closePool();
    }
};
void main().catch(async (error) => { console.error(error instanceof Error ? error.message : error); await closePool(); process.exitCode = 1; });
