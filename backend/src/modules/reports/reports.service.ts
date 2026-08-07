import OpenAI from 'openai';
import { PDFParse } from 'pdf-parse';
import { env } from '../../config/env.js';
import { buildExtractionGovernance, canonicalBiomarkerName, classifyDocument } from './report-governance.js';

export type ParsedParameter = {
  name: string;
  canonicalName?: string;
  value: number;
  unit: string;
  referenceRange: string;
  category: 'Blood' | 'Metabolic' | 'Organs' | 'Thyroid' | 'Vitamins';
  status: 'normal' | 'low' | 'high';
  pageNumber?: number;
  sectionName?: string;
  extractionConfidence?: number;
};

export type ReportAnalysisResult = {
  reportDate: string;
  labName: string;
  parameters: ParsedParameter[];
  score: number | null;
  categoryScores: Record<'Blood' | 'Metabolic' | 'Organs' | 'Thyroid' | 'Vitamins', number>;
  summary: string;
  actionPlan: Array<{ priority: number; title: string; detail: string }>;
  document: {
    documentType: string;
    supported: boolean;
    labName: string;
    pageCount: number;
    imageQuality: string;
    confidence: number;
  };
  extractionAttempts: Array<{
    attempt: number;
    strategy: string;
    parameterCount: number;
    confidence: number;
    rescanRecommended: boolean;
    notes: string[];
  }>;
  qualityGate: {
    status: 'PUBLISHABLE' | 'REVIEW_REQUIRED' | 'INSUFFICIENT_DATA';
    canScore: boolean;
    canPublish: boolean;
    confidence: number;
    extractionConfidence: number;
    validationConfidence: number;
    biomarkerCompleteness: number;
    expectedBiomarkers: { min: number; max: number; basis: string };
    detectedBiomarkers: number;
    validatedBiomarkers: number;
    coreBiomarkers: number;
    failedBiomarkers: string[];
    missingCriticalBiomarkers: string[];
    conflicts: string[];
    evidenceTraceability: Array<{
      biomarker: string;
      pageNumber: number;
      sectionName: string;
      confidence: number;
    }>;
    freshness: {
      label: string;
      confidence: number;
    };
    reasons: string[];
  };
  healthAssessment: {
    markerLabel: string;
    confidenceLabel: 'High' | 'Medium' | 'Needs Review';
    healthAreas: string[];
  };
};

const AI_MODEL = process.env.OPENAI_MODEL?.trim() || 'gpt-4o-mini';
const aiClient = env.openAiApiKey ? new OpenAI({ apiKey: env.openAiApiKey }) : null;

const normalizeWhitespace = (value: string) => value.replace(/\s+/g, ' ').trim();

const findLabName = (text: string): string | null => {
  const lines = text
    .split('\n')
    .map((line) => normalizeWhitespace(line))
    .filter(Boolean);
  const labLine = lines.find((line) =>
    /\b(lab|labs|laboratory|diagnostic|diagnostics|pathlab|pathlabs|hospital|clinic)\b/i.test(line)
  );
  if (!labLine) return null;
  return labLine.slice(0, 90);
};

const findDate = (text: string): string | null => {
  const match = text.match(
    /(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}|\d{1,2}\s+[A-Za-z]{3,9},?\s+\d{2,4}|[A-Za-z]{3,9}\s+\d{1,2},?\s+\d{2,4})/
  );
  if (!match) return null;
  const parsed = new Date(match[1]);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
};

const categorize = (name: string): ParsedParameter['category'] => {
  const n = name.toLowerCase();
  if (/hba1c|glucose|cholesterol|triglyceride|hdl|ldl|vldl|insulin/i.test(n)) return 'Metabolic';
  if (/hemoglobin|wbc|rbc|platelet|hematocrit|mcv/i.test(n)) return 'Blood';
  if (/creatinine|urea|sgpt|sgot|ast|alt|bilirubin|albumin|alp|egfr|uric/i.test(n)) return 'Organs';
  if (/tsh|t3|t4|thyroid/i.test(n)) return 'Thyroid';
  return 'Vitamins';
};

const parseRange = (value: string): { min?: number; max?: number } => {
  const cleaned = value.replace(/\s/g, '');
  const between = cleaned.match(/(-?\d+(?:\.\d+)?)\s*[-–]\s*(-?\d+(?:\.\d+)?)/);
  if (between) return { min: Number(between[1]), max: Number(between[2]) };
  const lt = cleaned.match(/^<?\s*(-?\d+(?:\.\d+)?)/);
  if (lt && cleaned.startsWith('<')) return { max: Number(lt[1]) };
  const gt = cleaned.match(/^>?\s*(-?\d+(?:\.\d+)?)/);
  if (gt && cleaned.startsWith('>')) return { min: Number(gt[1]) };
  return {};
};

