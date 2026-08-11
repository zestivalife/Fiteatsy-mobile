export const HEALTH_CALCULATION_FORMULA_VERSION = 'm2-health-calculations-v1';
const ACTIVITY_MULTIPLIERS = {
    sedentary: 1.2,
    light: 1.375,
    moderate: 1.55,
    very_active: 1.725
};
const round = (value, decimals = 1) => {
    const factor = 10 ** decimals;
    return Math.round(value * factor) / factor;
};
const isPositive = (value) => typeof value === 'number' && Number.isFinite(value) && value > 0;
const normalizeGender = (gender) => {
    const normalized = gender?.trim().toLowerCase();
    if (!normalized)
        return null;
    if (['male', 'm'].includes(normalized))
        return 'male';
    if (['female', 'f'].includes(normalized))
        return 'female';
    return null;
};
const normalizeActivityLevel = (activityLevel) => {
    const normalized = activityLevel?.trim().toLowerCase().replace(/[\s-]+/g, '_');
    if (!normalized)
        return null;
    if (['sedentary', 'inactive'].includes(normalized))
        return 'sedentary';
    if (['light', 'lightly_active'].includes(normalized))
        return 'light';
    if (['moderate', 'moderately_active'].includes(normalized))
        return 'moderate';
    if (['very_active', 'active', 'high'].includes(normalized))
        return 'very_active';
    return null;
};
const createBase = (inputSnapshot, calculatedAt) => ({
    formulaVersion: HEALTH_CALCULATION_FORMULA_VERSION,
    calculatedAt,
    inputSnapshot
});
const notAvailable = (reason, inputSnapshot, calculatedAt) => ({
    ...createBase(inputSnapshot, calculatedAt),
    status: 'NOT_AVAILABLE',
    reason,
    value: null,
    unit: null,
    category: null,
    values: {}
});
const available = (value, unit, category, inputSnapshot, calculatedAt, values) => ({
    ...createBase(inputSnapshot, calculatedAt),
    status: 'AVAILABLE',
    value,
    unit,
    category,
    values
});
const bmiCategory = (bmi) => {
    if (bmi < 18.5)
        return 'Underweight';
    if (bmi < 25)
        return 'Normal';
    if (bmi < 30)
        return 'Overweight';
    return 'Obese';
};
const calculateBmi = (input, calculatedAt) => {
    const inputSnapshot = { heightCm: input.heightCm, weightKg: input.weightKg };
    if (!isPositive(input.heightCm) || !isPositive(input.weightKg)) {
        return notAvailable('Height and weight are required.', inputSnapshot, calculatedAt);
    }
    const heightM = input.heightCm / 100;
    const value = round(input.weightKg / heightM ** 2);
    return available(value, 'kg/m2', bmiCategory(value), inputSnapshot, calculatedAt);
};
const calculateBmrValue = (input) => {
    const gender = normalizeGender(input.gender);
    if (!isPositive(input.age) || !gender || !isPositive(input.heightCm) || !isPositive(input.weightKg)) {
        return null;
    }
    const base = 10 * input.weightKg + 6.25 * input.heightCm - 5 * input.age;
    return Math.round(gender === 'male' ? base + 5 : base - 161);
};
const calculateBmr = (input, calculatedAt) => {
    const inputSnapshot = {
        age: input.age,
        gender: input.gender,
        heightCm: input.heightCm,
        weightKg: input.weightKg
    };
    const value = calculateBmrValue(input);
    if (value == null) {
        return notAvailable('Age, binary sex, height, and weight are required.', inputSnapshot, calculatedAt);
    }
    return available(value, 'kcal/day', null, inputSnapshot, calculatedAt);
};
const calculateTdee = (input, calculatedAt) => {
    const activityKey = normalizeActivityLevel(input.activityLevel);
    const bmr = calculateBmrValue(input);
    const inputSnapshot = {
        age: input.age,
        gender: input.gender,
        heightCm: input.heightCm,
        weightKg: input.weightKg,
        activityLevel: input.activityLevel
    };
    if (bmr == null || !activityKey) {
        return notAvailable('BMR inputs and activity level are required.', inputSnapshot, calculatedAt);
    }
    const multiplier = ACTIVITY_MULTIPLIERS[activityKey];
    const value = Math.round(bmr * multiplier);
    return available(value, 'kcal/day', null, inputSnapshot, calculatedAt, {
        bmr,
        activityMultiplier: multiplier
    });
};
const calculateTargetHeartRate = (input, calculatedAt) => {
    const inputSnapshot = { age: input.age };
    if (!isPositive(input.age)) {
        return notAvailable('Age is required.', inputSnapshot, calculatedAt);
    }
    const maxHeartRate = Math.round(220 - input.age);
    const minTarget = Math.round(maxHeartRate * 0.5);
    const maxTarget = Math.round(maxHeartRate * 0.85);
    return available(maxHeartRate, 'bpm', `${minTarget}-${maxTarget} bpm`, inputSnapshot, calculatedAt, {
        maxHeartRate,
        minTarget,
        maxTarget
    });
};
const cmToInches = (value) => value / 2.54;
const calculateBodyFat = (input, calculatedAt) => {
    const gender = normalizeGender(input.gender);
    const inputSnapshot = {
        gender: input.gender,
        heightCm: input.heightCm,
        waistCm: input.waistCm,
        hipCm: input.hipCm,
        neckCm: input.neckCm
    };
    if (!gender || !isPositive(input.heightCm) || !isPositive(input.waistCm) || !isPositive(input.neckCm)) {
        return notAvailable('Gender, height, waist, and neck measurements are required.', inputSnapshot, calculatedAt);
    }
    const heightIn = cmToInches(input.heightCm);
    const waistIn = cmToInches(input.waistCm);
    const neckIn = cmToInches(input.neckCm);
    if (gender === 'male') {
        if (waistIn <= neckIn) {
            return notAvailable('Waist measurement must be greater than neck measurement.', inputSnapshot, calculatedAt);
        }
        return available(round(86.01 * Math.log10(waistIn - neckIn) - 70.041 * Math.log10(heightIn) + 36.76), '%', null, inputSnapshot, calculatedAt);
    }
    if (!isPositive(input.hipCm)) {
        return notAvailable('Hip measurement is required for female body fat calculation.', inputSnapshot, calculatedAt);
    }
    const hipIn = cmToInches(input.hipCm);
    if (waistIn + hipIn <= neckIn) {
        return notAvailable('Waist and hip measurements must be greater than neck measurement.', inputSnapshot, calculatedAt);
    }
    return available(round(163.205 * Math.log10(waistIn + hipIn - neckIn) - 97.684 * Math.log10(heightIn) - 78.387), '%', null, inputSnapshot, calculatedAt);
};
const calculateOneRepMax = (input, calculatedAt) => {
    const oneRepInput = input.oneRepMaxInput;
    const inputSnapshot = {
        weightKg: oneRepInput?.weightKg ?? null,
        reps: oneRepInput?.reps ?? null
    };
    if (!isPositive(oneRepInput?.weightKg) || !isPositive(oneRepInput?.reps)) {
        return notAvailable('Lifted weight and repetitions are required.', inputSnapshot, calculatedAt);
    }
    return available(round(oneRepInput.weightKg * (1 + oneRepInput.reps / 30)), 'kg', null, inputSnapshot, calculatedAt);
};
export const calculateHealthMetrics = (input, calculatedAt = new Date().toISOString()) => ({
    bmi: calculateBmi(input, calculatedAt),
    bmr: calculateBmr(input, calculatedAt),
    tdee: calculateTdee(input, calculatedAt),
    targetHeartRate: calculateTargetHeartRate(input, calculatedAt),
    bodyFat: calculateBodyFat(input, calculatedAt),
    oneRepMax: calculateOneRepMax(input, calculatedAt)
});
