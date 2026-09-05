const scoreSection = (section, fields) => {
    const completed = fields.filter(({ value }) => {
        if (Array.isArray(value))
            return value.length > 0;
        if (typeof value === 'number')
            return Number.isFinite(value) && value > 0;
        return Boolean(String(value ?? '').trim());
    }).length;
    const missing = fields.filter(({ value }) => {
        if (Array.isArray(value))
            return value.length === 0;
        if (typeof value === 'number')
            return !Number.isFinite(value) || value <= 0;
        return !String(value ?? '').trim();
    }).map((item) => item.label);
    return {
        section,
        completed,
        total: fields.length,
        percent: Math.round((completed / Math.max(1, fields.length)) * 100),
        missing,
    };
};
export const calculateAgeFromDob = (dobISO) => {
    if (!dobISO)
        return null;
    const dob = new Date(dobISO);
    if (Number.isNaN(dob.getTime()))
        return null;
    const now = new Date();
    let age = now.getFullYear() - dob.getFullYear();
    if (now.getMonth() < dob.getMonth() || (now.getMonth() === dob.getMonth() && now.getDate() < dob.getDate())) {
        age -= 1;
    }
    return Math.max(0, age);
};
export const calculateBmi = (heightCm, weightKg) => {
    if (!heightCm || !weightKg || heightCm <= 0 || weightKg <= 0)
        return null;
    const heightM = heightCm / 100;
    return Number((weightKg / (heightM * heightM)).toFixed(1));
};
export const calculateWaistToHeightRatio = (waistCm, heightCm) => {
    if (!waistCm || !heightCm || waistCm <= 0 || heightCm <= 0)
        return null;
    return Number((waistCm / heightCm).toFixed(2));
};
export const calculateNutritionProfileCompletion = (profile, reportCount) => {
    const sections = [
        scoreSection('basic_information', [
            { label: 'Date of Birth', value: profile.dateOfBirthISO },
            { label: 'Calculated Age', value: profile.calculatedAge },
            { label: 'Gender', value: profile.gender },
            { label: 'Height', value: profile.heightCm },
            { label: 'Current Weight', value: profile.currentWeightKg },
            { label: 'BMI', value: calculateBmi(profile.heightCm, profile.currentWeightKg) },
        ]),
        scoreSection('body_composition', [
            { label: 'Goal Weight', value: profile.goalWeightKg },
            { label: 'Waist', value: profile.waistCm },
            { label: 'Hip', value: profile.hipCm },
            { label: 'Neck', value: profile.neckCm },
            { label: 'Body Fat %', value: profile.bodyFatPct },
        ]),
        scoreSection('lifestyle', [
            { label: 'Occupation', value: profile.occupation },
            { label: 'Working Hours', value: profile.workingHoursLabel },
            { label: 'Shift Type', value: profile.shiftType },
            { label: 'Activity Level', value: profile.activityLevel },
            { label: 'Work Mode', value: profile.workMode },
            { label: 'Travel Frequency', value: profile.travelFrequency },
            { label: 'Sleep Hours', value: profile.sleepHours },
            { label: 'Sleep Goal', value: profile.sleepGoalHours },
            { label: 'Sleep Quality', value: profile.sleepQualityLabel },
            { label: 'Smoking Status', value: profile.smokingStatus },
            { label: 'Alcohol Frequency', value: profile.alcoholFrequency },
            { label: 'Exercise Frequency', value: profile.exerciseFrequency },
            { label: 'Stress Level', value: profile.stressLevelLabel },
        ]),
        scoreSection('meal_behaviour', [
            { label: 'Wake Time', value: profile.wakeTime },
            { label: 'Breakfast Time', value: profile.breakfastTime },
            { label: 'Lunch Time', value: profile.lunchTime },
            { label: 'Dinner Time', value: profile.dinnerTime },
            { label: 'Sleep Time', value: profile.sleepTime },
            { label: 'Meals Per Day', value: profile.mealsPerDay },
            { label: 'Water Intake', value: profile.waterIntakeLiters },
            { label: 'Outside Food Frequency', value: profile.outsideFoodFrequency },
            { label: 'Cooking At Home', value: profile.cookingAtHome },
            { label: 'Who Cooks', value: profile.whoCooks },
        ]),
        scoreSection('food_preferences', [
            { label: 'Diet Type', value: profile.dietType },
            { label: 'Regional Cuisine', value: profile.regionalCuisine },
            { label: 'Preferred Cuisines', value: profile.preferredCuisines },
            { label: 'Foods You Like', value: profile.foodsLiked },
            { label: 'Foods You Dislike', value: profile.foodsDisliked },
            { label: 'Food Allergies', value: profile.foodAllergies },
            { label: 'Food Intolerances', value: profile.foodIntolerances },
            { label: 'Supplements', value: profile.currentSupplements },
        ]),
        scoreSection('medical_history', [
            { label: 'Current Medicines', value: profile.currentMedicines },
            { label: 'Primary Conditions', value: profile.primaryConditions },
            { label: 'Previous Conditions', value: profile.previousConditions },
            { label: 'Family History', value: profile.familyHistoryConditions },
            { label: 'Wellness Goals', value: profile.wellnessGoals },
            { label: 'Clinical Notes', value: profile.medicalNotes },
            { label: 'PCOS', value: profile.pcosStatus },
            { label: 'Thyroid', value: profile.thyroidStatus },
            { label: 'Diabetes', value: profile.diabetesStatus },
            { label: 'Hypertension', value: profile.hypertensionStatus },
            { label: 'Cholesterol', value: profile.cholesterolStatus },
            { label: 'Heart Conditions', value: profile.heartConditionStatus },
            { label: 'Previous Surgeries', value: profile.previousSurgeries },
        ]),
        scoreSection('blood_reports', [
            { label: 'Blood Reports', value: reportCount > 0 ? reportCount : null },
        ]),
    ];
    const totalCompleted = sections.reduce((sum, section) => sum + section.completed, 0);
    const totalFields = sections.reduce((sum, section) => sum + section.total, 0);
    const completionPercent = Math.round((totalCompleted / Math.max(1, totalFields)) * 100);
    const reportScore = sections.find((item) => item.section === 'blood_reports')?.percent ?? 0;
    const mealScore = sections.find((item) => item.section === 'meal_behaviour')?.percent ?? 0;
    const foodScore = sections.find((item) => item.section === 'food_preferences')?.percent ?? 0;
    const readinessScore = Math.round((completionPercent * 0.55) + (reportScore * 0.2) + (mealScore * 0.15) + (foodScore * 0.1));
    const missingFields = sections.flatMap((section) => section.missing);
    return {
        completionPercent,
        readinessScore,
        aiReady: readinessScore >= 75,
        missingFields,
        sectionScores: sections,
    };
};
