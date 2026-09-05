import { canonicalBiomarkerName } from './report-governance.js';
import { sanitizeReportAnalysisForPublic } from './report-response.js';
import { compareBiomarkerObservations } from '../biomarkers/biomarker-clinical-semantics.js';
const terminalStatuses = new Set(['PUBLISHED', 'PARTIALLY_VALIDATED', 'COMPLETED']);
export const isAnalysableReport = (report) => terminalStatuses.has(report.status) && Boolean(report.analysis?.qualityGate.canPublish && report.analysis.parameters.length > 0);
const parseReportDate = (report) => {
    const explicit = report.reportDate ?? report.analysis?.reportDate;
    const parsed = explicit ? Date.parse(explicit) : Number.NaN;
    const fallback = Date.parse(report.createdAtISO);
    return Number.isFinite(parsed) ? parsed : fallback;
};
export const sortAnalysableReports = (reports) => reports.filter(isAnalysableReport).sort((a, b) => {
    const dateDelta = parseReportDate(b) - parseReportDate(a);
    return dateDelta === 0 ? Date.parse(b.createdAtISO) - Date.parse(a.createdAtISO) : dateDelta;
});
const parseRange = (range) => {
    const normalized = range.replace(/\s+/g, '');
    const between = normalized.match(/(-?\d+(?:\.\d+)?)[-–](-?\d+(?:\.\d+)?)/);
    if (between)
        return { min: Number(between[1]), max: Number(between[2]) };
    const lessThan = normalized.match(/^<\s*(-?\d+(?:\.\d+)?)/);
    if (lessThan)
        return { max: Number(lessThan[1]) };
    const greaterThan = normalized.match(/^>\s*(-?\d+(?:\.\d+)?)/);
    if (greaterThan)
        return { min: Number(greaterThan[1]) };
    return {};
};
const abnormalDistance = (parameter) => {
    const range = parseRange(parameter.referenceRange);
    if (parameter.status === 'low' && typeof range.min === 'number')
        return range.min - parameter.value;
    if (parameter.status === 'high' && typeof range.max === 'number')
        return parameter.value - range.max;
    return null;
};
const compareMatched = (latest, previous) => {
    const delta = latest.value - previous.value;
    const toClinicalStatus = (status) => status.toUpperCase();
    const canonicalStatus = compareBiomarkerObservations({
        value: latest.value,
        unit: latest.unit,
        referenceRange: latest.referenceRange,
        clinicalStatus: toClinicalStatus(latest.status)
    }, {
        value: previous.value,
        unit: previous.unit,
        referenceRange: previous.referenceRange,
        clinicalStatus: toClinicalStatus(previous.status)
    });
    if (canonicalStatus === 'INCOMPARABLE') {
        return { classification: 'incomparable', delta: null, rationale: 'Units are not canonically compatible.' };
    }
    if (canonicalStatus === 'IMPROVED') {
        return {
            classification: 'improved',
            delta,
            rationale: latest.status === 'normal' ? 'Moved into the expected range.' : 'Moved closer to the expected range.'
        };
    }
    if (canonicalStatus === 'NEEDS_ATTENTION') {
        const movedFromNormal = previous.status === 'normal';
        return {
            classification: 'needs_attention',
            delta,
            rationale: latest.status === 'high'
                ? `${movedFromNormal ? 'Now' : 'Moved further'} above the report reference range.`
                : `${movedFromNormal ? 'Now' : 'Moved further'} below the report reference range.`
        };
    }
    if (canonicalStatus === 'STABLE') {
        return {
            classification: 'stable',
            delta,
            rationale: latest.status === 'normal'
                ? 'Remains within the expected range.'
                : 'No meaningful range-status change was established.'
        };
    }
    if (canonicalStatus === 'CHANGED') {
        return { classification: 'changed', delta, rationale: 'Changed since your previous report.' };
    }
    const latestDistance = abnormalDistance(latest);
    const previousDistance = abnormalDistance(previous);
    return {
        classification: latestDistance == null || previousDistance == null ? 'incomparable' : 'changed',
        delta: latestDistance == null || previousDistance == null ? null : delta,
        rationale: latestDistance == null || previousDistance == null
            ? 'The available reference data is not comparable.'
            : 'Changed since your previous report.'
    };
};
const keyFor = (parameter) => {
    const persistedIdentity = parameter.canonicalName ?? parameter.canonicalBiomarkerId ?? parameter.name;
    return canonicalBiomarkerName(persistedIdentity).trim().toLowerCase();
};
const reportMeta = (report) => ({
    id: report.id,
    reportDate: report.reportDate ?? report.analysis?.reportDate ?? report.createdAtISO,
    title: report.labName ?? report.analysis?.labName ?? report.fileName ?? 'Health Report'
});
export const buildReportComparison = (latestReport, previousReport) => {
    if (latestReport.id === previousReport.id)
        throw new Error('REPORT_COMPARISON_SAME_REPORT');
    if (!isAnalysableReport(latestReport) || !isAnalysableReport(previousReport))
        throw new Error('REPORT_COMPARISON_NOT_READY');
    if (latestReport.userId !== previousReport.userId || latestReport.clientId !== previousReport.clientId) {
        throw new Error('REPORT_COMPARISON_OWNER_MISMATCH');
    }
    const latest = sanitizeReportAnalysisForPublic(latestReport.analysis);
    const previous = sanitizeReportAnalysisForPublic(previousReport.analysis);
    const latestByKey = new Map(latest.parameters.map((parameter) => [keyFor(parameter), parameter]));
    const previousByKey = new Map(previous.parameters.map((parameter) => [keyFor(parameter), parameter]));
    const keys = new Set([...latestByKey.keys(), ...previousByKey.keys()]);
    const buckets = {
        improved: [], stable: [], needs_attention: [], changed: [], incomparable: []
    };
    for (const key of keys) {
        const latestParameter = latestByKey.get(key) ?? null;
        const previousParameter = previousByKey.get(key) ?? null;
        const comparison = latestParameter && previousParameter
            ? compareMatched(latestParameter, previousParameter)
            : { classification: 'incomparable', delta: null, rationale: 'This marker is not present in both reports.' };
        const source = latestParameter ?? previousParameter;
        const item = {
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
