import { pool } from '../../../db/pool.js';
export const persistSourceIdentityReview = async (submission, outcome) => {
    const result = await pool.query(`insert into controlled_food_source_identity_reviews
       (id, task_sha256, submission_sha256, reviewer_id, reviewer_qualification, qualification_reference, reviewed_on, declaration, decision_manifest)
     values ($1,$2,$3,$4,$5,$6,$7::date,$8,$9::jsonb)
     on conflict (submission_sha256) do nothing
     returning *`, [submission.submissionId, outcome.taskSha256, outcome.submissionSha256, submission.reviewerId, submission.reviewerQualification, submission.qualificationReference, submission.reviewedOn, submission.declaration, JSON.stringify({ decisions: submission.decisions, states: outcome.states })]);
    if (result.rows[0])
        return result.rows[0];
    const existing = await pool.query('select * from controlled_food_source_identity_reviews where submission_sha256=$1', [outcome.submissionSha256]);
    return existing.rows[0];
};
export const persistMeasurementRun = async (measurement, validation) => {
    if (validation.state !== 'COMPLETE' || !validation.measurementSha256)
        throw new Error('CURATION_MEASUREMENT_NOT_PERSISTABLE');
    const result = await pool.query(`insert into controlled_food_measurement_runs
       (id, preparation_id, formula_version, formula_sha256, measurement_sha256, state, evidence, operator_id, equipment_id, measured_on)
     values ($1,$2,$3,$4,$5,'COMPLETE',$6::jsonb,$7,$8,$9::date)
     on conflict (measurement_sha256) do update set measurement_sha256=excluded.measurement_sha256
     returning *`, [measurement.measurementRunId, measurement.preparationId, measurement.formulaVersion, measurement.formulaSha256, validation.measurementSha256, JSON.stringify(measurement), measurement.operator, measurement.equipmentId, measurement.measurementDate]);
    return result.rows[0];
};
export const persistCalculation = async (calculated, inputManifest) => {
    if (!calculated.calculationId || !calculated.measurementSha256 || !calculated.sourceRegistrySha256)
        throw new Error('CURATION_CALCULATION_NOT_PERSISTABLE');
    const measurement = await pool.query('select id from controlled_food_measurement_runs where measurement_sha256=$1', [calculated.measurementSha256]);
    if (!measurement.rows[0])
        throw new Error('CURATION_MEASUREMENT_NOT_FOUND');
    const result = await pool.query(`insert into controlled_food_calculations
       (id, preparation_id, measurement_run_id, calculation_method_version, calculation_sha256, source_registry_sha256, input_manifest, output_manifest)
     values ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb)
     on conflict (calculation_sha256) do update set calculation_sha256=excluded.calculation_sha256
     returning *`, [calculated.calculationId, calculated.preparationId, measurement.rows[0].id, calculated.calculationMethodVersion, calculated.calculationSha256, calculated.sourceRegistrySha256, JSON.stringify(inputManifest), JSON.stringify(calculated)]);
    return result.rows[0];
};
export const persistStageBReview = async (review) => {
    if (!review.reviewId || !review.reviewerQualification?.trim())
        throw new Error('CURATION_REVIEWER_AUTHORITY_REQUIRED');
    const client = await pool.connect();
    try {
        await client.query('begin');
        const calculation = await client.query('select id, calculation_sha256 from controlled_food_calculations where preparation_id=$1 order by created_at desc limit 1 for update', [review.preparationId]);
        if (!calculation.rows[0] || calculation.rows[0].calculation_sha256 !== review.calculationSha256)
            throw new Error('CURATION_STALE_APPROVAL');
        const result = await client.query(`insert into controlled_food_stage_b_reviews
         (id, preparation_id, calculation_id, calculation_sha256, reviewer_id, reviewer_role, reviewer_qualification, decision, notes, reviewed_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::timestamptz)
       on conflict (calculation_id, reviewer_id, decision) do update set notes=excluded.notes
       returning *`, [review.reviewId, review.preparationId, calculation.rows[0].id, review.calculationSha256, review.reviewerId, review.reviewerRole, review.reviewerQualification, review.state, review.notes, review.reviewedAt]);
        await client.query('commit');
        return result.rows[0];
    }
    catch (error) {
        await client.query('rollback');
        throw error;
    }
    finally {
        client.release();
    }
};
