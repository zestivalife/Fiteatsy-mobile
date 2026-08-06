import crypto from 'node:crypto';
export const CORE_BIOMARKERS = [
    'HbA1c',
    'Fasting Glucose',
    'Insulin',
    'HOMA-IR',
    'Triglycerides',
    'HDL Cholesterol',
    'LDL Cholesterol',
    'Total Cholesterol',
    'Creatinine',
    'eGFR',
    'Urea',
    'BUN',
    'Uric Acid',
    'ALT',
    'AST',
    'GGT',
    'Bilirubin',
    'Albumin',
    'Non-HDL',
    'VLDL',
    'ApoB',
    'Lipoprotein(a)',
    'hs-CRP',
    'Vitamin B12',
    'Vitamin D',
    'Ferritin',
    'Iron',
    'Hemoglobin',
    'TSH',
    'Free T4',
    'WBC',
    'Platelets'
];
const normalizeName = (value) => value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const coreAliases = [
    { canonicalName: 'HbA1c', aliases: ['Hb A1c', 'Glycated Hemoglobin', 'Glycosylated Hemoglobin'], dimension: 'Metabolic' },
    { canonicalName: 'Fasting Glucose', aliases: ['Glucose', 'FBS', 'Blood Sugar Fasting'], dimension: 'Metabolic' },
    { canonicalName: 'Insulin', aliases: ['Fasting Insulin'], dimension: 'Metabolic' },
    { canonicalName: 'HOMA-IR', aliases: ['HOMA IR', 'HOMA'], dimension: 'Metabolic' },
    { canonicalName: 'Triglycerides', aliases: ['Triglyceride', 'TG'], dimension: 'Metabolic' },
    { canonicalName: 'HDL Cholesterol', aliases: ['HDL'], dimension: 'Metabolic' },
    { canonicalName: 'LDL Cholesterol', aliases: ['LDL'], dimension: 'Metabolic' },
    { canonicalName: 'Total Cholesterol', aliases: ['Cholesterol'], dimension: 'Metabolic' },
    { canonicalName: 'Creatinine', aliases: ['Serum Creatinine'], dimension: 'Kidney' },
    { canonicalName: 'eGFR', aliases: ['Estimated GFR'], dimension: 'Kidney' },
    { canonicalName: 'Urea', aliases: ['Blood Urea'], dimension: 'Kidney' },
    { canonicalName: 'BUN', aliases: ['Blood Urea Nitrogen'], dimension: 'Kidney' },
    { canonicalName: 'Uric Acid', aliases: ['Serum Uric Acid'], dimension: 'Kidney' },
    { canonicalName: 'ALT', aliases: ['SGPT', 'Alanine Aminotransferase'], dimension: 'Liver' },
    { canonicalName: 'AST', aliases: ['SGOT', 'Aspartate Aminotransferase'], dimension: 'Liver' },
    { canonicalName: 'GGT', aliases: ['Gamma GT'], dimension: 'Liver' },
    { canonicalName: 'Bilirubin', aliases: ['Total Bilirubin'], dimension: 'Liver' },
    { canonicalName: 'Albumin', aliases: ['Serum Albumin'], dimension: 'Liver' },
    { canonicalName: 'Non-HDL', aliases: ['Non HDL'], dimension: 'Cardiovascular' },
    { canonicalName: 'VLDL', aliases: ['VLDL Cholesterol'], dimension: 'Cardiovascular' },
    { canonicalName: 'ApoB', aliases: ['Apolipoprotein B'], dimension: 'Cardiovascular' },
    { canonicalName: 'Lipoprotein(a)', aliases: ['Lp(a)', 'Lipoprotein A'], dimension: 'Cardiovascular' },
    { canonicalName: 'hs-CRP', aliases: ['High Sensitivity CRP', 'CRP'], dimension: 'Cardiovascular' },
    { canonicalName: 'Vitamin B12', aliases: ['B12', 'Cobalamin', 'Serum B12'], dimension: 'Nutrition' },
    { canonicalName: 'Vitamin D', aliases: ['25-OH Vitamin D', 'Vitamin D3'], dimension: 'Nutrition' },
    { canonicalName: 'Ferritin', aliases: ['Serum Ferritin'], dimension: 'Nutrition' },
    { canonicalName: 'Iron', aliases: ['Serum Iron'], dimension: 'Nutrition' },
    { canonicalName: 'Hemoglobin', aliases: ['Hb', 'Haemoglobin'], dimension: 'Nutrition' },
    { canonicalName: 'TSH', aliases: ['Thyroid Stimulating Hormone'], dimension: 'Thyroid/Blood Context' },
    { canonicalName: 'Free T4', aliases: ['FT4'], dimension: 'Thyroid/Blood Context' },
    { canonicalName: 'WBC', aliases: ['White Blood Cells', 'White Blood Cell Count'], dimension: 'Thyroid/Blood Context' },
    { canonicalName: 'Platelets', aliases: ['Platelet Count'], dimension: 'Thyroid/Blood Context' }
];
export const canonicalBiomarkerName = (rawName) => {
    const normalized = normalizeName(rawName);
    const match = coreAliases.find((item) => normalizeName(item.canonicalName) === normalized || item.aliases.some((alias) => normalizeName(alias) === normalized));
    return match?.canonicalName ?? rawName.trim().replace(/\s+/g, ' ');
};
export const biomarkerTier = (canonicalName) => coreAliases.some((item) => normalizeName(item.canonicalName) === normalizeName(canonicalName)) ? 1 : 2;
export const biomarkerDimension = (canonicalName, fallback) => coreAliases.find((item) => normalizeName(item.canonicalName) === normalizeName(canonicalName))?.dimension ?? fallback;
export const documentHash = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');
const hasNumericReferenceRange = (range) => /(\d+(?:\.\d+)?)\s*(?:-|–|<|>)/.test(range);
const hasSupportedDocumentSignal = (text, parameters) => /\b(lab|labs|laboratory|diagnostic|diagnostics|pathology|blood|serum|plasma|cbc|lipid|thyroid|vitamin|glucose|hba1c)\b/i.test(text) ||
    parameters.length >= 5;
