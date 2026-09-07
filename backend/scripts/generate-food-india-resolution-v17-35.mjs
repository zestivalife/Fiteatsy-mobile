import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

const dataRoot = new URL('../src/modules/nutrition/food-curation/data/', import.meta.url);
const BASELINE_SHA = '6b90f3fe06cf6ff1402cc8852dda208076615ea7';
const PROCESSOR = 'FOOD_INDIA_EVIDENCE_RESOLUTION_V17_35';
const GENERATED_AT = '2026-09-07T00:00:00.000Z';
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const load = (filename) => {
  const bytes = readFileSync(new URL(filename, dataRoot));
  return { filename, bytes, value: JSON.parse(bytes.toString('utf8')), sha256: sha256(bytes) };
};

const closureSource = load('food_catalogue_closure_v17_34.json');
const resolutionSource = load('food_resolution_v17_32c_decisions.json');
const adjudicationSource = load('food_usda_adjudication_v17_33a_decisions.json');
const blocked = closureSource.value.records.filter((item) => item.terminalState === 'BLOCKED_EVIDENCE');
const resolutionByReference = new Map(resolutionSource.value.decisions.map((item) => [item.referenceItemId, item]));
const adjudicationByReference = new Map(adjudicationSource.value.decisions.map((item) => [item.referenceItemId, item]));

if (blocked.length !== 123 || new Set(blocked.map((item) => item.referenceItemId)).size !== 123) throw new Error('V17_35_BLOCKED_COHORT_MISMATCH');

const sourceAssessments = [
  {
    assessmentId: 'V1735_SOURCE_IFCT2017_NIN',
    sourceName: 'Indian Food Composition Tables 2017',
    sourceOrganisation: 'ICMR - National Institute of Nutrition',
    sourceCountry: 'INDIA',
    sourceUrl: 'https://www.nin.res.in/ebooks/IFCT2017_16122024.pdf',
    sourceDocumentSha256: 'e87629581a58faca286f4886504bc75f33d6d3771a50fb4e40e2afee2b2b32dd',
    sourceClass: 'INDIA_AUTHORITATIVE',
    rightsStatus: 'PRIOR_WRITTEN_PERMISSION_REQUIRED',
    electronicProductReuse: 'NOT_CLEARED',
    nutritionUseDecision: 'PROHIBITED',
    rationale: 'The publication copyright page requires prior written NIN permission for electronic storage or reproduction in a product. No Fiteatsy permission artifact is present.',
    numericValuesIngested: false,
    processorVersion: PROCESSOR,
  },
  {
    assessmentId: 'V1735_SOURCE_OGD_ICAR_NUTRIENT_WATER_PRODUCTIVITY',
    sourceName: 'Nutrient content and nutritional water productivity of selected food commodities',
    sourceOrganisation: 'Indian Council of Agricultural Research / Department of Agricultural Research and Education',
    sourceCountry: 'INDIA',
    sourceUrl: 'https://ap.data.gov.in/catalog/nutrient-content-and-nutritional-water-productivity-selected-food-commodities',
    licenseUrl: 'https://data.gov.in/godl',
    sourceClass: 'INDIA_AUTHORITATIVE_OPEN_DATA',
    rightsStatus: 'GODL_REUSE_ALLOWED_WITH_ATTRIBUTION',
    electronicProductReuse: 'CLEARED',
    nutritionUseDecision: 'NOT_ACTIVATION_ELIGIBLE',
    rationale: 'The open dataset is reusable, but it does not establish exact identity and preparation state with the complete per-100g mandatory macro vector for the 123-item cohort.',
    numericValuesIngested: false,
    processorVersion: PROCESSOR,
  },
];

const sourceAssessmentArtifact = {
  schemaVersion: 'FITEATSY_FOOD_INDIA_SOURCE_ASSESSMENT_V17_35',
  baselineSha: BASELINE_SHA,
  processorVersion: PROCESSOR,
  generatedAt: GENERATED_AT,
  assessmentCount: sourceAssessments.length,
  ifctElectronicReuseCleared: false,
  activationEligibleAlternativeCount: 0,
  assessments: sourceAssessments,
};
sourceAssessmentArtifact.artifactSha256 = sha256(`${JSON.stringify(sourceAssessmentArtifact, null, 2)}\n`);

