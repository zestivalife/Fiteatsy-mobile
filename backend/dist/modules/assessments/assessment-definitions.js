import { z } from 'zod';
export const ASSESSMENT_TYPE_PSS10 = 'PSS10';
export const PSS10_INSTRUMENT_VERSION = 'pss10-fiteatsy-v2';
export const PSS10_SCORING_VERSION = 'pss10-scoring-v1';
export const PSS10_INTERPRETATION_VERSION = 'pss10-interpretation-v1';
export const pss10Items = [
    { id: 'PSS10_Q01', label: 'Upset by unexpected events.', reverseScored: false },
    { id: 'PSS10_Q02', label: 'Unable to control important things.', reverseScored: false },
    { id: 'PSS10_Q03', label: 'Nervous and stressed.', reverseScored: false },
    { id: 'PSS10_Q04', label: 'Confident in handling personal problems.', reverseScored: true },
    { id: 'PSS10_Q05', label: 'Things were going your way.', reverseScored: true },
    { id: 'PSS10_Q06', label: 'Unable to cope with tasks.', reverseScored: false },
    { id: 'PSS10_Q07', label: 'Able to control irritations.', reverseScored: true },
    { id: 'PSS10_Q08', label: 'On top of things.', reverseScored: true },
    { id: 'PSS10_Q09', label: 'Angered by uncontrollable events.', reverseScored: false },
    { id: 'PSS10_Q10', label: 'Difficulties were piling up.', reverseScored: false }
];
export const pss10ResponseOptions = [
    { value: 0, label: 'Never' },
    { value: 1, label: 'Almost never' },
    { value: 2, label: 'Sometimes' },
    { value: 3, label: 'Fairly often' },
    { value: 4, label: 'Very often' }
];
export const assessmentResponseSchema = z.object({
    itemId: z.string().min(1),
    selectedValue: z.number().int().min(0).max(4)
});
export const pss10ResponseListSchema = z.array(assessmentResponseSchema);
export const getPss10Interpretation = (score) => {
    if (!Number.isInteger(score) || score < 0 || score > 40) {
        throw new Error('PSS-10 score is outside the expected 0-40 range.');
    }
    if (score <= 13)
        return { key: 'LOW', label: 'Low stress' };
    if (score <= 26)
        return { key: 'MODERATE', label: 'Moderate stress' };
    return { key: 'HIGH', label: 'High perceived stress' };
};
export const getAssessmentDefinition = (assessmentType) => {
    if (assessmentType !== ASSESSMENT_TYPE_PSS10) {
        return null;
    }
    return {
        id: 'pss10',
        assessmentType: ASSESSMENT_TYPE_PSS10,
        instrumentVersion: PSS10_INSTRUMENT_VERSION,
        scoringVersion: PSS10_SCORING_VERSION,
        title: 'Perceived Stress Assessment',
        subtitle: 'Thinking about the last 30 days, select how often each of the following applied to you.',
        recallPeriod: 'the last 30 days',
        itemCount: pss10Items.length,
        maxScore: 40,
        licensedItemWordingPresent: true,
        items: pss10Items,
        responseOptions: pss10ResponseOptions,
        active: true
    };
};
export const normalizeAssessmentType = (assessmentType) => assessmentType.toUpperCase() === ASSESSMENT_TYPE_PSS10 ? ASSESSMENT_TYPE_PSS10 : null;
