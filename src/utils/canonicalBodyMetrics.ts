import type { AssessmentGender } from '../types';

export const BODY_METRICS_FORMULA_VERSION = 'profile-body-metrics-v1';

const finitePositive = (value?: number | null): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;

const round = (value: number, decimals: number) => {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
};

export const calculateAgeFromDateOfBirth = (dateOfBirthISO?: string | null, now = new Date()): number | null => {
  if (!dateOfBirthISO) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateOfBirthISO.slice(0, 10));
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day || date > now) return null;
  let age = now.getUTCFullYear() - year;
  if (now.getUTCMonth() + 1 < month || (now.getUTCMonth() + 1 === month && now.getUTCDate() < day)) age -= 1;
  return age >= 0 ? age : null;
};

export const calculateBmi = (heightCm?: number | null, weightKg?: number | null): number | null => {
  if (!finitePositive(heightCm) || !finitePositive(weightKg)) return null;
  return round(weightKg / ((heightCm / 100) ** 2), 1);
};

export const calculateWaistHipRatio = (waistCm?: number | null, hipCm?: number | null): number | null => {
  if (!finitePositive(waistCm) || !finitePositive(hipCm)) return null;
  return round(waistCm / hipCm, 2);
};

/** U.S. Navy circumference estimate. Inputs are canonical centimetres and are converted to inches. */
export const calculateBodyFatPercentage = (input: {
  gender?: AssessmentGender | null;
  heightCm?: number | null;
  waistCm?: number | null;
  neckCm?: number | null;
  hipCm?: number | null;
}): number | null => {
  const { gender, heightCm, waistCm, neckCm, hipCm } = input;
  if (!finitePositive(heightCm) || !finitePositive(waistCm) || !finitePositive(neckCm)) return null;
  const heightIn = heightCm / 2.54;
  const waistIn = waistCm / 2.54;
  const neckIn = neckCm / 2.54;
  let value: number | null = null;
  if (gender === 'Male' && waistIn > neckIn) {
    value = 86.01 * Math.log10(waistIn - neckIn) - 70.041 * Math.log10(heightIn) + 36.76;
  } else if (gender === 'Female' && finitePositive(hipCm)) {
    const hipIn = hipCm / 2.54;
    if (waistIn + hipIn > neckIn) value = 163.205 * Math.log10(waistIn + hipIn - neckIn) - 97.684 * Math.log10(heightIn) - 78.387;
  }
  return value != null && Number.isFinite(value) ? round(value, 1) : null;
};

export const calculateLeanBodyMassKg = (weightKg?: number | null, bodyFatPercent?: number | null): number | null => {
  if (!finitePositive(weightKg) || !finitePositive(bodyFatPercent) || bodyFatPercent >= 100) return null;
  return round(weightKg * (1 - bodyFatPercent / 100), 2);
};

