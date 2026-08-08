import { canonicalBiomarkerName } from './report-governance.js';
const keyForBiomarker = (name) => canonicalBiomarkerName(name).toLowerCase();
const publicReviewReason = (name) => `${name} needs review before it can be shown or used for health intelligence.`;
export const sanitizeReportAnalysisForPublic = (analysis) => {
    const rejectedBiomarkers = analysis.qualityGate.rejectedBiomarkers ?? [];
    const rejectedKeys = new Set(rejectedBiomarkers
        .filter((item) => item.validation_status !== 'VALID')
        .map((item) => keyForBiomarker(item.biomarker_name)));
    if (rejectedKeys.size === 0) {
        return analysis;
    }
    return {
        ...analysis,
        parameters: analysis.parameters.filter((parameter) => !rejectedKeys.has(keyForBiomarker(parameter.canonicalName ?? parameter.name))),
        qualityGate: {
            ...analysis.qualityGate,
            failedBiomarkers: rejectedBiomarkers
                .filter((item) => item.validation_status !== 'VALID')
                .map((item) => publicReviewReason(item.biomarker_name)),
            rejectedBiomarkers: rejectedBiomarkers.map((item) => item.validation_status === 'VALID'
                ? item
                : {
                    ...item,
                    reason: publicReviewReason(item.biomarker_name)
                }),
            evidenceTraceability: analysis.qualityGate.evidenceTraceability.filter((item) => !rejectedKeys.has(keyForBiomarker(item.biomarker_name)) || item.validation_status === 'VALID')
        }
    };
};
