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
  {
    assessmentId: 'V1735_SOURCE_FSSAI_STANDARDS',
    sourceName: 'Food Safety and Standards product standards and identity resources',
    sourceOrganisation: 'Food Safety and Standards Authority of India',
    sourceCountry: 'INDIA',
    sourceUrl: 'https://www.fssai.gov.in/cms/compendium-fss-fps-fa.php',
    sourceClass: 'INDIA_REGULATORY_IDENTITY',
    rightsStatus: 'PUBLIC_REGULATORY_REFERENCE_ONLY',
    electronicProductReuse: 'NOT_CLEARED',
    nutritionUseDecision: 'PROHIBITED',
    rationale: 'The standards support regulated product identity but do not provide a complete analytical per-100g nutrient vector for each exact catalogue identity; the FSSAI site also reserves rights.',
    numericValuesIngested: false,
    processorVersion: PROCESSOR,
  },
  {
    assessmentId: 'V1735_SOURCE_ICAR_PUBLICATIONS',
    sourceName: 'ICAR publications and commodity research',
    sourceOrganisation: 'Indian Council of Agricultural Research',
    sourceCountry: 'INDIA',
    sourceUrl: 'https://icar.gov.in/en/all-publications',
    sourceClass: 'INDIA_AGRICULTURAL_SCIENCE',
    rightsStatus: 'PUBLICATION_SPECIFIC_REUSE_REVIEW_REQUIRED',
    electronicProductReuse: 'NOT_CLEARED',
    nutritionUseDecision: 'PROHIBITED',
    rationale: 'The reviewed commodity publications do not supply reusable, primary, complete, exact-state analytical records for the entire frozen cohort; derivative IFCT values do not bypass IFCT rights.',
    numericValuesIngested: false,
    processorVersion: PROCESSOR,
  },
  {
    assessmentId: 'V1735_SOURCE_INDIA_UNIVERSITY_PUBLICATIONS',
    sourceName: 'Indian government and university scientific publications search',
    sourceOrganisation: 'Multiple Indian public research institutions',
    sourceCountry: 'INDIA',
    sourceUrl: 'https://shodhganga.inflibnet.ac.in/',
    sourceClass: 'INDIA_PUBLIC_SCIENTIFIC_LITERATURE',
    rightsStatus: 'PUBLICATION_SPECIFIC_REUSE_REVIEW_REQUIRED',
    electronicProductReuse: 'NOT_CLEARED',
    nutritionUseDecision: 'PROHIBITED',
    rationale: 'No cohort-wide set of exact identity, state, edible-portion, complete analytical nutrition records with explicit product reuse rights was established.',
    numericValuesIngested: false,
    processorVersion: PROCESSOR,
  },
  {
    assessmentId: 'V1735_SOURCE_INDIA_MARKET_MANUFACTURERS',
    sourceName: 'India-market manufacturer and regulatory label evidence',
    sourceOrganisation: 'Product-specific manufacturers',
    sourceCountry: 'INDIA',
    sourceUrl: 'https://www.fssai.gov.in/',
    sourceClass: 'INDIA_MARKET_PRODUCT_EVIDENCE',
    rightsStatus: 'PRODUCT_AND_LABEL_SPECIFIC',
    electronicProductReuse: 'NOT_CLEARED',
    nutritionUseDecision: 'PROHIBITED',
    rationale: 'Manufacturer labels are product, formulation, lot, and serving specific and cannot be substituted for generic catalogue identities without an exact governed product mapping and retained label evidence.',
    numericValuesIngested: false,
    processorVersion: PROCESSOR,
  },
  {
    assessmentId: 'V1735_SOURCE_EXISTING_FITEATSY',
    sourceName: 'Existing governed Fiteatsy food evidence',
    sourceOrganisation: 'Fiteatsy',
    sourceCountry: 'INDIA',
    sourceUrl: 'repository://food-curation/v17.31-v17.34',
    sourceClass: 'EXISTING_GOVERNED_EVIDENCE',
    rightsStatus: 'INTERNAL_REUSE_CLEARED',
    electronicProductReuse: 'CLEARED',
    nutritionUseDecision: 'NOT_ACTIVATION_ELIGIBLE',
    rationale: 'Exact alias and governed-parent reuse was evaluated in the prior immutable resolution chain; no exact reusable governed identity remained for this 123-item cohort.',
    numericValuesIngested: false,
    processorVersion: PROCESSOR,
  },
  {
    assessmentId: 'V1735_SOURCE_USDA_FDC',
    sourceName: 'USDA FoodData Central pinned releases',
    sourceOrganisation: 'United States Department of Agriculture',
    sourceCountry: 'UNITED_STATES',
    sourceUrl: 'https://fdc.nal.usda.gov/download-datasets/',
    sourceClass: 'APPROVED_GENERIC_FALLBACK',
    rightsStatus: 'US_FEDERAL_PUBLIC_DOMAIN',
    electronicProductReuse: 'CLEARED',
    nutritionUseDecision: 'NOT_ACTIVATION_ELIGIBLE',
    rationale: 'The permitted generic-source passes in v17.32B and v17.33A did not establish an exact remaining identity/state/edible-portion match with the mandatory vector, alias, or governed parent.',
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
  const identity = {
    canonicalName: item.canonicalName,
    aliases: prior.aliases,
    botanicalIdentity: null,
    botanicalIdentityStatus: 'NOT_ESTABLISHED_BY_REUSABLE_EXACT_SOURCE',
    cultivar: null,
    cultivarStatus: 'NOT_ESTABLISHED_BY_REUSABLE_EXACT_SOURCE',
    exactState: prior.exactState,
    preparationState: prior.preparationState,
    ediblePortion: null,
    ediblePortionStatus: 'NOT_ESTABLISHED_BY_REUSABLE_EXACT_SOURCE',
  };
  const sourceChecks = sourceAssessments.map((source) => ({
    assessmentId: source.assessmentId,
    sourceClass: source.sourceClass,
    rightsStatus: source.rightsStatus,
    identityMatch: source.assessmentId === 'V1735_SOURCE_EXISTING_FITEATSY' ? 'NO_EXACT_ALIAS_OR_PARENT' : 'NOT_ESTABLISHED',
    stateMatch: 'NOT_ESTABLISHED',
    cultivarMatch: 'NOT_ESTABLISHED',
    ediblePortionMatch: 'NOT_ESTABLISHED',
    nutrientCompleteness: 'NO_ACTIVATION_ELIGIBLE_VECTOR',
    rejectionReason: source.rationale,
  }));
  const servingEvidence = { status: 'NOT_ESTABLISHED', semanticServing: null, directAddQuantity: null };
  const nutritionEvidence = { status: 'NOT_INGESTED', basis: 'PER_100G_EDIBLE_PORTION_AS_CATALOGUED', vector: null, reason: 'NO_RIGHTS_CLEARED_COMPLETE_EXACT_SOURCE' };
  return {
    decisionId: `V1735_${item.referenceItemId}`,
    referenceItemId: item.referenceItemId,
    sourceRecordId: item.sourceRecordId,
    canonicalName: item.canonicalName,
    aliases: prior.aliases,
    botanicalIdentity: identity.botanicalIdentity,
    botanicalIdentityStatus: identity.botanicalIdentityStatus,
    cultivar: identity.cultivar,
    cultivarStatus: identity.cultivarStatus,
    referenceState: item.referenceState,
    exactState: prior.exactState,
    preparationState: prior.preparationState,
    ediblePortion: identity.ediblePortion,
    ediblePortionStatus: identity.ediblePortionStatus,
    category: prior.category,
    subcategory: prior.subcategory,
    evidenceClass: prior.evidenceClass,
    intendedOperationalUse: prior.intendedOperationalUse,
    intendedRoles: prior.intendedRoles,
    priorTerminalReason: item.terminalReason,
    priorProcessorVersion: item.effectiveProcessorVersion,
    priorUsdaDecision: adjudication?.finalDecision ?? null,
    sourceChecks,
    fallbackGateResults: {
      indiaAuthoritativeSource: 'FAILED_RIGHTS_OR_COMPLETE_EXACT_MATCH',
      approvedGenericSource: 'FAILED_EXACT_IDENTITY_STATE_OR_PORTION',
      existingGovernedReuse: 'NO_EXACT_REUSABLE_IDENTITY',
      aliasResolution: 'NO_EXACT_ALIAS',
      governedParentMapping: 'NO_EXACT_GOVERNED_PARENT',
      stateMatch: 'NOT_ESTABLISHED',
      ediblePortionMatch: 'NOT_ESTABLISHED',
      cultivarResolution: 'NOT_ESTABLISHED',
    },
    blockerClasses: ['RIGHTS', 'IDENTITY', 'STATE', 'CULTIVAR', 'EDIBLE_PORTION', 'NUTRIENT_COMPLETENESS'],
    ifctRightsStatus: 'PRIOR_WRITTEN_PERMISSION_REQUIRED',
    ifctNumericValuesIngested: false,
    reusableIndiaAlternativeStatus: 'NO_COMPLETE_EXACT_SOURCE',
    finalDecision: 'INDIA_LAB_VALIDATION_REQUIRED',
    activationEligible: false,
    nutritionVector: null,
    nutritionBasis: nutritionEvidence.basis,
    nutritionEvidenceHash: sha256(JSON.stringify(nutritionEvidence)),
    selectedSource: null,
    servingEvidence,
    servingHash: sha256(JSON.stringify(servingEvidence)),
    provenanceHash: sha256(JSON.stringify({ identity, sourceChecks, priorProcessorVersion: item.effectiveProcessorVersion, priorUsdaDecision: adjudication?.finalDecision ?? null })),
    dietClass: 'NOT_RUNTIME_ELIGIBLE',
    mealHeadEligibility: [],
    runtimeVisibility: 'EVIDENCE_REGISTER_ONLY',
    searchable: false,
    generatorEligible: false,
    componentEligible: false,
    directAddEligible: false,
    requiredLabCountry: 'INDIA',
    preferredAccreditation: 'NABL_ISO_IEC_17025',
    requiredScope: 'FOOD_PROXIMATE_ANALYSIS',
    requiredAnalytes: ['ENERGY_KCAL', 'PROTEIN_G', 'CARBOHYDRATE_G', 'FAT_G', 'FIBRE_G', 'MOISTURE_G', 'ASH_G'],
    requiredBasis: 'PER_100G_EDIBLE_PORTION_AS_CATALOGUED',
    samplePreparationProtocol: {
      prerequisite: 'QUALIFIED_TAXONOMIC_CULTIVAR_STATE_AND_EDIBLE_PORTION_SIGNOFF',
      samplingPlan: 'THREE_INDEPENDENT_INDIA_MARKET_LOTS_WITH_LOCATION_DATE_SUPPLIER_AND_LOT_TRACEABILITY',
      preparation: 'REMOVE_NON_EDIBLE_MATERIAL_EXACTLY_AS_SIGNED_OFF_THEN HOMOGENISE_EACH_LOT_SEPARATELY',
      reporting: 'REPORT_EACH_LOT_AND_AGGREGATION_METHOD_PER_100G_EDIBLE_PORTION_WITH_UNCERTAINTY_LOD_LOQ_AND_METHOD_VERSION',
    },
    nablTestCategory: 'CHEMICAL_FOOD_AND_AGRICULTURAL_PRODUCTS_PROXIMATE_ANALYSIS',
    expectedEvidenceArtifact: 'SIGNED_NABL_SCOPE_REPORT_PLUS_CHAIN_OF_CUSTODY_SAMPLE_PHOTOS_TAXONOMIC_SIGNOFF_RAW_RESULTS_METHODS_UNCERTAINTY_LOD_LOQ',
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
    botanicalIdentity: item.botanicalIdentity,
    botanicalIdentityStatus: item.botanicalIdentityStatus,
    cultivar: item.cultivar,
    cultivarStatus: item.cultivarStatus,
    exactState: item.exactState,
    ediblePortion: item.ediblePortion,
    ediblePortionStatus: item.ediblePortionStatus,
    sourcesChecked: item.sourceChecks,
    blockerClasses: item.blockerClasses,
    sampleCountry: item.requiredLabCountry,
    preferredAccreditation: item.preferredAccreditation,
    requiredScope: item.requiredScope,
    requiredAnalytes: item.requiredAnalytes,
    requiredBasis: item.requiredBasis,
    samplePreparationProtocol: item.samplePreparationProtocol,
    nablTestCategory: item.nablTestCategory,
    expectedEvidenceArtifact: item.expectedEvidenceArtifact,
    provenanceHash: item.provenanceHash,
    nutritionEvidenceHash: item.nutritionEvidenceHash,
    servingHash: item.servingHash,
    status: 'PENDING_SAMPLE_AND_LAB_EVIDENCE',
  })),
};
labQueue.artifactSha256 = sha256(`${JSON.stringify(labQueue, null, 2)}\n`);

writeFileSync(new URL('food_india_source_assessment_v17_35.json', dataRoot), `${JSON.stringify(sourceAssessmentArtifact, null, 2)}\n`);
writeFileSync(new URL('food_india_resolution_v17_35.json', dataRoot), `${JSON.stringify(decisions, null, 2)}\n`);
writeFileSync(new URL('food_india_lab_queue_v17_35.json', dataRoot), `${JSON.stringify(labQueue, null, 2)}\n`);
console.log(JSON.stringify({ cohortCount: records.length, evidenceClassCounts, activationQueueCount: 0, labQueueCount: labQueue.queueCount, ifctNumericValueCount: 0, artifactSha256: decisions.artifactSha256 }, null, 2));