const inferStatus = (value: number, range: string): ParsedParameter['status'] => {
  const parsed = parseRange(range);
  if (typeof parsed.min === 'number' && value < parsed.min) return 'low';
  if (typeof parsed.max === 'number' && value > parsed.max) return 'high';
  return 'normal';
};

const parseParameters = (text: string): ParsedParameter[] => {
  const lines = text.split('\n').map((line) => normalizeWhitespace(line)).filter(Boolean);
  const out: ParsedParameter[] = [];
  const linePattern =
    /^([A-Za-z][A-Za-z0-9 ()/+%-]{2,50})\s+(-?\d+(?:\.\d+)?)\s*([A-Za-z/%µ]+)?\s+(<?\s*-?\d+(?:\.\d+)?\s*(?:-|–)\s*-?\d+(?:\.\d+)?|<\s*-?\d+(?:\.\d+)?|>\s*-?\d+(?:\.\d+)?)/;

  for (const line of lines) {
    const match = line.match(linePattern);
    if (!match) continue;
    const name = normalizeWhitespace(match[1]);
    const value = Number(match[2]);
    if (!Number.isFinite(value)) continue;
    const unit = normalizeWhitespace(match[3] ?? '');
    const referenceRange = normalizeWhitespace(match[4]);
    out.push({
      name,
      canonicalName: canonicalBiomarkerName(name),
      value,
      unit,
      referenceRange,
      category: categorize(name),
      status: inferStatus(value, referenceRange),
      pageNumber: 1,
      sectionName: 'Detected table row',
      extractionConfidence: 0.9
    });
  }

  // de-dup by name and keep first parsed occurrence
  const unique = new Map<string, ParsedParameter>();
  for (const p of out) {
    if (!unique.has(p.name.toLowerCase())) unique.set(p.name.toLowerCase(), p);
  }
  return Array.from(unique.values());
};

const parseParametersFallback = (text: string): ParsedParameter[] => {
  const lines = text.split('\n').map((line) => normalizeWhitespace(line)).filter(Boolean);
  const out: ParsedParameter[] = [];
  const knownNames = [
    'HbA1c',
    'Glucose',
    'Fasting Glucose',
    'Total Cholesterol',
    'LDL',
    'HDL',
    'Triglycerides',
    'Creatinine',
    'Urea',
    'Uric Acid',
    'ALT',
    'AST',
    'Vitamin B12',
    'Vitamin D',
    'Hemoglobin',
    'TSH',
    'Platelets',
    'WBC',
    'Ferritin',
    'Iron'
  ];

  for (const line of lines) {
    const matchedName = knownNames.find((name) => new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(line));
    if (!matchedName) continue;
    const valueMatch = line.match(/(-?\d+(?:\.\d+)?)/);
    if (!valueMatch) continue;
    const rangeMatch = line.match(/(\d+(?:\.\d+)?\s*(?:-|–)\s*\d+(?:\.\d+)?|<\s*\d+(?:\.\d+)?|>\s*\d+(?:\.\d+)?)/);
    const unitMatch = line.match(/\d+(?:\.\d+)?\s*([A-Za-z/%µ]+)\b/);
    const value = Number(valueMatch[1]);
    if (!Number.isFinite(value)) continue;
    const referenceRange = normalizeWhitespace(rangeMatch?.[1] ?? 'Not specified');
    out.push({
      name: matchedName,
      canonicalName: canonicalBiomarkerName(matchedName),
      value,
      unit: normalizeWhitespace(unitMatch?.[1] ?? ''),
      referenceRange,
      category: categorize(matchedName),
      status: inferStatus(value, referenceRange),
      pageNumber: 1,
      sectionName: 'Secondary extraction pass',
      extractionConfidence: rangeMatch ? 0.78 : 0.62
    });
  }

  const unique = new Map<string, ParsedParameter>();
  for (const p of out) {
    const key = canonicalBiomarkerName(p.name).toLowerCase();
    if (!unique.has(key)) unique.set(key, p);
  }
  return Array.from(unique.values());
};

const parseParametersFromAiJson = (raw: string): ParsedParameter[] => {
  try {
    const json = JSON.parse(raw) as
      | Array<{
          name: string;
          value: number;
          unit?: string;
          referenceRange?: string;
          category?: string;
          status?: string;
        }>
      | {
          parameters?: Array<{
            name: string;
            value: number;
            unit?: string;
            referenceRange?: string;
            category?: string;
            status?: string;
          }>;
        };
    const parameters = Array.isArray(json) ? json : Array.isArray(json.parameters) ? json.parameters : [];

    return parameters
      .filter((item) => item && item.name && Number.isFinite(item.value))
      .map((item) => {
        const category = categorize(item.category || item.name);
        const referenceRange = item.referenceRange?.trim() || 'Not specified';
        const status = item.status === 'low' || item.status === 'high' || item.status === 'normal'
          ? item.status
          : inferStatus(Number(item.value), referenceRange);
        return {
          name: normalizeWhitespace(item.name),
          canonicalName: canonicalBiomarkerName(item.name),
          value: Number(item.value),
          unit: normalizeWhitespace(item.unit ?? ''),
          referenceRange,
          category,
          status,
          pageNumber: 1,
          sectionName: 'Vision extraction',
          extractionConfidence: 0.82
        };
      });
  } catch {
    return [];
  }
};

