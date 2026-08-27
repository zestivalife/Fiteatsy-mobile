import { canonicalBiomarkerName } from './report-governance.js';
import { sanitizeReportAnalysisForPublic } from './report-response.js';
import type { ParsedParameter } from './reports.service.js';
import type { ReportRecord } from './reports.store.js';

export type ReportComparisonClassification = 'improved' | 'stable' | 'needs_attention' | 'changed' | 'incomparable';

export type ReportComparisonItem = {
  biomarkerId: string;
  displayName: string;
  category: ParsedParameter['category'];
  previous: {
    value: number;
    unit: string;
    status: ParsedParameter['status'];
    referenceRange: string;
  } | null;
  latest: {
    value: number;
    unit: string;
    status: ParsedParameter['status'];
    referenceRange: string;
  } | null;
  comparison: {
    classification: ReportComparisonClassification;
    delta: number | null;
    rationale: string;
  };
};

export type ReportComparisonProjection = {
  latestReport: { id: string; reportDate: string; title: string };
  previousReport: { id: string; reportDate: string; title: string };
  summary: {
    comparableCount: number;
    improvedCount: number;
    stableCount: number;
    needsAttentionCount: number;
    changedCount: number;
    incomparableCount: number;
  };
  improved: ReportComparisonItem[];
  needsAttention: ReportComparisonItem[];
  stable: ReportComparisonItem[];
  changed: ReportComparisonItem[];
  incomparable: ReportComparisonItem[];
};

const terminalStatuses = new Set(['PUBLISHED', 'PARTIALLY_VALIDATED', 'COMPLETED']);

export const isAnalysableReport = (report: ReportRecord) =>
  terminalStatuses.has(report.status) && Boolean(report.analysis?.qualityGate.canPublish && report.analysis.parameters.length > 0);

