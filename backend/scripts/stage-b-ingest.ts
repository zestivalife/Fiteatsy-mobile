import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyBatchMeasurementAudit, inspectMeasurementSubmission, validateBatchMeasurementAudit } from '../src/modules/nutrition/food-curation/controlled-curation.engine.js';
import type { BatchMeasurementAudit, ControlledMeasurement } from '../src/modules/nutrition/food-curation/controlled-curation.types.js';

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.join(backendRoot, 'src/modules/nutrition/food-curation/data');
const inputPath = process.argv[2] ? path.resolve(process.argv[2]) : path.join(dataDir, 'batch-1.user-confirmed-measurements.json');
const outputPath = process.argv[3] ? path.resolve(process.argv[3]) : path.join(dataDir, 'batch-1.ingestion-status.json');
const input = JSON.parse(fs.readFileSync(inputPath, 'utf8')) as { evidenceClassification: string; batchAudit: BatchMeasurementAudit & { appliesToPreparationIds: string[] }; measurements: ControlledMeasurement[] };
if (input.evidenceClassification !== 'USER_CONFIRMED_PHYSICAL_MEASUREMENT_EVIDENCE') throw new Error('CURATION_EVIDENCE_CLASSIFICATION_INVALID');
const audit = validateBatchMeasurementAudit(input.batchAudit);
const submittedPreparationIds = input.measurements.map((measurement) => measurement.preparationId);
if (submittedPreparationIds.some((preparationId) => !input.batchAudit.appliesToPreparationIds.includes(preparationId)) || input.batchAudit.appliesToPreparationIds.some((preparationId) => !submittedPreparationIds.includes(preparationId))) throw new Error('CURATION_BATCH_AUDIT_BINDING_INCOMPLETE');

const foods = input.measurements.map((measurement) => {
  const auditedMeasurement = applyBatchMeasurementAudit(measurement, audit);
  const validation = inspectMeasurementSubmission(auditedMeasurement);
  const downstreamCalculationBlockers: string[] = [];
  if (measurement.preparationId === 'CP_CHAPATI') downstreamCalculationBlockers.push('SOURCE_CANDIDATE_REQUIRES_IDENTITY_REVIEW:REFINED_SUNFLOWER_OIL', 'SOURCE_CANDIDATE_REQUIRES_IDENTITY_REVIEW:COW_GHEE');
  if (measurement.preparationId === 'CP_MOONG_DAL') downstreamCalculationBlockers.push('NO_ACCEPTABLE_APPROVED_SOURCE_MATCH:SPLIT_HULLED_YELLOW_MOONG_DAL', 'SOURCE_CANDIDATE_REQUIRES_IDENTITY_REVIEW:COW_GHEE');
  if (measurement.preparationId === 'CP_BHINDI_SABJI' || measurement.preparationId === 'CP_BHINDI_ALOO') downstreamCalculationBlockers.push('SOURCE_CANDIDATE_REQUIRES_IDENTITY_REVIEW:REFINED_SUNFLOWER_OIL');
  if (measurement.preparationId === 'CP_POHA_PEANUT') downstreamCalculationBlockers.push('NO_ACCEPTABLE_APPROVED_SOURCE_MATCH:FLATTENED_RICE_POHA', 'SOURCE_CANDIDATE_REQUIRES_IDENTITY_REVIEW:GROUNDNUT_OIL');
  return {
    preparationId: measurement.preparationId,
    evidenceClassification: validation.evidenceClassification,
    submissionSha256: validation.submissionSha256,
    measurementRunId: null,
    measurementSha256: null,
    canonicalMeasurementEligible: validation.canonicalMeasurementEligible,
    validationErrors: validation.errors,
    downstreamCalculationBlockers,
    warnings: validation.warnings,
    state: validation.errors.length === 1 && validation.errors[0] === 'CURATION_APPROVED_FORMULA_HASH_REQUIRED' ? 'MEASUREMENT_AUDIT_COMPLETE_STAGE_A_BLOCKED' : 'MEASUREMENT_INCOMPLETE',
  };
});
const report = {
  schemaVersion: 'FITEATSY_STAGE_B_INGESTION_STATUS_V1',
  generatedFromRepositoryState: true,
  submittedEvidenceCount: foods.length,
  canonicalMeasurementRunsCreated: 0,
  calculationsExecuted: 0,
  reviewsCreated: 0,
  validationRelease: 'NOT_CREATED',
  primaryNextGate: 'STAGE_A_NUTRITIONIST_REVIEW_REQUIRED',
  measurementAuditMetadata: 'MEASUREMENT_AUDIT_METADATA_COMPLETE',
  measurementAuditBindingScope: 'BATCH_LEVEL_ALL_FIRST_FIVE',
  sourceResolution: [
    { ingredient: 'SPLIT_HULLED_YELLOW_MOONG_DAL', result: 'NO_ACCEPTABLE_APPROVED_SOURCE_MATCH', affectedFood: 'CP_MOONG_DAL' },
    { ingredient: 'FLATTENED_RICE_POHA', result: 'NO_ACCEPTABLE_APPROVED_SOURCE_MATCH', affectedFood: 'CP_POHA_PEANUT' },
  ],
  foods,
};
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
