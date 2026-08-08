export type GroundTruthBiomarker = {
  name: string;
  value: number;
  unit: string;
  referenceRange: string;
};

export type ReportExtractionEvaluationCase = {
  id: string;
  lab: 'Redcliffe' | 'Thyrocare' | 'Metropolis' | 'Unknown';
  reportType: string;
  source: 'synthetic_pdf_text_fixture';
  lines: string[];
  groundTruth: GroundTruthBiomarker[];
  expectedDecision: 'PUBLISHED' | 'PARTIALLY_VALIDATED' | 'REVIEW_REQUIRED' | 'INSUFFICIENT_DATA';
};

export const reportExtractionEvaluationCases: ReportExtractionEvaluationCase[] = [
  {
    id: 'redcliffe-diabetes-kidney-electrolytes',
    lab: 'Redcliffe',
    reportType: 'Diabetes + kidney + electrolytes panel',
    source: 'synthetic_pdf_text_fixture',
    lines: [
      'Redcliffe Labs Diagnostic Report',
      '05 Aug 2026',
      'HbA1c 7.7 % 4.5-6.4',
      'Estimated average glucose (eAG) 174.3 mg/dL 70-140',
      'Glucose Fasting 132 mg/dL 70-100',
      'Creatinine 1.0 mg/dL 0.6-1.3',
      'Blood Urea 31 mg/dL 15-40',
      'Sodium 141 mmol/L 136-145',
      'Potassium 4.5 mmol/L 3.6-5.2',
      'Chloride 104 mmol/L 100-108'
    ],
    groundTruth: [
      { name: 'HbA1c', value: 7.7, unit: '%', referenceRange: '4.5-6.4' },
      { name: 'Estimated Average Glucose', value: 174.3, unit: 'mg/dL', referenceRange: '70-140' },
      { name: 'Fasting Glucose', value: 132, unit: 'mg/dL', referenceRange: '70-100' },
      { name: 'Creatinine', value: 1.0, unit: 'mg/dL', referenceRange: '0.6-1.3' },
      { name: 'Urea', value: 31, unit: 'mg/dL', referenceRange: '15-40' },
      { name: 'Sodium', value: 141, unit: 'mmol/L', referenceRange: '136-145' },
      { name: 'Potassium', value: 4.5, unit: 'mmol/L', referenceRange: '3.6-5.2' },
      { name: 'Chloride', value: 104, unit: 'mmol/L', referenceRange: '100-108' }
    ],
    expectedDecision: 'PUBLISHED'
  },
  {
    id: 'thyrocare-lipid-thyroid-vitamin',
    lab: 'Thyrocare',
    reportType: 'Lipid + thyroid + vitamin panel',
    source: 'synthetic_pdf_text_fixture',
    lines: [
      'Thyrocare Technologies Limited Laboratory Report',
      '06 Aug 2026',
      'Total Cholesterol 208 mg/dL 120-200',
      'LDL 142 mg/dL 0-130',
      'HDL 45 mg/dL 40-80',
      'Triglycerides 168 mg/dL 40-150',
      'VLDL 34 mg/dL 5-40',
      'TSH 3.2 mIU/L 0.4-4.5',
      'Vitamin - B12 260 pg/mL 200-900',
      'Vitamin D 25 - Hydroxy 21 ng/mL 30-100'
    ],
    groundTruth: [
      { name: 'Total Cholesterol', value: 208, unit: 'mg/dL', referenceRange: '120-200' },
      { name: 'LDL Cholesterol', value: 142, unit: 'mg/dL', referenceRange: '0-130' },
      { name: 'HDL Cholesterol', value: 45, unit: 'mg/dL', referenceRange: '40-80' },
      { name: 'Triglycerides', value: 168, unit: 'mg/dL', referenceRange: '40-150' },
      { name: 'VLDL', value: 34, unit: 'mg/dL', referenceRange: '5-40' },
      { name: 'TSH', value: 3.2, unit: 'mIU/L', referenceRange: '0.4-4.5' },
      { name: 'Vitamin B12', value: 260, unit: 'pg/mL', referenceRange: '200-900' },
      { name: 'Vitamin D', value: 21, unit: 'ng/mL', referenceRange: '30-100' }
    ],
    expectedDecision: 'PUBLISHED'
  },
  {
    id: 'metropolis-cbc',
    lab: 'Metropolis',
    reportType: 'CBC report',
    source: 'synthetic_pdf_text_fixture',
    lines: [
      'Metropolis Healthcare Pathology Report',
      '07 Aug 2026',
      'Hemoglobin 13.1 g/dL 12-16',
      'TLC 6.8 10^3/µL 4-11',
      'Platelet Count 245 10^3/µL 150-450',
      'RBC Count 4.7 million/µL 4.2-5.4',
      'PCV 41 % 36-46',
      'MCV 88 fL 80-100',
      'MCH 29 pg 27-32',
      'MCHC 33 g/dL 32-36'
    ],
    groundTruth: [
      { name: 'Hemoglobin', value: 13.1, unit: 'g/dL', referenceRange: '12-16' },
      { name: 'WBC', value: 6.8, unit: '10^3/µL', referenceRange: '4-11' },
      { name: 'Platelets', value: 245, unit: '10^3/µL', referenceRange: '150-450' },
      { name: 'RBC', value: 4.7, unit: 'million/µL', referenceRange: '4.2-5.4' },
      { name: 'Hematocrit', value: 41, unit: '%', referenceRange: '36-46' },
      { name: 'MCV', value: 88, unit: 'fL', referenceRange: '80-100' },
      { name: 'MCH', value: 29, unit: 'pg', referenceRange: '27-32' },
      { name: 'MCHC', value: 33, unit: 'g/dL', referenceRange: '32-36' }
    ],
    expectedDecision: 'PUBLISHED'
  },
  {
    id: 'unknown-decimal-shift-risk',
    lab: 'Unknown',
    reportType: 'Implausible decimal extraction guard',
    source: 'synthetic_pdf_text_fixture',
    lines: [
      'Unknown Diagnostic Laboratory Report',
      '08 Aug 2026',
      'HbA1c 77 % 4.5-6.4',
      'Glucose Fasting 96 mg/dL 70-100',
      'Total Cholesterol 176 mg/dL 120-200',
      'LDL 98 mg/dL 0-130',
      'HDL 52 mg/dL 40-80',
      'Triglycerides 118 mg/dL 40-150',
      'Creatinine 0.9 mg/dL 0.6-1.3',
      'Hemoglobin 13.4 g/dL 12-16',
      'TSH 2.1 mIU/L 0.4-4.5'
    ],
    groundTruth: [
      { name: 'HbA1c', value: 77, unit: '%', referenceRange: '4.5-6.4' },
      { name: 'Fasting Glucose', value: 96, unit: 'mg/dL', referenceRange: '70-100' },
      { name: 'Total Cholesterol', value: 176, unit: 'mg/dL', referenceRange: '120-200' },
      { name: 'LDL Cholesterol', value: 98, unit: 'mg/dL', referenceRange: '0-130' },
      { name: 'HDL Cholesterol', value: 52, unit: 'mg/dL', referenceRange: '40-80' },
      { name: 'Triglycerides', value: 118, unit: 'mg/dL', referenceRange: '40-150' },
      { name: 'Creatinine', value: 0.9, unit: 'mg/dL', referenceRange: '0.6-1.3' },
      { name: 'Hemoglobin', value: 13.4, unit: 'g/dL', referenceRange: '12-16' },
      { name: 'TSH', value: 2.1, unit: 'mIU/L', referenceRange: '0.4-4.5' }
    ],
    expectedDecision: 'PARTIALLY_VALIDATED'
  }
];