const buildCategoryScores = (parameters: ParsedParameter[]) => {
  const grouped: Record<'Blood' | 'Metabolic' | 'Organs' | 'Thyroid' | 'Vitamins', number[]> = {
    Blood: [],
    Metabolic: [],
    Organs: [],
    Thyroid: [],
    Vitamins: []
  };
  for (const p of parameters) {
    grouped[p.category].push(p.status === 'normal' ? 85 : 62);
  }
  return {
    Blood: Math.round(grouped.Blood.reduce((a, b) => a + b, 0) / Math.max(1, grouped.Blood.length)),
    Metabolic: Math.round(grouped.Metabolic.reduce((a, b) => a + b, 0) / Math.max(1, grouped.Metabolic.length)),
    Organs: Math.round(grouped.Organs.reduce((a, b) => a + b, 0) / Math.max(1, grouped.Organs.length)),
    Thyroid: Math.round(grouped.Thyroid.reduce((a, b) => a + b, 0) / Math.max(1, grouped.Thyroid.length)),
    Vitamins: Math.round(grouped.Vitamins.reduce((a, b) => a + b, 0) / Math.max(1, grouped.Vitamins.length))
  };
};

const buildSummary = (parameters: ParsedParameter[]) => {
  const abnormal = parameters.filter((item) => item.status !== 'normal');
  if (abnormal.length === 0) {
    return 'Most values are within listed ranges. Keep your hydration, sleep, and activity rhythm stable for steady recovery.';
  }
  const first = abnormal[0];
  const second = abnormal[1] ?? abnormal[0];
  return `${first.name} and ${second.name} need attention versus listed ranges. Focus this week on consistent sleep timing, hydration, and meal regularity to support recovery trends.`;
};

const buildActionPlan = (parameters: ParsedParameter[]) => {
  const abnormal = parameters.filter((item) => item.status !== 'normal').slice(0, 3);
  if (abnormal.length === 0) {
    return [
      { priority: 1, title: 'Maintain your routine', detail: 'Continue your current routine and retest on schedule to confirm stable trends.' }
    ];
  }
  return abnormal.map((item, index) => ({
    priority: index + 1,
    title: `Improve ${item.name}`,
    detail: `${item.name} is outside the listed range. Add one sustainable correction habit this week and re-evaluate on your next report.`
  }));
};

const extractTextFromPdf = async (buffer: Buffer): Promise<string> => {
  const parser = new PDFParse({ data: buffer });
  try {
    const textResult = await parser.getText();
    return textResult.text ?? '';
  } finally {
    await parser.destroy();
  }
};

const parseImageViaAi = async (buffer: Buffer): Promise<{
  reportDate: string | null;
  labName: string | null;
  parameters: ParsedParameter[];
  notes: string[];
}> => {
  if (!aiClient) {
    return {
      reportDate: null,
      labName: null,
      parameters: [],
      notes: ['Backend image extraction provider is not configured; report requires retry with PDF or manual review.']
    };
  }

  const dataUrl = `data:image/jpeg;base64,${buffer.toString('base64')}`;
  const completion = await aiClient.chat.completions.create({
    model: AI_MODEL,
    max_tokens: 800,
    messages: [
      {
        role: 'system',
        content:
          'You extract lab report data. Return strict JSON with keys reportDate, labName, parameters. parameters is array of {name,value,unit,referenceRange,status,category}. status must be normal/low/high when possible.'
      },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Extract all readable lab parameters from this report image. Do not add fake values.' },
          { type: 'image_url', image_url: { url: dataUrl } }
        ]
      }
    ]
  });

  const content = completion.choices[0]?.message?.content?.trim() ?? '';
  const parsed = parseParametersFromAiJson(content);
  let reportDate: string | null = null;
  let labName: string | null = null;
  try {
    const json = JSON.parse(content) as { reportDate?: string; labName?: string };
    reportDate = typeof json.reportDate === 'string' ? json.reportDate : null;
    labName = typeof json.labName === 'string' ? json.labName : null;
  } catch {
    // no-op
  }

  return { reportDate, labName, parameters: parsed, notes: [] };
};

