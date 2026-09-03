import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.join(backendRoot, 'src/modules/nutrition/food-curation/data');
const inputPath = process.argv[2] ? path.resolve(process.argv[2]) : path.join(dataDir, 'first-five.measurement-template.json');
const outputPath = process.argv[3] ? path.resolve(process.argv[3]) : path.join(dataDir, 'stage-b.machine-status.json');
const input = JSON.parse(fs.readFileSync(inputPath, 'utf8')) as { measurements?: Array<Record<string, unknown>> };
const required = ['CP_CHAPATI', 'CP_MOONG_DAL', 'CP_BHINDI_SABJI', 'CP_BHINDI_ALOO', 'CP_POHA_PEANUT'];
const byId = new Map((input.measurements ?? []).map((item) => [String(item.preparationId ?? ''), item]));
const complete = (item: Record<string, unknown> | undefined) => Boolean(item
  && item.status === 'COMPLETE'
  && typeof item.measurementRunId === 'string'
  && typeof item.formulaSha256 === 'string'
  && typeof item.finalPreparedWeightGrams === 'number'
  && item.finalPreparedWeightGrams > 0);
const foods = required.map((preparationId) => ({ preparationId, state: complete(byId.get(preparationId)) ? 'STRUCTURED_VALIDATION_REQUIRED' : 'MEASUREMENT_REQUIRED' }));
const found = foods.filter((item) => item.state !== 'MEASUREMENT_REQUIRED').length;
const report = {
  schemaVersion: 'FITEATSY_STAGE_B_STATUS_V1',
  generatedFromRepositoryState: true,
  stageBEngineering: 'CANDIDATE_IMPLEMENTED',
  firstFiveData: found ? 'PARTIAL_MEASUREMENT_EVIDENCE_REQUIRES_VALIDATION' : 'STAGE_B_BLOCKED — PHYSICAL_MEASUREMENT_EVIDENCE_REQUIRED',
  controlledCurationMethodology: 'PARTIAL',
  indianFoodPopulation: 'STILL_BLOCKED',
  phase3ComponentHandoff: 'BLOCKED',
  production: 'UNCHANGED',
  primaryNextGate: 'PHYSICAL_MEASUREMENT_EVIDENCE_REQUIRED',
  realMeasurementRunsFound: found,
  realCalculationsExecuted: 0,
  realStageBApprovals: 0,
  validationRelease: 'NOT_CREATED',
  foods,
};
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
