import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.join(backendRoot, 'src/modules/nutrition/food-curation/data');
const inputPath = process.argv[2] ? path.resolve(process.argv[2]) : path.join(dataDir, 'batch-1.user-confirmed-measurements.json');
const outputPath = process.argv[3] ? path.resolve(process.argv[3]) : path.join(dataDir, 'stage-b.machine-status.json');
const input = JSON.parse(fs.readFileSync(inputPath, 'utf8')) as { measurements?: Array<Record<string, unknown>> };
const sourceReview = JSON.parse(fs.readFileSync(path.join(dataDir, 'batch-1.source-identity-review.pending.json'), 'utf8')) as { reviewer?: Record<string, string>; items?: Array<{ decision?: string }> };
const required = ['CP_CHAPATI', 'CP_MOONG_DAL', 'CP_BHINDI_SABJI', 'CP_BHINDI_ALOO', 'CP_POHA_PEANUT'];
const byId = new Map((input.measurements ?? []).map((item) => [String(item.preparationId ?? ''), item]));
const physicallySubmitted = (item: Record<string, unknown> | undefined) => Boolean(item
  && item.evidenceClassification === 'USER_CONFIRMED_PHYSICAL_MEASUREMENT_EVIDENCE'
  && typeof item.finalPreparedWeightGrams === 'number'
  && item.finalPreparedWeightGrams > 0);
const foods = required.map((preparationId) => ({ preparationId, state: physicallySubmitted(byId.get(preparationId)) ? 'PHYSICAL_EVIDENCE_PRESERVED_CANONICALISATION_BLOCKED' : 'MEASUREMENT_REQUIRED' }));
const submitted = foods.filter((item) => item.state !== 'MEASUREMENT_REQUIRED').length;
const report = {
  schemaVersion: 'FITEATSY_STAGE_B_STATUS_V1',
  generatedFromRepositoryState: true,
  stageBEngineering: 'CANDIDATE_IMPLEMENTED',
  firstFiveData: submitted === required.length ? 'PHYSICAL_EVIDENCE_PRESERVED — CANONICALISATION_BLOCKED' : 'PARTIAL_MEASUREMENT_EVIDENCE_REQUIRES_VALIDATION',
  controlledCurationMethodology: 'PARTIAL',
  indianFoodPopulation: 'STILL_BLOCKED',
  phase3ComponentHandoff: 'BLOCKED',
  production: 'UNCHANGED',
  primaryNextGate: 'STAGE_A_NUTRITIONIST_REVIEW_REQUIRED',
  sourceReviewerMetadata: sourceReview.reviewer?.reviewerId && sourceReview.reviewer?.reviewerQualification && sourceReview.reviewer?.qualificationReference && sourceReview.reviewer?.reviewedOn && sourceReview.reviewer?.declaration ? 'PRESENT_STRUCTURALLY_VALID' : 'MISSING',
  sourceDecisionsReceived: (sourceReview.items ?? []).filter((item) => item.decision && item.decision !== 'PENDING').length,
  physicalEvidenceSubmissionsFound: submitted,
  canonicalMeasurementRunsFound: 0,
  realCalculationsExecuted: 0,
  realStageBApprovals: 0,
  validationRelease: 'NOT_CREATED',
  foods,
};
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
