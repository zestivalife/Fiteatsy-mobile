import crypto from 'node:crypto';
import { canonicalBiomarkerName, CORE_BIOMARKERS } from '../reports/report-governance.js';
import type { ParsedParameter, ReportAnalysisResult } from '../reports/reports.service.js';

const normalized = (value: string) => value.trim().replace(/\s+/g, ' ');
const slug = (value: string) => normalized(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
const known = new Set(CORE_BIOMARKERS.map((name) => canonicalBiomarkerName(name)));
const aliasKey = (value: string) => normalized(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const unitForDisplay = (value?: string | null) => normalized(value || '').replace(/μ|µ/g, 'µ').replace(/^fl$/i, 'fL').replace(/\/ul$/i, '/µL') || null;
const EXTERNAL_ALIASES: Record<string, { id: string; name: string; panel: string; derived?: boolean }> = {
  'crp quantitative':{id:'crp',name:'C-Reactive Protein (CRP)',panel:'Inflammation'},'high sensitivity c reactive protein hs crp':{id:'hs_crp',name:'High-Sensitivity C-Reactive Protein (hs-CRP)',panel:'Inflammation'},
  'glycosylated hemoglobin hba1c':{id:'hba1c',name:'Glycated Haemoglobin (HbA1c)',panel:'Diabetes'},'estimated average glucose':{id:'estimated_average_glucose',name:'Estimated Average Glucose',panel:'Diabetes',derived:true},'glucose fasting':{id:'fasting_glucose',name:'Fasting Glucose',panel:'Diabetes'},
  'hemoglobin':{id:'hemoglobin',name:'Haemoglobin',panel:'CBC / Blood Counts'},'rbc count':{id:'rbc_count',name:'Red Blood Cell Count (RBC)',panel:'CBC / Blood Counts'},'pcv':{id:'pcv',name:'Packed Cell Volume (PCV)',panel:'CBC / Blood Counts'},'mcv':{id:'mcv',name:'Mean Cell Volume (MCV)',panel:'CBC / Blood Counts'},'mch':{id:'mch',name:'Mean Cell Haemoglobin (MCH)',panel:'CBC / Blood Counts'},'mchc':{id:'mchc',name:'Mean Cell Haemoglobin Concentration (MCHC)',panel:'CBC / Blood Counts'},'rdw cv':{id:'rdw_cv',name:'Red Cell Distribution Width (RDW-CV)',panel:'CBC / Blood Counts'},'tlc':{id:'wbc',name:'Total Leucocyte Count (TLC / WBC)',panel:'CBC / Blood Counts'},'neutrophils':{id:'neutrophils_percent',name:'Neutrophils',panel:'CBC / Blood Counts'},'lymphocytes':{id:'lymphocytes_percent',name:'Lymphocytes',panel:'CBC / Blood Counts'},'monocytes':{id:'monocytes_percent',name:'Monocytes',panel:'CBC / Blood Counts'},'eosinophils':{id:'eosinophils_percent',name:'Eosinophils',panel:'CBC / Blood Counts'},'basophils':{id:'basophils_percent',name:'Basophils',panel:'CBC / Blood Counts'},'platelet count':{id:'platelets',name:'Platelet Count',panel:'CBC / Blood Counts'},
  'iron':{id:'iron',name:'Iron',panel:'Anemia / Iron'},'tibc total iron binding capacity':{id:'tibc',name:'Total Iron Binding Capacity (TIBC)',panel:'Anemia / Iron'},'uibc':{id:'uibc',name:'Unsaturated Iron Binding Capacity (UIBC)',panel:'Anemia / Iron'},'ferritin':{id:'ferritin',name:'Ferritin',panel:'Anemia / Iron'},
  'total cholesterol':{id:'total_cholesterol',name:'Total Cholesterol',panel:'Lipid'},'triglycerides':{id:'triglycerides',name:'Triglycerides',panel:'Lipid'},'hdl cholesterol':{id:'hdl_cholesterol',name:'HDL Cholesterol',panel:'Lipid'},'non hdl cholesterol':{id:'non_hdl_cholesterol',name:'Non-HDL Cholesterol',panel:'Lipid',derived:true},'ldl cholesterol':{id:'ldl_cholesterol',name:'LDL Cholesterol',panel:'Lipid',derived:true},'v l d l cholesterol':{id:'vldl',name:'VLDL Cholesterol',panel:'Lipid',derived:true},
  'sgot ast':{id:'ast',name:'Aspartate Aminotransferase (AST)',panel:'Liver'},'sgpt alt':{id:'alt',name:'Alanine Aminotransferase (ALT)',panel:'Liver'},'alkaline phosphatase':{id:'alkaline_phosphatase',name:'Alkaline Phosphatase',panel:'Liver'},'total protein':{id:'total_protein',name:'Total Protein',panel:'Liver'},'albumin':{id:'albumin',name:'Albumin',panel:'Liver'},'globulin':{id:'globulin',name:'Globulin',panel:'Liver'},'bilirubin total':{id:'bilirubin_total',name:'Total Bilirubin',panel:'Liver'},'bilirubin direct':{id:'bilirubin_direct',name:'Direct Bilirubin',panel:'Liver'},'bilirubin indirect':{id:'bilirubin_indirect',name:'Indirect Bilirubin',panel:'Liver'},
  'blood urea':{id:'urea',name:'Blood Urea',panel:'Kidney'},'bun':{id:'bun',name:'Blood Urea Nitrogen (BUN)',panel:'Kidney'},'creatinine':{id:'creatinine',name:'Creatinine',panel:'Kidney'},'egfr ckd epi':{id:'egfr',name:'Estimated Glomerular Filtration Rate (eGFR)',panel:'Kidney',derived:true},'bun creatinine ratio':{id:'bun_creatinine_ratio',name:'BUN / Creatinine Ratio',panel:'Kidney',derived:true},'urea creatinine ratio':{id:'urea_creatinine_ratio',name:'Urea / Creatinine Ratio',panel:'Kidney',derived:true},'uric acid':{id:'uric_acid',name:'Uric Acid',panel:'Kidney'},
  'calcium serum':{id:'calcium',name:'Calcium',panel:'Electrolytes'},'sodium':{id:'sodium',name:'Sodium',panel:'Electrolytes'},'potassium':{id:'potassium',name:'Potassium',panel:'Electrolytes'},'chloride':{id:'chloride',name:'Chloride',panel:'Electrolytes'},'phosphorus':{id:'phosphorus',name:'Phosphorus',panel:'Electrolytes'},
  'vitamin b12':{id:'vitamin_b12',name:'Vitamin B12',panel:'Vitamins'},'vitamin d 25 hydroxy':{id:'vitamin_d',name:'Vitamin D 25-OH',panel:'Vitamins'},'triiodothyronine t3':{id:'t3',name:'Triiodothyronine (T3)',panel:'Thyroid'},'total thyroxine t4':{id:'t4',name:'Total Thyroxine (T4)',panel:'Thyroid'},'thyroid stimulating hormone ultrasensitive':{id:'tsh',name:'Thyroid Stimulating Hormone (TSH)',panel:'Thyroid'},
};

export const parseReferenceRange = (value?: string | null) => {
  const source = normalized(value || '');
  const between = source.match(/(-?\d+(?:\.\d+)?)\s*[-–]\s*(-?\d+(?:\.\d+)?)/);
  if (between) return { min: Number(between[1]), max: Number(between[2]), text: source || null };
  const max = source.match(/^(?:<|≤)\s*(-?\d+(?:\.\d+)?)/);
  if (max) return { min: null, max: Number(max[1]), text: source };
  const min = source.match(/^(?:>|≥)\s*(-?\d+(?:\.\d+)?)/);
  if (min) return { min: Number(min[1]), max: null, text: source };
  return { min: null, max: null, text: source || null };
};

export const resolveObservationDate = (input: { sampleDate?: string | null; reportDate?: string | null; documentDate?: string | null; uploadedAt: string | Date }) => {
  const candidates = [
    { value: input.sampleDate, source: 'SAMPLE_DATE' as const },
    { value: input.reportDate, source: 'REPORT_DATE' as const },
    { value: input.documentDate, source: 'DOCUMENT_METADATA' as const },
    { value: input.uploadedAt, source: 'UPLOAD_FALLBACK' as const },
  ];
  for (const candidate of candidates) {
    if (!candidate.value) continue;
    const date = new Date(candidate.value);
    if (!Number.isNaN(date.getTime())) return { date: date.toISOString().slice(0, 10), source: candidate.source };
  }
  throw new Error('REPORT_DATE_UNRESOLVED');
};

export const mapExternalBiomarker = (parameter: ParsedParameter, index: number, analysis: ReportAnalysisResult, document: { document_date?: string | null; uploaded_at: string | Date }, evidence?: {sourcePage?:number|null;sourceTestName?:string;sourceSectionPrecedence?:string;sourceTraceable?:boolean}) => {
  const rawName = normalized(parameter.rawName || parameter.name);
  const alias = EXTERNAL_ALIASES[aliasKey(rawName)];
  const sharedName = canonicalBiomarkerName(parameter.canonicalName || parameter.name);
  const explicitlyMapped = Boolean(alias || parameter.canonicalBiomarkerId) || sharedName !== canonicalBiomarkerName(rawName) || known.has(sharedName);
  const canonicalName = alias?.name || sharedName;
  const canonicalId = alias?.id || (explicitlyMapped ? (parameter.canonicalBiomarkerId || slug(canonicalName)) : null);
  const range = parseReferenceRange(parameter.referenceRange);
  const observed = resolveObservationDate({ sampleDate: (analysis as ReportAnalysisResult & { sampleCollectionDate?: string | null }).sampleCollectionDate, reportDate: analysis.reportDate, documentDate: document.document_date, uploadedAt: document.uploaded_at });
  const rawValue = String(parameter.value);
  const rowIdentity = crypto.createHash('sha256').update([index, rawName, rawValue, parameter.unit, parameter.referenceRange, observed.date].join('|')).digest('hex');
  return {
    rowIdentity,
    canonicalId,
    canonicalCode: canonicalId?.toUpperCase() || null,
    canonicalName: canonicalId ? canonicalName : null,
    canonicalStatus: canonicalId ? (alias?.derived ? 'DERIVED' : alias ? 'ALIAS_MATCH' : 'EXACT_CANONICAL_MATCH') : 'UNMAPPED',
    rawName,
    rawValue,
    rawUnit: normalized(parameter.unit || '') || null,
    rawRange: normalized(parameter.referenceRange || '') || null,
    rawFlag: parameter.status?.toUpperCase() || null,
    rawSection: parameter.sectionName || parameter.category || null,
    numericValue: Number.isFinite(parameter.value) ? parameter.value : null,
    canonicalUnit: unitForDisplay(parameter.unit),
    referenceMin: range.min,
    referenceMax: range.max,
    referenceText: range.text,
    labFlag: parameter.status === 'low' ? 'LOW' : parameter.status === 'high' ? 'HIGH' : 'NORMAL',
    observationDate: observed.date,
    dateSource: observed.source,
    extractionConfidence: parameter.extractionConfidence ?? analysis.qualityGate.extractionConfidence ?? analysis.qualityGate.confidence,
    mappingConfidence: canonicalId ? (alias ? 0.99 : 0.9) : 0,
    panel: alias?.panel || 'Other', provenance: alias?.derived ? 'LAB_REPORTED_CALCULATED' : 'LAB_REPORTED_DIRECT',
    sourcePage:evidence?.sourcePage??parameter.pageNumber??null,sourceTestName:evidence?.sourceTestName||rawName,sourceSectionPrecedence:evidence?.sourceSectionPrecedence||'UNRESOLVED',sourceTraceable:evidence?.sourceTraceable===true,
    bulkConfirmEligible:Boolean(canonicalId&&evidence?.sourceTraceable&&Number.isFinite(parameter.value)&&(parameter.extractionConfidence??analysis.qualityGate.extractionConfidence??0)>=0.8),
  };
};

export const selectLatestObservations = <T extends { canonicalBiomarkerId: string | null; observationDate: string; createdAt: string; reviewStatus: string }>(rows: T[]) => {
  const accepted = rows.filter((row) => row.canonicalBiomarkerId && !['REJECTED', 'IGNORED'].includes(row.reviewStatus));
  return [...accepted].sort((a, b) => b.observationDate.localeCompare(a.observationDate) || b.createdAt.localeCompare(a.createdAt)).filter((row, index, all) => all.findIndex((candidate) => candidate.canonicalBiomarkerId === row.canonicalBiomarkerId) === index);
};
