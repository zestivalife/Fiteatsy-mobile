const normalize = (value) => (value ?? '').trim().toLowerCase();
const normalized = (values) => values.map(normalize).filter(Boolean);
const enabledGuidanceItems = (guidance) => [
    ...guidance.whatCanIEatNow,
    ...Object.values(guidance.eatingOut).flat(),
    ...Object.values(guidance.cravings).flat(),
].filter((item) => item.enabled);
const dietCompatible = (requestedValue, dietaryTags) => {
    const requested = normalize(requestedValue).replaceAll('_', '-');
    if (!requested || requested.includes('non-vegetarian') || requested.includes('non vegetarian'))
        return true;
    const tags = normalized(dietaryTags).map((tag) => tag.replaceAll('_', '-'));
    if (requested.includes('vegan'))
        return tags.some((tag) => tag.includes('vegan'));
    if (requested.includes('jain'))
        return tags.some((tag) => tag.includes('jain'));
    if (requested.includes('egg'))
        return tags.some((tag) => tag.includes('egg') || tag.includes('vegetarian') || tag.includes('vegan'));
    if (requested.includes('vegetarian'))
        return tags.some((tag) => (!tag.includes('non-') && tag.includes('vegetarian')) || tag.includes('vegan') || tag.includes('jain'));
    return tags.some((tag) => requested.includes(tag) || tag.includes(requested));
};
const unresolved = (item) => !item.foodId ||
    !item.name.trim() ||
    !item.servingLabel.trim() ||
    !item.reason.trim() ||
    Object.values(item.nutrition).some((value) => !Number.isFinite(value));
export class OptionalGuidanceContractError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.name = 'OptionalGuidanceContractError';
        this.code = code;
    }
}
export const validateOptionalGuidanceV2 = (input) => {
    const guidance = input.content.optionalGuidance;
    if (!guidance)
        return null;
    const items = enabledGuidanceItems(guidance);
    if (!items.length)
        return guidance;
    const foodsById = new Map(input.verifiedActiveFoods.map((food) => [food.id, food]));
    const blockedTags = new Set(normalized([...input.compatibility.medicalRestrictions, ...input.compatibility.allergyTags]));
    const avoidedIds = new Set(input.compatibility.avoidedFoodIds);
    const avoidedNames = normalized(input.compatibility.avoidedFoods);
    for (const item of items) {
        if (unresolved(item)) {
            throw new OptionalGuidanceContractError('OPTIONAL_GUIDANCE_UNRESOLVED', `${item.name || 'Optional guidance'} contains unresolved nutrition data.`);
        }
        const food = foodsById.get(item.foodId);
        if (!food || food.verificationStatus !== 'verified') {
            throw new OptionalGuidanceContractError('OPTIONAL_GUIDANCE_NOT_VERIFIED', `${item.name} is not an active, verified catalogue food.`);
        }
        const foodNames = [normalize(food.canonicalName), normalize(food.displayName), normalize(item.name)];
        if (avoidedIds.has(food.id) || avoidedNames.some((avoided) => foodNames.some((name) => name.includes(avoided)))) {
            throw new OptionalGuidanceContractError('OPTIONAL_GUIDANCE_FOOD_AVOIDED', `${item.name} conflicts with the client's Foods to Avoid.`);
        }
        const safetyTags = normalized([...(food.allergenTags ?? []), ...item.restrictionTags]);
        if (safetyTags.some((tag) => blockedTags.has(tag))) {
            throw new OptionalGuidanceContractError('OPTIONAL_GUIDANCE_MEDICALLY_INCOMPATIBLE', `${item.name} conflicts with a client safety restriction.`);
        }
        if (!dietCompatible(input.compatibility.dietPreference, food.dietaryTags ?? [])) {
            throw new OptionalGuidanceContractError('OPTIONAL_GUIDANCE_EATING_STYLE_INCOMPATIBLE', `${item.name} conflicts with the client's eating style.`);
        }
        if (input.requireReviewed && !item.clinicallyReviewed) {
            throw new OptionalGuidanceContractError('OPTIONAL_GUIDANCE_NOT_REVIEWED', `${item.name} has not been clinically reviewed.`);
        }
    }
    return guidance;
};