export const classifyDocument = (input) => {
    const isImage = input.mimeType.toLowerCase().includes('image');
    const supported = hasSupportedDocumentSignal(input.text, []) || input.parameterCount > 0;
    const documentType = supported
        ? input.parameterCount >= 15
            ? 'full_body_checkup'
            : 'blood_investigation_report'
        : 'unsupported_document';
    const confidence = supported ? Math.min(0.98, 0.58 + Math.min(input.parameterCount, 25) / 60) : 0.2;
    return {
        documentType,
        supported,
        labName: input.labName,
        pageCount: isImage ? 1 : Math.max(1, (input.text.match(/\f/g)?.length ?? 0) + 1),
        imageQuality: isImage ? 'requires_ai_vision' : input.text.length > 150 ? 'text_extractable' : 'low_text_density',
        confidence: Number(confidence.toFixed(2))
    };
};
export const buildExtractionGovernance = (text, parameters, document) => {
    const canonicalCore = new Set();
    const failedBiomarkers = [];
    let validationConfidenceTotal = 0;
    let validatedCount = 0;
    for (const parameter of parameters) {
        const canonicalName = canonicalBiomarkerName(parameter.name);
        const hasUnit = Boolean(parameter.unit.trim());
        const hasRange = hasNumericReferenceRange(parameter.referenceRange);
        const clinicallyPlausible = Number.isFinite(parameter.value) && Math.abs(parameter.value) < 100000;
        const validationConfidence = hasUnit && hasRange && clinicallyPlausible ? 0.94 : 0.55;
        validationConfidenceTotal += validationConfidence;
        if (hasUnit && hasRange && clinicallyPlausible)
            validatedCount += 1;
        if (biomarkerTier(canonicalName) === 1)
            canonicalCore.add(canonicalName);
        if (!hasUnit || !hasRange || !clinicallyPlausible)
            failedBiomarkers.push(parameter.name);
    }
    const extractionConfidence = parameters.length === 0 ? 0 : Math.min(0.98, 0.62 + Math.min(parameters.length, 40) / 120);
    const validationConfidence = parameters.length === 0 ? 0 : validationConfidenceTotal / parameters.length;
    const completeness = canonicalCore.size / CORE_BIOMARKERS.length;
    const confidence = Number(((extractionConfidence * 0.35) + (validationConfidence * 0.35) + (completeness * 0.3)).toFixed(2));
    const criticalPresent = canonicalCore.has('HbA1c') ||
        canonicalCore.has('Fasting Glucose') ||
        canonicalCore.has('Hemoglobin') ||
        canonicalCore.has('TSH') ||
        canonicalCore.has('LDL Cholesterol');
    const reasons = [];
    if (!document.supported)
        reasons.push('Unsupported or non-medical document.');
    if (parameters.length < 8)
        reasons.push(`Only ${parameters.length} biomarkers detected; minimum quality gate is 8.`);
    if (canonicalCore.size < 3)
        reasons.push(`Only ${canonicalCore.size}/32 core biomarkers detected; minimum quality gate is 3.`);
    if (!criticalPresent)
        reasons.push('No critical clinical marker was confidently identified.');
    if (confidence < 0.7)
        reasons.push(`Overall confidence ${confidence} is below publish threshold 0.70.`);
    if (failedBiomarkers.length > Math.max(2, Math.floor(parameters.length * 0.35)))
        reasons.push('Too many biomarkers require validation review.');
    const rescanRequired = parameters.length < 8 ||
        canonicalCore.size < 3 ||
        confidence < 0.85 ||
        failedBiomarkers.length > 0;
    const canPublish = document.supported && reasons.length === 0;
    return {
        extractionAttempts: [
            {
                attempt: 1,
                strategy: text ? 'pdf_text_table_scan' : 'vision_structured_json',
                parameterCount: parameters.length,
                confidence: Number(extractionConfidence.toFixed(2)),
                rescanRecommended: rescanRequired,
                notes: rescanRequired ? ['Secondary extraction recommended before clinical publication.'] : []
            }
        ],
        qualityGate: {
            status: canPublish ? 'PUBLISHABLE' : 'REVIEW_REQUIRED',
            canScore: canPublish,
            canPublish,
            confidence,
            extractionConfidence: Number(extractionConfidence.toFixed(2)),
            validationConfidence: Number(validationConfidence.toFixed(2)),
            biomarkerCompleteness: Number(completeness.toFixed(2)),
            detectedBiomarkers: parameters.length,
            validatedBiomarkers: validatedCount,
            coreBiomarkers: canonicalCore.size,
            failedBiomarkers,
            reasons
        },
        healthAssessment: {
            markerLabel: `${canonicalCore.size} Key Health Markers Analysed`,
            confidenceLabel: confidence >= 0.85 ? 'High' : confidence >= 0.7 ? 'Medium' : 'Needs Review',
            healthAreas: Array.from(new Set(Array.from(canonicalCore).map((name) => biomarkerDimension(name, 'Metabolic'))))
        }
    };
};
