import crypto from 'node:crypto';
import type { ParsedParameter, ReportAnalysisResult } from './reports.service.js';

export const CORE_BIOMARKERS = [
  'HbA1c',
  'Fasting Glucose',
  'Insulin',
  'HOMA-IR',
  'Triglycerides',
  'HDL Cholesterol',
  'LDL Cholesterol',
  'Total Cholesterol',
  'Creatinine',
  'eGFR',
  'Urea',
  'BUN',
  'Uric Acid',
  'ALT',
  'AST',
  'GGT',
  'Bilirubin',
  'Albumin',
  'Non-HDL',
  'VLDL',
  'ApoB',
  'Lipoprotein(a)',
  'hs-CRP',
  'Vitamin B12',
  'Vitamin D',
  'Ferritin',
  'Iron',
  'Hemoglobin',
  'TSH',
  'Free T4',
  'WBC',
  'Platelets'
] as const;

const normalizeName = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const coreAliases: Array<{ canonicalName: string; aliases: string[]; dimension: string }> = [
  { canonicalName: 'HbA1c', aliases: ['Hb A1c', 'Glycated Hemoglobin', 'Glycosylated Hemoglobin'], dimension: 'Metabolic' },
  { canonicalName: 'Fasting Glucose', aliases: ['Glucose', 'FBS', 'Blood Sugar Fasting'], dimension: 'Metabolic' },
  { canonicalName: 'Insulin', aliases: ['Fasting Insulin'], dimension: 'Metabolic' },
  { canonicalName: 'HOMA-IR', aliases: ['HOMA IR', 'HOMA'], dimension: 'Metabolic' },
  { canonicalName: 'Triglycerides', aliases: ['Triglyceride', 'TG'], dimension: 'Metabolic' },
  { canonicalName: 'HDL Cholesterol', aliases: ['HDL'], dimension: 'Metabolic' },
  { canonicalName: 'LDL Cholesterol', aliases: ['LDL'], dimension: 'Metabolic' },
  { canonicalName: 'Total Cholesterol', aliases: ['Cholesterol'], dimension: 'Metabolic' },
  { canonicalName: 'Creatinine', aliases: ['Serum Creatinine'], dimension: 'Kidney' },
  { canonicalName: 'eGFR', aliases: ['Estimated GFR'], dimension: 'Kidney' },
  { canonicalName: 'Urea', aliases: ['Blood Urea'], dimension: 'Kidney' },
  { canonicalName: 'BUN', aliases: ['Blood Urea Nitrogen'], dimension: 'Kidney' },
  { canonicalName: 'Uric Acid', aliases: ['Serum Uric Acid'], dimension: 'Kidney' },
  { canonicalName: 'ALT', aliases: ['SGPT', 'Alanine Aminotransferase'], dimension: 'Liver' },
  { canonicalName: 'AST', aliases: ['SGOT', 'Aspartate Aminotransferase'], dimension: 'Liver' },
  { canonicalName: 'GGT', aliases: ['Gamma GT'], dimension: 'Liver' },
  { canonicalName: 'Bilirubin', aliases: ['Total Bilirubin'], dimension: 'Liver' },
  { canonicalName: 'Albumin', aliases: ['Serum Albumin'], dimension: 'Liver' },
  { canonicalName: 'Non-HDL', aliases: ['Non HDL'], dimension: 'Cardiovascular' },
  { canonicalName: 'VLDL', aliases: ['VLDL Cholesterol'], dimension: 'Cardiovascular' },
  { canonicalName: 'ApoB', aliases: ['Apolipoprotein B'], dimension: 'Cardiovascular' },
  { canonicalName: 'Lipoprotein(a)', aliases: ['Lp(a)', 'Lipoprotein A'], dimension: 'Cardiovascular' },
  { canonicalName: 'hs-CRP', aliases: ['High Sensitivity CRP', 'CRP'], dimension: 'Cardiovascular' },
  { canonicalName: 'Vitamin B12', aliases: ['B12', 'Cobalamin', 'Serum B12'], dimension: 'Nutrition' },
  { canonicalName: 'Vitamin D', aliases: ['25-OH Vitamin D', 'Vitamin D3'], dimension: 'Nutrition' },
  { canonicalName: 'Ferritin', aliases: ['Serum Ferritin'], dimension: 'Nutrition' },
  { canonicalName: 'Iron', aliases: ['Serum Iron'], dimension: 'Nutrition' },
  { canonicalName: 'Hemoglobin', aliases: ['Hb', 'Haemoglobin'], dimension: 'Nutrition' },
  { canonicalName: 'TSH', aliases: ['Thyroid Stimulating Hormone'], dimension: 'Thyroid/Blood Context' },
  { canonicalName: 'Free T4', aliases: ['FT4'], dimension: 'Thyroid/Blood Context' },
  { canonicalName: 'WBC', aliases: ['White Blood Cells', 'White Blood Cell Count'], dimension: 'Thyroid/Blood Context' },
  { canonicalName: 'Platelets', aliases: ['Platelet Count'], dimension: 'Thyroid/Blood Context' }
];