const records = blocked.map((item) => {
  const prior = resolutionByReference.get(item.referenceItemId);
  if (!prior) throw new Error(`V17_35_PRIOR_RESOLUTION_MISSING:${item.referenceItemId}`);
  const adjudication = adjudicationByReference.get(item.referenceItemId);
  return {
    decisionId: `V1735_${item.referenceItemId}`,
    referenceItemId: item.referenceItemId,
    sourceRecordId: item.sourceRecordId,
    canonicalName: item.canonicalName,
    referenceState: item.referenceState,
    category: prior.category,
    subcategory: prior.subcategory,
    evidenceClass: prior.evidenceClass,
    intendedOperationalUse: prior.intendedOperationalUse,
    intendedRoles: prior.intendedRoles,
    priorTerminalReason: item.terminalReason,
    priorProcessorVersion: item.effectiveProcessorVersion,
    priorUsdaDecision: adjudication?.finalDecision ?? null,
    ifctRightsStatus: 'PRIOR_WRITTEN_PERMISSION_REQUIRED',
    ifctNumericValuesIngested: false,
    reusableIndiaAlternativeStatus: 'NO_COMPLETE_EXACT_SOURCE',
    finalDecision: 'INDIA_LAB_VALIDATION_REQUIRED',
    activationEligible: false,
    nutritionVector: null,
    selectedSource: null,
    requiredLabCountry: 'INDIA',
    preferredAccreditation: 'NABL_ISO_IEC_17025',
    requiredScope: 'FOOD_PROXIMATE_ANALYSIS',
    requiredAnalytes: ['ENERGY_KCAL', 'PROTEIN_G', 'CARBOHYDRATE_G', 'FAT_G', 'FIBRE_G', 'MOISTURE_G', 'ASH_G'],
    requiredBasis: 'PER_100G_EDIBLE_PORTION_AS_CATALOGUED',
    processorVersion: PROCESSOR,
  };
}).sort((left, right) => Number(left.sourceRecordId) - Number(right.sourceRecordId));

const evidenceClassCounts = Object.fromEntries([...new Set(records.map((item) => item.evidenceClass))].sort().map((value) => [value, records.filter((item) => item.evidenceClass === value).length]));
const expectedClassCounts = { DAIRY: 16, GLOBAL_GENERIC_COMMODITY: 26, INDIA_SPECIFIC_COMMODITY: 28, PROTEIN: 8, RAW_INGREDIENT: 45 };
if (JSON.stringify(evidenceClassCounts) !== JSON.stringify(expectedClassCounts)) throw new Error(`V17_35_CLASS_COUNTS:${JSON.stringify(evidenceClassCounts)}`);
if (records.some((item) => item.activationEligible || item.nutritionVector || item.selectedSource || item.ifctNumericValuesIngested)) throw new Error('V17_35_UNCLEARED_NUTRITION_LEAK');

const decisions = {
  schemaVersion: 'FITEATSY_FOOD_INDIA_RESOLUTION_V17_35',
  baselineSha: BASELINE_SHA,
  processorVersion: PROCESSOR,
  generatedAt: GENERATED_AT,
  sourceArtifacts: [
    { filename: closureSource.filename, sha256: closureSource.sha256 },
    { filename: resolutionSource.filename, sha256: resolutionSource.sha256 },
    { filename: adjudicationSource.filename, sha256: adjudicationSource.sha256 },
    { filename: 'food_india_source_assessment_v17_35.json', sha256: sourceAssessmentArtifact.artifactSha256 },
  ],
  cohortCount: records.length,
  decisionCounts: { INDIA_LAB_VALIDATION_REQUIRED: records.length },
  evidenceClassCounts,
  activationQueueCount: 0,
  ifctNumericValueCount: 0,
  decisions: records,
};
decisions.artifactSha256 = sha256(`${JSON.stringify(decisions, null, 2)}\n`);

const labQueue = {
  schemaVersion: 'FITEATSY_FOOD_INDIA_LAB_QUEUE_V17_35',
  baselineSha: BASELINE_SHA,
  processorVersion: PROCESSOR,
  generatedAt: GENERATED_AT,
  sourceArtifact: 'food_india_resolution_v17_35.json',
  sourceArtifactSha256: decisions.artifactSha256,
  queueCount: records.length,
  evidenceClassCounts,
  records: records.map((item) => ({
    labRequestId: `V1735_LAB_${item.referenceItemId}`,
    referenceItemId: item.referenceItemId,
    canonicalName: item.canonicalName,
    referenceState: item.referenceState,
    evidenceClass: item.evidenceClass,
    sampleCountry: item.requiredLabCountry,
    preferredAccreditation: item.preferredAccreditation,
    requiredScope: item.requiredScope,
    requiredAnalytes: item.requiredAnalytes,
    requiredBasis: item.requiredBasis,
    status: 'PENDING_SAMPLE_AND_LAB_EVIDENCE',
  })),
};
labQueue.artifactSha256 = sha256(`${JSON.stringify(labQueue, null, 2)}\n`);

writeFileSync(new URL('food_india_source_assessment_v17_35.json', dataRoot), `${JSON.stringify(sourceAssessmentArtifact, null, 2)}\n`);
writeFileSync(new URL('food_india_resolution_v17_35.json', dataRoot), `${JSON.stringify(decisions, null, 2)}\n`);
writeFileSync(new URL('food_india_lab_queue_v17_35.json', dataRoot), `${JSON.stringify(labQueue, null, 2)}\n`);
console.log(JSON.stringify({ cohortCount: records.length, evidenceClassCounts, activationQueueCount: 0, labQueueCount: labQueue.queueCount, ifctNumericValueCount: 0, artifactSha256: decisions.artifactSha256 }, null, 2));
