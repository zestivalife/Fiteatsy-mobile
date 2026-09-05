import { ASSESSMENT_TYPE_PSS10, getPss10Interpretation, PSS10_INTERPRETATION_VERSION, PSS10_SCORING_VERSION, pss10Items } from './assessment-definitions.js';
export const scorePss10 = (responses) => {
    const expectedIds = new Set(pss10Items.map((item) => item.id));
    const responseMap = new Map();
    for (const response of responses) {
        if (!expectedIds.has(response.itemId)) {
            throw new Error(`Unknown PSS-10 item: ${response.itemId}`);
        }
        if (!Number.isInteger(response.selectedValue) || response.selectedValue < 0 || response.selectedValue > 4) {
            throw new Error(`Invalid PSS-10 response value for ${response.itemId}`);
        }
        if (responseMap.has(response.itemId)) {
            throw new Error(`Duplicate PSS-10 item response: ${response.itemId}`);
        }
        responseMap.set(response.itemId, response);
    }
    if (responseMap.size !== pss10Items.length) {
        throw new Error('PSS-10 completion requires responses for all 10 items.');
    }
    const itemScores = pss10Items.map((item) => {
        const response = responseMap.get(item.id);
        if (!response) {
            throw new Error(`Missing PSS-10 item response: ${item.id}`);
        }
        const normalizedScore = item.reverseScored ? 4 - response.selectedValue : response.selectedValue;
        return {
            itemId: item.id,
            selectedValue: response.selectedValue,
            normalizedScore,
            reverseScored: item.reverseScored
        };
    });
    const rawScore = itemScores.reduce((sum, item) => sum + item.normalizedScore, 0);
    if (rawScore < 0 || rawScore > 40) {
        throw new Error('PSS-10 score is outside the expected 0-40 range.');
    }
    return {
        assessmentType: ASSESSMENT_TYPE_PSS10,
        rawScore,
        maxScore: 40,
        scoringVersion: PSS10_SCORING_VERSION,
        interpretationVersion: PSS10_INTERPRETATION_VERSION,
        interpretation: getPss10Interpretation(rawScore),
        itemScores
    };
};
