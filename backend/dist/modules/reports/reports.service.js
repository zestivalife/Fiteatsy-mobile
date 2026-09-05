import OpenAI from 'openai';
import { PDFParse } from 'pdf-parse';
import { env } from '../../config/env.js';
import { buildExtractionGovernance, canonicalBiomarkerName, classifyDocument, CORE_BIOMARKERS } from './report-governance.js';
const currentBusinessDateLabel = () => new Date().toLocaleDateString('en-GB', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric',
    month: 'short',
    year: 'numeric'
});
const AI_VISION_TIMEOUT_MS = 25000;
const SUPPORTED_DOCUMENT_INTELLIGENCE_PROVIDERS = new Set(['openai']);
export class AdvancedAnalysisNotAllowedError extends Error {
    code = 'ADVANCED_ANALYSIS_NOT_ALLOWED';
    constructor(trigger) {
        super(`Advanced document intelligence is only allowed for USER_REANALYZE. Received ${trigger ?? 'missing trigger'}.`);
        this.name = 'AdvancedAnalysisNotAllowedError';
    }
}
export const assertAdvancedAnalysisAllowed = (trigger) => {
    if (trigger !== 'USER_REANALYZE') {
        throw new AdvancedAnalysisNotAllowedError(trigger);
    }
};
const getDocumentIntelligenceConfig = () => {
    const provider = env.documentIntelligenceProvider;
    return {
        provider,
        model: env.openAiVisionModel,
        configured: SUPPORTED_DOCUMENT_INTELLIGENCE_PROVIDERS.has(provider) && Boolean(env.openAiApiKey)
    };
};
const createOpenAiClient = () => (env.openAiApiKey ? new OpenAI({ apiKey: env.openAiApiKey }) : null);
const normalizeWhitespace = (value) => value.replace(/\s+/g, ' ').trim();
const normalizeUnit = (value) => normalizeWhitespace(value)
    .replace(/[´`'’]\s*L\b/g, 'µL')
    .replace(/μ/g, 'µ');
const findLabName = (text) => {
    const lines = text
        .split('\n')
        .map((line) => normalizeWhitespace(line))
        .filter(Boolean);
    const labLine = lines.find((line) => /\b(lab|labs|laboratory|diagnostic|diagnostics|pathlab|pathlabs|hospital|clinic)\b/i.test(line));
    if (!labLine)
        return null;
    return labLine.slice(0, 90);
};
const findDate = (text) => {
    const match = text.match(/(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}|\d{1,2}\s+[A-Za-z]{3,9},?\s+\d{2,4}|[A-Za-z]{3,9}\s+\d{1,2},?\s+\d{2,4})/);
    if (!match)
        return null;
    const parsed = new Date(match[1]);
    if (Number.isNaN(parsed.getTime()))
        return null;
    return parsed.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
};
const categorize = (name) => {
    const n = `${name} ${canonicalBiomarkerName(name)}`.toLowerCase();
    if (/hba1c|glucose|cholesterol|triglyceride|hdl|ldl|vldl|insulin/i.test(n))
        return 'Metabolic';
    if (/hemoglobin|wbc|rbc|platelet|hematocrit|mcv/i.test(n))
        return 'Blood';
    if (/creatinine|urea|sgpt|sgot|ast|alt|bilirubin|albumin|alp|egfr|uric/i.test(n))
        return 'Organs';
    if (/tsh|t3|t4|thyroid/i.test(n))
        return 'Thyroid';
    return 'Vitamins';
};
const parseRange = (value) => {
    const cleaned = value.replace(/\s/g, '');
    const between = cleaned.match(/(-?\d+(?:\.\d+)?)\s*[-–]\s*(-?\d+(?:\.\d+)?)/);
    if (between)
        return { min: Number(between[1]), max: Number(between[2]) };
    const lt = cleaned.match(/^<?\s*(-?\d+(?:\.\d+)?)/);
    if (lt && cleaned.startsWith('<'))
        return { max: Number(lt[1]) };
    const gt = cleaned.match(/^>?\s*(-?\d+(?:\.\d+)?)/);
    if (gt && cleaned.startsWith('>'))
        return { min: Number(gt[1]) };
    return {};
};
const inferStatus = (value, range) => {
    const parsed = parseRange(range);
    if (typeof parsed.min === 'number' && value < parsed.min)
        return 'low';
    if (typeof parsed.max === 'number' && value > parsed.max)
        return 'high';
    return 'normal';
};
const ignoredLabTextPattern = /\b(?:interpretation|impression|comment|note|methodology|method|sample|specimen|address|phone|email|www|footer|page\s+\d+|validated by|reported by|registered office|reference ranges? may vary|anaemic|anaemia|anemia|thalassemia|trait|probability|likelihood)\b/i;
const looksLikeTableRow = (line) => !ignoredLabTextPattern.test(line) &&
    /\d/.test(line) &&
    /\b(?:mg\/dL|g\/dL|ng\/mL|pg\/mL|mIU\/L|µIU\/mL|uIU\/mL|IU\/L|U\/L|%|cells\/µL|10\^?3|lakhs?|million|mmol\/L|mL\/min|ratio)\b/i.test(line);
const groupedTableNames = [
    ...CORE_BIOMARKERS,
    'Glucose',
    'Glucose Fasting',
    'Fasting Plasma Glucose',
    'Glucose Random',
    'Glycosylated Hemoglobin (HbA1c)',
    'Haemoglobin (Hb)',
    'Haemoglobin',
    'Estimated average glucose (eAG)',
    'SGPT',
    'SGOT',
    'SGPT; ALANINE AMINOTRANSFERASE (ALT), SERUM',
    'SGOT/AST',
    'SGPT/ALT',
    'Bilirubin Total',
    'Blood Urea',
    'Bun',
    'eGFR (CKD-EPI)',
    'V.L.D.L Cholesterol',
    'C-Reactive Protein (CRP), Quantitative',
    'CRP (Quantitative)',
    'High Sensitivity C-Reactive Protein (Hs-CRP)',
    'Vitamin - B12',
    'Vitamin D 25 - Hydroxy',
    'Thyroid Stimulating Hormone (Ultrasensitive)',
    'Gamma Glutamyl Transferase (GGT)',
    'TLC',
    'Total WBC Count',
    'Total WBC Count / TLC',
    'Total Leukocyte Count (TLC)',
    'Total Leucocyte Count (TLC)',
    'RBC Count',
    'PCV / Hematocrit',
    'PCV',
    'Mean Cell Volume(MCV)',
    'Mean Cell Volume',
    'MCV',
    'Mean Cell Haemoglobin Concentration(MCHC)',
    'Mean Cell Haemoglobin Concentration',
    'Mean Cell Hemoglobin Concentration',
    'Mean Cell Hb Conc(MCHC)',
    'Mean Cell Hb Conc',
    'Mean Cell Hemoglobin( MCH)',
    'Mean Cell Hemoglobin(MCH)',
    'Mean Cell Haemoglobin(MCH)',
    'Mean Cell Haemoglobin',
    'Mean Cell Hemoglobin',
    'MCH',
    'MCHC',
    'RDW (Red Cell Distribution Width)',
    'RDW (CV)',
    'Neutrophils',
    'Lymphocytes',
    'Monocytes',
    'Eosinophils',
    'Basophils',
    'Absolute Neutrophil Count',
    'Absolute Lymphocyte Count',
    'Absolute Monocyte Count',
    'Absolute Eosinophil Count',
    'Platelet Count',
    'Alkaline Phosphatase',
    'Total Protein',
    'Globulin',
    'Calcium Serum',
    'Calcium-Serum',
    'Phosphorus-Serum',
    'Sodium-Serum',
    'Potassium-Serum',
    'Chloride-Serum',
    'Sodium',
    'Potassium',
    'Chloride',
    'TIBC,(Total Iron Binding Capacity)',
    'Triiodothyronine (T3)',
    'Total Thyroxine (T4)',
    'Prolactin',
    'Prolactin-Serum',
    'Thyroid Stimulating Hormone(TSH)',
    'Thyroid Stimulating Hormone',
    'TSH 3rd Generation',
    'GLUCOSE FASTING (F), PLASMA',
    'TSH (THYROID STIMULATING HORMONE), SERUM'
];
const numericPattern = String.raw `-?\d+(?:\.\d+)?`;
const knownNameMatchesLine = (name, line) => {
    const normalizedName = normalizeWhitespace(name).toLowerCase();
    const normalizedLine = normalizeWhitespace(line).toLowerCase();
    if (normalizedName.includes('(') || normalizedName.includes(')')) {
        return normalizedLine === normalizedName || normalizedLine.includes(normalizedName);
    }
    return new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(line);
};
const isKnownBiomarkerLabel = (line) => {
    if (ignoredLabTextPattern.test(line))
        return false;
    return groupedTableNames.some((name) => normalizeWhitespace(name).toLowerCase() === line.toLowerCase());
};
const isMethodOrSectionLine = (line) => /^(?:method\s*:|calculated|hplc|cmia|clia|eclia|urease|uricase|ferene|immunoturbidimetry|immunoturbidimetric|hexokinase|enzymatic|colorimetric|biuret|arsenazo|ise-|electrical impedance|laser based|cyanide free|kinetic|glycerol|accelerator|para-nitrophenyl|diazo|diazonium)/i.test(line);
const normalizeRepeatedLeadingValues = (line) => {
    const first = line.match(/^(-?\d+(?:\.\d+)?)(?:\s+|$)/);
    if (!first)
        return line;
    let remaining = line.slice(first[0].length).trimStart();
    const repeatedValuePattern = new RegExp(`^${first[1].replace('.', '\\.')}\\s+`);
    while (repeatedValuePattern.test(remaining)) {
        remaining = remaining.replace(repeatedValuePattern, '').trimStart();
    }
    return `${first[1]} ${remaining}`.trim();
};
const parseValueUnitRange = (line) => {
    const normalizedLine = stripResultFlag(normalizeRepeatedLeadingValues(line));
    const match = normalizedLine.match(/^(-?\d+(?:\.\d+)?)\s+(.+?)\s+((?:<?|>?|>=?|<=?)\s*-?\d+(?:\.\d+)?(?:\s*(?:-|–)\s*-?\d+(?:\.\d+)?)?|up to\s+\d+(?:\.\d+)?|Deficient\s+<\s*\d+(?:\.\d+)?|Normal Or High:\s*>=\s*\d+(?:\.\d+)?)/i);
    if (!match)
        return null;
    return {
        value: Number(match[1]),
        unit: normalizeUnit(match[2]),
        referenceRange: normalizeWhitespace(match[3].replace(/^Normal Or High:\s*/i, ''))
    };
};
const boundedRangePattern = String.raw `(?:(?:<|>|>=|<=)\s*-?\d+(?:\.\d+)?|-?\d+(?:\.\d+)?\s*(?:-|–)\s*-?\d+(?:\.\d+)?)`;
const parseRangeUnitResult = (line) => {
    const sanitizedLine = stripResultFlag(line);
    const rangeFirst = sanitizedLine.match(new RegExp(`^(${boundedRangePattern})\\s+(.+?)\\s+(-?\\d+(?:\\.\\d+)?)$`, 'i'));
    if (rangeFirst) {
        return {
            value: Number(rangeFirst[3]),
            unit: normalizeUnit(rangeFirst[2]),
            referenceRange: normalizeWhitespace(rangeFirst[1])
        };
    }
    const unitFirst = sanitizedLine.match(new RegExp(`^([A-Za-zµμ/%][A-Za-z0-9/%µμ^./-]*)\\s+(${boundedRangePattern})\\s+(-?\\d+(?:\\.\\d+)?)$`, 'i'));
    if (unitFirst) {
        return {
            value: Number(unitFirst[3]),
            unit: normalizeUnit(unitFirst[1]),
            referenceRange: normalizeWhitespace(unitFirst[2])
        };
    }
    return null;
};
const parseResultToken = (value) => {
    const match = value.match(/^(?:<|>|<=|>=)?\s*(-?\d+(?:\.\d+)?)$/);
    if (!match)
        return null;
    const parsed = Number(match[1]);
    return Number.isFinite(parsed) ? parsed : null;
};
const looksLikeKnownBiomarkerName = (value) => {
    const canonical = canonicalBiomarkerName(value);
    return canonical !== value.trim().replace(/\s+/g, ' ') || groupedTableNames.some((name) => normalizeWhitespace(name).toLowerCase() === normalizeWhitespace(value).toLowerCase());
};
const containsUnitOrRangeFragment = (value) => /\d|mg\/dL|g\/dL|ng\/mL|pg\/mL|mIU\/L|µIU\/mL|uIU\/mL|IU\/L|U\/L|mmol\/L/i.test(value);
const stripResultFlag = (line) => normalizeWhitespace(line).replace(new RegExp(`^(${numericPattern})\\s+[HL]\\s+(?=[A-Za-zµμ/%])`, 'i'), '$1 ');
const collapseStandaloneRepeatedLetters = (line) => line.replace(/\b([A-Za-z])\1{2,}\b/g, '$1');
const compactPdfExtractedLine = (line) => {
    const cells = line.split(/\t+/).map((cell) => normalizeWhitespace(collapseStandaloneRepeatedLetters(cell))).filter(Boolean);
    if (cells.length === 0)
        return '';
    const first = cells[0];
    const repeatedFirstCells = cells.filter((cell) => cell === first).length;
    const firstNumber = parseResultToken(first);
    if (firstNumber !== null && repeatedFirstCells >= 2) {
        const richerRepeatedCell = cells.find((cell) => cell.startsWith(first) && cell !== first);
        const trailingCells = cells.filter((cell) => cell !== first && cell !== richerRepeatedCell);
        return normalizeWhitespace([richerRepeatedCell ?? first, ...trailingCells].join(' '));
    }
    if (repeatedFirstCells >= 2) {
        return normalizeWhitespace(first.replace(/\bSample:.*$/i, ''));
    }
    if (cells.length === 2 && looksLikeKnownBiomarkerName(cells[0])) {
        return normalizeWhitespace(`${cells[0]} ${cells[1]}`);
    }
    return normalizeWhitespace(cells.join(' '));
};
const normalizePdfTextForParsing = (text) => text
    .split('\n')
    .map(compactPdfExtractedLine)
    .filter(Boolean)
    .join('\n');
const extractKnownBiomarkerLabel = (line) => {
    const cleaned = normalizeWhitespace(line.replace(/\bSample:.*$/i, '').replace(/[-:]\s*$/, ''));
    if (/^(?:biological reference|reference group|interpretation|clinical significance|method|sample)\b/i.test(cleaned) ||
        /^[A-Za-z]+\),/.test(cleaned)) {
        return null;
    }
    if (isKnownBiomarkerLabel(cleaned))
        return cleaned;
    const inlineNames = [...groupedTableNames].sort((a, b) => b.length - a.length);
    return inlineNames.find((candidate) => {
        const normalizedCandidate = normalizeWhitespace(candidate).toLowerCase();
        const normalizedLine = cleaned.toLowerCase();
        return (normalizedLine === normalizedCandidate ||
            normalizedLine.startsWith(`${normalizedCandidate} `) ||
            normalizedLine.startsWith(`${normalizedCandidate}(`) ||
            normalizedLine.startsWith(`${normalizedCandidate}/`));
    }) ?? null;
};
const parseLooseResultUnitRange = (line) => {
    const normalizedLine = stripResultFlag(line).replace(/^\(\s*[A-Za-z0-9]+\s*\)\s+/, '');
    const valueUnitRange = normalizedLine.match(new RegExp(`^(${numericPattern})\\s+(.+?)\\s+(${boundedRangePattern})$`, 'i'));
    if (valueUnitRange) {
        return {
            value: Number(valueUnitRange[1]),
            unit: normalizeUnit(valueUnitRange[2]),
            referenceRange: normalizeWhitespace(valueUnitRange[3])
        };
    }
    const unitRangeValue = normalizedLine.match(new RegExp(`^(.+?)\\s+(${boundedRangePattern})\\s+(${numericPattern})$`, 'i'));
    if (unitRangeValue) {
        return {
            value: Number(unitRangeValue[3]),
            unit: normalizeUnit(unitRangeValue[1]),
            referenceRange: normalizeWhitespace(unitRangeValue[2])
        };
    }
    const valueUnitOnly = normalizedLine.match(new RegExp(`^(${numericPattern})\\s+([A-Za-zµμ/%][A-Za-z0-9/%µμ^./-]*)$`, 'i'));
    if (valueUnitOnly) {
        return {
            value: Number(valueUnitOnly[1]),
            unit: normalizeUnit(valueUnitOnly[2]),
            referenceRange: 'Not specified'
        };
    }
    return null;
};
const buildParsedParameter = (name, parsed, index, sectionName, extractionMethod, extractionConfidence) => ({
    name,
    canonicalName: canonicalBiomarkerName(name),
    value: parsed.value,
    unit: parsed.unit,
    referenceRange: parsed.referenceRange,
    category: categorize(name),
    status: inferStatus(parsed.value, parsed.referenceRange),
    pageNumber: Math.max(1, Math.ceil(index / 45)),
    sectionName,
    extractionMethod,
    extractionConfidence
});
const parseDelimitedReportRows = (text) => {
    // Preserve PDF table delimiters for the primary row parser. Running the
    // text through normalizePdfTextForParsing first collapses tabs to spaces,
    // which makes the tab-delimited branch unreachable and forces real reports
    // through the lower-confidence fallback scan.
    const rawLines = text
        .split('\n')
        .map((line) => collapseStandaloneRepeatedLetters(line).trim())
        .filter(Boolean);
    const out = [];
    for (let index = 0; index < rawLines.length; index += 1) {
        const cells = rawLines[index].split(/\t+/).map((cell) => normalizeWhitespace(cell)).filter(Boolean);
        if (cells.length < 3 || !looksLikeKnownBiomarkerName(cells[0]))
            continue;
        const [name, unit, referenceRangeStart] = cells;
        let referenceRange = referenceRangeStart;
        let resultValue = parseResultToken(cells[cells.length - 1]);
        let confidence = resultValue === null ? 0.88 : 0.95;
        if (resultValue === null) {
            const continuationLines = [];
            for (let offset = 1; offset <= 6 && index + offset < rawLines.length; offset += 1) {
                const nextLine = normalizeWhitespace(rawLines[index + offset]);
                if (!nextLine)
                    continue;
                if (/^(?:comment|po no|customer name|age\/gender|lab visit id|barcode id|sample type|collected via|referred by|collection date|report date|report status|test name|this test has been performed)/i.test(nextLine))
                    break;
                continuationLines.push(nextLine);
                const methodResult = nextLine.match(/\b(?:cmia|clia|hexokinase|kinetic|colorimetric|enzymatic|turbidimetry|immunoturbidimetric|arsenazo|biuret|diazo|calculated|impedance)\b.*?(?:<|>|<=|>=)?\s*(-?\d+(?:\.\d+)?)$/i);
                if (methodResult) {
                    const trailingValue = methodResult;
                    resultValue = Number(trailingValue[1]);
                    break;
                }
            }
            referenceRange = normalizeWhitespace([referenceRangeStart, ...continuationLines.slice(0, -1)].join(' '));
        }
        if (resultValue === null)
            continue;
        out.push({
            name,
            canonicalName: canonicalBiomarkerName(name),
            value: resultValue,
            unit: normalizeUnit(unit),
            referenceRange,
            category: categorize(name),
            status: inferStatus(resultValue, referenceRange),
            pageNumber: Math.max(1, Math.ceil(index / 65)),
            sectionName: 'Delimited report row',
            extractionMethod: 'pdf_delimited_report_row_scan',
            extractionConfidence: confidence
        });
    }
    return out;
};
const parseGroupedTableParameters = (lines) => {
    const out = [];
    const inlineNames = [...groupedTableNames].sort((a, b) => b.length - a.length);
    for (let index = 0; index < lines.length; index += 1) {
        const name = lines[index];
        const inlineName = inlineNames.find((candidate) => {
            const normalizedName = name.toLowerCase();
            const normalizedCandidate = candidate.toLowerCase();
            return normalizedName === normalizedCandidate || normalizedName.startsWith(`${normalizedCandidate} `);
        });
        if (inlineName) {
            const inlineRemainder = name.slice(inlineName.length).trim();
            const parsed = parseValueUnitRange(inlineRemainder) ?? parseLooseResultUnitRange(inlineRemainder);
            if (parsed && Number.isFinite(parsed.value)) {
                out.push(buildParsedParameter(inlineName, parsed, index, 'Inline PDF table row', 'pdf_inline_table_scan', 0.95));
                continue;
            }
            if (containsUnitOrRangeFragment(inlineRemainder))
                continue;
        }
        const groupedName = extractKnownBiomarkerLabel(name);
        if (!groupedName)
            continue;
        for (let offset = 1; offset <= 6 && index + offset < lines.length; offset += 1) {
            const candidate = lines[index + offset];
            if (ignoredLabTextPattern.test(candidate)) {
                if (isMethodOrSectionLine(candidate))
                    continue;
                break;
            }
            if (extractKnownBiomarkerLabel(candidate))
                break;
            if (offset === 1 && !isMethodOrSectionLine(candidate) && !parseRangeUnitResult(candidate) && !parseValueUnitRange(candidate) && !parseLooseResultUnitRange(candidate))
                continue;
            const parsed = parseRangeUnitResult(candidate) ?? parseValueUnitRange(candidate) ?? parseLooseResultUnitRange(candidate);
            if (!parsed || !Number.isFinite(parsed.value))
                continue;
            out.push(buildParsedParameter(groupedName, parsed, index, 'Grouped PDF table row', 'pdf_grouped_table_scan', 0.97));
            break;
        }
    }
    return out;
};
const parseParameters = (text) => {
    const normalizedText = normalizePdfTextForParsing(text);
    const lines = normalizedText.split('\n').map((line) => normalizeWhitespace(line)).filter(Boolean);
    const out = [...parseDelimitedReportRows(text), ...parseGroupedTableParameters(lines)];
    const linePattern = /^([A-Za-z][A-Za-z0-9 .(),/+%-]{2,70})\s+(-?\d+(?:\.\d+)?)\s*([A-Za-z0-9/%µμ^./-]+)?\s+(<?\s*-?\d+(?:\.\d+)?\s*(?:-|–)\s*-?\d+(?:\.\d+)?|<\s*-?\d+(?:\.\d+)?|>\s*-?\d+(?:\.\d+)?)/;
    for (const line of lines) {
        if (!looksLikeTableRow(line))
            continue;
        const match = line.match(linePattern);
        if (!match)
            continue;
        const name = normalizeWhitespace(match[1]);
        if (containsUnitOrRangeFragment(name))
            continue;
        const value = Number(match[2]);
        if (!Number.isFinite(value))
            continue;
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
            sectionName: 'Detected PDF table row',
            extractionMethod: 'pdf_table_row_scan',
            extractionConfidence: 0.96
        });
    }
    // De-dup by canonical biomarker so richer generic aliases beat weaker fallback rows.
    const unique = new Map();
    for (const p of out) {
        const key = canonicalBiomarkerName(p.name).toLowerCase();
        const existing = unique.get(key);
        if (!existing || (p.extractionConfidence ?? 0) > (existing.extractionConfidence ?? 0)) {
            unique.set(key, p);
        }
    }
    return Array.from(unique.values());
};
const parseParametersFallback = (text) => {
    const lines = normalizePdfTextForParsing(text).split('\n').map((line) => normalizeWhitespace(line)).filter(Boolean);
    const out = [];
    const knownNames = [
        'Estimated average glucose (eAG)',
        'Estimated average glucose',
        ...CORE_BIOMARKERS,
        'Glucose',
        'Fasting Glucose',
        'LDL',
        'HDL',
        'SGPT',
        'SGOT',
        'RBC',
        'Hematocrit',
        'MCV',
        'MCH',
        'MCHC',
        'RDW',
        'Neutrophils',
        'Lymphocytes',
        'Monocytes',
        'Eosinophils',
        'Basophils',
        'Sodium',
        'Potassium',
        'Chloride',
        'Calcium',
        'Protein',
        'Globulin',
        'ALP'
    ];
    for (const line of lines) {
        if (ignoredLabTextPattern.test(line))
            continue;
        const matchedName = knownNames.find((name) => knownNameMatchesLine(name, line));
        if (!matchedName)
            continue;
        const valueMatch = line.match(/(-?\d+(?:\.\d+)?)/);
        if (!valueMatch)
            continue;
        const rangeMatch = line.match(/(\d+(?:\.\d+)?\s*(?:-|–)\s*\d+(?:\.\d+)?|<\s*\d+(?:\.\d+)?|>\s*\d+(?:\.\d+)?)/);
        const unitMatch = line.match(/\d+(?:\.\d+)?\s*([A-Za-z/%µ]+)\b/);
        const value = Number(valueMatch[1]);
        if (!Number.isFinite(value))
            continue;
        const referenceRange = normalizeWhitespace(rangeMatch?.[1] ?? 'Not specified');
        out.push({
            name: matchedName,
            canonicalName: canonicalBiomarkerName(matchedName),
            value,
            unit: normalizeUnit(unitMatch?.[1] ?? ''),
            referenceRange,
            category: categorize(matchedName),
            status: inferStatus(value, referenceRange),
            pageNumber: 1,
            sectionName: 'Secondary extraction pass',
            extractionMethod: 'pdf_secondary_known_marker_scan',
            extractionConfidence: rangeMatch ? 0.78 : 0.62
        });
    }
    const unique = new Map();
    for (const p of out) {
        const key = canonicalBiomarkerName(p.name).toLowerCase();
        if (!unique.has(key))
            unique.set(key, p);
    }
    return Array.from(unique.values());
};
const extractJsonPayload = (raw) => {
    const trimmed = raw.trim();
    if (trimmed.startsWith('```')) {
        const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
        if (fenced?.[1])
            return fenced[1].trim();
    }
    const firstObject = trimmed.indexOf('{');
    const lastObject = trimmed.lastIndexOf('}');
    if (firstObject >= 0 && lastObject > firstObject)
        return trimmed.slice(firstObject, lastObject + 1);
    const firstArray = trimmed.indexOf('[');
    const lastArray = trimmed.lastIndexOf(']');
    if (firstArray >= 0 && lastArray > firstArray)
        return trimmed.slice(firstArray, lastArray + 1);
    return trimmed;
};
const parseAiNumericValue = (raw) => {
    if (typeof raw === 'number' && Number.isFinite(raw))
        return raw;
    if (typeof raw !== 'string')
        return null;
    const match = raw.trim().match(/^(?:<|>|<=|>=)?\s*(-?\d+(?:\.\d+)?)/);
    if (!match)
        return null;
    const parsed = Number(match[1]);
    return Number.isFinite(parsed) ? parsed : null;
};
const aiConfidenceToNumber = (raw) => {
    if (typeof raw === 'number' && Number.isFinite(raw))
        return raw;
    if (typeof raw !== 'string')
        return 0.82;
    const normalized = raw.trim().toLowerCase();
    if (normalized === 'high')
        return 0.9;
    if (normalized === 'medium')
        return 0.72;
    if (normalized === 'low')
        return 0.48;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0.82;
};
const parseParametersFromAiJson = (raw) => {
    try {
        const json = JSON.parse(extractJsonPayload(raw));
        const parameters = Array.isArray(json) ? json : Array.isArray(json.parameters) ? json.parameters : [];
        return parameters
            .map((item) => ({
            item,
            name: normalizeWhitespace(item.normalized_name ?? item.normalizedName ?? item.name ?? item.raw_name ?? item.rawName ?? ''),
            value: parseAiNumericValue(item.value)
        }))
            .filter(({ name, value }) => name && value !== null)
            .map((item) => {
            const rawItem = item.item;
            const category = categorize(rawItem.category || item.name);
            const referenceRange = (rawItem.referenceRange ?? rawItem.reference_range)?.trim() || 'Not specified';
            const pageNumber = Number(rawItem.source_page ?? rawItem.sourcePage ?? 1);
            const confidence = aiConfidenceToNumber(rawItem.confidence ?? rawItem.extractionConfidence);
            const status = rawItem.status === 'low' || rawItem.status === 'high' || rawItem.status === 'normal'
                ? rawItem.status
                : inferStatus(item.value, referenceRange);
            return {
                name: item.name,
                rawName: normalizeWhitespace(rawItem.raw_name ?? rawItem.rawName ?? item.name),
                canonicalName: canonicalBiomarkerName(item.name),
                canonicalBiomarkerId: rawItem.canonical_biomarker_id ?? rawItem.canonicalBiomarkerId ?? canonicalBiomarkerName(item.name),
                operator: rawItem.operator?.trim() || undefined,
                value: item.value,
                unit: normalizeUnit(rawItem.unit ?? ''),
                referenceRange,
                category,
                status,
                pageNumber: Number.isFinite(pageNumber) && pageNumber > 0 ? pageNumber : 1,
                sectionName: 'Vision extraction',
                extractionMethod: (rawItem.extraction_method ?? rawItem.extractionMethod)?.trim() || 'vision_structured_json',
                extractionConfidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0.82
            };
        });
    }
    catch {
        return [];
    }
};
const buildCategoryScores = (parameters) => {
    const grouped = {
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
const buildSummary = (parameters) => {
    const abnormal = parameters.filter((item) => item.status !== 'normal');
    if (abnormal.length === 0) {
        return 'Most values are within listed ranges. Keep your hydration, sleep, and activity rhythm stable for steady recovery.';
    }
    const first = abnormal[0];
    const second = abnormal[1] ?? abnormal[0];
    return `${first.name} and ${second.name} need attention versus listed ranges. Focus this week on consistent sleep timing, hydration, and meal regularity to support recovery trends.`;
};
const buildActionPlan = (parameters) => {
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
const extractTextFromPdf = async (buffer) => {
    const parser = new PDFParse({ data: buffer });
    try {
        const textResult = await parser.getText();
        return {
            text: textResult.text ?? '',
            pageCount: textResult.total || Math.max(1, textResult.pages.length)
        };
    }
    finally {
        await parser.destroy();
    }
};
const withTimeout = async (promise, timeoutMs, label) => {
    let timeout = null;
    try {
        return await Promise.race([
            promise,
            new Promise((_resolve, reject) => {
                timeout = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
            })
        ]);
    }
    finally {
        if (timeout)
            clearTimeout(timeout);
    }
};
const describeAiProviderError = (error, label) => {
    if (!error || typeof error !== 'object') {
        return `${label} failed.`;
    }
    const details = error;
    const parts = [
        `${label} failed`,
        details.status ? `status=${details.status}` : null,
        details.code ? `code=${details.code}` : null,
        details.type ? `type=${details.type}` : null,
        details.requestID ? `requestID=${details.requestID}` : null
    ].filter(Boolean);
    return `${parts.join(' ')}${details.message ? `: ${details.message.replace(/sk-[A-Za-z0-9]+/g, 'sk-REDACTED')}` : ''}`;
};
const renderPdfPagesForAdvancedAnalysis = async (buffer, pageCount) => {
    const parser = new PDFParse({ data: buffer });
    try {
        const pagesToRender = Array.from({ length: Math.max(0, pageCount ?? 0) }, (_, index) => index + 1);
        const result = await parser.getScreenshot({
            ...(pagesToRender.length > 0 ? { partial: pagesToRender } : {}),
            imageDataUrl: true,
            imageBuffer: false,
            desiredWidth: 1400
        });
        return result.pages.map((page) => page.dataUrl).filter(Boolean);
    }
    catch {
        return [];
    }
    finally {
        await parser.destroy();
    }
};
const parseViaAdvancedDocumentIntelligence = async (input) => {
    assertAdvancedAnalysisAllowed(input.context.analysisTrigger);
    const providerConfig = getDocumentIntelligenceConfig();
    if (!providerConfig.configured) {
        const reason = providerConfig.provider
            ? `Advanced document intelligence provider "${providerConfig.provider}" is not configured with required credentials.`
            : 'Advanced document intelligence provider is not configured.';
        return {
            reportDate: null,
            labName: null,
            parameters: [],
            notes: [reason]
        };
    }
    const aiClient = createOpenAiClient();
    if (!aiClient) {
        return {
            reportDate: null,
            labName: null,
            parameters: [],
            notes: ['Advanced document intelligence provider credentials are missing.']
        };
    }
    const isImage = input.mimeType.toLowerCase().includes('image');
    const safeMimeType = input.mimeType.toLowerCase().includes('png')
        ? 'image/png'
        : input.mimeType.toLowerCase().includes('webp')
            ? 'image/webp'
            : 'image/jpeg';
    const visualInputs = input.pageImages.length > 0
        ? input.pageImages
        : isImage
            ? [`data:${safeMimeType};base64,${input.buffer.toString('base64')}`]
            : [];
    const userContent = [
        {
            type: 'text',
            text: `Recover lab biomarkers from this medical report using visual layout and table reasoning.
Map Test Name -> Result -> Unit -> Reference Range.
Use biomarker aliases, expected units, and plausible ranges only to validate relationships; never force or invent values.
If a value looks like a decimal-shift issue such as HbA1c 77 instead of 7.7, keep the printed value and set lower confidence.
Return strict JSON only. parameters must be an array of objects with raw_name, normalized_name, value, unit, reference_range, flag, confidence. confidence must be high, medium, or low.
PDF text/layout fallback:
${input.text.slice(0, 12000)}`
        },
        ...visualInputs.map((url) => ({ type: 'image_url', image_url: { url } }))
    ];
    let completion;
    try {
        await input.context.auditProviderCall?.({
            reportId: input.context.reportId,
            triggerSource: input.context.analysisTrigger,
            provider: providerConfig.provider,
            model: providerConfig.model,
            userId: input.context.userId,
            clientId: input.context.clientId
        });
        completion = await withTimeout(aiClient.chat.completions.create({
            model: providerConfig.model,
            max_tokens: 1400,
            response_format: {
                type: 'json_schema',
                json_schema: {
                    name: 'fiteatsy_document_intelligence_biomarkers',
                    strict: true,
                    schema: {
                        type: 'object',
                        additionalProperties: false,
                        properties: {
                            reportDate: { type: ['string', 'null'] },
                            labName: { type: ['string', 'null'] },
                            parameters: {
                                type: 'array',
                                items: {
                                    type: 'object',
                                    additionalProperties: false,
                                    properties: {
                                        raw_name: { type: 'string' },
                                        normalized_name: { type: 'string' },
                                        value: { type: 'string' },
                                        unit: { type: 'string' },
                                        reference_range: { type: 'string' },
                                        flag: { type: 'string' },
                                        confidence: { type: 'string', enum: ['high', 'medium', 'low'] }
                                    },
                                    required: ['raw_name', 'normalized_name', 'value', 'unit', 'reference_range', 'flag', 'confidence']
                                }
                            }
                        },
                        required: ['reportDate', 'labName', 'parameters']
                    }
                }
            },
            messages: [
                {
                    role: 'system',
                    content: 'You are a medical document intelligence engine. Understand tables, columns, rows, headers, cells, reading order, and lab biomarker compatibility. Return only extracted visible values; do not diagnose, do not infer hidden values, and do not correct values silently.'
                },
                {
                    role: 'user',
                    content: userContent
                }
            ]
        }), AI_VISION_TIMEOUT_MS, 'Advanced document intelligence');
    }
    catch (error) {
        throw new Error(describeAiProviderError(error, 'Advanced document intelligence'));
    }
    const content = completion.choices[0]?.message?.content?.trim() ?? '';
    const parsed = parseParametersFromAiJson(content).map((parameter) => ({
        ...parameter,
        rawName: parameter.rawName ?? parameter.name,
        canonicalBiomarkerId: parameter.canonicalBiomarkerId ?? canonicalBiomarkerName(parameter.name),
        sectionName: 'Advanced document intelligence recovery',
        extractionMethod: 'document_intelligence_layout_recovery',
        extractionConfidence: parameter.extractionConfidence ?? 0.84
    }));
    let reportDate = null;
    let labName = null;
    try {
        const json = JSON.parse(extractJsonPayload(content));
        reportDate = typeof json.reportDate === 'string' ? json.reportDate : null;
        labName = typeof json.labName === 'string' ? json.labName : null;
    }
    catch {
        // no-op
    }
    return {
        reportDate,
        labName,
        parameters: parsed,
        notes: [
            visualInputs.length > 0
                ? 'Advanced analysis used rendered visual page representations for layout recovery.'
                : 'Advanced analysis used enhanced PDF text/table layout because visual page rendering was unavailable.'
        ]
    };
};
const mergeParameters = (primary, secondary) => {
    const merged = new Map();
    for (const parameter of [...primary, ...secondary]) {
        const key = canonicalBiomarkerName(parameter.name).toLowerCase();
        const existing = merged.get(key);
        if (!existing || (parameter.extractionConfidence ?? 0) > (existing.extractionConfidence ?? 0)) {
            merged.set(key, parameter);
        }
    }
    return Array.from(merged.values());
};
const buildReportAnalysisResult = (input) => {
    const document = classifyDocument({
        text: input.text,
        mimeType: input.mimeType,
        parameterCount: input.parameters.length,
        labName: input.labName
    });
    if (input.pageCount != null) {
        document.pageCount = input.pageCount;
    }
    const governance = buildExtractionGovernance(input.text, input.parameters, document);
    const rejectedBiomarkerNames = new Set((governance.qualityGate.rejectedBiomarkers ?? [])
        .filter((item) => item.validation_status !== 'VALID')
        .map((item) => canonicalBiomarkerName(item.biomarker_name)));
    const validatedParameters = input.parameters.filter((parameter) => !rejectedBiomarkerNames.has(canonicalBiomarkerName(parameter.name)));
    const governanceAttempt = governance.extractionAttempts[0];
    const governedAttempts = input.extractionAttempts.length > 0
        ? input.extractionAttempts.map((attempt, index) => ({
            ...attempt,
            rescanRecommended: attempt.rescanRecommended || (index === input.extractionAttempts.length - 1 ? governanceAttempt?.rescanRecommended ?? false : false),
            notes: Array.from(new Set([...attempt.notes, ...(index === input.extractionAttempts.length - 1 ? governanceAttempt?.notes ?? [] : [])]))
        }))
        : governance.extractionAttempts;
    const categoryScores = buildCategoryScores(validatedParameters);
    const score = governance.qualityGate.canScore
        ? Math.round((categoryScores.Blood + categoryScores.Metabolic + categoryScores.Organs + categoryScores.Thyroid + categoryScores.Vitamins) / 5)
        : null;
    const partialReviewCount = governance.qualityGate.rejectedBiomarkers?.length ?? 0;
    return {
        reportDate: input.reportDate,
        labName: input.labName,
        parameters: input.parameters,
        score,
        categoryScores,
        summary: governance.qualityGate.status === 'PARTIALLY_VALIDATED'
            ? `${governance.qualityGate.validatedBiomarkers} biomarkers were validated and ${partialReviewCount} need review. Scores use validated biomarkers only.`
            : governance.qualityGate.canPublish
                ? buildSummary(validatedParameters)
                : `Analysis incomplete. ${governance.qualityGate.detectedBiomarkers} biomarkers detected and ${governance.qualityGate.coreBiomarkers}/32 core markers identified. Please retry with a clearer full report or submit for review.`,
        actionPlan: governance.qualityGate.status === 'PARTIALLY_VALIDATED'
            ? [
                {
                    priority: 1,
                    title: 'Review uncertain biomarkers',
                    detail: `${partialReviewCount} extracted biomarkers need manual review before they influence clinical guidance.`
                },
                ...buildActionPlan(validatedParameters).slice(0, 2).map((item, index) => ({ ...item, priority: index + 2 }))
            ]
            : governance.qualityGate.canPublish
                ? buildActionPlan(validatedParameters)
                : [
                    {
                        priority: 1,
                        title: 'Retry upload or request review',
                        detail: governance.qualityGate.reasons[0] ?? 'The report did not meet the clinical confidence gate for health intelligence.'
                    }
                ],
        document,
        ...governance,
        extractionAttempts: governedAttempts,
        debugTrace: {
            pagesProcessed: document.pageCount,
            totalPages: document.pageCount,
            detectedContext: governance.qualityGate.reportContexts ?? [],
            extractedBiomarkers: governance.qualityGate.detectedBiomarkers,
            requiredBiomarkers: governance.qualityGate.requiredTier1Biomarkers?.length ?? 0,
            validatedBiomarkers: governance.qualityGate.validatedRequiredTier1Biomarkers ?? 0,
            rejectedBiomarkers: governance.qualityGate.rejectedBiomarkers?.length ?? 0,
            confidence: governance.qualityGate.confidence,
            finalState: governance.qualityGate.canPublish ? 'PUBLISHED' : governance.qualityGate.status,
            failedReasons: governance.qualityGate.reasons
        }
    };
};
export const analyzeReportBuffer = async (buffer, mimeType) => {
    const isPdf = mimeType.toLowerCase().includes('pdf');
    let text = '';
    let pdfPageCount = null;
    let parameters = [];
    let aiDate = null;
    let aiLab = null;
    let extractionAttempts = [];
    if (isPdf) {
        const pdfText = await extractTextFromPdf(buffer);
        text = pdfText.text;
        pdfPageCount = pdfText.pageCount;
        const primaryParameters = parseParameters(text);
        extractionAttempts.push({
            attempt: 1,
            strategy: 'pdf_text_table_scan',
            parameterCount: primaryParameters.length,
            confidence: Number((primaryParameters.length === 0 ? 0 : Math.min(0.98, 0.62 + Math.min(primaryParameters.length, 40) / 120)).toFixed(2)),
            rescanRecommended: primaryParameters.length < 8,
            notes: primaryParameters.length < 8 ? ['Primary extraction found too few biomarkers; running secondary extraction pass.'] : []
        });
        const secondaryParameters = parseParametersFallback(text);
        extractionAttempts.push({
            attempt: 2,
            strategy: 'pdf_secondary_known_marker_scan',
            parameterCount: secondaryParameters.length,
            confidence: Number((secondaryParameters.length === 0 ? 0 : Math.min(0.82, 0.5 + Math.min(secondaryParameters.length, 25) / 100)).toFixed(2)),
            rescanRecommended: primaryParameters.length < 8 && secondaryParameters.length < 8,
            notes: secondaryParameters.length === 0
                ? ['Secondary extraction did not find additional reliable biomarkers.']
                : ['Secondary extraction cross-checked known biomarker candidates before validation.']
        });
        parameters = mergeParameters(primaryParameters, secondaryParameters);
    }
    else {
        text = 'Image report uploaded. Standard upload does not run AI vision extraction; use user-initiated re-analysis for visual layout recovery.';
        extractionAttempts.push({
            attempt: 1,
            strategy: 'standard_image_upload_no_ai',
            parameterCount: parameters.length,
            confidence: 0,
            rescanRecommended: true,
            notes: ['Standard upload intentionally avoids OpenAI Vision. Ask the user to tap Re-analyse Report for advanced visual extraction.']
        });
    }
    const reportDate = aiDate ??
        findDate(text) ??
        currentBusinessDateLabel();
    const labName = aiLab ?? findLabName(text) ?? 'Uploaded Lab Report';
    return buildReportAnalysisResult({
        text,
        mimeType,
        parameters,
        extractionAttempts,
        reportDate,
        labName,
        pageCount: isPdf ? pdfPageCount : undefined
    });
};
export const analyzeReportBufferAdvanced = async (buffer, mimeType, context) => {
    assertAdvancedAnalysisAllowed(context.analysisTrigger);
    const isPdf = mimeType.toLowerCase().includes('pdf');
    let text = '';
    let pageCount = null;
    let pageImages = [];
    if (isPdf) {
        const pdfText = await extractTextFromPdf(buffer);
        text = pdfText.text;
        pageCount = pdfText.pageCount;
        pageImages = await renderPdfPagesForAdvancedAnalysis(buffer, pageCount);
    }
    const advanced = await parseViaAdvancedDocumentIntelligence({
        buffer,
        mimeType,
        text,
        pageImages,
        attemptNumber: 1,
        context
    });
    const reportDate = advanced.reportDate ??
        findDate(text) ??
        currentBusinessDateLabel();
    const labName = advanced.labName ?? findLabName(text) ?? 'Uploaded Lab Report';
    const extractionConfidence = advanced.parameters.length === 0
        ? 0
        : Number(Math.min(0.9, 0.6 + Math.min(advanced.parameters.length, 30) / 100).toFixed(2));
    return buildReportAnalysisResult({
        text,
        mimeType,
        parameters: advanced.parameters,
        reportDate,
        labName,
        pageCount: pageCount ?? (isPdf ? undefined : 1),
        extractionAttempts: [
            {
                attempt: 1,
                strategy: 'document_intelligence_layout_recovery',
                parameterCount: advanced.parameters.length,
                confidence: extractionConfidence,
                rescanRecommended: advanced.parameters.length < 3,
                notes: advanced.notes
            }
        ]
    });
};
