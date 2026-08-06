import { createBiomarkerObservation, upsertBiomarker } from '../biomarkers/biomarkers.repository.js';
import { calculateHealthScores } from '../intelligence/health-calculation-engine.js';
import { ClientOwnershipContext } from '../platform/platform.types.js';
import { ReportAnalysisResult, ParsedParameter } from './reports.service.js';
import { biomarkerDimension, biomarkerTier, canonicalBiomarkerName } from './report-governance.js';

const aliasGroups = [
  { canonicalName: 'HbA1c', aliases: ['Hb A1C', 'HBA1C', 'Glycated Hemoglobin', 'Glycated Haemoglobin', 'Glycosylated Hemoglobin', 'Glycosylated Haemoglobin', 'Hemoglobin A1c', 'Haemoglobin A1c'] },
  { canonicalName: 'Fasting Glucose', aliases: ['Glucose Fasting', 'Blood Sugar Fasting', 'FBS', 'Fasting Blood Sugar'] },
  { canonicalName: 'TSH', aliases: ['Thyroid Stimulating Hormone'] },
  { canonicalName: 'Creatinine', aliases: ['Serum Creatinine'] },
  { canonicalName: 'Hemoglobin', aliases: ['Hb', 'Haemoglobin'] },
  { canonicalName: 'Total Cholesterol', aliases: ['Cholesterol'] },
  { canonicalName: 'LDL Cholesterol', aliases: ['LDL'] },
  { canonicalName: 'HDL Cholesterol', aliases: ['HDL'] },
  { canonicalName: 'Triglycerides', aliases: ['Triglyceride', 'TG'] },
  { canonicalName: 'Vitamin D', aliases: ['25-OH Vitamin D', '25 Hydroxy Vitamin D', 'Vitamin D3'] },
  { canonicalName: 'Vitamin B12', aliases: ['B12', 'Cobalamin'] }
];

const normalizeName = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const canonicalName = (rawName: string) => {
  const governedName = canonicalBiomarkerName(rawName);
  if (governedName !== rawName.trim().replace(/\s+/g, ' ')) return governedName;
  const normalized = normalizeName(rawName);
  const match = aliasGroups.find((group) =>
    normalized === normalizeName(group.canonicalName) || group.aliases.some((alias) => normalizeName(alias) === normalized)
  );
  if (match) return match.canonicalName;
  return rawName.trim().replace(/\s+/g, ' ');
};

const aliasesForCanonicalName = (name: string, originalName: string) => {
  const group = aliasGroups.find((item) => normalizeName(item.canonicalName) === normalizeName(name));
  return [originalName, name, ...(group?.aliases ?? [])].filter((value, index, values) => values.indexOf(value) === index);
};

const mapCategory = (parameter: ParsedParameter) => {
  const governedDimension = biomarkerDimension(parameter.canonicalName ?? parameter.name, '');
  if (governedDimension && governedDimension !== parameter.category) return governedDimension;
  const name = parameter.name.toLowerCase();
  if (/vitamin|b12|folate|ferritin|iron|calcium|magnesium|albumin|protein/.test(name)) return 'Nutrition';
  if (/cholesterol|triglyceride|hdl|ldl|vldl/.test(name)) return 'Cardiovascular';
  if (/sgpt|sgot|ast|alt|bilirubin|albumin|alp/.test(name)) return 'Liver';
  if (/creatinine|urea|egfr|uric/.test(name)) return 'Kidney';
  if (/tsh|t3|t4|thyroid/.test(name)) return 'Thyroid';
  if (/crp|esr/.test(name)) return 'Inflammation';
  if (/testosterone|estrogen|progesterone|cortisol|insulin/.test(name)) return 'Hormonal';
  return parameter.category === 'Metabolic' ? 'Metabolic' : 'Metabolic';
};

const parseReferenceRange = (value: string): { min?: number; max?: number } => {
  const cleaned = value.replace(/\s/g, '');
  const between = cleaned.match(/(-?\d+(?:\.\d+)?)\s*[-–]\s*(-?\d+(?:\.\d+)?)/);
  if (between) return { min: Number(between[1]), max: Number(between[2]) };
  const lessThan = cleaned.match(/^<(-?\d+(?:\.\d+)?)/);
  if (lessThan) return { max: Number(lessThan[1]) };
  const greaterThan = cleaned.match(/^>(-?\d+(?:\.\d+)?)/);
  if (greaterThan) return { min: Number(greaterThan[1]) };
  return {};
};

const validateParameter = (parameter: ParsedParameter) => {
  const notes: string[] = [];
  if (!Number.isFinite(parameter.value)) notes.push('Value is not finite.');
  if (!parameter.unit.trim()) notes.push('Unit is missing.');
  if (!parameter.referenceRange.trim() || parameter.referenceRange === 'Not specified') notes.push('Reference range is missing.');
  const range = parseReferenceRange(parameter.referenceRange);
  const hasRange = typeof range.min === 'number' || typeof range.max === 'number';
  const plausible = Math.abs(parameter.value) < 100000;
  if (!plausible) notes.push('Value is outside clinical plausibility bounds.');
  const status: 'validated' | 'review_required' = notes.length > 0 || !hasRange || !plausible ? 'review_required' : 'validated';
  const baseConfidence = parameter.extractionConfidence ?? 0.85;
  const confidence = status === 'validated' ? Math.min(0.98, baseConfidence) : Math.min(0.6, baseConfidence);
  return { status, confidence, notes };
};

const testDateFromAnalysis = (analysis: ReportAnalysisResult) => {
  const parsed = new Date(analysis.reportDate);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return new Date().toISOString().slice(0, 10);
};

export const persistReportIntelligence = async (
  owner: ClientOwnershipContext,
  reportId: string,
  analysis: ReportAnalysisResult
) => {
  const testDate = testDateFromAnalysis(analysis);
  const observations = [];
  for (const parameter of analysis.parameters) {
    const name = canonicalName(parameter.name);
    const biomarker = await upsertBiomarker({
      canonicalName: name,
      aliases: aliasesForCanonicalName(name, parameter.name),
      category: mapCategory(parameter),
      standardUnit: parameter.unit || 'unspecified'
    });
    const validation = validateParameter(parameter);
    const observation = await createBiomarkerObservation(owner, {
      biomarkerId: biomarker.id,
      sourceReportId: reportId,
      value: parameter.value,
      unit: parameter.unit || 'unspecified',
      testDate,
      confidence: validation.confidence,
      validationStatus: validation.status,
      originalParameterName: parameter.name,
      sourceLocation: parameter.name,
      referenceRange: parameter.referenceRange
    });
    observations.push({
      id: observation.id,
      biomarkerId: biomarker.id,
      biomarkerName: biomarker.canonicalName,
      originalParameterName: observation.originalParameterName,
      validationStatus: observation.validationStatus,
      confidence: observation.confidence,
      tier: biomarkerTier(biomarker.canonicalName),
      notes: validation.notes
    });
  }

  const scores = analysis.qualityGate.canScore ? await calculateHealthScores(owner) : [];
  return { observations, scores };
};