export const canonicalBiomarkerName = (rawName: string) => {
  const normalized = normalizeName(rawName);
  const match = coreAliases.find((item) =>
    normalizeName(item.canonicalName) === normalized || item.aliases.some((alias) => normalizeName(alias) === normalized)
  );
  return match?.canonicalName ?? rawName.trim().replace(/\s+/g, ' ');
};

export const biomarkerTier = (canonicalName: string) =>
  coreAliases.some((item) => normalizeName(item.canonicalName) === normalizeName(canonicalName)) ? 1 : 2;

export const biomarkerDimension = (canonicalName: string, fallback: string) =>
  coreAliases.find((item) => normalizeName(item.canonicalName) === normalizeName(canonicalName))?.dimension ?? fallback;

export const documentHash = (buffer: Buffer) => crypto.createHash('sha256').update(buffer).digest('hex');

const hasNumericReferenceRange = (range: string) => /(\d+(?:\.\d+)?)\s*(?:-|–|<|>)/.test(range);

const hasSupportedDocumentSignal = (text: string, parameters: ParsedParameter[]) =>
  /\b(lab|labs|laboratory|diagnostic|diagnostics|pathology|blood|serum|plasma|cbc|lipid|thyroid|vitamin|glucose|hba1c)\b/i.test(text) ||
  parameters.length >= 5;

const sectionSignals: Array<{ key: string; pattern: RegExp; expected: number }> = [
  { key: 'cbc', pattern: /\b(cbc|complete blood count|hemogram|haemogram|wbc|rbc|platelet)\b/i, expected: 14 },
  { key: 'lipid', pattern: /\b(lipid|cholesterol|triglyceride|hdl|ldl|vldl)\b/i, expected: 8 },
  { key: 'diabetes', pattern: /\b(hba1c|glycated|glucose|fasting sugar|insulin|homa)\b/i, expected: 5 },
  { key: 'liver', pattern: /\b(liver|sgpt|sgot|alt|ast|bilirubin|albumin|ggt|alp)\b/i, expected: 9 },
  { key: 'kidney', pattern: /\b(kidney|renal|creatinine|urea|bun|egfr|uric acid)\b/i, expected: 8 },
  { key: 'thyroid', pattern: /\b(thyroid|tsh|t3|t4|ft3|ft4)\b/i, expected: 5 },
  { key: 'vitamins', pattern: /\b(vitamin|b12|d3|25-oh|ferritin|iron)\b/i, expected: 7 }
];

const detectSections = (text: string, parameters: ParsedParameter[]) => {
  const evidence = `${text}\n${parameters.map((item) => item.name).join('\n')}`;
  return sectionSignals.filter((section) => section.pattern.test(evidence)).map((section) => section.key);
};

const estimateExpectedRange = (
  document: ReportAnalysisResult['document'],
  sections: string[],
  parameters: ParsedParameter[]
) => {
  if (!document.supported) return { min: 0, max: 0, basis: 'unsupported_document' };

  if (document.documentType === 'full_body_checkup' && document.pageCount >= 8) {
    return { min: 60, max: 80, basis: 'multi_page_full_body_report' };
  }

  const bySections = sections.reduce((total, key) => total + (sectionSignals.find((item) => item.key === key)?.expected ?? 0), 0);
  const min = Math.max(8, Math.min(60, Math.round(bySections * 0.65), parameters.length));
  const max = Math.max(min, Math.min(80, Math.max(bySections, parameters.length)));
  return { min, max, basis: sections.length ? 'detected_report_sections' : 'minimum_medical_report_gate' };
};

