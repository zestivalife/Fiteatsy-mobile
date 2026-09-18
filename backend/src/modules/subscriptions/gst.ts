export const CGST_RATE_PERCENT = 9;
export const SGST_RATE_PERCENT = 9;

const roundMinor = (amountMinor: number, ratePercent: number) => Math.round((amountMinor * ratePercent) / 100);

export type GstBreakup = {
  baseAmountMinor: number;
  cgstRatePercent: number;
  cgstAmountMinor: number;
  sgstRatePercent: number;
  sgstAmountMinor: number;
  totalTaxMinor: number;
  totalAmountMinor: number;
};

export const calculateGst = (baseAmountMinor: number): GstBreakup => {
  const cgstAmountMinor = roundMinor(baseAmountMinor, CGST_RATE_PERCENT);
  const sgstAmountMinor = roundMinor(baseAmountMinor, SGST_RATE_PERCENT);
  return {
    baseAmountMinor,
    cgstRatePercent: CGST_RATE_PERCENT,
    cgstAmountMinor,
    sgstRatePercent: SGST_RATE_PERCENT,
    sgstAmountMinor,
    totalTaxMinor: cgstAmountMinor + sgstAmountMinor,
    totalAmountMinor: baseAmountMinor + cgstAmountMinor + sgstAmountMinor
  };
};

export const calculateGstForPlan = (_code: string, baseAmountMinor: number): GstBreakup => calculateGst(baseAmountMinor);
