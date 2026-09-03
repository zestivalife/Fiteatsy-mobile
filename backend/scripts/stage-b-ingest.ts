import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspectMeasurementSubmission } from '../src/modules/nutrition/food-curation/controlled-curation.engine.js';
import type { ControlledMeasurement } from '../src/modules/nutrition/food-curation/controlled-curation.types.js';

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.join(backendRoot, 'src/modules/nutrition/food-curation/data');
const inputPath = process.argv[2] ? path.resolve(process.argv[2]) : path.join(dataDir, 'batch-1.user-confirmed-measurements.json');
const outputPath = process.argv[3] ? path.resolve(process.argv[3]) : path.join(dataDir, 'batch-1.ingestion-status.json');
const input = JSON.parse(fs.readFileSync(inputPath, 'utf8')) as { evidenceClassification: string; measurements: ControlledMeasurement[] };
if (input.evidenceClassification !== 'USER_CONFIRMED_PHYSICAL_MEASUREMENT_EVIDENCE') throw new Error('CURATION_EVIDENCE_CLASSIFICATION_INVALID');

const foods = input.measurements.map((measurement) => {
  const validation = inspectMeasurementSubmission(measurement);
  const downstreamCalculationBlockers: string[] = [];
  if (measurement.preparationId === 'CP_CHAPATI') downstreamCalculationBlockers.push('CURATION_POST_COOKING_FAT_QUANTITY_REQUIRED_FOR_CALCULATION');
  if (measurement.preparationId === 'CP_MOONG_DAL') downstreamCalculationBlockers.push('NO_ACCEPTABLE_APPROVED_SOURCE_MATCH:RAW_MOONG_DAL');
  if (measurement.preparationId === 'CP_POHA_PEANUT') downstreamCalculationBlockers.push('NO_ACCEPTABLE_APPROVED_SOURCE_MATCH:FLATTENED_RICE_POHA');
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
    state: 'MEASUREMENT_INCOMPLETE',
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
  primaryNextGate: 'MEASUREMENT_PREREQUISITES_REQUIRED',
  sourceResolution: [
    { ingredient: 'RAW_MOONG_DAL', result: 'NO_ACCEPTABLE_APPROVED_SOURCE_MATCH', affectedFood: 'CP_MOONG_DAL' },
    { ingredient: 'FLATTENED_RICE_POHA', result: 'NO_ACCEPTABLE_APPROVED_SOURCE_MATCH', affectedFood: 'CP_POHA_PEANUT' },
    { ingredient: 'SEMOLINA', result: 'NO_ACCEPTABLE_APPROVED_SOURCE_MATCH', affectedFood: 'BATCH_2_CP_UPMA' }
  ],
  foods,
};
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
