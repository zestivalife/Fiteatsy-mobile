const escapePdfText = (value: string) =>
  value.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');

export const buildLabReportPdf = (lines: string[]) => {
  const content = [
    'BT',
    '/F1 12 Tf',
    '72 720 Td',
    ...lines.flatMap((line, index) => [
      `${index === 0 ? '' : '0 -18 Td'}`.trim(),
      `(${escapePdfText(line)}) Tj`,
    ]),
    'ET',
  ]
    .filter(Boolean)
    .join('\n');

  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj',
    `4 0 obj\n<< /Length ${Buffer.byteLength(content, 'utf8')} >>\nstream\n${content}\nendstream\nendobj`,
    '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj',
  ];

  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (const object of objects) {
    offsets.push(Buffer.byteLength(pdf, 'utf8'));
    pdf += `${object}\n`;
  }

  const xrefOffset = Buffer.byteLength(pdf, 'utf8');
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (let index = 1; index <= objects.length; index += 1) {
    pdf += `${String(offsets[index]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(pdf, 'utf8');
};

export const buildMultipartReportForm = (overrides?: {
  reportName?: string;
  reportDate?: string;
  labName?: string;
}) => {
  const form = new FormData();
  form.set(
    'reportFile',
    new Blob(
      [
        buildLabReportPdf([
          overrides?.labName ?? 'HealthLab Diagnostics',
          overrides?.reportDate ?? '14 Mar 2026',
          'Hemoglobin 12.5 g/dL 12-16',
          'Glucose 98 mg/dL 70-110',
          'TSH 2.1 uIU/mL 0.4-4.0',
        ]),
      ],
      { type: 'application/pdf' }
    ),
    overrides?.reportName ?? 'lab-report.pdf'
  );
  if (overrides?.reportDate) {
    form.set('reportDate', overrides.reportDate);
  }
  if (overrides?.labName) {
    form.set('labName', overrides.labName);
  }
  return form;
};
