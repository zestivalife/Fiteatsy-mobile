import OpenAI from 'openai';
import { PDFParse } from 'pdf-parse';
import { env } from '../../config/env.js';
const AI_MODEL = process.env.OPENAI_MODEL?.trim() || 'gpt-4o-mini';
const aiClient = env.openAiApiKey ? new OpenAI({ apiKey: env.openAiApiKey }) : null;
const normalizeWhitespace = (value) => value.replace(/\s+/g, ' ').trim();
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
    const n = name.toLowerCase();
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
const parseParameters = (text) => {
    const lines = text.split('\n').map((line) => normalizeWhitespace(line)).filter(Boolean);
    const out = [];
    const linePattern = /^([A-Za-z][A-Za-z0-9 ()/+%-]{2,50})\s+(-?\d+(?:\.\d+)?)\s*([A-Za-z/%µ]+)?\s+(<?\s*-?\d+(?:\.\d+)?\s*(?:-|–)\s*-?\d+(?:\.\d+)?|<\s*-?\d+(?:\.\d+)?|>\s*-?\d+(?:\.\d+)?)/;
    for (const line of lines) {
        const match = line.match(linePattern);
        if (!match)
            continue;
        const name = normalizeWhitespace(match[1]);
        const value = Number(match[2]);
        if (!Number.isFinite(value))
            continue;
        const unit = normalizeWhitespace(match[3] ?? '');
        const referenceRange = normalizeWhitespace(match[4]);
        out.push({
            name,
            value,
            unit,
            referenceRange,
            category: categorize(name),
            status: inferStatus(value, referenceRange)
        });
    }
    // de-dup by name and keep first parsed occurrence
    const unique = new Map();
    for (const p of out) {
        if (!unique.has(p.name.toLowerCase()))
            unique.set(p.name.toLowerCase(), p);
    }
    return Array.from(unique.values());
};
const parseParametersFromAiJson = (raw) => {
    try {
        const json = JSON.parse(raw);
        return json
            .filter((item) => item && item.name && Number.isFinite(item.value))
            .map((item) => {
            const category = categorize(item.category || item.name);
            const referenceRange = item.referenceRange?.trim() || 'Not specified';
            const status = item.status === 'low' || item.status === 'high' || item.status === 'normal'
                ? item.status
                : inferStatus(Number(item.value), referenceRange);
            return {
                name: normalizeWhitespace(item.name),
                value: Number(item.value),
                unit: normalizeWhitespace(item.unit ?? ''),
                referenceRange,
                category,
                status
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
        return textResult.text ?? '';
    }
    finally {
        await parser.destroy();
    }
};
const parseImageViaAi = async (buffer) => {
    if (!aiClient) {
        throw new Error('Image analysis requires AI service configuration. Please upload a PDF or enable backend AI key.');
    }
    const dataUrl = `data:image/jpeg;base64,${buffer.toString('base64')}`;
    const completion = await aiClient.chat.completions.create({
        model: AI_MODEL,
        max_tokens: 800,
        messages: [
            {
                role: 'system',
                content: 'You extract lab report data. Return strict JSON with keys reportDate, labName, parameters. parameters is array of {name,value,unit,referenceRange,status,category}. status must be normal/low/high when possible.'
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
    let reportDate = null;
    let labName = null;
    try {
        const json = JSON.parse(content);
        reportDate = typeof json.reportDate === 'string' ? json.reportDate : null;
        labName = typeof json.labName === 'string' ? json.labName : null;
    }
    catch {
        // no-op
    }
    return { reportDate, labName, parameters: parsed };
};
export const analyzeReportBuffer = async (buffer, mimeType) => {
    const isPdf = mimeType.toLowerCase().includes('pdf');
    let text = '';
    let parameters = [];
    let aiDate = null;
    let aiLab = null;
    if (isPdf) {
        text = await extractTextFromPdf(buffer);
        parameters = parseParameters(text);
    }
    else {
        const imageResult = await parseImageViaAi(buffer);
        aiDate = imageResult.reportDate;
        aiLab = imageResult.labName;
        parameters = imageResult.parameters;
    }
    if (parameters.length === 0) {
        throw new Error('No analyzable parameters found in this report. Please upload a clearer PDF/image report.');
    }
    const categoryScores = buildCategoryScores(parameters);
    const score = Math.round((categoryScores.Blood + categoryScores.Metabolic + categoryScores.Organs + categoryScores.Thyroid + categoryScores.Vitamins) / 5);
    return {
        reportDate: aiDate ??
            findDate(text) ??
            new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
        labName: aiLab ?? findLabName(text) ?? 'Uploaded Lab Report',
        parameters,
        score,
        categoryScores,
        summary: buildSummary(parameters),
        actionPlan: buildActionPlan(parameters)
    };
};
