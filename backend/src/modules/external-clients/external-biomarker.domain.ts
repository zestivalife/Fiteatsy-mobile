import crypto from 'node:crypto';
import { canonicalBiomarkerName, CORE_BIOMARKERS } from '../reports/report-governance.js';
import type { ParsedParameter, ReportAnalysisResult } from '../reports/reports.service.js';

const normalized = (value: string) => value.trim().replace(/\s+/g, ' ');
const slug = (value: string) => normalized(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
const known = new Set(CORE_BIOMARKERS.map((name) => canonicalBiomarkerName(name)));

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

export const mapExternalBiomarker = (parameter: ParsedParameter, index: number, analysis: ReportAnalysisResult, document: { document_date?: string | null; uploaded_at: string | Date }) => {
  const rawName = normalized(parameter.rawName || parameter.name);
  const canonicalName = canonicalBiomarkerName(parameter.canonicalName || parameter.name);
  const explicitlyMapped = Boolean(parameter.canonicalBiomarkerId) || canonicalName !== canonicalBiomarkerName(rawName) || known.has(canonicalName);
  const canonicalId = explicitlyMapped ? (parameter.canonicalBiomarkerId || slug(canonicalName)) : null;
  const range = parseReferenceRange(parameter.referenceRange);
  const observed = resolveObservationDate({ sampleDate: (analysis as ReportAnalysisResult & { sampleCollectionDate?: string | null }).sampleCollectionDate, reportDate: analysis.reportDate, documentDate: document.document_date, uploadedAt: document.uploaded_at });
  const rawValue = String(parameter.value);
  const rowIdentity = crypto.createHash('sha256').update([index, rawName, rawValue, parameter.unit, parameter.referenceRange, observed.date].join('|')).digest('hex');
  return {
    rowIdentity,
    canonicalId,
    canonicalCode: canonicalId?.toUpperCase() || null,
    canonicalName: canonicalId ? canonicalName : null,
    canonicalStatus: canonicalId ? 'MAPPED' : 'UNMAPPED',
    rawName,
    rawValue,
    rawUnit: normalized(parameter.unit || '') || null,
    rawRange: normalized(parameter.referenceRange || '') || null,
    rawFlag: parameter.status?.toUpperCase() || null,
    rawSection: parameter.sectionName || parameter.category || null,
    numericValue: Number.isFinite(parameter.value) ? parameter.value : null,
    canonicalUnit: normalized(parameter.unit || '') || null,
    referenceMin: range.min,
    referenceMax: range.max,
    referenceText: range.text,
    labFlag: parameter.status === 'low' ? 'LOW' : parameter.status === 'high' ? 'HIGH' : 'NORMAL',
    observationDate: observed.date,
    dateSource: observed.source,
    extractionConfidence: parameter.extractionConfidence ?? analysis.qualityGate.extractionConfidence ?? analysis.qualityGate.confidence,
    mappingConfidence: canonicalId ? 1 : 0,
  };
};

export const selectLatestObservations = <T extends { canonicalBiomarkerId: string | null; observationDate: string; createdAt: string; reviewStatus: string }>(rows: T[]) => {
  const accepted = rows.filter((row) => row.canonicalBiomarkerId && !['REJECTED', 'IGNORED'].includes(row.reviewStatus));
  return [...accepted].sort((a, b) => b.observationDate.localeCompare(a.observationDate) || b.createdAt.localeCompare(a.createdAt)).filter((row, index, all) => all.findIndex((candidate) => candidate.canonicalBiomarkerId === row.canonicalBiomarkerId) === index);
};