const parseReportDate = (report: ReportRecord) => {
  const explicit = report.reportDate ?? report.analysis?.reportDate;
  const parsed = explicit ? Date.parse(explicit) : Number.NaN;
  const fallback = Date.parse(report.createdAtISO);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const sortAnalysableReports = (reports: ReportRecord[]) =>
  reports.filter(isAnalysableReport).sort((a, b) => {
    const dateDelta = parseReportDate(b) - parseReportDate(a);
    return dateDelta === 0 ? Date.parse(b.createdAtISO) - Date.parse(a.createdAtISO) : dateDelta;
  });

const normalizeUnit = (unit: string) => unit.trim().replace(/μ/g, 'µ').replace(/\s+/g, '').toLowerCase();

const parseRange = (range: string): { min?: number; max?: number } => {
  const normalized = range.replace(/\s+/g, '');
  const between = normalized.match(/(-?\d+(?:\.\d+)?)[-–](-?\d+(?:\.\d+)?)/);
  if (between) return { min: Number(between[1]), max: Number(between[2]) };
  const lessThan = normalized.match(/^<\s*(-?\d+(?:\.\d+)?)/);
  if (lessThan) return { max: Number(lessThan[1]) };
  const greaterThan = normalized.match(/^>\s*(-?\d+(?:\.\d+)?)/);
  if (greaterThan) return { min: Number(greaterThan[1]) };
  return {};
};

const abnormalDistance = (parameter: ParsedParameter) => {
  const range = parseRange(parameter.referenceRange);
  if (parameter.status === 'low' && typeof range.min === 'number') return range.min - parameter.value;
  if (parameter.status === 'high' && typeof range.max === 'number') return parameter.value - range.max;
  return null;
};

const compareMatched = (latest: ParsedParameter, previous: ParsedParameter): ReportComparisonItem['comparison'] => {
  if (normalizeUnit(latest.unit) !== normalizeUnit(previous.unit)) {
    return { classification: 'incomparable', delta: null, rationale: 'Units are not canonically compatible.' };
  }

  const delta = latest.value - previous.value;
  if (latest.status === 'normal' && previous.status !== 'normal') {
    return { classification: 'improved', delta, rationale: 'Moved into the expected range.' };
  }
  if (latest.status !== 'normal' && previous.status === 'normal') {
    return {
      classification: 'needs_attention',
      delta,
      rationale: latest.status === 'high' ? 'Now above the report reference range.' : 'Now below the report reference range.'
    };
  }
  if (latest.status === 'normal' && previous.status === 'normal') {
    return { classification: 'stable', delta, rationale: 'Remains within the expected range.' };
  }
  if (latest.status !== previous.status) {
    return { classification: 'changed', delta, rationale: 'Changed since your previous report.' };
  }

  const latestDistance = abnormalDistance(latest);
  const previousDistance = abnormalDistance(previous);
  if (latestDistance == null || previousDistance == null) {
    return { classification: 'changed', delta, rationale: 'Changed since your previous report.' };
  }
  if (latestDistance < previousDistance) {
    return { classification: 'improved', delta, rationale: 'Moved closer to the expected range.' };
  }
  if (latestDistance > previousDistance) {
    return {
      classification: 'needs_attention',
      delta,
      rationale: latest.status === 'high' ? 'Moved further above the report reference range.' : 'Moved further below the report reference range.'
    };
  }
  return { classification: 'stable', delta, rationale: 'No meaningful range-status change was established.' };
};

const keyFor = (parameter: ParsedParameter) =>
  (parameter.canonicalBiomarkerId ?? parameter.canonicalName ?? canonicalBiomarkerName(parameter.name)).trim().toLowerCase();

const reportMeta = (report: ReportRecord) => ({
  id: report.id,
  reportDate: report.reportDate ?? report.analysis?.reportDate ?? report.createdAtISO,
  title: report.labName ?? report.analysis?.labName ?? report.fileName ?? 'Health Report'
});

export const buildReportComparison = (latestReport: ReportRecord, previousReport: ReportRecord): ReportComparisonProjection => {
  if (latestReport.id === previousReport.id) throw new Error('REPORT_COMPARISON_SAME_REPORT');
  if (!isAnalysableReport(latestReport) || !isAnalysableReport(previousReport)) throw new Error('REPORT_COMPARISON_NOT_READY');
  if (latestReport.userId !== previousReport.userId || latestReport.clientId !== previousReport.clientId) {
    throw new Error('REPORT_COMPARISON_OWNER_MISMATCH');
  }

  const latest = sanitizeReportAnalysisForPublic(latestReport.analysis!);
  const previous = sanitizeReportAnalysisForPublic(previousReport.analysis!);
  const latestByKey = new Map(latest.parameters.map((parameter) => [keyFor(parameter), parameter]));
  const previousByKey = new Map(previous.parameters.map((parameter) => [keyFor(parameter), parameter]));
  const keys = new Set([...latestByKey.keys(), ...previousByKey.keys()]);
  const buckets: Record<ReportComparisonClassification, ReportComparisonItem[]> = {
    improved: [], stable: [], needs_attention: [], changed: [], incomparable: []
  };

  for (const key of keys) {
    const latestParameter = latestByKey.get(key) ?? null;
    const previousParameter = previousByKey.get(key) ?? null;
    const comparison = latestParameter && previousParameter
      ? compareMatched(latestParameter, previousParameter)
      : { classification: 'incomparable' as const, delta: null, rationale: 'This marker is not present in both reports.' };
    const source = latestParameter ?? previousParameter!;
    const item: ReportComparisonItem = {
      biomarkerId: key,
      displayName: source.canonicalName ?? source.name,
      category: source.category,
      previous: previousParameter ? {
        value: previousParameter.value, unit: previousParameter.unit, status: previousParameter.status, referenceRange: previousParameter.referenceRange
      } : null,
      latest: latestParameter ? {
        value: latestParameter.value, unit: latestParameter.unit, status: latestParameter.status, referenceRange: latestParameter.referenceRange
      } : null,
      comparison
    };
    buckets[comparison.classification].push(item);
  }

  const comparableCount = buckets.improved.length + buckets.stable.length + buckets.needs_attention.length + buckets.changed.length;
  return {
    latestReport: reportMeta(latestReport),
    previousReport: reportMeta(previousReport),
    summary: {
      comparableCount,
      improvedCount: buckets.improved.length,
      stableCount: buckets.stable.length,
      needsAttentionCount: buckets.needs_attention.length,
      changedCount: buckets.changed.length,
      incomparableCount: buckets.incomparable.length
    },
    improved: buckets.improved,
    needsAttention: buckets.needs_attention,
    stable: buckets.stable,
    changed: buckets.changed,
    incomparable: buckets.incomparable
  };
};