const plausibleRanges: Array<{ pattern: RegExp; min: number; max: number; unitPattern?: RegExp }> = [
  { pattern: /^hba1c$/i, min: 3, max: 20, unitPattern: /%|mmol\/mol/i },
  { pattern: /glucose/i, min: 20, max: 600 },
  { pattern: /insulin/i, min: 0, max: 300 },
  { pattern: /triglyceride/i, min: 20, max: 2000 },
  { pattern: /cholesterol|hdl|ldl|vldl|non-hdl/i, min: 5, max: 1000 },
  { pattern: /creatinine/i, min: 0.1, max: 20 },
  { pattern: /^egfr$/i, min: 1, max: 200 },
  { pattern: /urea|bun/i, min: 1, max: 300 },
  { pattern: /uric acid/i, min: 0.5, max: 30 },
  { pattern: /^alt$|^ast$|^ggt$/i, min: 1, max: 2000 },
  { pattern: /bilirubin/i, min: 0, max: 40 },
  { pattern: /albumin/i, min: 0.5, max: 8 },
  { pattern: /vitamin b12/i, min: 20, max: 3000 },
  { pattern: /vitamin d/i, min: 1, max: 300 },
  { pattern: /ferritin/i, min: 1, max: 5000 },
  { pattern: /^iron$/i, min: 5, max: 500 },
  { pattern: /hemoglobin/i, min: 3, max: 25 },
  { pattern: /^tsh$/i, min: 0.001, max: 100 },
  { pattern: /free t4/i, min: 0.1, max: 10 },
  { pattern: /^wbc$/i, min: 0.1, max: 100 },
  { pattern: /platelet/i, min: 5, max: 1500 }
];

const plausibleValueCheck = (parameter: ParsedParameter) => {
  const canonicalName = canonicalBiomarkerName(parameter.name);
  const rule = plausibleRanges.find((item) => item.pattern.test(canonicalName));
  if (!rule) return { ok: Number.isFinite(parameter.value) && Math.abs(parameter.value) < 100000, reason: '' };
  const ok = parameter.value >= rule.min && parameter.value <= rule.max;
  const unitOk = rule.unitPattern ? rule.unitPattern.test(parameter.unit || parameter.referenceRange) : true;
  return {
    ok: ok && unitOk,
    reason: ok && unitOk ? '' : `${canonicalName} value ${parameter.value}${parameter.unit ? ` ${parameter.unit}` : ''} is outside clinical plausibility rules.`
  };
};

export const classifyDocument = (input: {
  text: string;
  mimeType: string;
  parameterCount: number;
  labName: string;
}): ReportAnalysisResult['document'] => {
  const isImage = input.mimeType.toLowerCase().includes('image');
  const supported = hasSupportedDocumentSignal(input.text, []) || input.parameterCount > 0;
  const documentType = supported
    ? input.parameterCount >= 15
      ? 'full_body_checkup'
      : 'blood_investigation_report'
    : 'unsupported_document';
  const confidence = supported ? Math.min(0.98, 0.58 + Math.min(input.parameterCount, 25) / 60) : 0.2;
  return {
    documentType,
    supported,
    labName: input.labName,
    pageCount: isImage ? 1 : Math.max(1, (input.text.match(/\f/g)?.length ?? 0) + 1),
    imageQuality: isImage ? 'requires_ai_vision' : input.text.length > 150 ? 'text_extractable' : 'low_text_density',
    confidence: Number(confidence.toFixed(2))
  };
};

