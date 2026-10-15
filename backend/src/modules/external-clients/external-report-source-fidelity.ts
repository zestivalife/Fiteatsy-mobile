import { PDFParse } from 'pdf-parse';
import type { ParsedParameter } from '../reports/reports.service.js';

export type ExternalSourceEvidence = {
  sampleCollectionDate: string | null;
  reportDate: string | null;
  laboratoryName: string | null;
  pages: Array<{ pageNumber: number; text: string }>;
};

const isoDate = (value: string | null) => {
  if (!value) return null;
  const parsed = new Date(value.replace(/\bSept\b/i, 'Sep'));
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
};
const firstMatch = (text: string, expression: RegExp) => text.match(expression)?.[1]?.trim() || null;
const key = (value: string) => value.toLowerCase().replace(/haemoglobin/g, 'hemoglobin').replace(/[^a-z0-9]+/g, ' ').trim();

export async function readExternalSourceEvidence(buffer: Buffer, mimeType: string): Promise<ExternalSourceEvidence> {
  if (!mimeType.toLowerCase().includes('pdf')) return { sampleCollectionDate: null, reportDate: null, laboratoryName: null, pages: [] };
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    const pages = result.pages.map((page) => ({ pageNumber: page.num, text: page.text || '' }));
    const detailedText = pages.filter((page) => /Sample Collected\s*:/i.test(page.text)).map((page) => page.text).join('\n');
    const allText = pages.map((page) => page.text).join('\n');
    const sample = firstMatch(detailedText, /Sample Collected\s*:\s*([^\n]+?)(?=\s+Report Date\s*:|\n)/i);
    const report = firstMatch(detailedText, /Report Date\s*:\s*([^\n.]+(?:AM|PM)?)/i);
    const lab = firstMatch(detailedText || allText, /Processing Lab\s*:-\s*([^\n,]+(?:Pvt\.?\s*Ltd\.?)?)/i);
    return { sampleCollectionDate: isoDate(sample), reportDate: isoDate(report), laboratoryName: lab, pages };
  } finally { await parser.destroy(); }
}

export function traceExternalParameter(parameter: ParsedParameter, evidence: ExternalSourceEvidence) {
  const name = key(parameter.rawName || parameter.name);
  const candidates = evidence.pages.filter((page) => key(page.text).includes(name));
  const detailed = candidates.find((page) => /Sample Collected\s*:/i.test(page.text)) || candidates.at(-1) || null;
  return {
    sourcePage: detailed?.pageNumber ?? null,
    sourceTestName: parameter.rawName || parameter.name,
    sourceSectionPrecedence: detailed && /Sample Collected\s*:/i.test(detailed.text) ? 'DETAILED_RESULT' : candidates.length ? 'SUMMARY' : 'UNRESOLVED',
    sourceTraceable: Boolean(detailed && detailed.text.includes(String(parameter.value))),
  };
}
