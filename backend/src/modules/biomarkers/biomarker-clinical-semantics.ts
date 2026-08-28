export const BIOMARKER_CLINICAL_CALCULATION_VERSION = 'FIT-BIOMARKER-CLINICAL.v1';

export type BiomarkerValidationStatus = 'pending' | 'validated' | 'rejected' | 'review_required';
export type BiomarkerClinicalStatus = 'LOW' | 'NORMAL' | 'HIGH' | 'UNKNOWN';
export type BiomarkerComparisonStatus = 'IMPROVED' | 'STABLE' | 'NEEDS_ATTENTION' | 'CHANGED' | 'INCOMPARABLE' | 'UNKNOWN';

type NumericRange = { min?: number; max?: number; minInclusive: boolean; maxInclusive: boolean };

const normalizeUnit = (unit: string) => unit.trim().replace(/μ/g, 'µ').replace(/\s+/g, '').toLowerCase();

export const parseNumericReferenceRange = (referenceRange: string | null): NumericRange | null => {
  if (!referenceRange) return null;
  const normalized = referenceRange.trim().replace(/\s+/g, '');
  const between = normalized.match(/^(-?\d+(?:\.\d+)?)[-–—](-?\d+(?:\.\d+)?)(?:[^\d].*)?$/);
  if (between) {
    const min = Number(between[1]);
    const max = Number(between[2]);
    return Number.isFinite(min) && Number.isFinite(max) && min <= max
      ? { min, max, minInclusive: true, maxInclusive: true }
      : null;
  }
  const oneSided = normalized.match(/^(<=|<|>=|>)(-?\d+(?:\.\d+)?)(?:[^\d].*)?$/);
  if (!oneSided) return null;
  const boundary = Number(oneSided[2]);
  if (!Number.isFinite(boundary)) return null;
  if (oneSided[1] === '<' || oneSided[1] === '<=') {
    return { max: boundary, minInclusive: true, maxInclusive: oneSided[1] === '<=' };
  }
  return { min: boundary, minInclusive: oneSided[1] === '>=', maxInclusive: true };
};

export const deriveBiomarkerClinicalStatus = (input: {
  value: number;
  unit: string;
  referenceRange: string | null;
  validationStatus: string;
}): BiomarkerClinicalStatus => {
  if (input.validationStatus.toLowerCase() !== 'validated' || !Number.isFinite(input.value) || !input.unit.trim()) return 'UNKNOWN';
  const range = parseNumericReferenceRange(input.referenceRange);
  if (!range) return 'UNKNOWN';
  if (range.min != null && (input.value < range.min || (!range.minInclusive && input.value === range.min))) return 'LOW';
  if (range.max != null && (input.value > range.max || (!range.maxInclusive && input.value === range.max))) return 'HIGH';
  return 'NORMAL';
};

const distanceFromRange = (value: number, status: BiomarkerClinicalStatus, referenceRange: string | null) => {
  const range = parseNumericReferenceRange(referenceRange);
  if (!range) return null;
  if (status === 'LOW' && range.min != null) return range.min - value;
  if (status === 'HIGH' && range.max != null) return value - range.max;
  return status === 'NORMAL' ? 0 : null;
};

export const compareBiomarkerObservations = (latest: {
  value: number; unit: string; referenceRange: string | null; clinicalStatus: BiomarkerClinicalStatus;
}, previous: {
  value: number; unit: string; referenceRange: string | null; clinicalStatus: BiomarkerClinicalStatus;
} | null): BiomarkerComparisonStatus => {
  if (!previous) return 'UNKNOWN';
  if (normalizeUnit(latest.unit) !== normalizeUnit(previous.unit)) return 'INCOMPARABLE';
  if (latest.clinicalStatus === 'UNKNOWN' || previous.clinicalStatus === 'UNKNOWN') return 'UNKNOWN';
  if (latest.clinicalStatus === 'NORMAL' && previous.clinicalStatus !== 'NORMAL') return 'IMPROVED';
  if (latest.clinicalStatus !== 'NORMAL' && previous.clinicalStatus === 'NORMAL') return 'NEEDS_ATTENTION';
  if (latest.clinicalStatus === 'NORMAL' && previous.clinicalStatus === 'NORMAL') return 'STABLE';
  if (latest.clinicalStatus !== previous.clinicalStatus) return 'CHANGED';
  const latestDistance = distanceFromRange(latest.value, latest.clinicalStatus, latest.referenceRange);
  const previousDistance = distanceFromRange(previous.value, previous.clinicalStatus, previous.referenceRange);
  if (latestDistance == null || previousDistance == null) return 'UNKNOWN';
  if (latestDistance < previousDistance) return 'IMPROVED';
  if (latestDistance > previousDistance) return 'NEEDS_ATTENTION';
  return 'STABLE';
};
