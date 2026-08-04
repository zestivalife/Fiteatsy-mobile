import { createBiomarkerObservation, upsertBiomarker } from '../biomarkers/biomarkers.repository.js';
import { calculateHealthScores } from '../intelligence/health-calculation-engine.js';
const aliasMap = {
    hba1c: ['Hb A1C', 'Glycated Hemoglobin', 'Hemoglobin A1c'],
    glucose: ['Fasting Glucose', 'Blood Sugar', 'FBS'],
    tsh: ['Thyroid Stimulating Hormone'],
    creatinine: ['Serum Creatinine'],
    hemoglobin: ['Hb'],
    cholesterol: ['Total Cholesterol'],
    ldl: ['LDL Cholesterol'],
    hdl: ['HDL Cholesterol'],
    triglyceride: ['Triglycerides'],
    'vitamin d': ['25-OH Vitamin D', 'Vitamin D3'],
    'vitamin b12': ['B12', 'Cobalamin']
};
const normalizeName = (value) => value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const canonicalName = (rawName) => {
    const normalized = normalizeName(rawName);
    const match = Object.entries(aliasMap).find(([key, aliases]) => normalized === key || aliases.some((alias) => normalizeName(alias) === normalized));
    if (match)
        return match[0].replace(/\b\w/g, (letter) => letter.toUpperCase());
    return rawName.trim().replace(/\s+/g, ' ');
};
const mapCategory = (parameter) => {
    const name = parameter.name.toLowerCase();
    if (/vitamin|b12|folate|ferritin|iron|calcium|magnesium|albumin|protein/.test(name))
        return 'Nutrition';
    if (/cholesterol|triglyceride|hdl|ldl|vldl/.test(name))
        return 'Cardiovascular';
    if (/sgpt|sgot|ast|alt|bilirubin|albumin|alp/.test(name))
        return 'Liver';
    if (/creatinine|urea|egfr|uric/.test(name))
        return 'Kidney';
    if (/tsh|t3|t4|thyroid/.test(name))
        return 'Thyroid';
    if (/crp|esr/.test(name))
        return 'Inflammation';
    if (/testosterone|estrogen|progesterone|cortisol|insulin/.test(name))
        return 'Hormonal';
    return parameter.category === 'Metabolic' ? 'Metabolic' : 'Metabolic';
};
const parseReferenceRange = (value) => {
    const cleaned = value.replace(/\s/g, '');
    const between = cleaned.match(/(-?\d+(?:\.\d+)?)\s*[-–]\s*(-?\d+(?:\.\d+)?)/);
    if (between)
        return { min: Number(between[1]), max: Number(between[2]) };
    const lessThan = cleaned.match(/^<(-?\d+(?:\.\d+)?)/);
    if (lessThan)
        return { max: Number(lessThan[1]) };
    const greaterThan = cleaned.match(/^>(-?\d+(?:\.\d+)?)/);
    if (greaterThan)
        return { min: Number(greaterThan[1]) };
    return {};
};
const validateParameter = (parameter) => {
    const notes = [];
    if (!Number.isFinite(parameter.value))
        notes.push('Value is not finite.');
    if (!parameter.unit.trim())
        notes.push('Unit is missing.');
    if (!parameter.referenceRange.trim() || parameter.referenceRange === 'Not specified')
        notes.push('Reference range is missing.');
    const range = parseReferenceRange(parameter.referenceRange);
    const hasRange = typeof range.min === 'number' || typeof range.max === 'number';
    const status = notes.length > 0 || !hasRange ? 'review_required' : 'validated';
    const confidence = status === 'validated' ? 0.9 : 0.55;
    return { status, confidence, notes };
};
const testDateFromAnalysis = (analysis) => {
    const parsed = new Date(analysis.reportDate);
    if (!Number.isNaN(parsed.getTime()))
        return parsed.toISOString().slice(0, 10);
    return new Date().toISOString().slice(0, 10);
};
export const persistReportIntelligence = async (owner, reportId, analysis) => {
    const testDate = testDateFromAnalysis(analysis);
    const observations = [];
    for (const parameter of analysis.parameters) {
        const name = canonicalName(parameter.name);
        const biomarker = await upsertBiomarker({
            canonicalName: name,
            aliases: [parameter.name, ...(aliasMap[normalizeName(name)] ?? [])].filter((value, index, values) => values.indexOf(value) === index),
            category: mapCategory(parameter),
            standardUnit: parameter.unit || 'unspecified'
        });
        const validation = validateParameter(parameter);
        const observation = await createBiomarkerObservation(owner, {
            biomarkerId: biomarker.id,
            sourceReportId: reportId,
            value: parameter.value,
            unit: parameter.unit || 'unspecified',
            testDate,
            confidence: validation.confidence,
            validationStatus: validation.status,
            sourceLocation: parameter.name,
            referenceRange: parameter.referenceRange
        });
        observations.push({
            id: observation.id,
            biomarkerId: biomarker.id,
            biomarkerName: biomarker.canonicalName,
            validationStatus: observation.validationStatus,
            confidence: observation.confidence,
            notes: validation.notes
        });
    }
    const scores = await calculateHealthScores(owner);
    return { observations, scores };
};