const mergeParameters = (primary: ParsedParameter[], secondary: ParsedParameter[]) => {
  const merged = new Map<string, ParsedParameter>();
  for (const parameter of [...primary, ...secondary]) {
    const key = canonicalBiomarkerName(parameter.name).toLowerCase();
    const existing = merged.get(key);
    if (!existing || (parameter.extractionConfidence ?? 0) > (existing.extractionConfidence ?? 0)) {
      merged.set(key, parameter);
    }
  }
  return Array.from(merged.values());
};

export const analyzeReportBuffer = async (buffer: Buffer, mimeType: string): Promise<ReportAnalysisResult> => {
  const isPdf = mimeType.toLowerCase().includes('pdf');
  let text = '';
  let parameters: ParsedParameter[] = [];
  let aiDate: string | null = null;
  let aiLab: string | null = null;
  let extractionAttempts: ReportAnalysisResult['extractionAttempts'] = [];

  if (isPdf) {
    text = await extractTextFromPdf(buffer);
    const primaryParameters = parseParameters(text);
    extractionAttempts.push({
      attempt: 1,
      strategy: 'pdf_text_table_scan',
      parameterCount: primaryParameters.length,
      confidence: Number((primaryParameters.length === 0 ? 0 : Math.min(0.98, 0.62 + Math.min(primaryParameters.length, 40) / 120)).toFixed(2)),
      rescanRecommended: primaryParameters.length < 8,
      notes: primaryParameters.length < 8 ? ['Primary extraction found too few biomarkers; running secondary extraction pass.'] : []
    });
    const secondaryParameters = primaryParameters.length < 8 ? parseParametersFallback(text) : [];
    if (secondaryParameters.length > 0 || primaryParameters.length < 8) {
      extractionAttempts.push({
        attempt: 2,
        strategy: 'pdf_secondary_known_marker_scan',
        parameterCount: secondaryParameters.length,
        confidence: Number((secondaryParameters.length === 0 ? 0 : Math.min(0.82, 0.5 + Math.min(secondaryParameters.length, 25) / 100)).toFixed(2)),
        rescanRecommended: secondaryParameters.length < 8,
        notes:
          secondaryParameters.length === 0
            ? ['Secondary extraction did not find additional reliable biomarkers.']
            : ['Secondary extraction added known biomarker candidates for validation.']
      });
    }
    parameters = mergeParameters(primaryParameters, secondaryParameters);
  } else {
    const imageResult = await parseImageViaAi(buffer);
    aiDate = imageResult.reportDate;
    aiLab = imageResult.labName;
    parameters = imageResult.parameters;
    extractionAttempts.push({
      attempt: 1,
      strategy: 'vision_structured_json',
      parameterCount: parameters.length,
      confidence: Number((parameters.length === 0 ? 0 : Math.min(0.82, 0.52 + Math.min(parameters.length, 25) / 100)).toFixed(2)),
      rescanRecommended: parameters.length < 8,
      notes: imageResult.notes
    });
  }

  const reportDate =
    aiDate ??
    findDate(text) ??
    new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  const labName = aiLab ?? findLabName(text) ?? 'Uploaded Lab Report';
  const document = classifyDocument({
    text,
    mimeType,
    parameterCount: parameters.length,
    labName
  });
  const governance = buildExtractionGovernance(text, parameters, document);
  const governanceAttempt = governance.extractionAttempts[0];
  const governedAttempts =
    extractionAttempts.length > 0
      ? extractionAttempts.map((attempt, index) => ({
          ...attempt,
          rescanRecommended:
            attempt.rescanRecommended || (index === extractionAttempts.length - 1 ? governanceAttempt?.rescanRecommended ?? false : false),
          notes: Array.from(new Set([...attempt.notes, ...(index === extractionAttempts.length - 1 ? governanceAttempt?.notes ?? [] : [])]))
        }))
      : governance.extractionAttempts;
  const categoryScores = buildCategoryScores(parameters);
  const score = governance.qualityGate.canScore
    ? Math.round(
        (categoryScores.Blood + categoryScores.Metabolic + categoryScores.Organs + categoryScores.Thyroid + categoryScores.Vitamins) / 5
      )
    : null;

  return {
    reportDate,
    labName,
    parameters,
    score,
    categoryScores,
    summary: governance.qualityGate.canPublish
      ? buildSummary(parameters)
      : `Analysis incomplete. ${governance.qualityGate.detectedBiomarkers} biomarkers detected and ${governance.qualityGate.coreBiomarkers}/32 core markers identified. Please retry with a clearer full report or submit for review.`,
    actionPlan: governance.qualityGate.canPublish
      ? buildActionPlan(parameters)
      : [
          {
            priority: 1,
            title: 'Retry upload or request review',
            detail: governance.qualityGate.reasons[0] ?? 'The report did not meet the clinical confidence gate for health intelligence.'
          }
        ],
    document,
    ...governance,
    extractionAttempts: governedAttempts
  };
};
