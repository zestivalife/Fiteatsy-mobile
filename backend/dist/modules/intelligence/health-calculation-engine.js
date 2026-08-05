import { listBiomarkerHistory } from '../biomarkers/biomarkers.repository.js';
import { listHealthObservations } from '../health/health-observations.repository.js';
import { getHealthProfileByClientId } from '../platform/platform.store.js';
import { createHealthScores } from './health-scores.repository.js';
const CALCULATION_VERSION = 'FIT-150.v1';
const clamp = (value, min = 0, max = 100) => Math.min(max, Math.max(min, value));
const scoreFromReferenceRange = (value, referenceRange) => {
    if (!referenceRange)
        return 70;
    const cleaned = referenceRange.replace(/\s/g, '');
    const between = cleaned.match(/(-?\d+(?:\.\d+)?)\s*[-–]\s*(-?\d+(?:\.\d+)?)/);
    if (between) {
        const min = Number(between[1]);
        const max = Number(between[2]);
        if (value >= min && value <= max)
            return 88;
        const range = Math.max(1, max - min);
        const distance = value < min ? min - value : value - max;
        return Math.round(clamp(88 - (distance / range) * 45, 35, 88));
    }
    const below = cleaned.match(/^<(-?\d+(?:\.\d+)?)/);
    if (below)
        return value < Number(below[1]) ? 88 : 55;
    const above = cleaned.match(/^>(-?\d+(?:\.\d+)?)/);
    if (above)
        return value > Number(above[1]) ? 88 : 55;
    return 70;
};
const average = (values) => Math.round(values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length));
const confidenceAverage = (values) => Number((values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length)).toFixed(4));
const scoreObservation = (metricType, value) => {
    switch (metricType) {
        case 'steps':
            return clamp(Math.round((value / 10000) * 100));
        case 'active_minutes':
        case 'workout_minutes':
            return clamp(Math.round((value / 45) * 100));
        case 'sleep_minutes':
            return clamp(Math.round(100 - Math.abs(value - 450) / 3));
        case 'hrv_ms':
            return clamp(Math.round((value / 70) * 100));
        case 'resting_heart_rate':
            return clamp(Math.round(100 - Math.abs(value - 62) * 2));
        case 'stress_score':
            return clamp(Math.round(100 - value));
        case 'hydration_ml':
            return clamp(Math.round((value / 2500) * 100));
        default:
            return 60;
    }
};
const insufficient = (scoreType, reason) => ({
    scoreType,
    scoreValue: null,
    scoreStatus: 'insufficient_data',
    confidence: 0,
    inputSummary: { reason },
    calculationVersion: CALCULATION_VERSION
});
export const calculateHealthScores = async (owner) => {
    const [biomarkers, observations, profile] = await Promise.all([
        listBiomarkerHistory(owner, { limit: 200, offset: 0 }),
        listHealthObservations(owner, { limit: 200, offset: 0 }),
        getHealthProfileByClientId(owner.clientId)
    ]);
    const validatedBiomarkers = biomarkers.filter((item) => item.validationStatus === 'validated');
    const recentObservations = observations.filter((item) => item.qualityStatus === 'accepted' || item.qualityStatus === 'estimated');
    const nutritionBiomarkers = validatedBiomarkers.filter((item) => /vitamin|b12|folate|ferritin|iron|albumin|protein|calcium|magnesium/i.test(`${item.biomarkerName} ${item.unit}`));
    const nutritionObservations = recentObservations.filter((item) => ['hydration_ml'].includes(item.metricType));
    const nutritionInputs = [
        ...nutritionBiomarkers.map((item) => scoreFromReferenceRange(item.value, item.referenceRange)),
        ...nutritionObservations.map((item) => scoreObservation(item.metricType, item.value))
    ];
    const clinicalInputs = validatedBiomarkers.map((item) => scoreFromReferenceRange(item.value, item.referenceRange));
    const activityObservations = recentObservations.filter((item) => ['steps', 'active_minutes', 'workout_minutes'].includes(item.metricType));
    const sleepObservations = recentObservations.filter((item) => item.metricType === 'sleep_minutes');
    const calmObservations = recentObservations.filter((item) => ['hrv_ms', 'resting_heart_rate', 'sleep_minutes', 'stress_score'].includes(item.metricType));
    const recoveryObservations = recentObservations.filter((item) => ['sleep_minutes', 'hrv_ms', 'resting_heart_rate', 'active_minutes', 'workout_minutes'].includes(item.metricType));
    const scores = [];
    scores.push(nutritionInputs.length
        ? {
            scoreType: 'nutrition',
            scoreValue: average(nutritionInputs),
            scoreStatus: 'calculated',
            confidence: confidenceAverage([
                ...nutritionBiomarkers.map((item) => item.confidence),
                ...nutritionObservations.map(() => 0.7)
            ]),
            inputSummary: {
                biomarkerObservationIds: nutritionBiomarkers.map((item) => item.id),
                healthObservationIds: nutritionObservations.map((item) => item.id),
                profileAvailable: Boolean(profile)
            },
            calculationVersion: CALCULATION_VERSION
        }
        : insufficient('nutrition', 'No validated nutrition biomarkers or nutrition observations are available.'));
    scores.push(clinicalInputs.length
        ? {
            scoreType: 'clinical',
            scoreValue: average(clinicalInputs),
            scoreStatus: 'calculated',
            confidence: confidenceAverage(validatedBiomarkers.map((item) => item.confidence)),
            inputSummary: { biomarkerObservationIds: validatedBiomarkers.map((item) => item.id), profileAvailable: Boolean(profile) },
            calculationVersion: CALCULATION_VERSION
        }
        : insufficient('clinical', 'No validated clinical biomarkers are available.'));
    scores.push(activityObservations.length
        ? {
            scoreType: 'activity',
            scoreValue: average(activityObservations.map((item) => scoreObservation(item.metricType, item.value))),
            scoreStatus: 'calculated',
            confidence: 0.7,
            inputSummary: { healthObservationIds: activityObservations.map((item) => item.id) },
            calculationVersion: CALCULATION_VERSION
        }
        : insufficient('activity', 'No activity observations are available.'));
    scores.push(sleepObservations.length
        ? {
            scoreType: 'sleep',
            scoreValue: average(sleepObservations.map((item) => scoreObservation(item.metricType, item.value))),
            scoreStatus: 'calculated',
            confidence: 0.78,
            inputSummary: {
                healthObservationIds: sleepObservations.map((item) => item.id),
                calculationRule: 'Sleep score compares observed sleep minutes against a 7.5 hour target and does not synthesize missing sleep data.'
            },
            calculationVersion: CALCULATION_VERSION
        }
        : insufficient('sleep', 'No sleep observations are available.'));
    scores.push(calmObservations.length
        ? {
            scoreType: 'calm',
            scoreValue: average(calmObservations.map((item) => scoreObservation(item.metricType, item.value))),
            scoreStatus: 'calculated',
            confidence: 0.72,
            inputSummary: {
                healthObservationIds: calmObservations.map((item) => item.id),
                calculationRule: 'Calm score uses HRV, resting heart rate, sleep, and stress observations when present.'
            },
            calculationVersion: CALCULATION_VERSION
        }
        : insufficient('calm', 'No HRV, resting heart rate, sleep, or stress observations are available.'));
    scores.push(recoveryObservations.length
        ? {
            scoreType: 'recovery',
            scoreValue: average(recoveryObservations.map((item) => scoreObservation(item.metricType, item.value))),
            scoreStatus: 'calculated',
            confidence: 0.7,
            inputSummary: {
                healthObservationIds: recoveryObservations.map((item) => item.id),
                calculationRule: 'Recovery score combines sleep, HRV, resting heart rate, and recent activity load inputs.'
            },
            calculationVersion: CALCULATION_VERSION
        }
        : insufficient('recovery', 'No recovery observations are available.'));
    const calculated = scores.filter((score) => score.scoreStatus === 'calculated' && score.scoreValue != null);
    scores.push(calculated.length
        ? {
            scoreType: 'overall',
            scoreValue: average(calculated.map((score) => score.scoreValue ?? 0)),
            scoreStatus: 'calculated',
            confidence: confidenceAverage(calculated.map((score) => score.confidence)),
            inputSummary: { scoreTypes: calculated.map((score) => score.scoreType) },
            calculationVersion: CALCULATION_VERSION
        }
        : insufficient('overall', 'No calculated health dimension scores are available.'));
    return createHealthScores(owner, scores);
};