export const buildExtractionGovernance = (
  text: string,
  parameters: ParsedParameter[],
  document: ReportAnalysisResult['document']
): Pick<ReportAnalysisResult, 'extractionAttempts' | 'qualityGate' | 'healthAssessment'> => {
  const canonicalCore = new Set<string>();
  const failedBiomarkers: string[] = [];
  const conflicts: string[] = [];
  let validationConfidenceTotal = 0;
  let validatedCount = 0;
  const seenValues = new Map<string, number>();

  for (const parameter of parameters) {
    const canonicalName = canonicalBiomarkerName(parameter.name);
    const hasUnit = Boolean(parameter.unit.trim());
    const hasRange = hasNumericReferenceRange(parameter.referenceRange);
    const plausibility = plausibleValueCheck(parameter);
    const clinicallyPlausible = plausibility.ok;
    const validationConfidence = hasUnit && hasRange && clinicallyPlausible ? 0.94 : 0.55;
    validationConfidenceTotal += validationConfidence;
    if (hasUnit && hasRange && clinicallyPlausible) validatedCount += 1;
    if (biomarkerTier(canonicalName) === 1) canonicalCore.add(canonicalName);
    if (!hasUnit || !hasRange || !clinicallyPlausible) failedBiomarkers.push(plausibility.reason || parameter.name);
    const previousValue = seenValues.get(canonicalName);
    if (typeof previousValue === 'number' && Math.abs(previousValue - parameter.value) > Math.max(0.2, Math.abs(previousValue) * 0.15)) {
      conflicts.push(`${canonicalName} has conflicting extracted values ${previousValue} and ${parameter.value}.`);
    }
    if (typeof previousValue !== 'number') seenValues.set(canonicalName, parameter.value);
  }

  const extractionConfidence = parameters.length === 0 ? 0 : Math.min(0.98, 0.62 + Math.min(parameters.length, 40) / 120);
  const validationConfidence = parameters.length === 0 ? 0 : validationConfidenceTotal / parameters.length;
  const completeness = canonicalCore.size / CORE_BIOMARKERS.length;
  const confidence = Number(((extractionConfidence * 0.35) + (validationConfidence * 0.35) + (completeness * 0.3)).toFixed(2));
  const criticalPresent =
    canonicalCore.has('HbA1c') ||
    canonicalCore.has('Fasting Glucose') ||
    canonicalCore.has('Hemoglobin') ||
    canonicalCore.has('TSH') ||
    canonicalCore.has('LDL Cholesterol');
  const missingCriticalBiomarkers = ['HbA1c', 'Fasting Glucose', 'Hemoglobin', 'TSH', 'LDL Cholesterol'].filter(
    (name) => !canonicalCore.has(name)
  );
  const sections = detectSections(text, parameters);
  const expectedBiomarkers = estimateExpectedRange(document, sections, parameters);

  const reasons: string[] = [];
  if (!document.supported) reasons.push('Unsupported or non-medical document.');
  if (parameters.length < 8) reasons.push(`Only ${parameters.length} biomarkers detected; minimum quality gate is 8.`);
  if (canonicalCore.size < 3) reasons.push(`Only ${canonicalCore.size}/32 core biomarkers detected; minimum quality gate is 3.`);
  if (!criticalPresent) reasons.push('No critical clinical marker was confidently identified.');
  if (parameters.length < expectedBiomarkers.min) {
    reasons.push(`Detected ${parameters.length} biomarkers, below expected minimum ${expectedBiomarkers.min} for this document.`);
  }
  if (confidence < 0.7) reasons.push(`Overall confidence ${confidence} is below publish threshold 0.70.`);
  if (failedBiomarkers.length > Math.max(2, Math.floor(parameters.length * 0.35))) reasons.push('Too many biomarkers require validation review.');
  if (conflicts.length > 0) reasons.push('Conflicting biomarker values require manual review.');

  const rescanRequired =
    parameters.length < 8 ||
    canonicalCore.size < 3 ||
    confidence < 0.85 ||
    failedBiomarkers.length > 0 ||
    conflicts.length > 0;

  const canPublish = document.supported && reasons.length === 0;
  const status = canPublish ? 'PUBLISHABLE' : parameters.length < 3 || !document.supported ? 'INSUFFICIENT_DATA' : 'REVIEW_REQUIRED';
  return {
    extractionAttempts: [
      {
        attempt: 1,
        strategy: text ? 'pdf_text_table_scan' : 'vision_structured_json',
        parameterCount: parameters.length,
        confidence: Number(extractionConfidence.toFixed(2)),
        rescanRecommended: rescanRequired,
        notes: rescanRequired ? ['Secondary extraction recommended before clinical publication.'] : []
      }
    ],
    qualityGate: {
      status,
      canScore: canPublish,
      canPublish,
      confidence,
      extractionConfidence: Number(extractionConfidence.toFixed(2)),
      validationConfidence: Number(validationConfidence.toFixed(2)),
      biomarkerCompleteness: Number(completeness.toFixed(2)),
      expectedBiomarkers,
      detectedBiomarkers: parameters.length,
      validatedBiomarkers: validatedCount,
      coreBiomarkers: canonicalCore.size,
      failedBiomarkers,
      missingCriticalBiomarkers,
      conflicts,
      evidenceTraceability: parameters.map((parameter) => ({
        biomarker: canonicalBiomarkerName(parameter.name),
        pageNumber: parameter.pageNumber ?? 1,
        sectionName: parameter.sectionName ?? 'Unknown section',
        confidence: Number((parameter.extractionConfidence ?? extractionConfidence).toFixed(2))
      })),
      freshness: {
        label: 'report_date_required_for_clinical_freshness',
        confidence: document.confidence
      },
      reasons
    },
    healthAssessment: {
      markerLabel: `${canonicalCore.size} Key Health Markers Analysed`,
      confidenceLabel: confidence >= 0.85 ? 'High' : confidence >= 0.7 ? 'Medium' : 'Needs Review',
      healthAreas: Array.from(new Set(Array.from(canonicalCore).map((name) => biomarkerDimension(name, 'Metabolic'))))
    }
  };
};
