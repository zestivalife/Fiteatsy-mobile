import type { ReportAnalysisResult } from './reports.service.js';
import { canonicalBiomarkerName } from './report-governance.js';

const keyForBiomarker = (name: string) => canonicalBiomarkerName(name).toLowerCase();

const publicReviewReason = (name: string) =>
  `${name} needs review before it can be shown or used for health intelligence.`;

const internalDomainErrorPatterns = [
  /invalid care case transition/i,
];

export const sanitizeReportErrorForPublic = (error?: string | null) => {
  if (!error) return error;
  return internalDomainErrorPatterns.some((pattern) => pattern.test(error))
    ? "We couldn't analyse this report. Please try again or choose another file."
    : error;
};

export const sanitizeReportAnalysisForPublic = (analysis: ReportAnalysisResult): ReportAnalysisResult => {
  const rejectedBiomarkers = analysis.qualityGate.rejectedBiomarkers ?? [];
  const rejectedKeys = new Set(
    rejectedBiomarkers
      .filter((item) => item.validation_status === 'INVALID')
      .map((item) => keyForBiomarker(item.biomarker_name))
  );

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
        .map((item) => (item.validation_status === 'INVALID' ? publicReviewReason(item.biomarker_name) : item.reason)),
      rejectedBiomarkers: rejectedBiomarkers.map((item) =>
        item.validation_status !== 'INVALID'
          ? item
          : {
              ...item,
              reason: publicReviewReason(item.biomarker_name)
            }
      ),
      evidenceTraceability: analysis.qualityGate.evidenceTraceability.filter(
        (item) => !rejectedKeys.has(keyForBiomarker(item.biomarker_name)) || item.validation_status === 'VALID'
      )
    }
  };
};
